// 动态资讯：每条标题碰到公司模型的哪个因素。命中、未命中、无模型三种情形；只匹配标题，不判断方向。
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
    factor: await server.ssrLoadModule('/src/verticals/finance/lib/feedFactor.ts'),
    narrative: await server.ssrLoadModule('/src/verticals/finance/lib/companyNarrative.ts'),
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

test('标题匹配变量名与常用说法；氧化铝不被「铝价」吃掉；命中时复用每步利润影响的写法', () => {
  const { factorNote } = modules.factor;
  const m = model();
  assert.deepEqual(m.variables.slice(0, 2).map((item: any) => item.name), ['沪铝', '氧化铝']);
  assert.equal(factorNote(m, '沪铝主力合约放量上行'), '碰到沪铝：每 +1,000 元/吨，净利润 +9.96 亿元');
  for (const title of ['铝价创年内新高', '电解铝企业利润扩张', '国内电解铝产能触及天花板']) assert.match(factorNote(m, title), /^碰到沪铝：/, title);
  assert.equal(factorNote(m, '氧化铝价格大幅回落'), '碰到氧化铝：每 +100 元/吨，净利润 -1.92 亿元');
  // 命中了变量但凭据里没有它的每步利润影响（神火的煤价）：没有可写的数，就不写。
  assert.equal(m.ruleOfThumb.some((item: any) => /煤/.test(m.variables.find((v: any) => v.id === item.id)?.name ?? '')), false);
  assert.equal(factorNote(m, '动力煤价格走弱'), '');
  const withCoal = { ...m, ruleOfThumb: [...m.ruleOfThumb, { id: m.variables[2].id, delta: 100, profitDelta: 3.96e8 }] };
  assert.equal(factorNote(withCoal, '动力煤价格走弱'), `碰到${m.variables[2].name}：每 +100 ${m.variables[2].unit}，净利润 +3.96 亿元`);
  assert.equal(factorNote(m, '神火股份召开年度股东大会'), '', '没命中不写');
  assert.equal(factorNote(m, ''), '');
  assert.equal(factorNote(null, '沪铝上涨'), '', '无模型不写');
  assert.equal(factorNote(undefined, '沪铝上涨'), '');
  assert.doesNotMatch(factorNote(m, '沪铝上涨'), /无关|利好|利空|上涨|下跌/, '不判断方向');
});

test('只读已存的研究凭据：没有研究、没有凭据、读失败都是无模型；同一公司只读一次', async () => {
  const { loadFactorModel } = modules.factor;
  const calls: string[] = [];
  const read = async (route: string) => {
    calls.push(route);
    if (route.includes('000933.SZ/page-research')) return { research: { sensitivity: { resultRef: RESULT } } };
    if (route.includes('600900.SH/page-research')) return { research: null };
    if (route.includes('000807.SZ/page-research')) throw new Error('down');
    if (route === `/research-results/${RESULT}`) return shenhuo.sensitivityResult;
    throw new Error('unexpected ' + route);
  };
  const memo = new Map();
  assert.ok((await loadFactorModel('000933.SZ', read, memo)).variables.length >= 2);
  assert.equal(await loadFactorModel('600900.SH', read, memo), null);
  assert.equal(await loadFactorModel('000807.SZ', read, memo), null);
  await loadFactorModel('000933.SZ', read, memo);
  assert.equal(calls.filter(route => route.includes('000933.SZ/page-research')).length, 1);
  assert.ok(calls.every(route => !/\/(coverage\/ensure|page-research\/revert)/.test(route)), '只有读取，不触发研究或数据补取');
});
