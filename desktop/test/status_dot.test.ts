// 状态点提示：挂到 body、按圆点位置夹在视口内，贴边或在裁切容器里都不被挡。
import assert from 'node:assert/strict';
import test, { before, after } from 'node:test';
import { fileURLToPath } from 'node:url';
import { createServer as createHttpServer } from 'node:http';
import { createServer } from 'vite';
import * as React from 'react';
import { Window } from 'happy-dom';

let server: Awaited<ReturnType<typeof createServer>>, win: Window, root: ReturnType<typeof import('react-dom/client')['createRoot']>, container: HTMLElement;
let dotModule: Record<string, any>;
const previous = { window: globalThis.window, document: globalThis.document, IS_REACT_ACT_ENVIRONMENT: globalThis.IS_REACT_ACT_ENVIRONMENT };
before(async () => {
  win = new Window({ width: 1000, height: 800 });
  Object.assign(globalThis, { window: win, document: win.document, IS_REACT_ACT_ENVIRONMENT: true });
  server = await createServer({ configFile: false, root: fileURLToPath(new URL('../', import.meta.url)),
    resolve: { alias: { '@': fileURLToPath(new URL('../src/verticals/finance', import.meta.url)) } },
    server: { middlewareMode: true, hmr: { server: createHttpServer() }, watch: null }, appType: 'custom' });
  dotModule = await server.ssrLoadModule('/src/verticals/finance/components/ui/StatusDot.tsx');
  container = win.document.createElement('div') as unknown as HTMLElement;
  container.style.overflow = 'hidden';
  win.document.body.append(container);
  root = (await import('react-dom/client')).createRoot(container);
});
after(async () => { await React.act(async () => root?.unmount()); await server?.close(); win?.happyDOM.abort(); Object.assign(globalThis, previous); });

const rect = (left: number, top: number, width: number, height: number) => ({ left, top, width, height, right: left + width, bottom: top + height, x: left, y: top, toJSON() {} });

async function hover(dotRect: ReturnType<typeof rect>) {
  await React.act(async () => root.render(null));
  await React.act(async () => root.render(React.createElement(dotModule.StatusDot, { tone: 'info', label: '新报告或估值变化' })));
  const dot = container.querySelector('.status-dot') as HTMLElement;
  dot.getBoundingClientRect = () => dotRect as DOMRect;
  const proto = (win as any).HTMLElement.prototype;
  const original = proto.getBoundingClientRect;
  proto.getBoundingClientRect = function (this: HTMLElement) { return this.classList.contains('status-dot-tip') ? rect(0, 0, 160, 30) : original.call(this); };
  await React.act(async () => { dot.dispatchEvent(new (win as any).MouseEvent('mouseover', { bubbles: true })); });
  proto.getBoundingClientRect = original;
  return win.document.body.querySelector('.status-dot-tip') as HTMLElement;
}

test('贴着窗口左边：提示挂到 body 外层，左边不出视口', async () => {
  const tip = await hover(rect(2, 300, 7, 7));
  assert.ok(tip, '悬停后出现提示');
  assert.ok(!container.contains(tip), '提示不在会裁切的容器里');
  assert.equal(tip.textContent, '新报告或估值变化');
  assert.equal(tip.style.left, '8px');
  assert.equal(tip.style.top, `${300 - 8 - 30}px`, '默认在圆点上方');
});

test('贴着窗口顶部：上方放不下就翻到下方；贴右边不出视口', async () => {
  const tip = await hover(rect(995, 4, 7, 7));
  assert.equal(tip.style.top, `${4 + 7 + 8}px`);
  assert.equal(tip.style.left, `${1000 - 160 - 8}px`);
});
