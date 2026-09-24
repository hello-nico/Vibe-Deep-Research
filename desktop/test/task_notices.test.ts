import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import {
  dropTrack, listTracks, noticeFromOutcome, objectHref, objectPathFromLocation, pruneTracks,
  resetTaskNoticesForTest, resolveTrack, sameOriginPage, trackTask, TASK_TRACK_KEY, TASK_TRACK_TTL_MS,
} from '../src/verticals/finance/lib/taskNotices.ts';

const object = { slug: 'industries/nbs-煤炭开采和洗选业', title: '煤炭开采和洗选业', kind: 'industry' as const, path: '/sectors/煤炭开采和洗选业' };

function memoryStore(start: Record<string, string> = {}) {
  const data = { ...start };
  return {
    getItem(key: string) { return data[key] ?? null; },
    setItem(key: string, value: string) { data[key] = value; },
    data,
  };
}

test('登记后状态完成即产生一条提醒，停留发起页或无变化不弹全局卡', async () => {
  resetTaskNoticesForTest();
  const store = memoryStore();
  const track = trackTask({ kind: 'report', object, ref: 'sess-1', baseline: 'old', originHref: '/sectors/煤炭开采和洗选业?view=report' }, store);
  assert.equal(listTracks(Date.now(), store).length, 1);
  const done = await resolveTrack(track, {
    listReports: async () => ({ items: [{ report_id: 'new', current: true }] }),
    findReportTask: async () => ({ sessionId: 'sess-1', running: false }),
    sessionState: () => ({ running: false }),
  });
  assert.equal(done.status, 'done');
  if (done.status !== 'done') throw new Error('expected done');
  const away = noticeFromOutcome(track, done, '/watchlist');
  assert.ok(away);
  assert.match(away.title, /图文报告已生成/);
  assert.equal(away.href, objectHref(object.path, { view: 'report' }));
  assert.equal(noticeFromOutcome(track, done, '/sectors/煤炭开采和洗选业?view=report'), null);
  const check = trackTask({ kind: 'refresh', object, ref: 'chk-1', phase: 'check', page: 'industry' }, store);
  const unchanged = await resolveTrack(check, { readCheck: async () => ({ status: 'unchanged' }) });
  assert.equal(unchanged.status, 'unchanged');
});

test('清单持久化读写失败不抛错，超时条目被清理', () => {
  resetTaskNoticesForTest();
  const broken = {
    getItem() { throw new Error('blocked'); },
    setItem() { throw new Error('blocked'); },
  };
  assert.doesNotThrow(() => trackTask({ kind: 'report', object, ref: 'sess-2' }, broken));
  const old = trackTask({ kind: 'report', object, ref: 'sess-3', startedAt: Date.now() - TASK_TRACK_TTL_MS - 10 }, memoryStore());
  assert.equal(pruneTracks([old], Date.now()).length, 0);
  const store = memoryStore();
  trackTask({ kind: 'refresh', object, ref: 'chk-2', phase: 'check' }, store);
  assert.ok(store.data[TASK_TRACK_KEY]);
  dropTrack('refresh:' + object.slug, store);
  assert.equal(listTracks(Date.now(), store).length, 0);
});

test('对象路径去掉分段参数，失败与待确认跳转符合规格', () => {
  assert.equal(objectPathFromLocation('/sectors/煤炭开采和洗选业?view=report&refresh=confirm'), '/sectors/煤炭开采和洗选业');
  assert.equal(sameOriginPage('/research?company=companies/600309-sh&view=report', '/research?company=companies/600309-sh&view=report'), true);
  assert.equal(sameOriginPage('/research?company=companies/600309-sh&view=report', '/research?company=companies/600309-sh'), false);
  const track = trackTask({ kind: 'refresh', object, ref: 'chk', phase: 'check' }, memoryStore());
  const pending = noticeFromOutcome(track, { status: 'done', variant: 'refresh-pending', detail: '点击查看并确认' }, '/watchlist');
  assert.ok(pending?.href.includes('refresh=confirm'));
  assert.equal(pending?.sticky, true);
});

test('公司研究完成提醒按草案和无新增分别显示，原页也能收到', () => {
  const company = { slug: 'companies/600900-sh', title: '长江电力', kind: 'company' as const, path: '/research?company=companies%2F600900-sh' };
  const track = trackTask({ kind: 'research', object: company, ref: 'research-1', originHref: company.path }, memoryStore());
  const pending = noticeFromOutcome(track, { status: 'done', variant: 'research-pending', detail: '' }, company.path);
  assert.match(pending?.title || '', /研究完成，草案待你审阅/);
  assert.equal(pending?.href, '/my-research?tab=tasks');
  const unchanged = noticeFromOutcome(track, { status: 'done', variant: 'research-no-increment', detail: '' }, '/watchlist');
  assert.match(unchanged?.title || '', /没有需要更新的内容/);
});

test('报告与刷新在生成/检查时登记，外壳挂载提醒且共用卡片样式', () => {
  const root = fileURLToPath(new URL('../src/verticals/finance/', import.meta.url));
  const pane = readFileSync(root + 'components/WikiReportPane.tsx', 'utf8');
  const refresh = readFileSync(root + 'components/CompanyRefreshConfirm.tsx', 'utf8');
  const layout = readFileSync(root + 'components/layout/Layout.tsx', 'utf8');
  const css = readFileSync(root + 'components/refresh-confirm.css', 'utf8');
  assert.match(pane, /trackTask\(\{/);
  assert.match(refresh, /trackTask\(\{/);
  assert.match(refresh, /className="task-notice task-notice-local"/);
  assert.match(layout, /<TaskNotices \/>/);
  assert.match(css, /\.task-notice-stack/);
  assert.match(css, /prefers-reduced-motion/);
});
