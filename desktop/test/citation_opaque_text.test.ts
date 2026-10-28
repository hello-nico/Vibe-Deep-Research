import assert from 'node:assert/strict';
import test from 'node:test';
import { createElement as h, act } from 'react';
import { Window } from 'happy-dom';
import { createServer } from 'vite';
import { createServer as httpServer } from 'node:http';
import { fileURLToPath } from 'node:url';

const REF = 'source:tushare:ann:' + 'a'.repeat(64) + ':p3:b32';
const href = (ref: string) => 'http://127.0.0.1:5930/evidence?ref=' + encodeURIComponent(ref);

test('角标文字：单个字母改显「来源」，中文文字不变，引用 id 片段不显示', async () => {
  const win = new Window({ url: 'http://127.0.0.1:5930/' });
  const previous = { window: globalThis.window, document: globalThis.document };
  Object.assign(globalThis, { window: win, document: win.document });
  const server = await createServer({ configFile: false, root: fileURLToPath(new URL('../', import.meta.url)),
    esbuild: { jsx: 'automatic' },
    server: { middlewareMode: true, hmr: { server: httpServer() }, watch: null }, appType: 'custom',
    resolve: { alias: [{ find: '@', replacement: fileURLToPath(new URL('../src/verticals/finance', import.meta.url)) }] },
    ssr: { noExternal: ['react-router-dom', 'react-router'], resolve: { conditions: ['module-sync', 'node', 'import', 'development'] } } });
  try {
    const { markWebCitations } = await server.ssrLoadModule('/src/verticals/finance/components/ConversationCitations.tsx');
    const { citationTitle, opaqueCitationText } = await server.ssrLoadModule('/src/verticals/finance/lib/citationMarks.ts');
    const root = win.document.createElement('div');
    const texts = ['s', 'p', '三季报', '公告', 'p3', 'ann'];
    for (const text of texts) {
      const a = win.document.createElement('a');
      a.href = href(REF);
      a.textContent = text;
      root.append(a);
    }
    markWebCitations(root);
    const shown = [...root.querySelectorAll('a')].map(a => a.textContent);
    assert.deepEqual(shown, ['来源', '来源', '三季报', '公告', '来源', '来源']);
    assert.equal(citationTitle(REF, 's'), '来源');
    assert.equal(citationTitle(REF, '华能国际三季报'), '华能国际三季报');
    assert.equal(opaqueCitationText('Q3'), true);
    assert.equal(opaqueCitationText('年报'), false);
  } finally {
    await server.close();
    Object.assign(globalThis, previous);
    await win.happyDOM.abort();
  }
});

test('解析出文档简称后，原为「s」的角标改显简称', async () => {
  const win = new Window({ url: 'http://127.0.0.1:5930/' });
  const previous = { window: globalThis.window, document: globalThis.document, fetch: globalThis.fetch,
    IS_REACT_ACT_ENVIRONMENT: globalThis.IS_REACT_ACT_ENVIRONMENT, HTMLAnchorElement: globalThis.HTMLAnchorElement,
    HTMLElement: globalThis.HTMLElement, Element: globalThis.Element, MutationObserver: globalThis.MutationObserver };
  Object.assign(globalThis, { window: win, document: win.document, IS_REACT_ACT_ENVIRONMENT: true,
    HTMLAnchorElement: win.HTMLAnchorElement, HTMLElement: win.HTMLElement, Element: win.Element, MutationObserver: win.MutationObserver });
  const sha = 'a'.repeat(64);
  globalThis.fetch = async (url, init) => {
    const path = String(url);
    if (path.includes('/wiki/refs/resolve')) {
      const ref = JSON.parse(String(init?.body)).refs[0];
      return Response.json({ results: [{ ref, status: 'resolved', kind: 'source',
        data: { document_id: 'd1', parse_revision_id: 'r1', parsed_content_sha256: sha, block_id: 'b32' } }] });
    }
    if (path.includes('/blocks/')) return Response.json({ document_id: 'd1', parse_revision_id: 'r1', parsed_content_sha256: sha, block_id: 'b32', page: 3, text: '正文' });
    return Response.json({ title: '华能国际2026年第三季度报告', symbol: '600011.SH', reporting_period: '2026Q3', document_type: 'quarterly_report' });
  };
  const server = await createServer({ configFile: false, root: fileURLToPath(new URL('../', import.meta.url)),
    esbuild: { jsx: 'automatic' },
    resolve: { alias: [{ find: '@', replacement: fileURLToPath(new URL('../src/verticals/finance', import.meta.url)) }] },
    server: { middlewareMode: true, hmr: { server: httpServer() }, watch: null }, appType: 'custom',
    ssr: { noExternal: ['react-router-dom', 'react-router'], resolve: { conditions: ['module-sync', 'node', 'import', 'development'] } } });
  const { createRoot } = await import('react-dom/client');
  const container = win.document.createElement('div');
  win.document.body.append(container);
  const root = createRoot(container);
  try {
    const { ConversationCitations } = await server.ssrLoadModule('/src/verticals/finance/components/ConversationCitations.tsx');
    await act(async () => root.render(h(ConversationCitations, {},
      h('a', { href: href(REF) }, 's'), h('a', { href: href(REF) }, '三季报'))));
    await act(async () => { await new Promise(resolve => setTimeout(resolve, 50)); });
    const labels = [...container.querySelectorAll('a')].map(a => a.textContent);
    assert.equal(labels[1], '三季报', '可读的中文链接文字不变');
    assert.notEqual(labels[0], 's');
    assert.match(String(labels[0]), /华能国际/, '解析到文档简称后显示简称');
  } finally {
    await act(async () => root.unmount());
    await server.close();
    Object.assign(globalThis, previous);
    await win.happyDOM.abort();
  }
});
