import assert from 'node:assert/strict';
import test from 'node:test';
import { createElement as h, act } from 'react';
import { Window } from 'happy-dom';
import { createServer } from 'vite';
import { createServer as httpServer } from 'node:http';
import { fileURLToPath } from 'node:url';

function panelStore() {
  let panel: { kind: 'assistant'; sessionId: string; pageName: string } | null = null;
  const listeners = new Set<() => void>();
  const notify = () => listeners.forEach(listener => listener());
  return {
    getSidePanel: () => panel,
    subscribeSidePanel: (listener: () => void) => { listeners.add(listener); return () => { listeners.delete(listener); }; },
    openAssistantPanel: (sessionId: string, pageName = '问助手') => { panel = { kind: 'assistant', sessionId, pageName }; notify(); },
    closeSidePanel: () => { panel = null; notify(); },
  };
}

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
      ...panelStore(),
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

test('运行中发送按钮切换为停止，有草稿时提示结束后再发', async () => {
  const win = new Window();
  const previous = { window: globalThis.window, document: globalThis.document, IS_REACT_ACT_ENVIRONMENT: globalThis.IS_REACT_ACT_ENVIRONMENT };
  Object.assign(globalThis, { window: win, document: win.document, IS_REACT_ACT_ENVIRONMENT: true });
  const server = await createServer({ configFile: false, root: fileURLToPath(new URL('../', import.meta.url)),
    resolve: { alias: [{ find: '@', replacement: fileURLToPath(new URL('../src/verticals/finance', import.meta.url)) }] },
    server: { middlewareMode: true, hmr: { server: httpServer() }, watch: null }, appType: 'custom' });
  const { createRoot } = await import('react-dom/client');
  const container = win.document.createElement('div');
  win.document.body.append(container);
  const root = createRoot(container);
  let cancelled = 0;
  const trajectorySnap = {
    running: true, failed: false, openState: 'open' as const, hasMore: false, loadingOlder: false,
    runningCalls: [] as { id: string; name: string }[], steps: [] as { id: string; kind: string }[], streaming: false,
  };
  const sessions = {
    ...panelStore(),
    ensureAssistant: async () => ({ sessionId: 'assistant', mode: 'ask' }),
    startAssistant: async () => ({ sessionId: 'assistant', status: 'started', mode: 'ask' }),
    cancelSession: async () => { cancelled++; },
    focusAssistantSession: () => () => {},
    switchAssistantMode: async () => {},
    sessionState: () => ({ running: true, lastAgentError: null, promptError: null, removed: false, awaitingFirstTurn: false }),
    trajectory: () => ({
      subscribe: () => () => {},
      getSnapshot: () => trajectorySnap,
    }),
    subscribeSessionList: () => () => {},
  };
  try {
    const { FinanceAiDock } = await server.ssrLoadModule('/src/verticals/finance/components/ui/FinanceAiDock.tsx');
    const { AiPageProvider, useAiPage } = await server.ssrLoadModule('/src/core/ai/pageContext.tsx');
    const { ResearchSessionContext } = await server.ssrLoadModule('/src/verticals/finance/dsh/research-session.tsx');
    function Page() {
      useAiPage({ key: 'daily-review', title: '大盘行情', context: '' });
      return h(FinanceAiDock, { renderPanel: content => h('section', {}, content) });
    }
    await act(async () => root.render(h(ResearchSessionContext.Provider, { value: sessions }, h(AiPageProvider, {}, h(Page)))));
    await act(async () => container.querySelector('button')!.click());
    const stop = [...container.querySelectorAll('button')].find(node => (node.textContent || '').includes('停止'));
    assert.ok(stop, '运行中应显示停止');
    assert.equal(stop!.getAttribute('aria-label'), '停止');
    assert.equal((stop as HTMLButtonElement).disabled, false);
    const box = container.querySelector('textarea[aria-label="问助手输入"]') as HTMLTextAreaElement;
    assert.ok(box);
    assert.equal(box.disabled, false);
    await act(async () => { stop!.click(); });
    assert.equal(cancelled, 1);
    await act(async () => {
      const proto = Object.getOwnPropertyDescriptor(win.HTMLTextAreaElement.prototype, 'value');
      proto?.set?.call(box, '下一问');
      box.dispatchEvent(new win.Event('input', { bubbles: true }));
    });
    assert.match(container.textContent || '', /当前回答结束后可发送/);
    const send = [...container.querySelectorAll('button')].find(node => (node.getAttribute('aria-label') || '') === '发送');
    assert.ok(send);
    assert.equal((send as HTMLButtonElement).disabled, true);
  } finally {
    await act(async () => root.unmount());
    await server.close();
    win.happyDOM.abort();
    Object.assign(globalThis, previous);
  }
});
