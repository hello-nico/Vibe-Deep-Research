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
const info = (grade: string | null, previousGrade: string | null, researchedAt = '2026-10-26T01:00:00Z') => ({ grade, previousGrade, researchedAt });
const running = { task_id: 't', symbol: '300750.SZ', status: 'running', current_step: 3, steps: [1, 2, 3, 4, 5, 6].map(i => ({ key: `s${i}`, label: 's', status: 'pending' })) };

test('三种结论：变了、没变、研究中；研究早于披露日、读不到不写；没有上一版只写档位', () => {
  const c = card('000933.SZ', '神火', '2026-10-20');
  assert.deepEqual(result.reconResult(c, undefined, info('合理', '偏低')), { text: '已按三季报重新研究：估值从偏低变为合理', changed: true, id: 'recon:000933.SZ:2026Q3:偏低>合理' });
  assert.deepEqual(result.reconResult(c, undefined, info('合理', '合理')), { text: '已按三季报重新研究：估值判断没变（合理）', changed: false });
  assert.deepEqual(result.reconResult(card('300750.SZ', '宁德', '2026-10-21'), running as any, null), { text: '正在按三季报重新研究（3/6）', changed: false });
  assert.equal(result.reconResult(c, undefined, info('合理', '偏低', '2026-10-19T01:00:00Z')), null, '研究完成早于披露日：不写');
  assert.equal(result.reconResult(c, undefined, null), null, '读不到不写');
  assert.deepEqual(result.reconResult(c, undefined, info('合理', null)), { text: '已按三季报重新研究：估值合理', changed: false });
});

test('财报卡：第三行写结论，变了的置顶并在底行类型前加「判断变化 · 」；没变的不置顶', () => {
  const changed = stream.reconStream(card('000933.SZ', '神火', '2026-10-20'), result.reconResult(card('000933.SZ', '神火', '2026-10-20'), undefined, info('合理', '偏低')));
  const same = stream.reconStream(card('601899.SH', '紫金', '2026-10-24'), result.reconResult(card('601899.SH', '紫金', '2026-10-24'), undefined, info('合理', '合理')));
  const none = stream.reconStream(card('600900.SH', '长电', '2026-10-25'));
  assert.equal(changed.pinned, true); assert.deepEqual(changed.result, { text: '已按三季报重新研究：估值从偏低变为合理', strong: true });
  assert.equal(same.pinned, undefined); assert.equal(same.result.strong, false);
  assert.equal(none.result, undefined);
  assert.deepEqual(stream.streamOf([none, same, changed], '全部').map((c: any) => c.companies[0].name), ['神火', '长电', '紫金'], '变了的置顶，其余按日期');
});

test('页面：结论行与「判断变化 · 」前缀；进行中写进度', async () => {
  const loadResults = async () => ({ '000933.SZ': result.reconResult(card('000933.SZ', '神火', '2026-10-20'), undefined, info('合理', '偏低')), '300750.SZ': result.reconResult(card('300750.SZ', '宁德', '2026-10-21'), running, null) });
  const data = { as_of: '2026-10-26', variables: [], cards: [], coverage: { unresearched: [], uncovered: [] } };
  const Probe = () => { pageContext.useAiQuestion(); return null; };
  await React.act(async () => root.render(React.createElement(router.MemoryRouter, null,
    React.createElement(sessionModule.ResearchSessionContext.Provider, { value: { start: async () => ({ sessionId: 's', status: 'started' }) } },
      React.createElement(pageContext.AiPageProvider, {}, React.createElement(Probe), React.createElement(desk.VariableDesk, { load: async () => data, loadFlips: async () => [], loadRecon: async () => [card('300750.SZ', '宁德', '2026-10-21'), card('000933.SZ', '神火', '2026-10-20')], loadFilings: async () => ({ rows: [], hidden: 0 }), loadResults, filter: '全部' }))))));
  await React.act(async () => {});
  const cards = [...container.querySelectorAll('[data-recon-card]')];
  assert.deepEqual(cards.map(c => c.getAttribute('data-recon-card')), ['000933.SZ', '300750.SZ'], '档位变了的神火置顶');
  assert.equal(cards[0].querySelector('[data-recon-result]')!.textContent, '已按三季报重新研究：估值从偏低变为合理');
  assert.ok(cards[0].querySelector('[data-recon-result].is-strong'));
  assert.match(cards[0].querySelector('.variable-card-foot')!.textContent!, /^判断变化 · 财报 · 10 月 20 日/);
  assert.equal(cards[1].querySelector('[data-recon-result]')!.textContent, '正在按三季报重新研究（3/6）');
  assert.match(cards[1].querySelector('.variable-card-foot')!.textContent!, /^财报 · 10 月 21 日/);
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

test('小圆点：有未看的判断变化亮（无数字）；进入动态页清除并记为已看；看过不再亮；跟踪图标上没有', async () => {
  win.localStorage.clear();
  const render = async (path: string, ids: string[]) => {
    await React.act(async () => root.render(null));
    await React.act(async () => root.render(React.createElement('div', null,
      React.createElement('a', { 'aria-label': '动态' }, React.createElement(dotModule.FeedDot, { pathname: path, load: async () => ids })),
      React.createElement('a', { 'aria-label': '跟踪' }))));
    await React.act(async () => { await new Promise(resolve => setTimeout(resolve, 30)); });
  };
  const dot = () => container.querySelector('a[aria-label="动态"] .status-dot');
  await render('/watch', ['flip:a', 'recon:b']);
  assert.ok(dot(), '圆点亮');
  assert.equal(dot()!.textContent!.replace(/\D/g, ''), '', '不显示数字');
  assert.equal(container.querySelector('a[aria-label="跟踪"] .status-dot'), null, '跟踪上没有');
  await render('/feed', ['flip:a', 'recon:b']);
  assert.equal(dot(), null, '进入动态页即清除');
  await render('/watch', ['flip:a', 'recon:b']);
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
