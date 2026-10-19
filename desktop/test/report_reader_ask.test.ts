// 资料阅读页：选中文字不自动进问助手，点浮动工具条里的「问助手」才进入「已选原文」；底部没有追问条。
import assert from 'node:assert/strict';
import test, { before, after } from 'node:test';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { createServer as createHttpServer } from 'node:http';
import { createServer } from 'vite';
import * as React from 'react';
import { Window } from 'happy-dom';

const previous = { window: globalThis.window, document: globalThis.document, sessionStorage: (globalThis as any).sessionStorage, IS_REACT_ACT_ENVIRONMENT: (globalThis as any).IS_REACT_ACT_ENVIRONMENT };
let win: Window, server: any, root: any, container: HTMLElement, modules: Record<string, any>;
before(async () => {
  win = new Window();
  Object.assign(globalThis, { window: win, document: win.document, sessionStorage: win.sessionStorage, IS_REACT_ACT_ENVIRONMENT: true });
  server = await createServer({ configFile: false, root: fileURLToPath(new URL('../', import.meta.url)),
    resolve: { alias: { '@': fileURLToPath(new URL('../src/verticals/finance', import.meta.url)) } },
    server: { middlewareMode: true, hmr: { server: createHttpServer() }, watch: null }, appType: 'custom',
    ssr: { noExternal: ['react-router-dom', 'react-router'], resolve: { conditions: ['module-sync', 'node', 'import', 'development'] } } });
  modules = {
    reader: await server.ssrLoadModule('/src/verticals/finance/pages/ReportReader.tsx'),
    dock: await server.ssrLoadModule('/src/verticals/finance/components/ui/FinanceAiDock.tsx'),
    page: await server.ssrLoadModule('/src/core/ai/pageContext.tsx'),
    session: await server.ssrLoadModule('/src/verticals/finance/dsh/research-session.tsx'),
    router: await server.ssrLoadModule('react-router-dom'),
  };
  container = win.document.createElement('div') as unknown as HTMLElement;
  win.document.body.append(container);
  root = (await import('react-dom/client')).createRoot(container);
});
after(async () => { await React.act(async () => root?.unmount()); await server?.close(); win?.happyDOM.abort(); Object.assign(globalThis, previous); });

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

test('选中不自动进问助手，点浮动条「问助手」才放进已选原文（默认收起）；阅读器底部没有追问条；面板标题已是文档名时不再另显标签', async t => {
  const id = 'a'.repeat(32);
  t.mock.method(globalThis, 'fetch', async (input: unknown) => {
    const url = String(input);
    if (url.includes('/documents/' + id) && !url.includes('/raw') && !url.includes('/parsed')) {
      return Response.json({ document_id: id, title: '长江电力公告', has_raw: true, has_parsed: true, extra: { content_type: 'markdown', parse_revision_id: 'r1', parsed_content_sha256: 'b'.repeat(64) } });
    }
    return new Response('公告正文第一段。\n公司控股股东增持股份已完成。', { status: 200 });
  });
  const sessions = {
    ...panelStore(),
    ensureAssistant: async () => ({ sessionId: 'assistant', mode: 'agent' }),
    focusAssistantSession: () => () => {}, sessionState: () => null, trajectory: () => null, subscribeSessionList: () => () => {},
  };
  const { MemoryRouter, Routes, Route } = modules.router;
  const h = React.createElement;
  const Page = () => h('div', {}, h(modules.reader.ReportReader), h(modules.dock.FinanceAiDock, { renderPanel: (content: any) => h('aside', {}, content) }));
  await React.act(async () => root.render(h(modules.session.ResearchSessionContext.Provider, { value: sessions },
    h(modules.page.AiPageProvider, {}, h(MemoryRouter, { initialEntries: ['/my-reports/read/' + id] },
      h(Routes, {}, h(Route, { path: '/my-reports/read/:id', element: h(Page) })))))));
  await React.act(async () => { await new Promise(resolve => setTimeout(resolve, 30)); });
  assert.equal(container.querySelectorAll('footer').length, 0, '阅读器底部没有提问条');
  assert.doesNotMatch(container.textContent!, /追问范围|就此追问/);
  await React.act(async () => (container.querySelector('button.ai-chat-trigger') as HTMLButtonElement).click());
  const pre = container.querySelector('pre')!;
  Object.defineProperty(win, 'getSelection', { configurable: true, value: () => ({ toString: () => '公司控股股东增持股份已完成', getRangeAt: () => ({ getBoundingClientRect: () => ({ left: 10, width: 20, top: 30 }) }) }) });
  await React.act(async () => { pre.dispatchEvent(new win.MouseEvent('mouseup', { bubbles: true })); });
  assert.doesNotMatch(container.textContent!, /已选原文/, '选中后没点「问助手」，不进入已选原文');
  const bar = container.querySelector('.report-ask-bar')!;
  assert.deepEqual([...bar.querySelectorAll('button')].map(node => node.textContent), ['复制', '问助手']);
  await React.act(async () => (bar.querySelectorAll('button')[1] as HTMLButtonElement).click());
  assert.match(container.textContent!, /已选原文：公司控股股东增持股份已完成/);
  assert.equal(container.querySelector('aside details')!.hasAttribute('open'), false, '已选原文默认收起成一行');
  assert.equal([...container.querySelectorAll('aside .tag')].some(node => node.textContent!.includes('长江电力公告')), false);
});

test('PDF 浮动条的「问助手」走阅读器命令与界面扩展点：注册命令，并只在选中文字后才把它交给页面', () => {
  const pdf = readFileSync(new URL('../src/core/components/PdfReader.tsx', import.meta.url), 'utf8');
  assert.match(pdf, /commands\.registerCommand\(\{[\s\S]*ASK_COMMAND_ID/);
  assert.match(pdf, /selectionMenus: \{ \.\.\.schema\.selectionMenus, selection:/);
  assert.match(pdf, /action: \(\) => \{ if \(picked\) latest\.current\.onAsk\?\.\(picked\); \}/);
  const reader = readFileSync(new URL('../src/verticals/finance/pages/ReportReader.tsx', import.meta.url), 'utf8');
  assert.match(reader, /onAsk=\{askAbout\}/);
  assert.doesNotMatch(reader, /<footer|追问范围|就此追问/);
});
