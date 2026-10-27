// 问助手面板简化：没有模式与模型菜单、一律深查；个股页两个按钮；动态卡「讨论」打开面板。
import assert from 'node:assert/strict';
import test from 'node:test';
import { createElement as h, act, useState } from 'react';
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

test('面板没有模式与模型菜单，一律以深查发送', async () => {
  await harness(async ({ win, container, modules, render }) => {
    const ensured: any[] = [], started: any[] = [];
    const sessions = {
      ...panelStore(),
      ensureAssistant: async (input: any) => { ensured.push(input); return { sessionId: 'assistant', mode: 'agent' }; },
      startAssistant: async (input: any) => { started.push(input); return { sessionId: 'assistant', status: 'started', mode: 'agent' }; },
      focusAssistantSession: () => () => {}, sessionState: () => null, trajectory: () => null, subscribeSessionList: () => () => {},
    };
    function Page() {
      modules.page.useAiPage({ key: 'feed:variables', title: '行情', context: '' });
      return h(modules.dock.FinanceAiDock, { renderPanel: (content: any) => h('section', {}, content) });
    }
    await render(Page, sessions);
    await act(async () => container.querySelector('button')!.click());
    assert.equal(ensured[0].mode, 'agent');
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

test('个股页打开面板时以 deep_research 绑定当前公司，发送也带同一对象', async () => {
  await harness(async ({ win, container, modules, render }) => {
    const ensured: any[] = [], started: any[] = [];
    const sessions = {
      ...panelStore(),
      ensureAssistant: async (input: any) => { ensured.push(input); return { sessionId: 'assistant', status: 'started', mode: 'agent' }; },
      startAssistant: async (input: any) => { started.push(input); return { sessionId: 'assistant', status: 'started', mode: 'agent' }; },
      focusAssistantSession: () => () => {}, sessionState: () => null, trajectory: () => null, subscribeSessionList: () => () => {},
    };
    function Page() {
      modules.page.useAiPage({ key: 'company-wiki:companies/000933-sz', title: '神火股份', context: '净利润 12.3 亿元' });
      return h(modules.dock.FinanceAiDock, { renderPanel: (content: any) => h('section', {}, content) });
    }
    await render(Page, sessions);
    await act(async () => container.querySelector('button')!.click());
    assert.equal(ensured[0].plugin, 'deep_research');
    assert.equal(ensured[0].target, 'companies/000933-sz');
    const box = container.querySelector('textarea[aria-label="问助手输入"]') as HTMLTextAreaElement;
    await setValue(win, box, '它靠什么赚钱');
    await act(async () => button(container, '发送')!.click());
    assert.equal(started[0].plugin, 'deep_research');
    assert.equal(started[0].target, 'companies/000933-sz');
    assert.equal(started[0].prompt, '它靠什么赚钱', '快照走 pageSnapshot，不拼进用户问题');
    assert.match(started[0].pageSnapshot, /净利润 12.3 亿元/);
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
      modules.page.useAiPage({ key: 'feed:variables', title: '行情', context: '' });
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

test('问助手的上下文标签只属于当前页：切到别的页面再打开，上一页的标签（自动带入与手动 @）都不保留', async () => {
  await harness(async ({ container, modules, render }) => {
    const sessions = {
      ...panelStore(),
      ensureAssistant: async () => ({ sessionId: 'assistant', mode: 'agent' }),
      focusAssistantSession: () => () => {}, sessionState: () => null, trajectory: () => null, subscribeSessionList: () => () => {},
    };
    let pageKey = 'document:abc:1';
    let title = '长江电力公告';
    const notice = { kind: 'document', id: 'document:abc', label: '长江电力关于控股股东增持股份结果的公告' };
    const tags = () => [...container.querySelectorAll('.finance-assistant-panel .tag, aside .tag')].map(node => node.textContent!.trim());
    function Page() {
      modules.page.useAiPage({ key: pageKey, title, context: '' });
      const { cite } = modules.page.useAiQuestion();
      return h('div', {}, h('button', { id: 'cite', onClick: () => cite(notice) }, '引用'),
        h(modules.dock.FinanceAiDock, { renderPanel: (content: any) => h('aside', {}, content) }));
    }
    await render(Page, sessions);
    await act(async () => (container.querySelector('#cite') as HTMLButtonElement).click());
    assert.ok(tags().some(text => text.includes('长江电力关于控股股东增持股份结果的公告')), '资料页引用后面板里有标签');
    // 换到动态页：面板仍开着时沿用旧页面，再点“问助手”切到当前页。
    pageKey = 'feed:variables'; title = '行情';
    await render(Page, sessions);
    await act(async () => (container.querySelector('button.ai-chat-trigger') as HTMLButtonElement).click());
    assert.equal(container.querySelector('h2')!.textContent, '行情');
    assert.deepEqual(tags(), [], '动态页的问助手不带资料页的标签');
    // 回到资料页也不恢复：标签不跨页保留。
    pageKey = 'document:abc:1'; title = '长江电力公告';
    await render(Page, sessions);
    await act(async () => (container.querySelector('button.ai-chat-trigger') as HTMLButtonElement).click());
    assert.deepEqual(tags(), []);
  });
});

test('点问助手打开后输入框获得焦点；面板已开时切页不抢焦点', async () => {
  await harness(async ({ win, container, modules, render }) => {
    const sessions = {
      ...panelStore(),
      ensureAssistant: async () => ({ sessionId: 'assistant', mode: 'agent' }),
      focusAssistantSession: () => () => {}, sessionState: () => null, trajectory: () => null, subscribeSessionList: () => () => {},
    };
    let setPage: ((key: string, title: string) => void) | undefined;
    function App() {
      const [page, set] = useState({ key: 'feed:variables', title: '行情' });
      setPage = (key, title) => set({ key, title });
      modules.page.useAiPage({ key: page.key, title: page.title, context: '' });
      return h('div', {},
        h('button', { id: 'outside', type: 'button' }, '页内'),
        h(modules.dock.FinanceAiDock, { renderPanel: (content: any) => h('aside', {}, content) }));
    }
    await render(App, sessions);
    await act(async () => (container.querySelector('button.ai-chat-trigger') as HTMLButtonElement).click());
    const box = container.querySelector('textarea[aria-label="问助手输入"]') as HTMLTextAreaElement;
    assert.equal(win.document.activeElement, box);
    await act(async () => { (container.querySelector('#outside') as HTMLButtonElement).focus(); });
    assert.equal(win.document.activeElement, container.querySelector('#outside'));
    await act(async () => { setPage!('company-wiki:companies/000933-sz', '神火股份'); });
    assert.equal(win.document.activeElement, container.querySelector('#outside'), '切页不抢焦点');
  });
});

test('focusAssistantComposer 只聚焦已就绪的问助手输入框', async () => {
  const { createServer } = await import('vite');
  const { createServer: httpServer } = await import('node:http');
  const { fileURLToPath } = await import('node:url');
  const { Window } = await import('happy-dom');
  const win = new Window();
  const previous = { window: globalThis.window, document: globalThis.document };
  Object.assign(globalThis, { window: win, document: win.document });
  const server = await createServer({ configFile: false, root: fileURLToPath(new URL('../', import.meta.url)),
    server: { middlewareMode: true, hmr: { server: httpServer() }, watch: null }, appType: 'custom' });
  try {
    const sessions = await server.ssrLoadModule('/src/verticals/finance/assistant/sessions.ts');
    win.document.body.innerHTML = '<textarea aria-label="问助手输入" disabled></textarea>';
    assert.equal(sessions.focusAssistantComposer(win.document), false);
    (win.document.querySelector('textarea') as HTMLTextAreaElement).disabled = false;
    assert.equal(sessions.focusAssistantComposer(win.document), true);
    assert.equal(win.document.activeElement, win.document.querySelector('textarea'));
  } finally {
    await server.close();
    win.happyDOM.abort();
    Object.assign(globalThis, previous);
  }
});
