// 对话里调整的页面呈现：动态记录卡（档位变化置顶、打开对话、撤回只对最新一次）、对话里提到的因素、放行的接口。
import assert from 'node:assert/strict';
import test, { before, after } from 'node:test';
import { fileURLToPath } from 'node:url';
import { createServer as createHttpServer } from 'node:http';
import { createServer } from 'vite';
import * as React from 'react';
import { Window } from 'happy-dom';
import { researchRoute } from '../dsh/finance-ui/research.mjs';

let server: Awaited<ReturnType<typeof createServer>>, win: Window, root: ReturnType<typeof import('react-dom/client')['createRoot']>, container: HTMLElement;
let events: Record<string, any>, stream: Record<string, any>, desk: Record<string, any>, factors: Record<string, any>, router: Record<string, any>, pageContext: Record<string, any>, sessionModule: Record<string, any>;
const previous = { window: globalThis.window, document: globalThis.document, fetch: globalThis.fetch, IS_REACT_ACT_ENVIRONMENT: globalThis.IS_REACT_ACT_ENVIRONMENT };
before(async () => {
  win = new Window();
  Object.assign(globalThis, { window: win, document: win.document, IS_REACT_ACT_ENVIRONMENT: true });
  server = await createServer({ configFile: false, root: fileURLToPath(new URL('../', import.meta.url)),
    resolve: { alias: { '@': fileURLToPath(new URL('../src/verticals/finance', import.meta.url)) } },
    server: { middlewareMode: true, hmr: { server: createHttpServer() }, watch: null }, appType: 'custom',
    ssr: { noExternal: ['react-router-dom', 'react-router'], resolve: { conditions: ['module-sync', 'node', 'import', 'development'] } } });
  const load = (path: string) => server.ssrLoadModule(`/src/verticals/finance/${path}`);
  [events, stream, desk, factors, sessionModule] = await Promise.all([load('lib/researchEvents.ts'), load('lib/feedStream.ts'), load('pages/VariableDesk.tsx'), load('components/ConversationFactors.tsx'), load('dsh/research-session.tsx')]);
  router = await server.ssrLoadModule('react-router-dom');
  pageContext = await server.ssrLoadModule('/src/core/ai/pageContext.tsx');
  container = win.document.createElement('div') as unknown as HTMLElement;
  win.document.body.append(container);
  root = (await import('react-dom/client')).createRoot(container);
});
after(async () => { await React.act(async () => root?.unmount()); await server?.close(); win?.happyDOM.abort(); Object.assign(globalThis, previous); });

const ev = (id: string, at: string, over: Record<string, unknown> = {}) => ({ id, at, symbol: '000933.SZ', kind: 'drivers', summary: '按讨论改写铝价取值', session_id: `s-${id}`, research_version: `v-${id}`, previous_version: null, reversible: true, grade_before: null, grade_after: null, ...over });

test('撤回只对该公司最新一次可用，其余不显示撤回；撤回过之后更早的都不可用；候选状态变化没有撤回', () => {
  const list = [
    ev('c', '2026-10-26T09:00:00Z', { kind: 'candidate', reversible: false }),
    ev('b', '2026-10-26T08:00:00Z'), ev('a', '2026-10-25T08:00:00Z'),
    ev('z', '2026-10-26T08:00:00Z', { symbol: '600900.SH' }),
  ];
  const states = events.revertStates(list);
  assert.equal(states.get('b'), 'available'); assert.equal(states.get('a'), 'newer'); assert.equal(states.has('c'), false);
  assert.equal(states.get('z'), 'available', '另一家各算各的');
  const afterRevert = events.revertStates([ev('r', '2026-10-26T10:00:00Z', { kind: 'revert', reversible: false }), ...list]);
  assert.equal(afterRevert.get('b'), 'newer', '撤回之后不能再退');
});

test('三种记录卡：档位变了（置顶、判断变化）、没变、没有档位字段；用词不含内部词', () => {
  const names = { '000933': '神火' };
  const cards = events.writebackEvents([
    ev('1', '2026-10-26T08:00:00Z', { grade_before: '合理', grade_after: '偏高' }),
    ev('2', '2026-10-25T08:00:00Z', { kind: 'thesis', summary: '把论点改成以氧化铝成本为主', grade_before: '偏高', grade_after: '偏高' }),
    ev('3', '2026-10-24T08:00:00Z', { kind: 'candidate', summary: '候选因子：电价', reversible: false }),
  ], names).map(stream.writebackStream);
  assert.deepEqual(cards.map((c: any) => c.type), ['对话', '对话', '对话']);
  assert.equal(cards[0].title[0].text, '按讨论改写铝价取值');
  assert.equal(cards[0].involved[0].text, '神火 · 价格影响');
  assert.deepEqual(cards[0].result, { text: '估值从合理变为偏高', strong: true }); assert.equal(cards[0].pinned, true);
  assert.deepEqual(cards[1].result, { text: '估值没变（偏高）', strong: false }); assert.equal(cards[1].pinned, undefined);
  assert.equal(cards[2].result, undefined); assert.equal(cards[2].revert, undefined);
  assert.equal(cards[0].revert.state, 'available'); assert.equal(cards[1].revert.state, 'newer');
  assert.equal(cards[0].date, '2026-10-26');
  assert.equal(cards[2].title[0].text, '新因素：电价', '内部说法换成人话');
  assert.equal(stream.streamOf(cards.slice().reverse(), '全部')[0].key, 'event:1', '档位变了的置顶');
  assert.doesNotMatch(JSON.stringify(cards.map((c: any) => [c.title, c.involved, c.result])), /写回|候选|driver|session/i);
});

let loadCount = 0;
async function showDesk(loadEventsRaw: () => Promise<unknown>, sessions: Record<string, unknown>) {
  loadCount = 0;
  const loadEvents = async () => { loadCount++; return loadEventsRaw(); };
  const data = { as_of: '2026-10-26', variables: [], cards: [], coverage: { unresearched: [], uncovered: [] } };
  await React.act(async () => root.render(React.createElement(router.MemoryRouter, null,
    React.createElement(sessionModule.ResearchSessionContext.Provider, { value: sessions },
      React.createElement(pageContext.AiPageProvider, {}, React.createElement(desk.VariableDesk, { load: async () => data, loadFlips: async () => [], loadRecon: async () => [], loadFilings: async () => ({ rows: [], hidden: 0 }), loadEvents, filter: '全部' }))))));
  await React.act(async () => { await new Promise(resolve => setTimeout(resolve, 20)); });
}

test('动态里的记录卡：置顶、「对话」、打开对话、撤回带版本发 POST 并重读；旧的不显示撤回', async () => {
  const requests: { url: string; method: string; body?: string }[] = [];
  let reverted = false;
  globalThis.fetch = (async (url: string, init?: RequestInit) => {
    requests.push({ url: String(url), method: init?.method ?? 'GET', body: init?.body as string | undefined });
    return Response.json({});
  }) as typeof fetch;
  const list = () => events.writebackEvents(reverted ? [] : [
    ev('1', '2026-10-26T08:00:00Z', { grade_before: '合理', grade_after: '偏高' }), ev('0', '2026-10-25T08:00:00Z'),
  ], { '000933': '神火' });
  const opened: string[] = [];
  await showDesk(async () => list(), { openSession: async (id: string) => { opened.push(id); }, start: async () => ({ sessionId: 's', status: 'started' }) });
  const cards = [...container.querySelectorAll('[data-writeback-card]')];
  assert.equal(cards.length, 2);
  assert.equal(cards[0].querySelector('.variable-card-title')!.textContent, '按讨论改写铝价取值');
  assert.equal(loadCount, 1, '记录只读一次，不会因渲染反复重读');
  assert.equal(cards[0].querySelector('.variable-card-result')!.textContent, '估值从合理变为偏高');
  assert.match(cards[0].querySelector('.variable-card-foot')!.textContent!, /^置顶 · 对话 · 10-26/);
  const labels = (card: Element) => [...card.querySelectorAll('.variable-card-actions > *')].map(el => el.textContent);
  assert.ok(labels(cards[0]).includes('撤回') && labels(cards[0]).includes('打开对话') && labels(cards[0]).includes('看神火') && labels(cards[0]).includes('讨论'));
  assert.ok(!labels(cards[1]).includes('撤回'), '旧的一次没有撤回按钮');
  assert.ok(!labels(cards[1]).includes('已有更新的版本'), '旧的一次不写灰字');
  await React.act(async () => ([...cards[0].querySelectorAll('button')].find(b => b.textContent === '打开对话') as HTMLButtonElement).click());
  assert.deepEqual(opened, ['s-1']);
  reverted = true;
  await React.act(async () => ([...cards[0].querySelectorAll('button')].find(b => b.textContent === '撤回') as HTMLButtonElement).click());
  await React.act(async () => { await new Promise(resolve => setTimeout(resolve, 20)); });
  const post = requests.find(r => r.method === 'POST')!;
  assert.match(post.url, /\/finance-research\/wiki\/companies\/000933\.SZ\/page-research\/revert$/);
  assert.equal(post.body, JSON.stringify({ expectedResearchVersion: 'v-1' }));
  assert.equal(loadCount, 2, '撤回后重读一次');
  assert.equal(container.querySelectorAll('[data-writeback-card]').length, 0, '撤回后重读');
});

test('对话里提到的因素：纳入、排除（理由可空，Backend 要理由时记暂不需要）、观察；排除后不再出现；读不到整组不出现', async () => {
  const calls: { url: string; method: string; body?: any }[] = [];
  const items = [
    { id: 'f1', name: '电价', why: '电解铝成本里电价占大头', status: '候选' },
    { id: 'f2', name: '氧化铝库存', why: '库存变化影响现货', status: '候选' },
    { id: 'f3', name: '煤价', why: '自备电厂', status: '候选' },
    { id: 'f4', name: '已排除的', why: '不该出现', status: '排除' },
  ];
  globalThis.fetch = (async (url: string, init?: RequestInit) => {
    const method = init?.method ?? 'GET';
    calls.push({ url: String(url), method, body: init?.body ? JSON.parse(init.body as string) : undefined });
    if (method === 'GET') return Response.json({ items });
    const id = String(url).split('/').pop()!;
    const body = JSON.parse(init!.body as string);
    return Response.json({ ...items.find(item => item.id === id), status: body.status });
  }) as typeof fetch;
  let researched = 0;
  const render = async () => { await React.act(async () => root.render(null)); await React.act(async () => root.render(React.createElement(factors.ConversationFactors, { symbol: '000933', onResearch: () => { researched++; } }))); await React.act(async () => { await new Promise(resolve => setTimeout(resolve, 20)); }); };
  await render();
  assert.match(calls[0].url, /\/finance-research\/wiki\/companies\/000933\.SZ\/driver-candidates$/);
  assert.equal(container.querySelector('[data-conversation-factors] h3')!.textContent, '对话里的新因素');
  assert.equal(container.querySelectorAll('[data-factor]').length, 3, '排除的不显示');
  const row = (id: string) => container.querySelector(`[data-factor="${id}"]`)!;
  assert.deepEqual([...row('f1').querySelectorAll('.company-page-factor-actions button')].map(b => b.textContent), ['纳入', '排除', '观察']);
  assert.doesNotMatch(container.textContent!, /候选|driver|写回/i);
  await React.act(async () => ([...row('f1').querySelectorAll('button')].find(b => b.textContent === '纳入') as HTMLButtonElement).click());
  await React.act(async () => {});
  assert.deepEqual(calls.at(-1)!.body, { status: '纳入' });
  assert.match(calls.at(-1)!.url, /driver-candidates\/f1$/);
  assert.equal(row('f1').querySelector('[data-factor-state="included"]')!.textContent, '已纳入，下次研究会算进模型重新研究');
  await React.act(async () => (row('f1').querySelector('[data-factor-state] button') as HTMLButtonElement).click());
  assert.equal(researched, 1);
  assert.ok(!calls.some(c => c.url.includes('/page-research') || c.url.includes('/ensure')), '纳入不自动跑研究');
  await React.act(async () => ([...row('f2').querySelectorAll('button')].find(b => b.textContent === '排除') as HTMLButtonElement).click());
  assert.ok(row('f2').querySelector('input[aria-label="排除理由"]'), '排除要有地方写理由');
  await React.act(async () => ([...row('f2').querySelectorAll('button')].find(b => b.textContent === '确认排除') as HTMLButtonElement).click());
  await React.act(async () => {});
  assert.deepEqual(calls.at(-1)!.body, { status: '排除', reason: '暂不需要' }, '理由可空');
  assert.equal(container.querySelector('[data-factor="f2"]'), null, '排除后不再显示');
  await React.act(async () => ([...row('f3').querySelectorAll('button')].find(b => b.textContent === '观察') as HTMLButtonElement).click());
  await React.act(async () => {});
  assert.deepEqual(calls.at(-1)!.body, { status: '观察' });
  assert.equal(row('f3').querySelector('[data-factor-state="watching"]')!.textContent, '观察中');
  globalThis.fetch = (async () => Response.json({ detail: 'x' }, { status: 500 })) as typeof fetch;
  await render();
  assert.equal(container.querySelector('[data-conversation-factors]'), null, '读不到整组不出现');
});

test('宿主放行：写回记录读、因素读与改状态；新建因素与其他方法不放行', () => {
  assert.equal(researchRoute('GET', '/feed/research-events'), true);
  assert.equal(researchRoute('POST', '/feed/research-events'), false);
  assert.equal(researchRoute('GET', '/wiki/companies/000933.SZ/driver-candidates'), true);
  assert.equal(researchRoute('PATCH', '/wiki/companies/000933.SZ/driver-candidates/a1b2c3d4e5f60718'), true);
  assert.equal(researchRoute('POST', '/wiki/companies/000933.SZ/driver-candidates'), false, '新建只有模型能做');
  assert.equal(researchRoute('DELETE', '/wiki/companies/000933.SZ/driver-candidates/a1'), false);
  assert.equal(researchRoute('PATCH', '/wiki/companies/000933.SZ/driver-candidates/../x'), false);
});
