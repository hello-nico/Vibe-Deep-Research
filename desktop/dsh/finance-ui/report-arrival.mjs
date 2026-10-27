/** 关注公司定期报告披露后自动重研。定时用运行时 cordis timer（ctx.interval）；dsh-schedule 是会话提醒，不用。 */

export const REPORT_ARRIVAL_PROMPT = '定期报告已披露，按最新报告重研';
export const REPORT_ARRIVAL_TRIGGER = 'report_arrival';
const DEFAULT_INTERVAL_MS = 3 * 60 * 60 * 1000;
const QUARTER_END = new Set(['03-31', '06-30', '09-30', '12-31']);

export function shanghaiToday(now = new Date()) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Shanghai', year: 'numeric', month: '2-digit', day: '2-digit' }).format(now);
}

export function reportArrivalIntervalMs(env = process.env) {
  const raw = env.VIBE_REPORT_ARRIVAL_INTERVAL_MS;
  if (raw == null || raw === '') return DEFAULT_INTERVAL_MS;
  const value = Number(raw);
  return Number.isFinite(value) && value >= 0 ? value : DEFAULT_INTERVAL_MS;
}

export function periodRank(period) {
  const text = String(period ?? '').replace(/^TTM:/, '');
  const fiscal = /^FY(\d{4})$/.exec(text);
  if (fiscal) return Number(fiscal[1]) * 10 + 4;
  const quarter = /^(\d{4})(?:YTD)?(Q[1-4]|H1)$/.exec(text);
  if (!quarter) return null;
  return Number(quarter[1]) * 10 + (quarter[2] === 'H1' ? 2 : Number(quarter[2].slice(1)));
}

export function periodKeyFromEndDate(iso) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso || '')) return '';
  const year = iso.slice(0, 4);
  const day = iso.slice(5);
  if (day === '03-31') return `${year}Q1`;
  if (day === '06-30') return `${year}H1`;
  if (day === '09-30') return `${year}Q3`;
  if (day === '12-31') return `FY${year}`;
  return '';
}

export function latestDisclosedPeriodic(reports, today) {
  let best = null;
  for (const row of reports || []) {
    const period = String(row?.period || '');
    if (!QUARTER_END.has(period.slice(5))) continue;
    const actual = String(row?.actual || '');
    if (!/^\d{4}-\d{2}-\d{2}$/.test(actual) || actual > today) continue;
    const key = periodKeyFromEndDate(period);
    const rank = periodRank(key);
    if (!key || rank == null) continue;
    if (!best || rank > best.rank) best = { period, key, rank, actual };
  }
  return best;
}

function companyBusy(tasks, symbol) {
  return (tasks || []).some(task => task.symbol === symbol && (task.status === 'running' || task.status === 'interrupted'));
}

function alreadyTriggered(tasks, symbol, periodKey) {
  return (tasks || []).some(task => task.symbol === symbol && task.trigger === REPORT_ARRIVAL_TRIGGER && task.trigger_period === periodKey);
}

export function shanghaiDate(iso) {
  if (typeof iso !== 'string' || !iso) return '';
  if (/^\d{4}-\d{2}-\d{2}$/.test(iso)) return iso;
  const ms = Date.parse(iso);
  return Number.isFinite(ms) ? shanghaiToday(new Date(ms)) : '';
}

function latestCompletedDay(tasks, symbol) {
  let best = '';
  for (const task of tasks || []) {
    if (task.symbol !== symbol || task.status !== 'completed') continue;
    const day = shanghaiDate(task.finished_at || task.updated_at);
    if (day && day > best) best = day;
  }
  return best;
}

function alreadyCurrent(company, tasks, latest) {
  const used = periodRank(company.report_period);
  if (used != null) return latest.rank <= used;
  const completed = latestCompletedDay(tasks, company.symbol) || shanghaiDate(company.researched_at);
  return !completed || completed >= latest.actual;
}

export function planReportArrivalJobs({ companies, calendars, tasks, today }) {
  const jobs = [];
  for (const company of companies || []) {
    if (!company?.symbol || companyBusy(tasks, company.symbol)) continue;
    const latest = latestDisclosedPeriodic(calendars?.get?.(company.symbol)?.reports || calendars?.[company.symbol]?.reports || [], today);
    if (!latest) continue;
    if (alreadyCurrent(company, tasks, latest)) continue;
    if (alreadyTriggered(tasks, company.symbol, latest.key)) continue;
    jobs.push({
      symbol: company.symbol,
      slug: company.slug,
      title: company.title,
      trigger: REPORT_ARRIVAL_TRIGGER,
      trigger_period: latest.key,
      prompt: REPORT_ARRIVAL_PROMPT,
    });
  }
  return jobs;
}

export async function runReportArrivalCheck({ listCompanies, fetchCalendars, listTasks, startRun, today, now, diagnose } = {}) {
  const note = payload => { try { diagnose?.(payload); } catch { /* diagnostics must not fail the check */ } };
  try {
    const companies = await (listCompanies?.() ?? []);
    note({ step: 'companies', n: companies.length });
    if (!companies.length) return [];
    const calendars = await (fetchCalendars?.(companies.map(item => item.symbol)) ?? new Map());
    const tasks = listTasks?.() ?? [];
    const jobs = planReportArrivalJobs({ companies, calendars, tasks, today: today || shanghaiToday(now) });
    note({ step: 'jobs', n: jobs.length, symbols: jobs.map(job => job.symbol) });
    const started = [];
    for (const job of jobs) started.push(await startRun(job));
    return started;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    note({ step: 'error', message });
    throw error;
  }
}

export function attachReportArrival(ctx, track, deps) {
  const signal = deps.lifetime?.signal;
  const run = () => {
    if (signal?.aborted) return Promise.resolve([]);
    return runReportArrivalCheck(deps).catch(error => {
      const message = error instanceof Error ? error.message : String(error);
      try { deps.diagnose?.({ step: 'error', message }); } catch { /* keep boot alive */ }
      return [];
    });
  };
  const boot = Promise.resolve().then(run);
  const ms = reportArrivalIntervalMs();
  if (ms > 0) {
    // Cordis throws on reading undeclared services such as ctx.interval; use a plain timer.
    const timer = setInterval(() => { void run(); }, ms);
    timer.unref?.();
    track(() => clearInterval(timer));
  }
  return boot;
}
