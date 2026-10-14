// 问助手面板简化：没有模式与模型菜单、一律深查；个股页两个按钮；动态卡「讨论」打开面板。
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

async function harness(run: (ctx: { win: Window; container: HTMLElement; root: any; modules: Record<string, any>; render: (page: any, sessions: any) => Promise<void> }) => Promise<void>) {
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
  try {
    const modules = {
      dock: await server.ssrLoadModule('/src/verticals/finance/components/ui/FinanceAiDock.tsx'),
      page: await server.ssrLoadModule('/src/core/ai/pageContext.tsx'),
      session: await server.ssrLoadModule('/src/verticals/finance/dsh/research-session.tsx'),
    };
    const render = async (Page: any, sessions: any) => act(async () => root.render(h(modules.session.ResearchSessionContext.Provider, { value: sessions }, h(modules.page.AiPageProvider, {}, h(Page)))));
    await run({ win, container, root, modules, render });
  } finally {
    await act(async () => root.unmount());
    await server.close();
    win.happyDOM.abort();
    Object.assign(globalThis, previous);
  }
}
const setValue = (win: Window, box: HTMLTextAreaElement, value: string) => act(async () => {
  Object.getOwnPropertyDescriptor(win.HTMLTextAreaElement.prototype, 'value')?.set?.call(box, value);
  box.dispatchEvent(new win.Event('input', { bubbles: true }));
});
const button = (container: HTMLElement, text: string) => [...container.querySelectorAll('button')].find(node => node.textContent === text) as HTMLButtonElement | undefined;

test('面板没有模式与模型菜单，一律以深查发送；早先的即答会话按深查继续', async () => {
  await harness(async ({ win, container, modules, render }) => {
    const ensured: any[] = [], started: any[] = [], switched: any[] = [];
    const sessions = {
      ...panelStore(),
      ensureAssistant: async (input: any) => { ensured.push(input); return { sessionId: 'assistant', mode: 'ask' }; },
      startAssistant: async (input: any) => { started.push(input); return { sessionId: 'assistant', status: 'started', mode: 'agent' }; },
      switchAssistantMode: async (...args: any[]) => { switched.push(args); },
      focusAssistantSession: () => () => {}, sessionState: () => null, trajectory: () => null, subscribeSessionList: () => () => {},
    };
    function Page() {
      modules.page.useAiPage({ key: 'daily-review', title: '大盘行情', context: '' });
      return h(modules.dock.FinanceAiDock, { renderPanel: (content: any) => h('section', {}, content) });
    }
    await render(Page, sessions);
    await act(async () => container.querySelector('button')!.click());
    assert.equal(ensured[0].mode, 'agent');
    assert.deepEqual(switched, [['assistant', 'agent', 'market:daily-review']], '旧的即答会话切到深查，只切一次');
    assert.equal(container.querySelector('[aria-label="问助手模式"]'), null);
    assert.equal(container.querySelector('[aria-label="问助手模型"]'), null);
    assert.doesNotMatch(container.textContent!, /Ask|Agent/);
    const box = container.querySelector('textarea[aria-label="问助手输入"]') as HTMLTextAreaElement;
    assert.equal(box.getAttribute('placeholder'), '问问这一页的内容，或让它帮你查');
    await setValue(win, box, '大盘怎么样');
    await act(async () => button(container, '发送')!.click());
    assert.equal(started[0].mode, 'agent');
    assert.equal(started[0].prompt, '大盘怎么样');
  });
});

test('旧会话切换失败时沿用现有错误提示，面板不装作已就绪', async () => {
  let switches = 0;
  await harness(async ({ container, modules, render }) => {
    const sessions = {
      ...panelStore(),
      ensureAssistant: async () => ({ sessionId: 'assistant', mode: 'ask' }),
      switchAssistantMode: async () => { switches++; throw new Error('boom'); },
      focusAssistantSession: () => () => {}, sessionState: () => null, trajectory: () => null, subscribeSessionList: () => () => {},
    };
    function Page() {
      modules.page.useAiPage({ key: 'daily-review', title: '大盘行情', context: '' });
      return h(modules.dock.FinanceAiDock, { renderPanel: (content: any) => h('section', {}, content) });
    }
    await render(Page, sessions);
    await act(async () => container.querySelector('button')!.click());
    assert.equal(switches, 1, '失败后不自动重试');
    assert.doesNotMatch(container.textContent!, /正在准备/, '显示错误提示而不是一直等待');
    assert.equal((container.querySelector('textarea[aria-label="问助手输入"]') as HTMLTextAreaElement).disabled, true, '没就绪前不能发');
  });
});

test('面板标题区写当前对象；页面给了动作才多一行按钮，禁用条件跟页面一致', async () => {
  await harness(async ({ container, modules, render }) => {
    const runs: string[] = [];
    let flags = { researching: false, canRevert: true };
    const sessions = {
      ...panelStore(),
      ensureAssistant: async () => ({ sessionId: 'assistant', mode: 'agent' }),
      focusAssistantSession: () => () => {}, sessionState: () => null, trajectory: () => null, subscribeSessionList: () => () => {},
    };
    function Page() {
      modules.page.useAiPage({ key: 'company-wiki:companies/000933-sz', title: '神火股份', context: '',
        actions: [
          { id: 'research', label: '重新研究', disabled: flags.researching, run: () => runs.push('research') },
          { id: 'revert', label: '撤回上次更新', disabled: !flags.canRevert, run: () => runs.push('revert') },
        ] });
      return h(modules.dock.FinanceAiDock, { renderPanel: (content: any) => h('section', {}, content) });
    }
    await render(Page, sessions);
    await act(async () => container.querySelector('button')!.click());
    assert.equal(container.querySelector('h2')!.textContent, '神火股份');
    assert.match(container.querySelector('header')!.textContent!, /问助手/);
    const row = container.querySelector('.finance-assistant-actions')!;
    assert.deepEqual([...row.querySelectorAll('button')].map(node => node.textContent), ['重新研究', '撤回上次更新']);
    assert.equal(button(container, '重新研究')!.disabled, false);
    await act(async () => button(container, '重新研究')!.click());
    await act(async () => button(container, '撤回上次更新')!.click());
    assert.deepEqual(runs, ['research', 'revert']);
    flags = { researching: true, canRevert: false };
    await render(Page, sessions);
    assert.equal(button(container, '重新研究')!.disabled, true, '研究进行中禁用');
    assert.equal(button(container, '撤回上次更新')!.disabled, true, '没有可撤回版本时禁用');
  });
});

test('没有页面动作的页面不显示按钮行', async () => {
  await harness(async ({ container, modules, render }) => {
    const sessions = {
      ...panelStore(),
      ensureAssistant: async () => ({ sessionId: 'assistant', mode: 'agent' }),
      focusAssistantSession: () => () => {}, sessionState: () => null, trajectory: () => null, subscribeSessionList: () => () => {},
    };
    function Page() {
      modules.page.useAiPage({ key: 'daily-review', title: '大盘行情', context: '' });
      return h(modules.dock.FinanceAiDock, { renderPanel: (content: any) => h('section', {}, content) });
    }
    await render(Page, sessions);
    await act(async () => container.querySelector('button')!.click());
    assert.equal(container.querySelector('.finance-assistant-actions'), null);
  });
});

test('个股页的两个按钮就是页面上的重新研究与撤回入口', async () => {
  const { readFileSync } = await import('node:fs');
  const source = readFileSync(new URL('../src/verticals/finance/pages/CompanyWiki.tsx', import.meta.url), 'utf8');
  assert.match(source, /id: 'research', label: '重新研究', disabled: researching \|\| !page\.loaded \|\| Boolean\(page\.error\), run: \(\) => void store\.restart\(\)/);
  assert.match(source, /id: 'revert', label: '撤回上次更新', disabled: !page\.canRevert/);
  assert.match(source, /services\.revertResearch\?\.\(symbol, page\.researchVersion\)/);
});
