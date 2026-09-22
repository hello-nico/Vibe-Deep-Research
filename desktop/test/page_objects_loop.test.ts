import assert from 'node:assert/strict';
import test from 'node:test';
import { createElement as h, act } from 'react';
import { Window } from 'happy-dom';
import { createServer } from 'vite';
import { createServer as httpServer } from 'node:http';
import { fileURLToPath } from 'node:url';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

test('页面对象登记不因 Context 更新反复登记', async () => {
  const win = new Window();
  const previous = { window: globalThis.window, document: globalThis.document, IS_REACT_ACT_ENVIRONMENT: globalThis.IS_REACT_ACT_ENVIRONMENT };
  Object.assign(globalThis, { window: win, document: win.document, IS_REACT_ACT_ENVIRONMENT: true });
  const cacheDir = await mkdtemp(join(tmpdir(), 'vibe-page-objects-'));
  const server = await createServer({
    configFile: false,
    cacheDir,
    root: fileURLToPath(new URL('../', import.meta.url)),
    resolve: { alias: [{ find: '@', replacement: fileURLToPath(new URL('../src/verticals/finance', import.meta.url)) }] },
    server: { middlewareMode: true, hmr: { server: httpServer() }, watch: null },
    appType: 'custom',
  });
  const { createRoot } = await import('react-dom/client');
  const container = win.document.createElement('div');
  win.document.body.append(container);
  const root = createRoot(container);
  try {
    const { AiPageProvider, useAiPageObjects, usePageAssistantObjects } = await server.ssrLoadModule('/src/core/ai/pageContext.tsx');
    let renders = 0;
    function Page() {
      renders += 1;
      if (renders > 20) throw new Error(`页面对象登记循环：${renders} 次渲染`);
      useAiPageObjects('intel:radar', [{
        kind: 'url',
        id: 'url:https://example.com/a',
        label: '样例资讯',
        url: 'https://example.com/a',
        hint: '当前列表',
      }]);
      const registry = usePageAssistantObjects();
      return h('p', {}, String(registry.objects.length));
    }
    await act(async () => root.render(h(AiPageProvider, {}, h(Page))));
    await act(async () => {});
    await act(async () => {});
    assert.ok(renders <= 6, `登记后渲染次数应为有限次，实际 ${renders}`);
    assert.equal(container.textContent, '1');
  } finally {
    await act(async () => root.unmount());
    await server.close();
    await rm(cacheDir, { recursive: true, force: true });
    win.happyDOM.abort();
    Object.assign(globalThis, previous);
  }
});
