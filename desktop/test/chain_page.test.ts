// 产业链页第一版：链条、共同驱动、链上公司并排；公司无研究、接口缺口；从个股页进入。
// 链结构与框架按「估值模板与行业公共层」T5 契约的夹具；公司估值用 t73_real.json 里的真实研究凭据。
import assert from 'node:assert/strict';
import test, { before, after } from 'node:test';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { createServer as createHttpServer } from 'node:http';
import { createServer } from 'vite';
import * as React from 'react';
import { Window } from 'happy-dom';
import { companyPageFixture, fixtureData } from './fixtures/company_page.ts';

const futures = JSON.parse(readFileSync(new URL('./fixtures/futures_al_ao.json', import.meta.url), 'utf8'));
const contract = JSON.parse(readFileSync(new URL('./fixtures/chain_coal_power_aluminum.json', import.meta.url), 'utf8'));
const real = JSON.parse(readFileSync(new URL('./fixtures/t73_real.json', import.meta.url), 'utf8'));
const shenhuo = real.shenhuo, huaneng = real.huaneng;
const SENS = shenhuo.sensitivityResult.result_id as string, SCEN = shenhuo.scenarioResult.result_id as string, HN_SCEN = huaneng.scenarioResult.result_id as string;

let server: Awaited<ReturnType<typeof createServer>>, win: Window, root: ReturnType<typeof import('react-dom/client')['createRoot']>, container: HTMLElement;
let lib: Record<string, any>, pageModule: Record<string, any>, companyModule: Record<string, any>, router: Record<string, any>, pageContext: Record<string, any>, sessionModule: Record<string, any>;
const previous = { window: globalThis.window, document: globalThis.document, fetch: globalThis.fetch, sessionStorage: globalThis.sessionStorage, IS_REACT_ACT_ENVIRONMENT: globalThis.IS_REACT_ACT_ENVIRONMENT };
before(async () => {
  win = new Window();
  Object.assign(globalThis, { window: win, document: win.document, sessionStorage: win.sessionStorage, requestAnimationFrame: win.requestAnimationFrame.bind(win), cancelAnimationFrame: win.cancelAnimationFrame.bind(win), IS_REACT_ACT_ENVIRONMENT: true });
  server = await createServer({ configFile: false, root: fileURLToPath(new URL('../', import.meta.url)),
    resolve: { alias: { '@': fileURLToPath(new URL('../src/verticals/finance', import.meta.url)) } },
    server: { middlewareMode: true, hmr: { server: createHttpServer() }, watch: null }, appType: 'custom',
    ssr: { noExternal: ['react-router-dom', 'react-router'], resolve: { conditions: ['module-sync', 'node', 'import', 'development'] } } });
  lib = await server.ssrLoadModule('/src/verticals/finance/lib/chainPage.ts');
  pageModule = await server.ssrLoadModule('/src/verticals/finance/pages/ChainPage.tsx');
  companyModule = await server.ssrLoadModule('/src/verticals/finance/pages/CompanyPage.tsx');
  sessionModule = await server.ssrLoadModule('/src/verticals/finance/dsh/research-session.tsx');
  router = await server.ssrLoadModule('react-router-dom');
  pageContext = await server.ssrLoadModule('/src/core/ai/pageContext.tsx');
  container = win.document.createElement('div') as unknown as HTMLElement;
  win.document.body.append(container);
  root = (await import('react-dom/client')).createRoot(container);
});
after(async () => { await React.act(async () => root?.unmount()); await server?.close(); win?.happyDOM.abort(); Object.assign(globalThis, previous); });

const researched = (grade: string, extra: Record<string, unknown> = {}) => ({ research: { valuation: { grade, scenarioRef: SCEN }, sensitivity: { resultRef: SENS }, ...extra } });
const NAMES: Record<string, string> = { '600863': '华能蒙电', '600011': '华能国际', '600900': '长江电力', '000933': '神火股份', '000807': '云铝股份' };
const PRICES: Record<string, number> = { '600863': 5.21, '600011': 7.8, '600900': 27.1, '000933': 52.67, '000807': 15 };
/** 路由 → 回包；值为 Error 表示这条读不到。 */
function services(overrides: Record<string, unknown> = {}, quotes: unknown = undefined) {
  const routes: Record<string, unknown> = {
    '/wiki/chains/coal-power-aluminum': contract.chain,
    ...Object.fromEntries(Object.entries(contract.frameworks).map(([code, body]) => [`/wiki/industries/${code}/valuation-framework`, body])),
    '/wiki/companies/000933.SZ/page-research': researched('偏高'),
    '/wiki/companies/000807.SZ/page-research': researched('合理'),
    '/wiki/companies/600863.SH/page-research': { research: { valuation: { grade: '合理', scenarioRef: HN_SCEN } } },
    '/wiki/companies/600011.SH/page-research': { research: null },
    '/wiki/companies/600900.SH/page-research': { research: null },
    [`/research-results/${SENS}`]: shenhuo.sensitivityResult, [`/research-results/${SCEN}`]: shenhuo.scenarioResult, [`/research-results/${HN_SCEN}`]: huaneng.scenarioResult,
    ...overrides,
  };
  const requested: string[] = [];
  return {
    requested,
    read: async (route: string) => { requested.push(route); const body = routes[route]; if (body === undefined || body instanceof Error) throw body instanceof Error ? body : new Error('404 ' + route); return structuredClone(body); },
    quote: async (codes: string) => { if (quotes instanceof Error) throw quotes; return Object.fromEntries(codes.split(',').map(code => [code, { name: NAMES[code], price: PRICES[code] }])); },
  };
}
const h = React.createElement;
const sessions = { start: async () => ({ sessionId: 's', status: 'started' }), openSession: async () => {} };
async function show(service: any, chainId = 'coal-power-aluminum') {
  await React.act(async () => root.render(null));
  await React.act(async () => root.render(h(router.MemoryRouter, null, h(pageContext.AiPageProvider, {}, h(sessionModule.ResearchSessionContext.Provider, { value: sessions }, h(pageModule.ChainPage, { chainId, services: service }))))));
  await React.act(async () => { await new Promise(resolve => setTimeout(resolve, 20)); });
  await React.act(async () => {});
}
const text = (selector: string) => container.querySelector(selector)?.textContent ?? '';
const row = (symbol: string) => container.querySelector(`[data-company="${symbol}"]`) as HTMLElement;

test('纯函数：共同驱动按价格合并并列出影响的环节；箭头只写相邻环节之间的价格；现价在三档里的位置', () => {
  const chain = contract.chain;
  const drivers = lib.chainDrivers(chain);
  assert.deepEqual(drivers.map((item: any) => item.driver), ['煤价', '电价', '铝价', '氧化铝']);
  assert.deepEqual(drivers[0].nodes, ['煤炭开采', '电力', '工业金属'], '煤价合并两条传导，环节按链上顺序');
  assert.deepEqual(drivers[2].nodes, ['工业金属']);
  assert.equal(lib.arrowLabel(chain, 0), '煤价');
  assert.equal(lib.arrowLabel(chain, 1), '电价');
  assert.equal(lib.nodeIndex(chain, '801160'), 1, '传导里写行业代码也认');
  const tiers = [{ name: '悲观', price: 3 }, { name: '中性', price: 5 }, { name: '乐观', price: 7 }];
  assert.deepEqual([2, 4, 5, 6, 8].map(price => lib.positionText(price, tiers)), ['低于悲观价', '在悲观价与中性价之间', '正在中性价', '在中性价与乐观价之间', '高于乐观价']);
  assert.equal(lib.positionText(null, tiers), '');
  assert.equal(lib.positionText(5, tiers.slice(0, 2)), '');
  assert.equal(lib.roleText('upstream'), '上游');
  assert.equal(lib.chainStages(chain), '煤炭开采 → 电力 → 工业金属');
  assert.equal(lib.chainWatchedCount(chain, ['000933', '600900.SH', '601288.SH']), 2, '只计链上已关注，农行不在链上');
});

test('链条、共同驱动、链上公司并排：环节估值方法、驱动传导、每家公司的档位与区间位置', async () => {
  await show(services());
  assert.equal(text('.page-head .workspace-title'), '煤—电—铝');
  assert.match(text('[data-chain-headline]'), /^煤炭开采 → 电力 → 工业金属，由煤价、电价、铝价、氧化铝连成一条链。链上 5 家公司，已研究 3 家：2 家估值合理，1 家估值偏高。$/);
  // 链条：三个环节按顺序，每个写估值方法，箭头上写传导价格。
  const nodes = [...container.querySelectorAll('[data-node]')];
  assert.deepEqual(nodes.map(node => node.querySelector('b')!.textContent), ['煤炭开采', '电力', '工业金属']);
  assert.match(nodes[1]!.textContent!, /基础设施收益率：看电量乘电价的现金回报和分红收益率/);
  assert.match(nodes[2]!.textContent!, /商品周期市盈率：用铝价、氧化铝价三档推出利润/);
  assert.deepEqual(nodes.map(node => node.textContent!.match(/链上 (\d) 家公司/)![1]), ['0', '3', '2']);
  assert.deepEqual([...container.querySelectorAll('.chain-arrow small')].map(item => item.textContent), ['煤价', '电价']);
  // 共同驱动。
  const drivers = [...container.querySelectorAll('[data-driver]')];
  assert.deepEqual(drivers.map(item => item.getAttribute('data-driver')), ['煤价', '电价', '铝价', '氧化铝']);
  assert.match(drivers[0]!.textContent!, /煤价进入火电燃料成本与铝厂自备电；自备电厂的煤价直接进入铝厂成本煤炭开采电力工业金属/);
  // 链上公司按环节顺序：电力在前，工业金属在后。
  assert.deepEqual([...container.querySelectorAll('[data-company]')].map(item => item.getAttribute('data-company')), ['600863.SH', '600011.SH', '600900.SH', '000933.SZ', '000807.SZ']);
  const sh = row('000933.SZ');
  assert.equal(sh.querySelector('.chain-company-name a')!.textContent, '神火', '公司名用简称，与动态、跟踪一致');
  assert.equal(sh.querySelector('.chain-company-name a')!.getAttribute('href'), '/watch/000933');
  assert.equal(sh.querySelector('.chain-company-grade')!.textContent, '估值偏高');
  assert.match(sh.querySelector('.chain-band')!.getAttribute('aria-label')!, /现价 52\.67 元\/股，在中性价与乐观价之间/);
  assert.equal(sh.querySelectorAll('.chain-band-tick').length, 3);
  assert.match(sh.querySelector('.chain-company-implied')!.textContent!, /市场在赌沪铝约 24,100 元\/吨，现在 23,465 元\/吨/);
  assert.equal(row('000807.SZ').querySelector('.chain-company-grade')!.textContent, '估值合理');
  // 蒙电研究里没有敏感性凭据：就地写缺什么，不编。
  const hn = row('600863.SH');
  assert.match(hn.querySelector('.chain-band')!.getAttribute('aria-label')!, /现价 5\.21 元\/股/);
  assert.equal(hn.querySelector('.chain-company-implied')!.textContent, '缺市场在赌的价格');
  // 没研究的不触发研究，只写“尚未研究”，仍能进个股页。
  for (const symbol of ['600011.SH', '600900.SH']) {
    assert.equal(row(symbol).querySelector('.chain-company-none')!.textContent, '尚未研究');
    assert.ok(row(symbol).querySelector('a')!.getAttribute('href')!.startsWith('/watch/'));
  }
  assert.doesNotMatch(container.querySelector('.chain')!.textContent!, /买入|卖出|建议|undefined|NaN|null|template_id|commodity_pe|infra_yield|upstream/);
});

test('设计原则 4：整页没有品牌橙描边或底色，橙色只在区间条的现价点', async () => {
  await show(services());
  assert.equal(container.querySelectorAll('.card-alert, .tone-brand').length, 0);
  assert.equal(container.querySelectorAll('[data-band-price]').length, 3, '三家有三档价和现价的公司各一个现价点');
  const css = readFileSync(new URL('../src/verticals/finance/pages/chain-page.css', import.meta.url), 'utf8');
  const brandLines = css.split('\n').filter(line => /brand/.test(line) && !line.startsWith('/*'));
  assert.equal(brandLines.length, 1);
  assert.match(brandLines[0]!, /^\.chain-band-dot, \.chain-cycle-dot /, '橙色只给图表里的当前值：现价点与周期位置点');
  assert.doesNotMatch(css, /box-shadow|brand-soft|brand-line/);
});

test('公司无研究：整条链的公司都写“尚未研究”，页首如实写已研究 0 家，不读三档价与凭据', async () => {
  const none = Object.fromEntries(['000933.SZ', '000807.SZ', '600863.SH', '600011.SH', '600900.SH'].map(symbol => [`/wiki/companies/${symbol}/page-research`, { research: null }]));
  const service = services(none);
  await show(service);
  assert.match(text('[data-chain-headline]'), /已研究 0 家。$/);
  assert.equal(container.querySelectorAll('.chain-company-none').length, 5);
  assert.equal(container.querySelectorAll('.chain-band').length, 0);
  assert.equal(service.requested.some(route => route.startsWith('/research-results/')), false);
  assert.equal(service.requested.some(route => /ensure|\/research$/.test(route)), false, '只读，不触发研究');
  // 一家都没有的链。
  const empty = structuredClone(contract.chain); for (const node of empty.nodes) node.companies = [];
  await show(services({ '/wiki/chains/coal-power-aluminum': empty }));
  assert.match(text('[data-chain-section="companies"]'), /链上还没有关注公司/);
});

test('接口缺口：链读不到整页一句话加重试；框架、研究、凭据、行情各缺一块只缺那一块', async () => {
  const down = services({ '/wiki/chains/coal-power-aluminum': new Error('503') });
  await show(down);
  assert.match(text('[role="alert"]'), /这条产业链暂时读取不到/);
  assert.equal(container.querySelector('[data-chain]'), null);
  // 重试：链恢复后再读。
  let ok = false;
  const flaky = services();
  const read = flaky.read;
  flaky.read = async (route: string) => { if (route === '/wiki/chains/coal-power-aluminum' && !ok) throw new Error('503'); return read(route); };
  await show(flaky);
  ok = true;
  await React.act(async () => (container.querySelector('[role="alert"] button') as HTMLButtonElement).click());
  await React.act(async () => { await new Promise(resolve => setTimeout(resolve, 20)); });
  assert.ok(container.querySelector('[data-chain]'));
  // 一个环节的框架缺：该环节写“估值方法暂缺”，其余照常。
  await show(services({ '/wiki/industries/801160/valuation-framework': new Error('404') }));
  assert.match(text('[data-node="801160"]'), /估值方法暂缺/);
  assert.match(text('[data-node="801050"]'), /商品周期市盈率/);
  assert.match(text('[data-gap="framework"]'), /部分环节的估值方法暂时读取不到/);
  // 神火的三档价与凭据都读不到：仍显示档位，区间条与隐含价各写缺什么。
  await show(services({ [`/research-results/${SENS}`]: new Error('x'), [`/research-results/${SCEN}`]: new Error('x') }));
  assert.equal(row('000933.SZ').querySelector('.chain-company-grade')!.textContent, '估值偏高');
  assert.match(row('000933.SZ').textContent!, /缺三档价/);
  assert.match(row('000933.SZ').textContent!, /缺市场在赌的价格/);
  // 行情读不到：名字退回代码，区间条缺现价。
  await show(services({}, new Error('quote down')));
  assert.equal(row('000933.SZ').querySelector('.chain-company-name a')!.textContent, '000933');
  assert.match(row('000933.SZ').textContent!, /缺现价/);
  // 研究读取失败按尚未研究写，不报错。
  await show(services({ '/wiki/companies/000933.SZ/page-research': new Error('500') }));
  assert.equal(row('000933.SZ').querySelector('.chain-company-none')!.textContent, '尚未研究');
});

test('从个股页进入：公司在链上时页首出现“所属产业链”入口，不在链上或读不到就没有；链定义会话内只读一次', async () => {
  const { researchRoute } = await import('../dsh/finance-ui/research.mjs');
  assert.equal(researchRoute('GET', '/wiki/chains'), true);
  assert.equal(researchRoute('GET', '/wiki/chains/coal-power-aluminium'), true);
  assert.equal(researchRoute('POST', '/wiki/chains'), false);
  assert.equal(researchRoute('GET', '/wiki/industries/801055.SI/valuation-framework'), true);
  const chains = [contract.chain, { ...contract.chain, chain_id: 'lithium-battery', name: '锂电', nodes: [{ industry_code: '1', industry_name: '电池', companies: ['300750.SZ'] }] }];
  assert.deepEqual(lib.chainsOf(chains, '000933.SZ'), [{ chain_id: 'coal-power-aluminum', name: '煤—电—铝' }]);
  assert.deepEqual(lib.chainsOf(chains, '000933'), [{ chain_id: 'coal-power-aluminum', name: '煤—电—铝' }], '带不带后缀都认');
  assert.deepEqual(lib.chainsOf(chains, '601288.SH'), []);
  assert.equal(lib.chainPath('coal-power-aluminum'), '/chains/coal-power-aluminum');
  const routes: Record<string, unknown> = { '/wiki/chains': contract.list, '/wiki/chains/coal-power-aluminum': contract.chain, '/wiki/chains/lithium-battery': chains[1] };
  const asked: string[] = [];
  const stub = { read: async (route: string) => { asked.push(route); if (!(route in routes)) throw new Error('404'); return routes[route]; }, quote: async () => ({}) };
  assert.equal((await lib.loadChainIndex(stub)).length, 2);
  assert.deepEqual(await lib.loadChainIndex({ read: async () => { throw new Error('down'); }, quote: async () => ({}) }), [], '读不到返回空，不抛');
  // 页面：个股页头部。
  lib.resetChainIndex();
  globalThis.fetch = (async (url: string) => {
    const route = String(url).replace('/finance-research', '');
    return route in routes ? Response.json(routes[route]) : Response.json({ detail: 'x' }, { status: 404 });
  }) as typeof fetch;
  const fixture = companyPageFixture({ research: null, stale: false, basisVersion: 'v' });
  fixture.services.data.quote = async () => ({ ...fixtureData.quote!, price: 52.67 });
  const open = async (symbol: string) => {
    await React.act(async () => root.render(h(router.MemoryRouter, null, h(companyModule.CompanyPage, { key: symbol, symbol, name: '神火股份', services: fixture.services }))));
    await React.act(async () => { await new Promise(resolve => setTimeout(resolve, 30)); });
  };
  await open('000933');
  const entry = container.querySelector('[data-chain-entry]')!;
  assert.match(entry.textContent!, /所属产业链：煤—电—铝/);
  assert.equal(entry.querySelector('a')!.getAttribute('href'), '/chains/coal-power-aluminum');
  await open('601288');
  assert.equal(container.querySelector('[data-chain-entry]'), null);
  lib.resetChainIndex();
});

// ---------------------------------------------------------------- 试算：沪铝变一下，链上各家利润怎么动

test('试算纯函数：沪铝拖到 25,465 元/吨，神火利润 +19.92 亿元（系数 996,000 元/吨 × 2,000）；默认现价时全是 0；范围取模型区间；未研究与缺模型各写各的', async () => {
  const view = await lib.loadChainView('coal-power-aluminum', services());
  const setup = lib.calcSetup(view.companies);
  assert.deepEqual(setup, { id: 'cmdty:SHFE.AL', name: '沪铝', unit: '元/吨', current: 23465, min: 20000, max: 28000, step: 50 });
  const at = (value: number) => Object.fromEntries(lib.calcRows(view.companies, setup, value).map((item: any) => [item.symbol, item]));
  const up = at(25465);
  assert.equal(up['000933.SZ'].state, 'ok');
  assert.equal(Math.round(up['000933.SZ'].delta), 1_992_000_000);
  assert.ok(Math.abs(up['000933.SZ'].share - 1_992_000_000 / 9_562_000_000) < 1e-9, '占比 = 变动 ÷ 对比期利润');
  assert.equal(up['000933.SZ'].baseLabel, '2026 上半年 × 2');
  assert.equal(Math.round(at(22465)['000933.SZ'].delta), -996_000_000);
  assert.equal(at(23465)['000933.SZ'].delta, 0);
  // 没研究：不估；已研究但研究里没存利润模型（蒙电只有三档价）：写明。
  assert.equal(up['600011.SH'].state, 'none');
  assert.equal(up['600011.SH'].delta, undefined);
  assert.equal(up['600863.SH'].state, 'nomodel');
  // 模型里没有沪铝：不算；缺对比期均价：不算，不假装 0。
  const noVar = structuredClone(view.companies.find((item: any) => item.symbol === '000933.SZ'));
  noVar.model.variables = noVar.model.variables.filter((item: any) => item.id !== 'cmdty:SHFE.AL');
  const noAnchor = structuredClone(view.companies.find((item: any) => item.symbol === '000933.SZ'));
  noAnchor.model.variables.find((item: any) => item.id === 'cmdty:SHFE.AL').anchor = null;
  assert.deepEqual(lib.calcRows([noVar, noAnchor], setup, 25000).map((item: any) => item.state), ['novar', 'noanchor']);
  assert.equal(lib.calcSetup([noVar]), null, '没有任何模型带沪铝就没有试算节');
  assert.equal(lib.calcSetup(view.companies.filter((item: any) => item.status === 'none')), null);
  // 基数利润非正：不给占比。
  const loss = structuredClone(view.companies.find((item: any) => item.symbol === '000933.SZ'));
  loss.model.baseProfit = -1;
  assert.equal(lib.calcRows([loss], setup, 25000)[0].share, null);
});

test('试算页：滑块默认现价，每家一行；拖到 25,465 神火 +19.92 亿元、占对比期利润 20.8%；未研究写“未研究”', async () => {
  await show(services());
  const panel = container.querySelector('[data-chain-section="calc"]') as HTMLElement;
  assert.ok(panel);
  assert.match(panel.textContent!, /沪铝变一下，链上各家利润怎么动/);
  assert.equal(text('[data-calc-value]'), '23,465 元/吨');
  const calc = (symbol: string) => container.querySelector(`[data-calc="${symbol}"]`) as HTMLElement;
  assert.deepEqual([...container.querySelectorAll('[data-calc]')].map(item => item.getAttribute('data-calc')), ['600863.SH', '600011.SH', '600900.SH', '000933.SZ', '000807.SZ']);
  assert.equal(calc('000933.SZ').querySelector('[data-calc-delta]')!.textContent, '0.00 亿元');
  const input = panel.querySelector('input[type="range"]') as HTMLInputElement;
  assert.deepEqual([input.min, input.max, input.step], ['20000', '28000', '50']);
  await React.act(async () => {
    const setter = Object.getOwnPropertyDescriptor(win.HTMLInputElement.prototype, 'value')!.set!;
    setter.call(input, '25465');
    input.dispatchEvent(new win.Event('input', { bubbles: true }));
  });
  assert.equal(text('[data-calc-value]'), '25,465 元/吨');
  assert.equal(calc('000933.SZ').querySelector('[data-calc-delta]')!.textContent, '+19.92 亿元');
  assert.match(calc('000933.SZ').querySelector('[data-calc-share]')!.textContent!, /^\+20\.8%/);
  assert.equal(calc('000807.SZ').querySelector('[data-calc-delta]')!.textContent, '+19.92 亿元');
  assert.equal(calc('600011.SH').textContent!.includes('未研究'), true);
  assert.equal(calc('600863.SH').textContent!.includes('研究里没有利润模型'), true);
  await React.act(async () => {
    const setter = Object.getOwnPropertyDescriptor(win.HTMLInputElement.prototype, 'value')!.set!;
    setter.call(input, '21465');
    input.dispatchEvent(new win.Event('input', { bubbles: true }));
  });
  assert.equal(calc('000933.SZ').querySelector('[data-calc-delta]')!.textContent, '−19.92 亿元');
  assert.doesNotMatch(panel.textContent!, /买入|卖出|建议|undefined|NaN|null/);
});

test('试算页：链上没有任何已研究的利润模型，整节不出现，其余照常', async () => {
  const none = Object.fromEntries(['000933.SZ', '000807.SZ', '600863.SH', '600011.SH', '600900.SH'].map(symbol => [`/wiki/companies/${symbol}/page-research`, { research: null }]));
  await show(services(none));
  assert.equal(container.querySelector('[data-chain-section="calc"]'), null);
  assert.ok(container.querySelector('[data-chain-section="companies"]'));
});

// ---------------------------------------------------------------- 周期位置：沪铝 − 1.93 × 氧化铝 的价差分位

const cycleServices = (daily: unknown = futures, overrides: Record<string, unknown> = {}) => services({ [lib.cycleRoute]: daily, ...overrides });

test('周期位置纯函数：真实日线（Stock 接口实取 2026-10-20）806 个共同交易日，现价差 17,884 元/吨处在 79% 分位 → 高位；氧化铝 2023 年 6 月才有日线，写明只有 3.3 年', () => {
  const cycle = lib.cyclePosition(futures);
  assert.equal(cycle.state, 'ok');
  const p = cycle.position;
  assert.deepEqual([p.days, p.from, p.asOf, p.percentile, p.zone], [806, '2023-06-19', '2026-10-19', 79, '高位']);
  assert.ok(Math.abs(p.spread - 17884.45) < 1e-6 && Math.abs(p.low - 9970.79) < 1e-6 && Math.abs(p.high - 20265.74) < 1e-6);
  assert.match(p.short, /氧化铝期货 2023 年 6 月才有日线，只能按可得的 3\.3 年算/);
  assert.equal(lib.cycleSentence(p), '铝价减去氧化铝成本的价差处在近 3.3 年的 79% 分位，在高位区间');
  assert.deepEqual([0, 24, 25, 50, 75, 76, 100].map(lib.cycleZone), ['底部', '底部', '中位', '中位', '中位', '高位', '高位']);
});

test('周期位置纯函数：整十年写“近 10 年”不加说明；现值等于历史最低是 0% 分位；日线缺一条、样本不足、坏数字都写缺口，不估', () => {
  const day = (i: number) => new Date(Date.UTC(2016, 9, 20) + i * 86400000).toISOString().slice(0, 10);
  const mk = (n: number, al: (i: number) => number, ao = (_i: number) => 1000) => ({ series: [
    { id: 'cmdty:SHFE.AL', points: Array.from({ length: n }, (_, i) => [day(i), String(al(i))]) },
    { id: 'cmdty:SHFE.AO', first_day: day(0), points: Array.from({ length: n }, (_, i) => [day(i), String(ao(i))]) }] });
  const ten = lib.cyclePosition(mk(3651, i => 20000 - i)).position;
  assert.equal(ten.short, '');
  assert.equal(ten.percentile, 0, '现值是历史最低：0%（只有它自己，算半格也不到 1%）');
  assert.equal(lib.cycleSentence(ten), '铝价减去氧化铝成本的价差处在近 10 年的 0% 分位，在底部区间');
  assert.equal(lib.cyclePosition(mk(3651, i => 10000 + i)).position.percentile, 100);
  assert.deepEqual(lib.cyclePosition({ series: [mk(300, () => 1).series[0]] }), { state: 'gap', reason: '氧化铝日线取不到' });
  assert.deepEqual(lib.cyclePosition(null), { state: 'gap', reason: '沪铝日线取不到' });
  assert.match(lib.cyclePosition(mk(100, () => 20000)).reason, /只有 100 天，不够算分位/);
  const bad = mk(400, () => 20000); bad.series[0]!.points[5] = [day(5), 'oops'];
  assert.equal(lib.cyclePosition(bad).position.days, 399, '坏数字那天跳过，不当 0');
});

test('周期位置页：一句话加底部—中位—高位刻度，现价差点在 79%；说明里写价差公式、期间与不含电价吨成本；只此一个橙点之外不新增橙色', async () => {
  const service = cycleServices();
  await show(service);
  const panel = container.querySelector('[data-chain-section="cycle"]') as HTMLElement;
  assert.ok(panel);
  assert.equal(text('[data-cycle-line]'), '铝价减去氧化铝成本的价差处在近 3.3 年的 79% 分位，在高位区间');
  assert.equal((container.querySelector('[data-cycle-dot]') as HTMLElement).style.left, '79%');
  assert.deepEqual([...panel.querySelectorAll('.chain-cycle-scale > span')].map(item => item.textContent), ['底部', '中位', '高位']);
  assert.match(text('[data-cycle-note]'), /价差 = 沪铝 − 1\.93 × 氧化铝.*现在 17,884 元\/吨，历史最低 9,971、最高 20,266.*2023-06-19 至 2026-10-19 共 806 个交易日。氧化铝期货 2023 年 6 月才有日线.*不含电价和吨成本/);
  assert.ok(service.requested.includes(lib.cycleRoute));
  assert.match(lib.cycleRoute, /^\/market\/futures-daily\?ids=cmdty%3ASHFE\.AL,cmdty%3ASHFE\.AO&years=10$/);
  // 周期位置排在共同驱动之后、试算之前。
  const order = [...container.querySelectorAll('[data-chain-section]')].map(item => item.getAttribute('data-chain-section'));
  assert.deepEqual(order, ['nodes', 'drivers', 'cycle', 'calc', 'companies']);
  assert.doesNotMatch(panel.textContent!, /买入|卖出|建议|undefined|NaN|null/);
});

test('周期位置页：日线读不到只那一节写缺口加重试，其余照常；重试后补上；链上没有铝价与氧化铝驱动就没有这一节', async () => {
  let fail = true;
  const base = cycleServices();
  const service = { ...base, read: async (route: string, signal?: AbortSignal) => { if (route === lib.cycleRoute && fail) throw new Error('502'); return base.read(route, signal); } };
  await show(service);
  assert.match(text('[data-gap="cycle"]'), /沪铝与氧化铝日线暂时读取不到。重试/);
  assert.ok(container.querySelector('[data-chain-section="companies"]') && container.querySelector('[data-chain-section="calc"]'));
  fail = false;
  await React.act(async () => { (container.querySelector('[data-gap="cycle"] button') as HTMLElement).click(); });
  await React.act(async () => { await new Promise(resolve => setTimeout(resolve, 20)); });
  assert.match(text('[data-cycle-line]'), /79% 分位/);
  // 部分合约失败：Stock 的 failed 里有氧化铝，series 只有沪铝。
  await show(cycleServices({ series: [futures.series[0]], failed: [{ id: 'cmdty:SHFE.AO', message: 'x' }] }));
  assert.equal(text('[data-gap="cycle"]').startsWith('氧化铝日线取不到'), true);
  const noDrivers = structuredClone(contract.chain); noDrivers.transmission = noDrivers.transmission.filter((item: any) => item.driver !== '氧化铝');
  await show(cycleServices(futures, { '/wiki/chains/coal-power-aluminum': noDrivers }));
  assert.equal(container.querySelector('[data-chain-section="cycle"]'), null);
});
