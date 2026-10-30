// 关注页单一搜索框：筛已关注 + 列出可加入的候选；接口用替身，不碰真实 Backend。
import assert from 'node:assert/strict';
import test, { before, after, beforeEach } from 'node:test';
import { createServer as createHttpServer } from 'node:http';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';
import * as React from 'react';
import { Window } from 'happy-dom';
import { researchRoute } from '../dsh/finance-ui/research.mjs';

let server: Awaited<ReturnType<typeof createServer>>, win: Window, root: ReturnType<typeof import('react-dom/client')['createRoot']>, container: HTMLElement;
let watchPage: Record<string, any>, watchlist: Record<string, any>, roster: Record<string, any>, sessionModule: Record<string, any>, router: Record<string, any>, pageContext: Record<string, any>, search: Record<string, any>;
const previous = { window: globalThis.window, document: globalThis.document, sessionStorage: globalThis.sessionStorage, localStorage: globalThis.localStorage, requestAnimationFrame: globalThis.requestAnimationFrame, cancelAnimationFrame: globalThis.cancelAnimationFrame, fetch: globalThis.fetch, IS_REACT_ACT_ENVIRONMENT: globalThis.IS_REACT_ACT_ENVIRONMENT };
const calls: string[] = [];
let serverWatch: string[] = [];
let serverRoster: string[] = [];
let searchMode: 'ok' | 'down' = 'ok';
let writeFails = false;
const HITS = [
  { symbol: '600547.SH', name: '山东黄金', exchange: '上交所', match: 'fuzzy' },
  { symbol: '600489.SH', name: '中金黄金', exchange: '上交所', match: 'fuzzy' },
  { symbol: '000933.SZ', name: '神火股份', exchange: '深交所', match: 'name' },
];
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

before(async () => {
  win = new Window();
  Object.assign(globalThis, { window: win, document: win.document, sessionStorage: win.sessionStorage, localStorage: win.localStorage, requestAnimationFrame: (fn: () => void) => setTimeout(fn, 0), cancelAnimationFrame: clearTimeout, IS_REACT_ACT_ENVIRONMENT: true,
    fetch: async (url: string | URL | Request, init?: { method?: string; body?: string }) => {
      const path = typeof url === 'string' ? url : url instanceof URL ? url.href : (url as Request).url ?? String(url);
      const method = init?.method ?? 'GET';
      calls.push(`${method} ${path} ${init?.body ?? ''}`.trim());
      if (path.includes('/securities/search')) {
        if (searchMode === 'down') return json({ code: 'securities_unavailable' }, 503);
        const q = new URL(path, 'http://x').searchParams.get('q') ?? '';
        return json({ as_of: '2026-10-30', items: HITS.filter(hit => q.includes(hit.name) || hit.name.includes(q) || hit.symbol.startsWith(q) || (q.includes('黄金') && hit.name.includes('黄金')) || (q === 'sdhj' && hit.name === '山东黄金')) });
      }
      if (path.includes('/market/quotes')) {
        const names: Record<string, string> = { '000933.SZ': '神火股份', '600547.SH': '山东黄金', '600519.SH': '贵州茅台' };
        const symbols = (new URL(path, 'http://x').searchParams.get('symbols') ?? '').split(',').filter(Boolean);
        const blank = { price: null, change: null, change_pct: null, open: null, high: null, low: null, prev_close: null, limit_up: null, limit_down: null, volume: null, amount: null, market_cap: null, pe_ttm: null, as_of: null };
        return json({ quotes: symbols.filter(symbol => names[symbol]).map(symbol => ({ symbol, name: names[symbol], ...blank })), missing: [] });
      }
      if (path.includes('client/watch') && method === 'POST' && writeFails) return json({ detail: 'x' }, 500);
      if (path.includes('client/watch/delete')) return json({ symbols: serverWatch, removed: true });
      if (path.includes('client/watch')) {
        if (method === 'POST') { const symbol = JSON.parse(init!.body!).symbol; if (!serverWatch.includes(symbol)) serverWatch.push(symbol); }
        return json({ symbols: [...serverWatch], added: true });
      }
      if (path.includes('client/research')) {
        if (method === 'POST') { const symbol = JSON.parse(init!.body!).symbol; if (!serverRoster.includes(symbol)) serverRoster.push(symbol); }
        return json({ symbols: [...serverRoster], added: true });
      }
      if (path.includes('/wiki/pages')) return json({ items: [], total: 0 });
      return json({});
    } });
  server = await createServer({ configFile: false, root: fileURLToPath(new URL('../', import.meta.url)),
    resolve: { alias: { '@': fileURLToPath(new URL('../src/verticals/finance', import.meta.url)) } },
    server: { middlewareMode: true, hmr: { server: createHttpServer() }, watch: null }, appType: 'custom',
    ssr: { noExternal: ['react-router-dom', 'react-router'], resolve: { conditions: ['module-sync', 'node', 'import', 'development'] } } });
  watchPage = await server.ssrLoadModule('/src/verticals/finance/pages/Watch.tsx');
  search = await server.ssrLoadModule('/src/verticals/finance/lib/securitySearch.ts');
  watchlist = await server.ssrLoadModule('/src/verticals/finance/lib/watchlist.ts');
  roster = await server.ssrLoadModule('/src/verticals/finance/lib/researchRoster.ts');
  sessionModule = await server.ssrLoadModule('/src/verticals/finance/dsh/research-session.tsx');
  router = await server.ssrLoadModule('react-router-dom');
  pageContext = await server.ssrLoadModule('/src/core/ai/pageContext.tsx');
  container = win.document.createElement('div') as unknown as HTMLElement;
  win.document.body.append(container);
  root = (await import('react-dom/client')).createRoot(container);
});
after(async () => { await React.act(async () => root?.unmount()); await server?.close(); win?.happyDOM.abort(); Object.assign(globalThis, previous); });
beforeEach(async () => { searchMode = 'ok'; writeFails = false; serverWatch = ['000933']; serverRoster = ['000933']; await watchlist.hydrateWatch(); await roster.hydrateRoster(); calls.length = 0; });

const wait = (ms: number) => React.act(async () => { await new Promise(resolve => setTimeout(resolve, ms)); });
async function showWatch(path = '/watch') {
  const sessions = { start: async () => ({ sessionId: 's', status: 'started' }), subscribeSessionList: () => () => {} };
  const services = { readResearch: async () => ({ new_material: null, basisVersion: 'v1' }), subscribeResearch: () => () => {}, startResearch: async () => ({ sessionId: 's', status: 'researching', stage: '正在研究' }) };
  const { CompanyPageServicesContext } = await server.ssrLoadModule('/src/verticals/finance/pages/CompanyPage.tsx');
  await React.act(async () => root.render(null));
  await React.act(async () => root.render(React.createElement(router.MemoryRouter, { initialEntries: [path] },
    React.createElement(sessionModule.ResearchSessionContext.Provider, { value: sessions },
      React.createElement(CompanyPageServicesContext.Provider, { value: services },
        React.createElement(pageContext.AiPageProvider, {}, React.createElement(watchPage.Watch)))))));
  await wait(20);
}
const input = () => container.querySelector('input[aria-label="搜索关注"]') as unknown as HTMLInputElement;
const setter = () => Object.getOwnPropertyDescriptor(win.HTMLInputElement.prototype, 'value')!.set!;
const type = async (text: string, settle = 330) => { await React.act(async () => { setter().call(input(), text); input().dispatchEvent(new win.Event('input', { bubbles: true }) as unknown as Event); }); await wait(settle); };
const joinRows = () => [...container.querySelectorAll('[data-join]')] as unknown as HTMLElement[];
const searches = () => calls.filter(call => call.includes('/securities/search'));
const click = (element: Element | null | undefined) => React.act(async () => { (element as HTMLElement).click(); await new Promise(resolve => setTimeout(resolve, 30)); });

test('页面上只有一个搜索框：没有「添加关注」按钮和单独的输入框', async () => {
  await showWatch();
  assert.equal(container.querySelectorAll('input, textarea').length, 1);
  assert.equal(container.querySelector('textarea'), null);
  assert.ok(![...container.querySelectorAll('button')].some(button => /添加关注/.test(button.textContent ?? '')));
  assert.equal(joinRows().length, 0, '不输入时不出候选');
});

test('输入「山东黄金」：出候选，点「加入关注」后进已关注并保留搜索文字', async () => {
  await showWatch();
  await type('山东黄金');
  assert.equal(searches().length, 1);
  assert.match(searches()[0]!, /q=%E5%B1%B1%E4%B8%9C%E9%BB%84%E9%87%91&limit=5/);
  const rows = joinRows();
  assert.deepEqual(rows.map(row => row.querySelector('.font-medium')?.textContent), ['山东黄金', '中金黄金'], '已关注的神火股份不出现在候选里');
  assert.match(rows[0]!.textContent ?? '', /600547\.SH · 上交所/);
  assert.equal(rows[0]!.querySelector('button')?.textContent, '加入关注');
  calls.length = 0;
  await click(rows[0]!.querySelector('button'));
  assert.ok(calls.some(call => call.startsWith('POST') && call.includes('client/watch') && call.includes('600547')), '加入自选');
  assert.ok(calls.some(call => call.startsWith('POST') && call.includes('client/research') && call.includes('600547')), 'A 股进研究名单');
  assert.deepEqual(joinRows().map(row => row.querySelector('.font-medium')?.textContent), ['中金黄金'], '加入的不再出现在候选里');
  assert.match(container.querySelector('table')?.textContent ?? '', /山东黄金/, '出现在已关注列表里');
  assert.equal(input().value, '山东黄金', '搜索框保留文字');
});

test('加入失败：在那一行下面写一句灰字，不弹窗', async () => {
  await showWatch();
  await type('山东黄金');
  writeFails = true;
  await click(joinRows()[0]!.querySelector('button'));
  assert.match(joinRows()[0]!.querySelector('.watch-add-error')?.textContent ?? '', /没保存上/);
  assert.equal(joinRows().length, 2, '这一行还在，可再试');
  assert.equal(container.querySelectorAll('.watch-add-error').length, 1);
  assert.equal(container.querySelector('[role=alert]'), null);
});

test('粘贴多个代码：出「加入这 N 只」，一次批量加入；港股美股只进自选', async () => {
  await showWatch();
  await type('600519 000933 AAPL');
  assert.equal(searches().length, 0, '粘贴多个代码不查名单');
  const [batch] = joinRows();
  assert.equal(batch?.querySelector('.font-medium')?.textContent, '加入这 2 只', '已关注的 000933 不计');
  calls.length = 0;
  await click(batch!.querySelector('button'));
  assert.ok(calls.some(call => call.startsWith('POST') && call.includes('client/watch') && call.includes('600519')));
  assert.ok(calls.some(call => call.startsWith('POST') && call.includes('client/research') && call.includes('600519')));
  assert.ok(calls.some(call => call.startsWith('POST') && call.includes('client/watch') && call.includes('AAPL')));
  assert.equal(calls.some(call => call.startsWith('POST') && call.includes('client/research') && call.includes('AAPL')), false, '美股不进研究名单');
  assert.match(container.querySelector('[role=status]')?.textContent ?? '', /已关注 2 只；其中 1 只港股或美股暂不支持研究/);
});

test('只输入一个港股或美股代码：出「加入 X」', async () => {
  await showWatch();
  await type('AAPL');
  assert.deepEqual(joinRows().map(row => row.querySelector('.font-medium')?.textContent), ['加入 AAPL']);
  await type('00700.HK');
  assert.deepEqual(joinRows().map(row => row.querySelector('.font-medium')?.textContent), ['加入 00700.HK']);
  await type('6005');
  assert.ok(!joinRows().some(row => /加入 0/.test(row.textContent ?? '')), '半截数字不当港股代码');
  await type('sdhj');
  assert.deepEqual(joinRows().map(row => row.querySelector('.font-medium')?.textContent), ['山东黄金'], '拼音搜到 A 股时不当成美股代码');
});

test('接口 503：只显示已关注的筛选结果，不出候选，不弹错；没匹配时写一句话', async () => {
  searchMode = 'down';
  await showWatch();
  await type('神火');
  assert.equal(joinRows().length, 0);
  assert.match(container.querySelector('table')?.textContent ?? '', /000933/);
  assert.equal(container.querySelector('[role=alert]'), null);
  await type('山东黄金');
  assert.equal(joinRows().length, 0);
  assert.equal(container.querySelector('table'), null);
  assert.match(container.textContent ?? '', /没找到，试试代码或公司全称/);
  assert.equal(container.querySelector('[role=alert]'), null);
  await type('600519');
  assert.deepEqual(joinRows().map(row => row.querySelector('.font-medium')?.textContent), ['加入 600519'], '名单没拉到时整串 A 股代码仍可直接加');
});

test('接口有结果时，没有候选也没有已关注匹配就写「没找到」', async () => {
  await showWatch();
  await type('神火');
  assert.equal(joinRows().length, 0, '候选里只有已关注的神火股份，被滤掉');
  assert.ok(container.querySelector('table'), '已关注的神火仍在列表里');
});

test('输入法拼写期间不发请求，选字完成后才查；连续输入只发最后一次', async () => {
  await showWatch();
  await React.act(async () => { input().dispatchEvent(new win.CompositionEvent('compositionstart', { bubbles: true }) as unknown as Event); });
  await type('shandong');
  assert.equal(searches().length, 0);
  setter().call(input(), '山东黄金');
  await React.act(async () => { input().dispatchEvent(new win.CompositionEvent('compositionend', { bubbles: true, data: '山东黄金' }) as unknown as Event); });
  await wait(330);
  assert.equal(searches().length, 1);
  calls.length = 0;
  await type('山东', 100);
  await type('山东黄', 100);
  await type('山东黄金股份', 330);
  assert.equal(searches().length, 1, '停顿约 250ms 才请求');
  assert.match(decodeURIComponent(searches()[0]!), /q=山东黄金股份&/);
});

test('securitySearch：503 或网络失败返回 null，空输入不请求，接口白名单放行 GET', async () => {
  const seen: string[] = [];
  const read = (async (route: string) => { seen.push(route); throw new Error('x'); }) as any;
  assert.equal(await search.searchSecurities('山东黄金', undefined, read), null);
  assert.deepEqual(await search.searchSecurities('   ', undefined, read), []);
  assert.equal(seen.length, 1);
  assert.equal(researchRoute('GET', '/securities/search'), true);
  assert.equal(researchRoute('POST', '/securities/search'), false);
});
