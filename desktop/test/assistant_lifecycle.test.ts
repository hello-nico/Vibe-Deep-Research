import assert from 'node:assert/strict';
import test from 'node:test';
import { createElement as h, act } from 'react';
import { Window } from 'happy-dom';
import { createServer } from 'vite';
import { createServer as httpServer } from 'node:http';
import { fileURLToPath } from 'node:url';

test('问助手自有输入绑定会话；卸载忽略迟到绑定，不搬深度对话节点', async () => {
  const win = new Window();
  const previous = { window: globalThis.window, document: globalThis.document, IS_REACT_ACT_ENVIRONMENT: globalThis.IS_REACT_ACT_ENVIRONMENT };
  Object.assign(globalThis, { window: win, document: win.document, IS_REACT_ACT_ENVIRONMENT: true });
  const server = await createServer({ configFile: false, root: fileURLToPath(new URL('../', import.meta.url)),
    resolve: { alias: [{ find: '@', replacement: fileURLToPath(new URL('../src/verticals/finance', import.meta.url)) }] },
    server: { middlewareMode: true, hmr: { server: httpServer() }, watch: null }, appType: 'custom' });
  const { createRoot } = await import('react-dom/client');
  const container = win.document.createElement('div');
  const home = win.document.createElement('div');
  home.innerHTML = '<div id="dsh-conversation">原生输入</div><span>after</span>';
  win.document.body.append(home, container);
  const conversation = home.firstChild;
  const root = createRoot(container);
  try {
    const { FinanceAiDock } = await server.ssrLoadModule('/src/verticals/finance/components/ui/FinanceAiDock.tsx');
    const { AiPageProvider, useAiPage } = await server.ssrLoadModule('/src/core/ai/pageContext.tsx');
    const { ResearchSessionContext } = await server.ssrLoadModule('/src/verticals/finance/dsh/research-session.tsx');
    let focused = 0, calls = 0;
    let pending: Promise<unknown> | undefined;
    const sessions = {
      ensureAssistant: async () => { calls++; return pending || { sessionId: 'assistant', mode: 'ask' }; },
      startAssistant: async () => ({ sessionId: 'assistant', status: 'started', mode: 'ask' }),
      focusAssistantSession: () => { focused++; return () => {}; },
      switchAssistantMode: async () => {},
      sessionState: () => null,
      trajectory: () => null,
      subscribeSessionList: () => () => {},
    };
    function Page() {
      useAiPage({ key: 'daily-review', title: '大盘行情', context: '' });
      return h(FinanceAiDock, { renderPanel: content => h('section', {}, content) });
    }
    const render = async () => { await act(async () => root.render(h(ResearchSessionContext.Provider, { value: sessions }, h(AiPageProvider, {}, h(Page))))); };
    const open = async () => { await act(async () => container.querySelector('button')!.click()); };
    await render(); await open();
    assert.equal(focused, 0);
    assert.equal(calls, 1);
    assert.equal(home.firstChild, conversation);
    assert.ok(container.querySelector('textarea[aria-label="问助手输入"]'));
    assert.ok(container.querySelector('button[aria-label="问助手模式"]'));
    await act(async () => container.querySelector('[aria-label="关闭"]')!.click());
    assert.equal(home.firstChild, conversation);
    await open();
    assert.equal(focused, 0);
    assert.equal(calls, 1);
    await act(async () => root.render(null));
    assert.equal(home.firstChild, conversation);
    let resolve!: (value: unknown) => void;
    pending = new Promise(done => { resolve = done; });
    await render(); await open();
    await act(async () => root.render(null));
    await act(async () => resolve({ sessionId: 'late', mode: 'ask' }));
    assert.equal(focused, 0);
    assert.equal(home.firstChild, conversation);
  } finally {
    await act(async () => root.unmount());
    await server.close();
    win.happyDOM.abort();
    Object.assign(globalThis, previous);
  }
});
