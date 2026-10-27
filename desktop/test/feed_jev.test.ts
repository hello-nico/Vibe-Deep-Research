// 动态资讯接 Jev：驱动与方向句、改写合并与新进展标记、公告「查看全部」。Backend 回包按 Stock 接口形态，真实标题取自三份 eval 的样本。
import assert from 'node:assert/strict';
import test, { before, after } from 'node:test';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { createServer as createHttpServer } from 'node:http';
import { createServer } from 'vite';
import * as React from 'react';
import { Window } from 'happy-dom';

const real = JSON.parse(readFileSync(new URL('./fixtures/t73_real.json', import.meta.url), 'utf8'));
const shenhuo = real.shenhuo;
const RESULT = `result:${'a'.repeat(32)}`;
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
    jev: await server.ssrLoadModule('/src/verticals/finance/lib/feedJev.ts'),
    factor: await server.ssrLoadModule('/src/verticals/finance/lib/feedFactor.ts'),
    narrative: await server.ssrLoadModule('/src/verticals/finance/lib/companyNarrative.ts'),
    api: await server.ssrLoadModule('/src/verticals/finance/lib/api.ts'),
    page: await server.ssrLoadModule('/src/core/ai/pageContext.tsx'),
    watch: await server.ssrLoadModule('/src/verticals/finance/lib/watchlist.ts'),
    router: await server.ssrLoadModule('react-router-dom'),
  };
  container = win.document.createElement('div') as unknown as HTMLElement;
  win.document.body.append(container);
  root = (await import('react-dom/client')).createRoot(container);
});
after(async () => { await React.act(async () => root?.unmount()); await server?.close(); win?.happyDOM.abort(); Object.assign(globalThis, previous); });

const model = () => modules.narrative.parseSensitivity(shenhuo.sensitivityResult);

test('Jev 驱动句：碰到X：对利润偏正面 / 偏负面 / 影响不明；有价格模型且有每步影响时保留数值半句；不写利好、利空', () => {
  const { jevFactorText, DIRECTION_TEXT } = modules.jev;
  assert.deepEqual(DIRECTION_TEXT, { positive: '对利润偏正面', negative: '对利润偏负面', unclear: '影响不明' });
  assert.equal(jevFactorText({ driver: '发电量', direction: 'negative', p: 0.9 }), '碰到发电量：对利润偏负面');
  assert.equal(jevFactorText({ driver: '净息差', direction: 'unclear' }), '碰到净息差：影响不明');
  assert.equal(jevFactorText({ driver: '沪铝', direction: 'positive' }, model()), '碰到沪铝：对利润偏正面；每 +1,000 元/吨，净利润 +9.96 亿元');
  assert.equal(jevFactorText({ driver: '氧化铝', direction: 'negative' }, model()), '碰到氧化铝：对利润偏负面；每 +100 元/吨，净利润 -1.92 亿元');
  assert.equal(jevFactorText({ driver: '煤炭售价', direction: 'positive' }, model()), '碰到煤炭售价：对利润偏正面', '该驱动没有每步影响就不写数');
  assert.equal(jevFactorText({ driver: '发电量', direction: 'positive' }, model()), '碰到发电量：对利润偏正面', '不是模型里的变量不写数');
  for (const bad of [null, undefined, { driver: '', direction: 'positive' }, { driver: '沪铝', direction: 'sideways' }]) assert.equal(jevFactorText(bad as any, model()), '');
  for (const direction of ['positive', 'negative', 'unclear']) assert.doesNotMatch(jevFactorText({ driver: '沪铝', direction } as any), /利好|利空|买入|卖出|建议/);
});

const h = React.createElement;
