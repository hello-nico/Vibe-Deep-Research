// 第一次打开：关注为空时的空态；选中公司后加入关注与研究名单并进入个股页，已有关注时不出现。
import assert from 'node:assert/strict';
import test, { before, after } from 'node:test';
import { createServer as createHttpServer } from 'node:http';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';
import * as React from 'react';
import { Window } from 'happy-dom';

let server: Awaited<ReturnType<typeof createServer>>, win: Window, root: ReturnType<typeof import('react-dom/client')['createRoot']>, container: HTMLElement;
let watchPage: Record<string, any>, firstOpen: Record<string, any>, lib: Record<string, any>, watchlist: Record<string, any>, roster: Record<string, any>, chainLib: Record<string, any>;
const chainFixture = {
  id: 'uchain:0123456789ab', public_chain_id: 'coal-power-aluminium', name: '煤—电—铝', version: 2, has_previous: false,
  stages: [
    { industry_code: 'a', industry_name: '煤炭开采', companies: [] },
    { industry_code: 'b', industry_name: '电力', companies: [] },
    { industry_code: 'c', industry_name: '工业金属', companies: ['000933.SZ'] },
  ],
  drivers: [], transmission: [],
};
let userChains: unknown[] = [chainFixture];
let chainsDown = false;
let sessionModule: Record<string, any>, router: Record<string, any>, pageContext: Record<string, any>;
const previous = { window: globalThis.window, document: globalThis.document, sessionStorage: globalThis.sessionStorage, localStorage: globalThis.localStorage, requestAnimationFrame: globalThis.requestAnimationFrame, cancelAnimationFrame: globalThis.cancelAnimationFrame, fetch: globalThis.fetch, IS_REACT_ACT_ENVIRONMENT: globalThis.IS_REACT_ACT_ENVIRONMENT };
const calls: string[] = [];
const pages = [
  { slug: 'companies/000933-sz', title: '神火股份' },
  { slug: 'companies/600900-sh', title: '长江电力' },
];

before(async () => {
  win = new Window();
  Object.assign(globalThis, { window: win, document: win.document, sessionStorage: win.sessionStorage, localStorage: win.localStorage, requestAnimationFrame: (fn: () => void) => setTimeout(fn, 0), cancelAnimationFrame: clearTimeout, IS_REACT_ACT_ENVIRONMENT: true,
    fetch: async (url: string | URL | Request, init?: { method?: string; body?: string }) => {
      const path = typeof url === 'string' ? url : url instanceof URL ? url.href : (url as Request).url ?? String(url);
      calls.push(`${init?.method ?? 'GET'} ${path} ${init?.body ?? ''}`.trim());
      if (chainsDown && path.includes('/wiki/user-chains')) return new Response('{}', { status: 500 });
      const body = path.includes('/wiki/pages') ? { items: pages, total: pages.length }
        : /\/wiki\/user-chains\/[^/?]+/.test(path) ? chainFixture
        : path.includes('/wiki/user-chains') ? { items: userChains.map(() => ({ id: chainFixture.id })) }
        : path.includes('client/') ? { symbols: ['000933'], added: true } : {};
      return new Response(JSON.stringify(body), { status: 200, headers: { 'Content-Type': 'application/json' } });
    } });
  server = await createServer({ configFile: false, root: fileURLToPath(new URL('../', import.meta.url)),
    resolve: { alias: { '@': fileURLToPath(new URL('../src/verticals/finance', import.meta.url)) } },
    server: { middlewareMode: true, hmr: { server: createHttpServer() }, watch: null }, appType: 'custom',
    ssr: { noExternal: ['react-router-dom', 'react-router'], resolve: { conditions: ['module-sync', 'node', 'import', 'development'] } } });
  watchPage = await server.ssrLoadModule('/src/verticals/finance/pages/Watch.tsx');
  firstOpen = await server.ssrLoadModule('/src/verticals/finance/pages/FirstOpen.tsx');
  chainLib = await server.ssrLoadModule('/src/verticals/finance/lib/chainPage.ts');
  lib = await server.ssrLoadModule('/src/verticals/finance/lib/firstOpen.ts');
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

let at = '';
const Where = () => { at = router.useLocation().pathname; return null; };
async function showWatch(path = '/watch') {
  const sessions = { start: async () => ({ sessionId: 's', status: 'started' }), subscribeSessionList: () => () => {} };
  const services = { readResearch: async () => ({ new_material: null, basisVersion: 'v1' }), subscribeResearch: () => () => {}, startResearch: async () => ({ sessionId: 's', status: 'researching', stage: '正在研究' }) };
  const { CompanyPageServicesContext } = await server.ssrLoadModule('/src/verticals/finance/pages/CompanyPage.tsx');
  await React.act(async () => root.render(null));
  await React.act(async () => root.render(React.createElement(router.MemoryRouter, { initialEntries: [path] },
    React.createElement(sessionModule.ResearchSessionContext.Provider, { value: sessions },
      React.createElement(CompanyPageServicesContext.Provider, { value: services },
        React.createElement(pageContext.AiPageProvider, {}, React.createElement(Where), React.createElement(watchPage.Watch)))))));
  await React.act(async () => { await new Promise(resolve => setTimeout(resolve, 20)); });
  if (path.includes('kind=chains')) {
    for (let i = 0; i < 25 && !(container.textContent || '').includes('煤—电—铝'); i++) {
      await React.act(async () => { await new Promise(resolve => setTimeout(resolve, 20)); });
    }
  }
}

test('名称只匹配已研究过的公司，代码只认 A 股，认不出时给一句提示', () => {
  assert.deepEqual(lib.resolveFirstOpenInput('神火股份', pages), { symbol: '000933', name: '神火股份' });
  assert.deepEqual(lib.resolveFirstOpenInput('长江', pages), { symbol: '600900', name: '长江电力' });
  assert.deepEqual(lib.resolveFirstOpenInput(' 601288 ', pages), { symbol: '601288', name: '601288' });
  assert.deepEqual(lib.resolveFirstOpenInput('sh600519', pages), { symbol: '600519', name: '600519' });
  assert.match(lib.resolveFirstOpenInput('00700.HK', pages).hint, /暂不支持/);
  assert.match(lib.resolveFirstOpenInput('某某公司', pages).hint, /6 位 A 股代码/);
  assert.equal(lib.resolveFirstOpenInput('   ', pages).hint, '');
});

test('示例只列已研究过的公司', () => {
  assert.deepEqual(lib.firstOpenExamples(pages).map((item: { name: string }) => item.name), ['神火股份', '长江电力']);
  assert.deepEqual(lib.firstOpenExamples([]), []);
});

test('关注为空：显示一句话、输入框和示例，不出现表格；输入后进入个股页', async () => {
  watchlist.replaceWatchCache([]);
  await showWatch();
  assert.ok(container.querySelector('[aria-label="第一次打开"]'), '空态出现');
  assert.match(container.textContent ?? '', /你在关注哪些公司？/);
  assert.equal(container.querySelector('table'), null);
  assert.deepEqual([...container.querySelectorAll('[aria-label="示例公司"] button')].map(b => b.textContent), ['神火股份', '长江电力']);
  const input = container.querySelector('input[aria-label="公司名称或代码"]') as HTMLInputElement;
  const setter = Object.getOwnPropertyDescriptor(win.HTMLInputElement.prototype, 'value')!.set!;
  calls.length = 0;
  await React.act(async () => { setter.call(input, '000933'); input.dispatchEvent(new win.Event('input', { bubbles: true })); });
  await React.act(async () => { (container.querySelector('button[type=submit]') as HTMLElement).click(); await new Promise(resolve => setTimeout(resolve, 20)); });
  assert.ok(calls.some(call => call.startsWith('POST') && call.includes('client/watch') && call.includes('000933')), '加入关注');
  assert.ok(calls.some(call => call.startsWith('POST') && call.includes('client/research') && call.includes('000933')), '加入研究名单');
  assert.equal(at, '/watch/000933', '进入个股页（研究由个股页自己开始）');
});

test('认不出的输入只出提示，不加关注', async () => {
  const started: string[] = [];
  await React.act(async () => root.render(React.createElement(firstOpen.FirstOpen, { pages, onStart: async (symbol: string) => { started.push(symbol); } })));
  const input = container.querySelector('input') as HTMLInputElement;
  const setter = Object.getOwnPropertyDescriptor(win.HTMLInputElement.prototype, 'value')!.set!;
  await React.act(async () => { setter.call(input, '某某公司'); input.dispatchEvent(new win.Event('input', { bubbles: true })); });
  await React.act(async () => { (container.querySelector('button[type=submit]') as HTMLElement).click(); });
  assert.deepEqual(started, []);
  assert.match(container.querySelector('[role=status]')?.textContent ?? '', /6 位 A 股代码/);
});

test('已有关注时不出现空态，照常显示列表', async () => {
  watchlist.replaceWatchCache(['000933']);
  await showWatch();
  assert.equal(container.querySelector('[aria-label="第一次打开"]'), null);
  assert.ok(container.querySelector('table'), '关注表格');
  assert.ok(container.querySelector('[aria-label="关注对象"]'), '个股 / 产业链分段');
});

test('空态只在个股分段；产业链分段列出用户自己的链，点进链页', async () => {
  watchlist.replaceWatchCache(['000933']);
  await showWatch('/watch?kind=chains');
  assert.equal(container.querySelector('[aria-label="第一次打开"]'), null);
  assert.equal(container.querySelector('table'), null);
  assert.match(container.textContent ?? '', /煤—电—铝/);
  assert.match(container.textContent ?? '', /煤炭开采 → 电力 → 工业金属/);
  assert.match(container.textContent ?? '', /链上已关注 1 家/);
  const link = container.querySelector('a[href="/chains/uchain%3A0123456789ab"]');
  assert.ok(link, '进入链页');
});

test('关注为空时切到产业链仍能看见链，空态不出现', async () => {
  watchlist.replaceWatchCache([]);
  await showWatch('/watch?kind=chains');
  assert.equal(container.querySelector('[aria-label="第一次打开"]'), null);
  assert.match(container.textContent ?? '', /煤—电—铝/);
});

test('产业链分段只列用户链：没有时一句话说怎么建，不展示预置链；读不到一句话加重试', async () => {
  watchlist.replaceWatchCache(['000933']);
  userChains = [];
  await showWatch('/watch?kind=chains');
  assert.match(container.querySelector('[data-chains-empty]')?.textContent ?? '', /在公司页或对话里新建产业链/);
  assert.equal(container.querySelectorAll('.object-grid a').length, 0);
  assert.equal(calls.some(call => /\/wiki\/chains(?!\w)/.test(call)), false, '不再读预置链');
  userChains = [chainFixture]; chainsDown = true;
  await showWatch('/watch?kind=chains');
  await React.act(async () => { await new Promise(resolve => setTimeout(resolve, 60)); });
  assert.match(container.querySelector('[role=alert]')?.textContent ?? '', /暂时读取不到 · 重试/);
  chainsDown = false;
  await React.act(async () => { (container.querySelector('[role=alert] button') as HTMLButtonElement).click(); });
  await React.act(async () => { await new Promise(resolve => setTimeout(resolve, 40)); });
  assert.match(container.textContent ?? '', /煤—电—铝/);
});
