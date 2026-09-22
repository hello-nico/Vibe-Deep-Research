import assert from 'node:assert/strict';
import test from 'node:test';
import { createElement as h, act } from 'react';
import { Window } from 'happy-dom';
import { createServer } from 'vite';
import { createServer as httpServer } from 'node:http';
import { fileURLToPath } from 'node:url';

test('依据深链冷启动、刷新、站内跳转只打开一个面板，关闭后不自动重开', async () => {
  const win = new Window({ url: 'http://127.0.0.1:5930/' });
  const previous = { window: globalThis.window, document: globalThis.document,
    fetch: globalThis.fetch, IS_REACT_ACT_ENVIRONMENT: globalThis.IS_REACT_ACT_ENVIRONMENT };
  Object.assign(globalThis, { window: win, document: win.document, IS_REACT_ACT_ENVIRONMENT: true });
  const server = await createServer({ configFile: false, root: fileURLToPath(new URL('../', import.meta.url)),
    esbuild: { jsx: 'automatic' },
    resolve: { alias: [{ find: '@', replacement: fileURLToPath(new URL('../src/verticals/finance', import.meta.url)) }] },
    server: { middlewareMode: true, hmr: { server: httpServer() }, watch: null }, appType: 'custom',
    ssr: { noExternal: ['react-router-dom', 'react-router'], resolve: { conditions: ['module-sync', 'node', 'import', 'development'] } } });
  const { createRoot } = await import('react-dom/client');
  const container = win.document.createElement('div');
  win.document.body.append(container);
  let root = createRoot(container);
  let reads = 0;
  globalThis.fetch = async (_url, init) => {
    reads++;
    const ref = JSON.parse(String(init?.body)).refs[0];
    return Response.json({ results: [{ ref, status: 'resolved', kind: 'claim', data: { text: `依据 ${ref}` } }] });
  };
  try {
    const { createMemoryRouter, RouterProvider, Outlet } = await server.ssrLoadModule('react-router-dom');
    const { EvidenceProvider } = await server.ssrLoadModule('/src/verticals/finance/components/EvidenceCard.tsx');
    const { EvidenceDeepLink } = await server.ssrLoadModule('/src/verticals/finance/pages/EvidenceDeepLink.tsx');
    const { markWebCitations } = await server.ssrLoadModule('/src/verticals/finance/components/ConversationCitations.tsx');
    const streamingLink = win.document.createElement('a');
    streamingLink.href = 'http://127.0.0.1:5930/evidence?ref=claim%3Afirst';
    streamingLink.textContent = '127.0.0.1';
    const citationRoot = win.document.createElement('div');
    citationRoot.append(streamingLink);
    markWebCitations(citationRoot);
    assert.equal(streamingLink.textContent, '来源', '流式外链残留的主机名不能当成依据标题');
    assert.equal(streamingLink.dataset.evidenceRef, 'claim:first');
    const routes = [{ path: '/', element: h(EvidenceProvider, {}, h(Outlet)), children: [
      { path: 'evidence', element: h(EvidenceDeepLink) }, { path: 'home', element: h('p', {}, '首页') },
    ] }];
    let router = createMemoryRouter(routes, { initialEntries: ['/evidence?ref=claim:first'] });
    const render = async () => { await act(async () => root.render(h(RouterProvider, { router }))); };
    const panels = () => container.querySelectorAll('[role="dialog"]');
    await render();
    assert.equal(panels().length, 1, '冷启动应收到打开请求');
    assert.equal(reads, 1);
    await act(async () => (container.querySelector('[aria-label="关闭依据"]') as HTMLButtonElement).click());
    assert.equal(panels().length, 0, '关闭一次即可，不能因 callback 变化重开');
    await act(async () => router.navigate('/home'));
    await act(async () => router.navigate('/evidence?ref=claim:second'));
    assert.equal(panels().length, 1);
    assert.match(container.textContent || '', /依据 claim:second/);
    await act(async () => root.unmount());
    router.dispose();
    root = createRoot(container);
    router = createMemoryRouter(routes, { initialEntries: ['/evidence?ref=claim:second'] });
    await render();
    assert.equal(panels().length, 1, '刷新等价的新挂载仍应打开');
    assert.equal(reads, 3, '每次导航或新挂载只读取一次');
    await act(async () => router.navigate('/evidence?ref=invalid'));
    assert.equal(panels().length, 0);
    assert.ok(container.querySelector('[role="alert"]'));
    router.dispose();
  } finally {
    await act(async () => root.unmount());
    await server.close();
    Object.assign(globalThis, previous);
    await win.happyDOM.abort();
  }
});
