import assert from 'node:assert/strict';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { createElement, useContext } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { createServer } from 'vite';
import { createServer as createHttpServer } from 'node:http';

test('外壳组合保持研究上下文，并在同一树内装配助手与原生浮层', async () => {
  const server = await createServer({
    configFile: false, esbuild: { jsx: 'automatic' },
    root: fileURLToPath(new URL('../', import.meta.url)),
    server: { middlewareMode: true, hmr: { server: createHttpServer() }, watch: null }, appType: 'custom',
  });
  try {
    const { FinanceRoot } = await server.ssrLoadModule('/src/verticals/finance/components/layout/FinanceRoot.tsx');
    const { FinanceAssistantSeat } = await server.ssrLoadModule('/src/verticals/finance/components/layout/FinanceAssistantSurface.tsx');
    const { FinanceSlots } = await server.ssrLoadModule('/src/verticals/finance/dsh/NativeDsh.tsx');
    const { useResearchSessions } = await server.ssrLoadModule('/src/verticals/finance/dsh/research-session.tsx');
    const calls: string[] = [];
    const research = { start: async () => { throw new Error('渲染不能启动研究'); } };
    const slots = {
      renderSlot(name: string) {
        calls.push(name);
        return name === 'shell.overlay'
          ? createElement('div', null, createElement(FinanceAssistantSeat), createElement('span', null, '原生浮层'))
          : createElement('span', null, '原生详情');
      },
    };
    function PageProbe() {
      assert.equal(useResearchSessions(), research);
      assert.equal(useContext(FinanceSlots), slots);
      return createElement('main', null, '业务页面');
    }
    const render = (showDetails: boolean) => renderToStaticMarkup(createElement(FinanceRoot, {
      slots, research, showDetails, sessionError: '会话错误示例',
    }, createElement(PageProbe)));
    const closed = render(false);
    assert.deepEqual(calls, ['shell.overlay']);
    assert.equal((closed.match(/data-finance-assistant-seat/g) ?? []).length, 1);
    assert.match(closed, /业务页面/);
    assert.match(closed, /原生浮层/);
    assert.match(closed, /role="alert"[^>]*>会话错误示例/);
    assert.doesNotMatch(closed, /原生详情/);
    calls.length = 0;
    assert.match(render(true), /原生详情/);
    assert.deepEqual(calls, ['shell.overlay', 'details']);
  } finally {
    await server.close();
  }
});
