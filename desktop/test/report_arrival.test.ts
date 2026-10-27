import assert from 'node:assert/strict';
import test from 'node:test';
import {
  attachReportArrival, latestDisclosedPeriodic, periodKeyFromEndDate, periodRank,
  planReportArrivalJobs, REPORT_ARRIVAL_PROMPT, REPORT_ARRIVAL_TRIGGER, runReportArrivalCheck,
} from '../dsh/finance-ui/report-arrival.mjs';

const huaneng = { symbol: '600011.SH', slug: 'companies/600011-sh', title: '华能国际', report_period: '2026H1' };
const shenhuo = { symbol: '000933.SZ', slug: 'companies/000933-sz', title: '神火股份', report_period: '2026H1' };
const q3 = { period: '2026-09-30', actual: '2026-10-20' };
const today = '2026-10-26';

function calendars(rows) {
  return new Map(Object.entries(rows).map(([symbol, reports]) => [symbol, { reports }]));
}

test('补跑：已披露定期报告晚于研究所用报告期则排队重研', () => {
  const jobs = planReportArrivalJobs({
    companies: [huaneng],
    calendars: calendars({ '600011.SH': [q3] }),
    tasks: [{ symbol: '600011.SH', status: 'completed', report_period: '2026H1' }],
    today,
  });
  assert.equal(jobs.length, 1);
  assert.equal(jobs[0].symbol, '600011.SH');
  assert.equal(jobs[0].trigger, REPORT_ARRIVAL_TRIGGER);
  assert.equal(jobs[0].trigger_period, '2026Q3');
  assert.equal(jobs[0].prompt, REPORT_ARRIVAL_PROMPT);
});

test('已是最新报告不触发', () => {
  const jobs = planReportArrivalJobs({
    companies: [{ ...huaneng, report_period: '2026Q3' }],
    calendars: calendars({ '600011.SH': [q3] }),
    tasks: [],
    today,
  });
  assert.equal(jobs.length, 0);
});

test('手动研究在披露后完成不触发', () => {
  const jobs = planReportArrivalJobs({
    companies: [{ ...huaneng, report_period: null }],
    calendars: calendars({ '600011.SH': [q3] }),
    tasks: [{ symbol: '600011.SH', status: 'completed', finished_at: '2026-10-26T08:00:00.000Z' }],
    today,
  });
  assert.equal(jobs.length, 0);
});

test('披露前完成触发', () => {
  const jobs = planReportArrivalJobs({
    companies: [{ ...huaneng, report_period: null }],
    calendars: calendars({ '600011.SH': [q3] }),
    tasks: [{ symbol: '600011.SH', status: 'completed', finished_at: '2026-10-19T08:00:00.000Z' }],
    today,
  });
  assert.equal(jobs.length, 1);
  assert.equal(jobs[0].trigger_period, '2026Q3');
});

test('旧任务无 report_period 走完成时间', () => {
  const after = planReportArrivalJobs({
    companies: [{ symbol: '603799.SH', slug: 'companies/603799-sh', title: '华友钴业' }],
    calendars: calendars({ '603799.SH': [q3] }),
    tasks: [{ symbol: '603799.SH', status: 'completed', updated_at: '2026-10-26T12:00:00.000Z' }],
    today,
  });
  assert.equal(after.length, 0);
  const before = planReportArrivalJobs({
    companies: [{ symbol: '603799.SH', slug: 'companies/603799-sh', title: '华友钴业' }],
    calendars: calendars({ '603799.SH': [q3] }),
    tasks: [{ symbol: '603799.SH', status: 'completed', updated_at: '2026-10-12T00:00:00.000Z' }],
    today,
  });
  assert.equal(before.length, 1);
});

test('无本地任务时用 wiki 研究时间：披露前完成触发', () => {
  const jobs = planReportArrivalJobs({
    companies: [{ symbol: '300750.SZ', slug: 'companies/300750-sz', title: '宁德时代', researched_at: '2026-10-13T10:16:03.158147+00:00' }],
    calendars: calendars({ '300750.SZ': [{ period: '2026-09-30', actual: '2026-10-21' }] }),
    tasks: [],
    today,
  });
  assert.equal(jobs.length, 1);
  assert.equal(jobs[0].symbol, '300750.SZ');
  assert.equal(jobs[0].trigger_period, '2026Q3');
});

test('检查失败留下诊断，不再静默吞掉原因', async () => {
  const notes = [];
  await assert.rejects(() => runReportArrivalCheck({
    listCompanies: async () => { throw new Error('日历读取失败'); },
    diagnose: payload => notes.push(payload),
    startRun: async () => {},
    today,
  }), /日历读取失败/);
  assert.equal(notes.some(item => item.step === 'error' && /日历读取失败/.test(item.message)), true);
});

test('进行中不重复', () => {
  for (const status of ['running', 'interrupted']) {
    const jobs = planReportArrivalJobs({
      companies: [huaneng],
      calendars: calendars({ '600011.SH': [q3] }),
      tasks: [{ symbol: '600011.SH', status }],
      today,
    });
    assert.equal(jobs.length, 0, status);
  }
});

test('同一报告期只触发一次', () => {
  const jobs = planReportArrivalJobs({
    companies: [huaneng],
    calendars: calendars({ '600011.SH': [q3] }),
    tasks: [{ symbol: '600011.SH', status: 'failed', trigger: REPORT_ARRIVAL_TRIGGER, trigger_period: '2026Q3' }],
    today,
  });
  assert.equal(jobs.length, 0);
});

test('只做年报半年报一季报三季报；未到披露日不触发', () => {
  assert.equal(periodKeyFromEndDate('2026-09-30'), '2026Q3');
  assert.equal(periodKeyFromEndDate('2025-12-31'), 'FY2025');
  assert.equal(periodRank('2026Q3'), 20263);
  assert.equal(latestDisclosedPeriodic([{ period: '2026-10-15', actual: '2026-10-16' }], today), null);
  assert.equal(latestDisclosedPeriodic([{ period: '2026-09-30', actual: '2026-10-30' }], today), null);
  assert.equal(latestDisclosedPeriodic([q3], today).key, '2026Q3');
});

test('排队：一次只跑下一家', async () => {
  const order = [];
  let release;
  const gate = new Promise(resolve => { release = resolve; });
  const started = runReportArrivalCheck({
    listCompanies: async () => [huaneng, shenhuo],
    fetchCalendars: async () => calendars({ '600011.SH': [q3], '000933.SZ': [q3] }),
    listTasks: () => [],
    today,
    startRun: async job => {
      order.push(`start:${job.symbol}`);
      if (job.symbol === '600011.SH') await gate;
      order.push(`done:${job.symbol}`);
      return job.symbol;
    },
  });
  await new Promise(resolve => setTimeout(resolve, 20));
  assert.deepEqual(order, ['start:600011.SH']);
  release();
  assert.deepEqual(await started, ['600011.SH', '000933.SZ']);
  assert.deepEqual(order, ['start:600011.SH', 'done:600011.SH', 'start:000933.SZ', 'done:000933.SZ']);
});

test('无快照公司不请求、不启动', async () => {
  let fetched = false, started = 0;
  const result = await runReportArrivalCheck({
    listCompanies: async () => [],
    fetchCalendars: async () => { fetched = true; return new Map(); },
    listTasks: () => [],
    startRun: async () => { started += 1; },
    today,
  });
  assert.deepEqual(result, []);
  assert.equal(fetched, false);
  assert.equal(started, 0);
});

test('宿主启动补跑一次；间隔 0 不再挂定时', async () => {
  const previous = process.env.VIBE_REPORT_ARRIVAL_INTERVAL_MS;
  process.env.VIBE_REPORT_ARRIVAL_INTERVAL_MS = '0';
  const checks = [];
  const ctx = {};
  const timers = [];
  const boot = attachReportArrival(ctx, disposer => timers.push(disposer), {
    lifetime: { signal: { aborted: false } },
    listCompanies: async () => { checks.push('check'); return []; },
    fetchCalendars: async () => new Map(),
    listTasks: () => [],
    startRun: async () => {},
    today,
  });
  await boot;
  assert.deepEqual(checks, ['check']);
  assert.equal(timers.length, 0);
  if (previous === undefined) delete process.env.VIBE_REPORT_ARRIVAL_INTERVAL_MS;
  else process.env.VIBE_REPORT_ARRIVAL_INTERVAL_MS = previous;
});
