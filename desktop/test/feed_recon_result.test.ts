// 财报卡重研结论、判断变化置顶、导航「动态」小圆点。
import assert from 'node:assert/strict';
import test, { before, after } from 'node:test';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { createServer as createHttpServer } from 'node:http';
import { createServer } from 'vite';
import * as React from 'react';
import { Window } from 'happy-dom';

let server: Awaited<ReturnType<typeof createServer>>, win: Window, root: ReturnType<typeof import('react-dom/client')['createRoot']>, container: HTMLElement;
let result: Record<string, any>, stream: Record<string, any>, attention: Record<string, any>, dotModule: Record<string, any>, desk: Record<string, any>, router: Record<string, any>, pageContext: Record<string, any>, sessionModule: Record<string, any>;
const previous = { window: globalThis.window, document: globalThis.document, fetch: globalThis.fetch, localStorage: (globalThis as any).localStorage, IS_REACT_ACT_ENVIRONMENT: globalThis.IS_REACT_ACT_ENVIRONMENT };
before(async () => {
  win = new Window();
  Object.assign(globalThis, { window: win, document: win.document, localStorage: win.localStorage, IS_REACT_ACT_ENVIRONMENT: true });
  server = await createServer({ configFile: false, root: fileURLToPath(new URL('../', import.meta.url)),
    resolve: { alias: { '@': fileURLToPath(new URL('../src/verticals/finance', import.meta.url)) } },
    server: { middlewareMode: true, hmr: { server: createHttpServer() }, watch: null }, appType: 'custom',
    ssr: { noExternal: ['react-router-dom', 'react-router'], resolve: { conditions: ['module-sync', 'node', 'import', 'development'] } } });
  const load = (path: string) => server.ssrLoadModule(`/src/verticals/finance/${path}`);
  [result, stream, attention, dotModule, desk, sessionModule] = await Promise.all([load('lib/reconResult.ts'), load('lib/feedStream.ts'), load('lib/feedAttention.ts'), load('components/layout/FeedDot.tsx'), load('pages/VariableDesk.tsx'), load('dsh/research-session.tsx')]);
  router = await server.ssrLoadModule('react-router-dom');
  pageContext = await server.ssrLoadModule('/src/core/ai/pageContext.tsx');
  container = win.document.createElement('div') as unknown as HTMLElement;
  win.document.body.append(container);
  root = (await import('react-dom/client')).createRoot(container);
});
after(async () => { await React.act(async () => root?.unmount()); await server?.close(); win?.happyDOM.abort(); Object.assign(globalThis, previous); });

const card = (symbol: string, company: string, date: string, extra: Record<string, unknown> = {}) => ({ symbol, company, period: '2026Q3', date, headline: `${company}三季报：单季净利润 27.05 亿元，比上季多 2.14 亿元`, explain: '沪铝变化约带来 +1.20 亿元', details: ['明细'], ...extra });

for (const outcome of ['success', 'failure'] as const) test(`公告和对账先到先显示，跟踪变量 ${outcome} 不挡住其余卡片`, async () => {
  let finish!: (value: any) => void, fail!: (error: Error) => void;
  const pending = new Promise((resolve, reject) => { finish = resolve; fail = reject; });
  let finishRecon!: (value: any[]) => void;
  const reconPending = new Promise<any[]>(resolve => { finishRecon = resolve; });
  const tracking = JSON.parse(readFileSync(new URL('./fixtures/tracking_variables.json', import.meta.url), 'utf8'));
  const props = { load: () => pending, loadRecon: () => reconPending, loadFlips: async () => [],
    loadFilings: async () => ({ rows: [{ symbol: '000933.SZ', name: '神火股份', title: '收购进展公告', when: '2026-10-28 09:00', url: 'https://example.com/a', industry: '工业金属' }], hidden: 0 }),
    loadEvents: async () => [], loadResults: async () => ({}) };
  await React.act(async () => root.render(React.createElement(router.MemoryRouter, null,
    React.createElement(pageContext.AiPageProvider, {}, React.createElement(desk.VariableDesk, props)))));
  assert.ok(container.querySelector('[data-filing-card]'), '变量和对账均未返回时公告先显示');
  assert.equal(container.querySelector('[data-variable-card]'), null);
  await React.act(async () => finishRecon([card('000933.SZ', '神火股份', '2026-10-28')]));
  assert.ok(container.querySelector('[data-recon-card]'), '变量仍未返回时对账独立显示');
  await React.act(async () => outcome === 'success' ? finish(tracking) : fail(new Error('tracking temporarily unavailable')));
  assert.ok(container.querySelector('[data-filing-card]'));
  assert.ok(container.querySelector('[data-recon-card]'));
  assert.equal(!!container.querySelector('[data-variable-card]'), outcome === 'success');
  assert.equal(!!container.querySelector('[role="alert"]'), outcome === 'failure');
});

test('跳档未完成不显示空态，失败可重试', async () => {
  let release!: () => void;
  const pending = new Promise<void>(resolve => { release = resolve; });
  const tracking = JSON.parse(readFileSync(new URL('./fixtures/tracking_variables.json', import.meta.url), 'utf8'));
  let reads = 0;
  const props = { load: async () => ({ ...tracking, cards: [] }),
    loadFlips: async () => { reads++; if (reads === 1) { await pending; throw new Error('flip unavailable'); } return []; },
    loadRecon: async () => [], loadResults: async () => ({}), loadEvents: async () => [], loadFilings: async () => ({ rows: [], hidden: 0 }) };
  await React.act(async () => root.render(React.createElement(router.MemoryRouter, null,
    React.createElement(pageContext.AiPageProvider, {}, React.createElement(desk.VariableDesk, props)))));
  assert.equal(container.querySelector('.variable-desk-empty'), null);
  assert.ok(container.querySelector('[aria-busy="true"]'));
  await React.act(async () => release());
  assert.ok(container.querySelector('[role="alert"]'));
  await React.act(async () => (container.querySelector('[role="alert"] button') as HTMLButtonElement).click());
  assert.equal(reads, 2);
  assert.equal(container.querySelector('[role="alert"]'), null);
  assert.ok(container.querySelector('.variable-desk-empty'));
});
const info = (grade: string | null, previousGrade: string | null, researchedAt = '2026-10-26T01:00:00Z') => ({ grade, previousGrade, researchedAt });
const running = { task_id: 't', symbol: '300750.SZ', status: 'running', current_step: 3, steps: [1, 2, 3, 4, 5, 6].map(i => ({ key: `s${i}`, label: 's', status: 'pending' })) };

test('三种结论：变了、没变、研究中；研究早于披露日、读不到不写；没有上一版只写档位', () => {
  const c = card('000933.SZ', '神火', '2026-10-20');
  assert.deepEqual(result.reconResult(c, undefined, info('合理', '偏低')), { text: '估值从偏低变为合理', changed: true, id: 'recon:000933.SZ:2026Q3:偏低>合理' });
  assert.deepEqual(result.reconResult(c, undefined, info('合理', '合理')), { text: '估值没变（合理）', changed: false });
  assert.deepEqual(result.reconResult(card('300750.SZ', '宁德', '2026-10-21'), running as any, null), { text: '重新研究中 3/6', changed: false });
  assert.equal(result.reconResult(c, undefined, info('合理', '偏低', '2026-10-19T01:00:00Z')), null, '研究完成早于披露日：不写');
  assert.equal(result.reconResult(c, undefined, null), null, '读不到不写');
  assert.deepEqual(result.reconResult(c, undefined, info('合理', null)), { text: '三季报后估值合理', changed: false });
});

test('财报卡：第三行写结论，变了的置顶，底行只写类型；没变的不置顶', () => {
  const changed = stream.reconStream(card('000933.SZ', '神火', '2026-10-20'), result.reconResult(card('000933.SZ', '神火', '2026-10-20'), undefined, info('合理', '偏低')));
  const same = stream.reconStream(card('601899.SH', '紫金', '2026-10-24'), result.reconResult(card('601899.SH', '紫金', '2026-10-24'), undefined, info('合理', '合理')));
  const none = stream.reconStream(card('600900.SH', '长电', '2026-10-25'));
  assert.equal(changed.pinned, true); assert.deepEqual(changed.result, { text: '估值从偏低变为合理', strong: true });
  assert.equal(same.pinned, undefined); assert.equal(same.result.strong, false);
  assert.equal(none.result, undefined);
  assert.deepEqual(stream.streamOf([none, same, changed], '全部').map((c: any) => c.companies[0].name), ['神火', '长电', '紫金'], '变了的置顶，其余按日期');
});

test('新一期数据只提示新报告，不写旧报告期；有进度时显示进度', () => {
  const c = card('600011.SH', '华能国际', '2026-10-28');
  const arrival = { material: { kind: 'report', name: '三季报', date: '2026-10-27' }, symbol: c.symbol, period: '2026Q3', company: c.company, date: '2026-10-27', text: '三季报已出', id: 'report:600011.SH:2026Q3' };
  const pending = result.reconResult(c, undefined, info('偏高', '合理'), arrival);
  assert.equal(pending.text, '三季报已出');
  assert.equal(pending.pending, true);
  assert.equal(pending.changed, false);
  assert.deepEqual(stream.reconStream(c, pending).research, { symbol: c.symbol, name: c.company });
  assert.equal(result.reconResult(c, running, null, arrival).text, '重新研究中 3/6');
});

test('无对账数字也有新报告卡；看卡只读，点击按钮才沿现有公司研究流程开始', async () => {
  let starts = 0, reconReads = 0;
  const methods: string[] = [];
  const oldFetch = globalThis.fetch;
  globalThis.fetch = (async (url, init) => {
    methods.push(init?.method || 'GET');
    const path = String(url);
    if (path.includes('/coverage/ensure')) return Response.json({});
    if (path.includes('/data-packet')) return Response.json({ symbol: '600011.SH', as_of: '2000-01-01', fields: {} });
    if (path.includes('/page-research')) return Response.json({ research: { valuation: { grade: '偏高' } }, new_material: starts ? null : arrival.material, basisVersion: 'v1' });
    if (path.startsWith('/finance-research-tasks')) return Response.json({ items: [] });
    throw new Error(`unexpected ${path}`);
  }) as typeof fetch;
  const arrival = { material: { kind: 'report', name: '三季报', date: '2026-10-27' }, symbol: '600011.SH', period: '2026Q3', company: '华能国际', date: '2026-10-27', text: '三季报已出', id: 'report:600011.SH:2026Q3' };
  const loadResults = async () => starts ? {} : ({ '600011.SH:2026Q3': { text: arrival.text, changed: false, pending: true, id: arrival.id } });
  const data = { as_of: '2026-10-27', variables: [], cards: [], coverage: { unresearched: [], uncovered: [] } };
  try {
    await React.act(async () => root.render(React.createElement(router.MemoryRouter, null,
      React.createElement(sessionModule.ResearchSessionContext.Provider, { value: { start: async () => { starts++; return { sessionId: 'clicked', status: 'started' }; } } },
        React.createElement(pageContext.AiPageProvider, {}, React.createElement(desk.VariableDesk, {
          load: async () => data, loadFlips: async () => [], loadRecon: async () => { reconReads++; return starts ? [] : [card(arrival.symbol, arrival.company, arrival.date, { headline: `${arrival.company}${arrival.text}`, details: [], reminder: true })]; },
          loadFilings: async () => ({ rows: [], hidden: 0 }), loadEvents: async () => [], loadResults,
        }))))));
    await React.act(async () => {});
    const cards = container.querySelectorAll('[data-recon-card]');
    assert.equal(cards.length, 1);
    assert.equal(cards[0].querySelector('h4')!.textContent, '华能国际三季报已出');
    assert.equal(cards[0].querySelector('[data-recon-result]'), null, '不重复新报告文案');
    assert.equal(cards[0].querySelector('.variable-card-foot > span')!.textContent, '财报', '观察日期不冒充披露日');
    assert.doesNotMatch(cards[0].textContent!, /研究还按|半年报/);
    assert.equal(starts, 0);
    assert.ok(methods.every(method => method === 'GET'));
    const button = [...cards[0].querySelectorAll('button')].find(item => item.textContent === '重新研究') as HTMLButtonElement;
    await React.act(async () => { button.click(); });
    await React.act(async () => {});
    assert.equal(starts, 1);
    assert.equal(methods.filter(method => method === 'POST').length, 1, '点击才沿既有路径 ensure');
    assert.equal(reconReads, 2, '快速完成、未观察到进行中，也按用户动作重读一次资料快照');
    assert.equal(container.querySelector('[data-recon-card]'), null);
  } finally { globalThis.fetch = oldFetch; }
});

test('页面：结论行，置顶卡底行不叠标签；进行中写进度', async () => {
  const loadResults = async () => ({ '000933.SZ:2026Q3': result.reconResult(card('000933.SZ', '神火', '2026-10-20'), undefined, info('合理', '偏低')), '300750.SZ:2026Q3': result.reconResult(card('300750.SZ', '宁德', '2026-10-21'), running, null) });
  const data = { as_of: '2026-10-26', variables: [], cards: [], coverage: { unresearched: [], uncovered: [] } };
  const Probe = () => { pageContext.useAiQuestion(); return null; };
  await React.act(async () => root.render(React.createElement(router.MemoryRouter, null,
    React.createElement(sessionModule.ResearchSessionContext.Provider, { value: { start: async () => ({ sessionId: 's', status: 'started' }) } },
      React.createElement(pageContext.AiPageProvider, {}, React.createElement(Probe), React.createElement(desk.VariableDesk, { load: async () => data, loadFlips: async () => [], loadRecon: async () => [card('300750.SZ', '宁德', '2026-10-21'), card('000933.SZ', '神火', '2026-10-20')], loadFilings: async () => ({ rows: [], hidden: 0 }), loadResults, filter: '全部' }))))));
  await React.act(async () => {});
  const cards = [...container.querySelectorAll('[data-recon-card]')];
  assert.deepEqual(cards.map(c => c.getAttribute('data-recon-card')), ['000933.SZ', '300750.SZ'], '档位变了的神火置顶');
  assert.equal(cards[0].querySelector('[data-recon-result]')!.textContent, '估值从偏低变为合理');
  assert.ok(cards[0].querySelector('[data-recon-result].is-strong'));
  assert.match(cards[0].querySelector('.variable-card-foot')!.textContent!, /^置顶 · 财报 · 10-20/);
  assert.equal(cards[1].querySelector('[data-recon-result]')!.textContent, '重新研究中 3/6');
  assert.match(cards[1].querySelector('.variable-card-foot')!.textContent!, /^财报 · 10-21/);
});

function mock(options: { grade?: [string | null, string | null] }) {
  globalThis.fetch = (async (url: string) => {
    const path = String(url);
    if (path.includes('client/watch')) return Response.json({ symbols: ['000933'] });
    if (path.includes('/tracking/variables')) return Response.json({ as_of: '2026-10-26', variables: [], cards: [], coverage: { unresearched: [], uncovered: [] } });
    if (path.includes('/feed/research-events')) return Response.json({ items: [{ id: 'e1', at: '2026-10-26T07:28:49Z', symbol: '000933.SZ', kind: 'drivers', summary: '按讨论改写铝价取值', session_id: 's1', research_version: 'v2', previous_version: 'v1', reversible: true,
      grade_before: options.grade?.[0] ?? null, grade_after: options.grade?.[1] ?? null }] });
    return Response.json({ detail: 'unused' }, { status: 404 });
  }) as typeof fetch;
}

test('编号：对话里调整导致档位变化才有编号（与动态里的记录卡一一对应）；没变、没有档位字段没有', async () => {
  mock({ grade: ['合理', '偏高'] });
  assert.deepEqual(await attention.loadAttentionIds(), ['writeback:e1']);
  mock({ grade: ['偏高', '偏高'] });
  assert.deepEqual(await attention.loadAttentionIds(), []);
  mock({});
  assert.deepEqual(await attention.loadAttentionIds(), [], '旧记录没有档位字段');
});

test('没有对账数字的新报告也点亮动态小点，读取只发 GET，研究用上新一期后不再提醒', async () => {
  const oldFetch = globalThis.fetch;
  const methods: string[] = [];
  let period = '2026H1';
  globalThis.fetch = (async (url, init) => {
    const path = String(url);
    methods.push(init?.method || 'GET');
    if (path.includes('client/watch')) return Response.json({ symbols: ['600011'] });
    if (path.includes('/tracking/variables')) return Response.json({ as_of: '2026-10-27', variables: [], cards: [], coverage: { unresearched: [], uncovered: [] } });
    if (path.includes('/market/report-periods')) return Response.json({ items: [{ symbol: '600011.SH', status: 'sourced', latest_report_period: '2026-09-30', fetched_at: '2026-10-27T23:00:00+08:00' }] });
    if (path.startsWith('/finance-research-tasks')) return Response.json({ items: [{ task_id: 'old', symbol: '600011.SH', title: '公司研究 · 华能国际', status: 'completed', steps: [], report_period: period, updated_at: '2026-10-20', created_at: '2026-10-19' }] });
    if (path.includes('/quarter-reconciliation')) return Response.json({ status: 'gap' });
    if (path.includes('/page-research')) return Response.json({ new_material: period === '2026H1' ? { kind: 'report', name: '三季报', date: '2026-10-27' } : null, research: { valuation: { grade: '偏高' }, researchedAt: '2026-10-20', report_period: period } });
    if (path.includes('/feed/research-events')) return Response.json({ items: [] });
    return Response.json({});
  }) as typeof fetch;
  try {
    assert.deepEqual(await attention.loadAttentionIds(), ['material:600011.SH:report:三季报:2026-10-27']);
    assert.ok(methods.every(method => method === 'GET'));
    period = '2026Q3';
    assert.deepEqual(await attention.loadAttentionIds(), []);
  } finally { globalThis.fetch = oldFetch; }
});

test('动态研究从进行中转为完成时重读资料卡一次，清除旧提醒快照', async t => {
  const polls: (() => void)[] = [];
  const nativeTimeout = win.setTimeout.bind(win);
  t.mock.method(win, 'setTimeout', ((callback: () => void, ms: number, ...args: unknown[]) => {
    if (ms === 15_000) { polls.push(callback); return 0; }
    return nativeTimeout(callback, ms, ...args);
  }) as typeof win.setTimeout);
  let runningNow = true, reads = 0;
  const data = { as_of: '2026-10-28', variables: [], cards: [], coverage: { unresearched: [], uncovered: [] } };
  const loadRecon = async () => { reads++; return runningNow ? [card('600011.SH', '华能国际', '2026-10-27', { reminder: true, headline: '华能国际三季报已出', details: [] })] : []; };
  const loadResults = async () => ({ '600011.SH:2026Q3': runningNow ? { text: '重新研究中 3/6', changed: false } : null });
  await React.act(async () => root.render(null));
  await React.act(async () => root.render(React.createElement(router.MemoryRouter, null,
    React.createElement(pageContext.AiPageProvider, {}, React.createElement(desk.VariableDesk, {
      load: async () => data, loadFlips: async () => [], loadRecon, loadResults,
      loadFilings: async () => ({ rows: [], hidden: 0 }), loadEvents: async () => [],
    })))));
  await React.act(async () => {});
  assert.equal(reads, 1);
  assert.ok(polls.length);
  runningNow = false;
  await React.act(async () => { polls.pop()!(); });
  await React.act(async () => {});
  assert.equal(reads, 2);
  assert.equal(container.querySelector('[data-recon-card]'), null);
});

test('小圆点：有未看的判断变化亮（无数字）；进入动态页清除并记为已看；看过不再亮；跟踪图标上没有', async () => {
  win.localStorage.clear();
  const render = async (path: string, ids: string[]) => {
    await React.act(async () => root.render(null));
    await React.act(async () => root.render(React.createElement('div', null,
      React.createElement('a', { 'aria-label': '动态' }, React.createElement(dotModule.FeedDot, { pathname: path, load: async () => ids, peek: () => ids, delayMs: 0 })),
      React.createElement('a', { 'aria-label': '跟踪' }))));
    await React.act(async () => { await new Promise(resolve => setTimeout(resolve, 30)); });
  };
  const dot = () => container.querySelector('a[aria-label="动态"] .status-dot');
  await render('/watch', ['report:a', 'recon:b']);
  assert.ok(dot(), '圆点亮');
  assert.equal(dot()!.textContent!.replace(/\D/g, ''), '', '不显示数字');
  assert.equal(container.querySelector('a[aria-label="跟踪"] .status-dot'), null, '跟踪上没有');
  await render('/feed', ['report:a', 'recon:b']);
  assert.equal(dot(), null, '进入动态页即清除');
  await render('/watch', ['report:a', 'recon:b']);
  assert.equal(dot(), null, '看过不再亮');
  await render('/watch', ['flip:a', 'recon:b', 'recon:new']);
  assert.ok(dot(), '有新的又亮');
  await render('/watch', []);
  assert.equal(dot(), null, '没有判断变化不亮');
});

test('编号：跳档卡与写回的编号稳定；Layout 只在「动态」挂圆点，跟踪圆点已删', () => {
  assert.equal(attention.flipAttentionId({ symbol: '000933.SZ', kind: 'crossed', company: '神火', text: 'x' }), 'flip:000933.SZ:crossed:x');
  assert.equal(attention.writebackAttentionId('e1'), 'writeback:e1');
  const layout = readFileSync(new URL('../src/verticals/finance/components/layout/Layout.tsx', import.meta.url), 'utf8');
  assert.match(layout, /to === "\/feed" && <FeedDot/);
  assert.doesNotMatch(layout, /ArrivalDot|"\/tracking" && </);
});

test('个股详情的小圆点只消费已有缓存，不启动全关注读取', async () => {
  win.localStorage.clear();
  let calls = 0;
  await React.act(async () => root.render(null));
  await React.act(async () => root.render(React.createElement(dotModule.FeedDot, {
    pathname: '/watch/600011', delayMs: 0, peek: () => ['report:new'],
    load: async () => { calls++; return ['report:new']; },
  })));
  await React.act(async () => { await new Promise(resolve => setTimeout(resolve, 20)); });
  assert.equal(calls, 0);
  assert.ok(container.querySelector('.status-dot'));
});

for (const failure of ['recon', 'results']) test(`动态 ${failure} 部分失败显示重试、保留已到卡片，重试后清除提示`, async () => {
  let broken = true;
  const recon = card('600011.SH', '华能国际', '2026-10-27');
  const props = {
    load: async () => ({ as_of: '2026-10-27', variables: [], cards: [], coverage: { unresearched: [], uncovered: [] } }),
    loadFlips: async () => [], loadEvents: async () => [], loadFilings: async () => ({ rows: [], hidden: 0 }),
    loadRecon: async (_signal: AbortSignal, _now: unknown, progress: any, failed: any) => {
      progress?.([recon]);
      if (broken && failure === 'recon') failed?.(new Error('fixture partial failure'));
      return [recon];
    },
    loadResults: async (_cards: unknown, _signal: AbortSignal, failed: any) => {
      if (broken && failure === 'results') failed?.(new Error('fixture result failure'));
      return {};
    },
  };
  await React.act(async () => root.render(null));
  await React.act(async () => root.render(React.createElement(router.MemoryRouter, null, React.createElement(desk.VariableDesk, props))));
  assert.match(container.querySelector('[role="alert"]')?.textContent ?? '', /暂时读取不到 · 重试/);
  assert.ok(container.querySelector('[data-recon-card]'), '成功卡片不因另一项失败而消失');
  broken = false;
  await React.act(async () => (container.querySelector('[role="alert"] button') as HTMLButtonElement).click());
  assert.equal(container.querySelector('[role="alert"]'), null);
});
