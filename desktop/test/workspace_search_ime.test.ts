// 搜索框与中文输入法：拼写中的字母不外传，选字后才通知；外部值变化在非拼写时同步。
import assert from 'node:assert/strict';
import test, { before, after } from 'node:test';
import { createServer as createHttpServer } from 'node:http';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';
import * as React from 'react';
import { Window } from 'happy-dom';

let server: Awaited<ReturnType<typeof createServer>>, win: Window, root: ReturnType<typeof import('react-dom/client')['createRoot']>, container: HTMLElement;
let mod: Record<string, any>;
const previous = { window: globalThis.window, document: globalThis.document, IS_REACT_ACT_ENVIRONMENT: globalThis.IS_REACT_ACT_ENVIRONMENT };

before(async () => {
  win = new Window();
  Object.assign(globalThis, { window: win, document: win.document, IS_REACT_ACT_ENVIRONMENT: true });
  server = await createServer({ configFile: false, root: fileURLToPath(new URL('../', import.meta.url)),
    resolve: { alias: { '@': fileURLToPath(new URL('../src/verticals/finance', import.meta.url)) } },
    server: { middlewareMode: true, hmr: { server: createHttpServer() }, watch: null }, appType: 'custom' });
  mod = await server.ssrLoadModule('/src/verticals/finance/components/ui/WorkspaceSearch.tsx');
  container = win.document.createElement('div') as unknown as HTMLElement;
  win.document.body.append(container);
  root = (await import('react-dom/client')).createRoot(container);
});
after(async () => { await React.act(async () => root?.unmount()); await server?.close(); win?.happyDOM.abort(); Object.assign(globalThis, previous); });

test('拼写期间不通知外部，选字完成后只通知一次最终文字；外部值在非拼写时同步', async () => {
  const seen: string[] = [];
  const Host = () => {
    const [value, setValue] = React.useState('');
    return React.createElement(mod.WorkspaceSearch, { placeholder: '搜索', value, onChange: (next: string) => { seen.push(next); setValue(next); } });
  };
  await React.act(async () => root.render(React.createElement(Host)));
  const input = container.querySelector('input') as unknown as HTMLInputElement;
  const setter = Object.getOwnPropertyDescriptor(win.HTMLInputElement.prototype, 'value')!.set!;
  const type = async (text: string) => React.act(async () => { setter.call(input, text); input.dispatchEvent(new win.Event('input', { bubbles: true }) as unknown as Event); });
  await React.act(async () => { input.dispatchEvent(new win.CompositionEvent('compositionstart', { bubbles: true }) as unknown as Event); });
  await type('sha');
  await type('shasha');
  assert.deepEqual(seen, [], '拼写中的字母不外传');
  assert.equal(input.value, 'shasha', '拼写中的字母留在框里，不被重置');
  setter.call(input, '沙沙');
  await React.act(async () => { input.dispatchEvent(new win.CompositionEvent('compositionend', { bubbles: true, data: '沙沙' }) as unknown as Event); });
  assert.deepEqual(seen, ['沙沙']);
  await type('沙沙a');
  assert.deepEqual(seen, ['沙沙', '沙沙a'], '非拼写时照常逐字通知');
});
