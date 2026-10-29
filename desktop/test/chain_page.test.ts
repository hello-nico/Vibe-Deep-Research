// 产业链页（用户自己的链）：链条、共同驱动、链上公司并排；公司无研究、接口缺口；个股页推荐所在链；建链、加减公司、撤回、删除、版本冲突。
// 用户链按 Stock `docs/user-chains-contract.md`；环节骨架与框架用「估值模板与行业公共层」T5 契约的夹具；公司估值用 t73_real.json 里的真实研究凭据。
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
// 2026-10-29 从 Stock codex1-chain 冻结画像提取 cycle，未调用模型或行情服务。
const profiles = JSON.parse(readFileSync(new URL('./fixtures/chain_cycle_profiles.json', import.meta.url), 'utf8'));
const aluminumMetric = () => lib.cycleMetric(profiles['801055.SI'].cycle);
const contract = JSON.parse(readFileSync(new URL('./fixtures/chain_coal_power_aluminum.json', import.meta.url), 'utf8'));
const real = JSON.parse(readFileSync(new URL('./fixtures/t73_real.json', import.meta.url), 'utf8'));
const shenhuo = real.shenhuo, huaneng = real.huaneng;
const SENS = shenhuo.sensitivityResult.result_id as string, SCEN = shenhuo.scenarioResult.result_id as string, HN_SCEN = huaneng.scenarioResult.result_id as string;

const UID = 'uchain:0123456789ab';
const UROUTE = '/wiki/user-chains/uchain%3A0123456789ab';
/** 契约夹具的公共链骨架 → Backend 的用户链：环节叫 stages，带版本与是否有上一版。 */
const userRaw = (chain: any, extra: Record<string, unknown> = {}) => ({ id: UID, public_chain_id: 'coal-power-aluminium', name: chain.name, stages: chain.nodes, drivers: [], transmission: chain.transmission, version: 3, has_previous: true, updated_at: '2026-10-26T00:00:00Z', source: { kind: 'created' }, ...extra });

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
    [UROUTE]: userRaw(contract.chain),
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
  const writes: { method: string; route: string; body?: any }[] = [];
  const writeResult: { next: unknown } = { next: { ok: true } };
  return {
    requested, writes, writeResult,
    write: async (method: string, route: string, body?: unknown) => { writes.push({ method, route, body }); if (writeResult.next instanceof Error) throw writeResult.next; return structuredClone(writeResult.next); },
    watched: () => ['000933', '600011', '601288'],
    follow: async (code: string) => { writes.push({ method: 'FOLLOW', route: code }); },
    read: async (route: string) => { requested.push(route); const body = routes[route]; if (body === undefined || body instanceof Error) throw body instanceof Error ? body : new Error('404 ' + route); return structuredClone(body); },
    quote: async (codes: string) => { if (quotes instanceof Error) throw quotes; return Object.fromEntries(codes.split(',').map(code => [code, { name: NAMES[code], price: PRICES[code] }])); },
  };
}
const h = React.createElement;
const sessions = { start: async () => ({ sessionId: 's', status: 'started' }), openSession: async () => {} };
async function show(service: any, chainId = UID) {
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
  assert.equal(lib.nodeIndex(chain, '801161.SI'), 1, '传导里写行业代码也认');
  const tiers = [{ name: '悲观', price: 3 }, { name: '中性', price: 5 }, { name: '乐观', price: 7 }];
  assert.deepEqual([2, 4, 5, 6, 8].map(price => lib.positionText(price, tiers)), ['低于悲观价', '在悲观价与中性价之间', '在中性价', '在中性价与乐观价之间', '高于乐观价']);
  assert.equal(lib.positionText(null, tiers), '');
  assert.equal(lib.positionText(5, tiers.slice(0, 2)), '');
  assert.equal(lib.roleText('upstream'), '上游');
  assert.equal(lib.chainStages(chain), '煤炭开采 → 电力 → 工业金属');
  assert.equal(lib.chainCompanyCount(chain), 5, '链上公司数 = 各环节公司合计');
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
  assert.equal(sh.querySelector('.chain-company-name a')!.textContent, '神火股份', '公司名用简称，与动态、跟踪一致');
  assert.equal(sh.querySelector('.chain-company-name a')!.getAttribute('href'), '/watch/000933');
  assert.equal(sh.querySelector('.chain-company-grade')!.textContent, '估值偏高');
  assert.match(sh.querySelector('.chain-band')!.getAttribute('aria-label')!, /现价 52\.67 元\/股，在中性价与乐观价之间/);
  assert.equal(sh.querySelectorAll('.chain-band-tick').length, 3);
  assert.match(sh.querySelector('.chain-company-implied')!.textContent!, /按现在的股价，大致对应 沪铝约 24,100 元\/吨（研究时 23,465 元\/吨）/);
  assert.equal(row('000807.SZ').querySelector('.chain-company-grade')!.textContent, '估值合理');
  // 蒙电研究里没有敏感性凭据：就地写缺什么，不编。
  const hn = row('600863.SH');
  assert.match(hn.querySelector('.chain-band')!.getAttribute('aria-label')!, /现价 5\.21 元\/股/);
  assert.equal(hn.querySelector('.chain-company-implied')!.textContent, '无对应价格');
  // 没研究的不触发研究，只写“尚未研究”，仍能进个股页。
  for (const symbol of ['600011.SH', '600900.SH']) {
    assert.equal(row(symbol).querySelector('.chain-company-none')!.textContent, '未研究');
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
  await show(services({ [UROUTE]: userRaw(empty) }));
  assert.equal(container.querySelectorAll('[data-stage-empty]').length, 3, '每个环节各写一句还没有你关注的公司');
  assert.match(text('[data-chain-section="companies"]'), /暂无关注公司/);
});

test('接口缺口：链读不到整页一句话加重试；框架、研究、凭据、行情各缺一块只缺那一块', async () => {
  const down = services({ [UROUTE]: new Error('503') });
  await show(down);
  assert.match(text('[role="alert"]'), /读取失败/);
  assert.equal(container.querySelector('[data-chain]'), null);
  // 重试：链恢复后再读。
  let ok = false;
  const flaky = services();
  const read = flaky.read;
  flaky.read = async (route: string) => { if (route === UROUTE && !ok) throw new Error('503'); return read(route); };
  await show(flaky);
  ok = true;
  await React.act(async () => (container.querySelector('[role="alert"] button') as HTMLButtonElement).click());
  await React.act(async () => { await new Promise(resolve => setTimeout(resolve, 20)); });
  assert.ok(container.querySelector('[data-chain]'));
  // 一个环节的框架缺：该环节写“估值方法暂缺”，其余照常。
  await show(services({ '/wiki/industries/801161.SI/valuation-framework': new Error('404') }));
  assert.match(text('[data-node="801161.SI"]'), /缺估值方法/);
  assert.match(text('[data-node="801055.SI"]'), /商品周期市盈率/);
  assert.match(text('[data-gap="framework"]'), /部分估值方法读取失败/);
  // 神火股份的三档价与凭据都读不到：仍显示档位，区间条与隐含价各写缺什么。
  await show(services({ [`/research-results/${SENS}`]: new Error('x'), [`/research-results/${SCEN}`]: new Error('x') }));
  assert.equal(row('000933.SZ').querySelector('.chain-company-grade')!.textContent, '估值偏高');
  assert.match(row('000933.SZ').textContent!, /缺三档价/);
  assert.match(row('000933.SZ').textContent!, /无对应价格/);
  // 行情读不到：名字退回代码，区间条缺现价。
  await show(services({}, new Error('quote down')));
  assert.equal(row('000933.SZ').querySelector('.chain-company-name a')!.textContent, '000933');
  assert.match(row('000933.SZ').textContent!, /缺现价/);
  // 研究读取失败按尚未研究写，不报错。
  await show(services({ '/wiki/companies/000933.SZ/page-research': new Error('500') }));
  assert.equal(row('000933.SZ').querySelector('.chain-company-none')!.textContent, '未研究');
});

test('个股页推荐所在链：读推荐接口，已建的进你的链，未建的点「建产业链」建好进入；读不到或没有推荐整段不出现；不再按申万自动挂链', async () => {
  const { researchRoute } = await import('../dsh/finance-ui/research.mjs');
  for (const [method, path] of [['GET', '/wiki/user-chains'], ['GET', '/wiki/user-chains/recommendations'], ['POST', '/wiki/user-chains'], ['GET', '/wiki/user-chains/uchain:0123456789ab'], ['PATCH', '/wiki/user-chains/uchain:0123456789ab'], ['DELETE', '/wiki/user-chains/uchain:0123456789ab'], ['POST', '/wiki/user-chains/uchain:0123456789ab/revert'], ['GET', '/wiki/user-chains/uchain:0123456789ab/candidates']]) {
    assert.equal(researchRoute(method, path), true, `${method} ${path}`);
  }
  assert.equal(lib.chainPath(UID), '/chains/uchain%3A0123456789ab');
  assert.equal(lib.loadChainIndex, undefined, '预置链索引已移除');
  // 纯函数：推荐。
  const rec = { items: [{ public_chain_id: 'coal-power-aluminium', name: '煤—电—铝', built: false, user_chain_id: null }, { public_chain_id: 'lithium-battery', name: '锂电', built: true, user_chain_id: 'uchain:a1b2c3d4e5f6' }] };
  const asked: string[] = [];
  const stub = { ...services(), read: async (route: string) => { asked.push(route); if (route.startsWith('/wiki/user-chains/recommendations')) return rec; throw new Error('404'); } };
  assert.deepEqual(await lib.loadRecommendations('000933', stub), [{ publicChainId: 'coal-power-aluminium', name: '煤—电—铝', built: false, userChainId: null }, { publicChainId: 'lithium-battery', name: '锂电', built: true, userChainId: 'uchain:a1b2c3d4e5f6' }]);
  assert.deepEqual(asked, ['/wiki/user-chains/recommendations?symbol=000933.SZ'], '6 位代码补成带后缀的完整代码');
  assert.deepEqual(await lib.loadRecommendations('00700.HK', stub), [], '港股不请求');
  assert.deepEqual(await lib.loadRecommendations('000933', { ...stub, read: async () => { throw new Error('down'); } }), [], '读不到返回空，不抛');
  // 页面：个股页头部。
  const fixture = companyPageFixture({ research: null, stale: false, basisVersion: 'v' });
  fixture.services.data.quote = async () => ({ ...fixtureData.quote!, price: 52.67 });
  const chainService = services();
  let items = rec.items;
  chainService.read = async (route: string) => { if (route.startsWith('/wiki/user-chains/recommendations')) { if (items === null) throw new Error('down'); return { symbol: '000933.SZ', items }; } throw new Error('404'); };
  let at = '';
  const Where = () => { at = router.useLocation().pathname; return null; };
  const open = async (symbol: string) => {
    await React.act(async () => root.render(h(router.MemoryRouter, null, h(Where), h(companyModule.CompanyPage, { key: symbol, symbol, name: '神火股份', services: fixture.services, chainServices: chainService }))));
    await React.act(async () => { await new Promise(resolve => setTimeout(resolve, 30)); });
  };
  await open('000933');
  const entry = container.querySelector('[data-chain-entry]')!;
  assert.match(entry.textContent!, /^推荐所在链：煤—电—铝建产业链、锂电$/);
  assert.equal(entry.querySelector('a')!.getAttribute('href'), '/chains/uchain%3Aa1b2c3d4e5f6', '已建的链进入你的那条');
  assert.equal(entry.querySelectorAll('a').length, 1, '未建的不是链接');
  // 点「建产业链」：以已关注公司为底建链，然后进入新链。
  chainService.writeResult.next = { id: 'uchain:b1b2c3d4e5f6', created: true };
  await React.act(async () => { (entry.querySelector('button') as HTMLButtonElement).click(); });
  await React.act(async () => { await new Promise(resolve => setTimeout(resolve, 20)); });
  assert.deepEqual(chainService.writes.map((item: any) => [item.method, item.route, item.body]), [['POST', '/wiki/user-chains', { public_chain_id: 'coal-power-aluminium', watched_symbols: ['000933.SZ', '600011.SH', '601288.SH'] }]]);
  assert.equal(at, '/chains/uchain%3Ab1b2c3d4e5f6');
  // 建失败：原处一句话，留在个股页。
  await open('000933');
  chainService.writeResult.next = new Error('500');
  await React.act(async () => { (container.querySelector('[data-chain-entry] button') as HTMLButtonElement).click(); });
  await React.act(async () => { await new Promise(resolve => setTimeout(resolve, 20)); });
  assert.match(text('[data-chain-error]'), /没成功/);
  // 没有推荐 / 读不到：整段不出现。
  items = [];
  await open('601288');
  assert.equal(container.querySelector('[data-chain-entry]'), null);
  items = null as any;
  await open('000933');
  assert.equal(container.querySelector('[data-chain-entry]'), null);
});

test('同环节还可关注：展开读候选（整条链最多 8 家）按环节分开，点「关注」即关注并加入本链，带版本与已关注列表；读不到写一句话加重试', async () => {
  const service = services({ [`${UROUTE}/candidates?watched=000933.SZ,600011.SH,601288.SH`]: { items: [
    { symbol: '600900.SH', industry_code: '801161.SI', industry_name: '电力', role: 'midstream' },
    { symbol: '000807.SZ', industry_code: '801055.SI', industry_name: '工业金属', role: 'downstream' },
  ], limit: 8 } });
  await show(service);
  assert.equal(service.requested.some((route: string) => route.includes('/candidates')), false, '展开前不读候选');
  const stage = (code: string) => container.querySelector(`[data-stage="${code}"]`) as HTMLElement;
  const details = stage('801161.SI').querySelector('details') as HTMLDetailsElement;
  assert.equal(details.querySelector('summary')!.textContent, '同环节还可关注');
  await React.act(async () => { details.open = true; details.dispatchEvent(new win.Event('toggle') as unknown as Event); });
  await React.act(async () => { await new Promise(resolve => setTimeout(resolve, 20)); });
  assert.equal(service.requested.filter((route: string) => route.includes('/candidates')).length, 1);
  assert.deepEqual([...stage('801161.SI').querySelectorAll('[data-candidate]')].map(item => item.getAttribute('data-candidate')), ['600900.SH'], '只列本环节的候选');
  assert.match(stage('801161.SI').querySelector('[data-candidate]')!.textContent!, /长江电力|600900/);
  assert.deepEqual([...stage('801055.SI').querySelectorAll('[data-candidate]')].map(item => item.getAttribute('data-candidate')), ['000807.SZ'], '另一环节只有自己的候选');
  // 点「关注」：先关注，再带版本号与已关注列表加进链；随后重读。
  await React.act(async () => { (stage('801161.SI').querySelector('[data-candidate] button') as HTMLButtonElement).click(); });
  await React.act(async () => { await new Promise(resolve => setTimeout(resolve, 20)); });
  assert.deepEqual(service.writes.map((item: any) => [item.method, item.route, item.body]), [
    ['FOLLOW', '600900', undefined],
    ['PATCH', UROUTE, { expected_version: 3, add_companies: ['600900.SH'], watched_symbols: ['000933.SZ', '600011.SH', '601288.SH'] }],
  ]);
  // 候选读不到：一句话加重试。
  const down = services({ [`${UROUTE}/candidates?watched=000933.SZ,600011.SH,601288.SH`]: new Error('500') });
  await show(down);
  const det = container.querySelector('[data-stage="801161.SI"] details') as HTMLDetailsElement;
  await React.act(async () => { det.open = true; det.dispatchEvent(new win.Event('toggle') as unknown as Event); });
  await React.act(async () => { await new Promise(resolve => setTimeout(resolve, 20)); });
  assert.match(text('[data-gap="candidates"]'), /读取失败重试/);
  // 候选为空。
  const none = services({ [`${UROUTE}/candidates?watched=000933.SZ,600011.SH,601288.SH`]: { items: [], limit: 8 } });
  await show(none);
  const det2 = container.querySelector('[data-stage="801161.SI"] details') as HTMLDetailsElement;
  await React.act(async () => { det2.open = true; det2.dispatchEvent(new win.Event('toggle') as unknown as Event); });
  await React.act(async () => { await new Promise(resolve => setTimeout(resolve, 20)); });
  assert.match(text('[data-candidates-empty]'), /暂无推荐/);
});

test('管理：移出只移出这条链（带版本号）；撤回上一版（没有上一版不显示）；删除要确认；版本冲突重读并提示，不静默覆盖', async () => {
  const service = services();
  await show(service);
  assert.ok(container.querySelector('[data-chain-revert]'), 'has_previous 为真时有撤回');
  assert.equal(container.querySelector('[data-chain-delete]')!.textContent, '删除');
  // 移出。
  await React.act(async () => { (row('000933.SZ').querySelector('[data-remove]') as HTMLButtonElement).click(); });
  await React.act(async () => { await new Promise(resolve => setTimeout(resolve, 20)); });
  assert.deepEqual(service.writes.map((item: any) => [item.method, item.route, item.body]), [['PATCH', UROUTE, { expected_version: 3, remove_companies: ['000933.SZ'] }]]);
  // 撤回。
  service.writes.length = 0;
  await React.act(async () => { (container.querySelector('[data-chain-revert]') as HTMLButtonElement).click(); });
  await React.act(async () => { await new Promise(resolve => setTimeout(resolve, 20)); });
  assert.deepEqual(service.writes.map((item: any) => [item.method, item.route, item.body]), [['POST', `${UROUTE}/revert`, { expected_version: 3 }]]);
  // 版本冲突：Backend 返回 409，重读并提示，不静默覆盖。
  const conflict = await server.ssrLoadModule('/src/verticals/finance/lib/research.ts');
  service.writeResult.next = new conflict.ResearchError(409, 'conflict');
  const before = service.requested.filter((route: string) => route === UROUTE).length;
  await React.act(async () => { (row('000807.SZ').querySelector('[data-remove]') as HTMLButtonElement).click(); });
  await React.act(async () => { await new Promise(resolve => setTimeout(resolve, 30)); });
  assert.match(text('[data-chain-notice]'), /已更新到最新，请重试/);
  assert.ok(service.requested.filter((route: string) => route === UROUTE).length > before, '冲突后重读');
  assert.ok(container.querySelector('[data-chain]'), '重读不闪回骨架，内容仍在');
  // 其他失败：一句话。
  service.writeResult.next = new Error('500');
  await React.act(async () => { (row('000807.SZ').querySelector('[data-remove]') as HTMLButtonElement).click(); });
  await React.act(async () => { await new Promise(resolve => setTimeout(resolve, 30)); });
  assert.match(text('[data-chain-notice]'), /没成功/);
  // 没有上一版：不显示撤回。
  await show(services({ [UROUTE]: userRaw(contract.chain, { has_previous: false }) }));
  assert.equal(container.querySelector('[data-chain-revert]'), null);
});

test('删除：确认后带版本号删除并回到关注页产业链分段；取消不删', async () => {
  const service = services();
  let at = '';
  const Where = () => { at = router.useLocation().pathname + router.useLocation().search; return null; };
  await React.act(async () => root.render(null));
  await React.act(async () => root.render(h(router.MemoryRouter, { initialEntries: [`/chains/${UID}`] }, h(Where), h(pageContext.AiPageProvider, {}, h(sessionModule.ResearchSessionContext.Provider, { value: sessions }, h(pageModule.ChainPage, { chainId: UID, services: service }))))));
  await React.act(async () => { await new Promise(resolve => setTimeout(resolve, 30)); });
  const click = async (button: Element | null) => { await React.act(async () => { (button as HTMLButtonElement).click(); }); await React.act(async () => { await new Promise(resolve => setTimeout(resolve, 30)); }); };
  await click(container.querySelector('[data-chain-delete]'));
  const dialog = () => win.document.body.querySelector('[role="dialog"], [role="alertdialog"]') as HTMLElement | null;
  assert.match(dialog()?.textContent ?? '', /关注和研究会保留/);
  const buttons = () => [...dialog()!.querySelectorAll('button')];
  await click(buttons().find(button => /取消/.test(button.textContent!))!);
  assert.equal(service.writes.length, 0, '取消不删');
  await click(container.querySelector('[data-chain-delete]'));
  await click(buttons().find(button => /确认删除/.test(button.textContent!))!);
  assert.deepEqual(service.writes.map((item: any) => [item.method, item.route]), [['DELETE', `${UROUTE}?expected_version=3`]]);
  assert.equal(at, '/watch?kind=chains');
});

// ---------------------------------------------------------------- 试算：沪铝变一下，链上各家利润怎么动

test('试算纯函数：沪铝拖到 25,465 元/吨，神火股份利润 +19.92 亿元（系数 996,000 元/吨 × 2,000）；默认现价时全是 0；范围取模型区间；未研究与缺模型各写各的', async () => {
  const view = await lib.loadChainView(UID, services());
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
  assert.notEqual(lib.calcSetup([noVar])?.id, 'cmdty:SHFE.AL', '没有沪铝时改用其余价格变量');
  assert.equal(lib.calcSetup(view.companies.filter((item: any) => item.status === 'none')), null);
  // 基数利润非正：不给占比。
  const loss = structuredClone(view.companies.find((item: any) => item.symbol === '000933.SZ'));
  loss.model.baseProfit = -1;
  assert.equal(lib.calcRows([loss], setup, 25000)[0].share, null);
});

test('试算页：滑块默认现价，每家一行；拖到 25,465 神火股份 +19.92 亿元、占对比期利润 20.8%；未研究写“未研究”', async () => {
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
  assert.equal(calc('600863.SH').textContent!.includes('无利润模型'), true);
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

const cycleServices = (daily: unknown = futures, overrides: Record<string, unknown> = {}) => services({
  [lib.cycleRoute(aluminumMetric())]: daily,
  '/industries/profiles/current?industry_code=801055.SI': profiles['801055.SI'],
  '/industries/profiles/current?industry_code=801161.SI': profiles['801161.SI'],
  ...overrides,
});

test('周期位置纯函数：真实日线（Stock 接口实取 2026-10-20）806 个共同交易日，现价差 17,884 元/吨处在 79% 分位 → 高位；氧化铝 2023 年 6 月才有日线，写明只有 3.3 年', () => {
  const cycle = lib.cyclePosition(futures, aluminumMetric());
  assert.equal(cycle.state, 'ok');
  const p = cycle.position;
  assert.deepEqual([p.days, p.from, p.asOf, p.percentile, p.zone], [806, '2023-06-19', '2026-10-19', 79, '高位']);
  assert.ok(Math.abs(p.spread - 17884.45) < 1e-6 && Math.abs(p.low - 9970.79) < 1e-6 && Math.abs(p.high - 20265.74) < 1e-6);
  assert.match(p.short, /共同可得历史不足 10 年，只能按 3\.3 年算/);
  assert.equal(lib.cycleSentence(p, aluminumMetric()), '价差处在近 3.3 年的 79% 分位，在高位区间（约）');
  assert.deepEqual([0, 24, 25, 50, 75, 76, 100].map(lib.cycleZone), ['底部', '底部', '中位', '中位', '中位', '高位', '高位']);
});

test('周期位置纯函数：整十年写“近 10 年”不加说明；现值等于历史最低是 0% 分位；日线缺一条、样本不足、坏数字都写缺口，不估', () => {
  const day = (i: number) => new Date(Date.UTC(2016, 9, 20) + i * 86400000).toISOString().slice(0, 10);
  const mk = (n: number, al: (i: number) => number, ao = (_i: number) => 1000) => ({ series: [
    { id: 'cmdty:SHFE.AL', points: Array.from({ length: n }, (_, i) => [day(i), String(al(i))]) },
    { id: 'cmdty:SHFE.AO', first_day: day(0), points: Array.from({ length: n }, (_, i) => [day(i), String(ao(i))]) }] });
  const ten = lib.cyclePosition(mk(3651, i => 20000 - i), aluminumMetric()).position;
  assert.equal(ten.short, '');
  assert.equal(ten.percentile, 0, '现值是历史最低：0%（只有它自己，算半格也不到 1%）');
  assert.equal(lib.cycleSentence(ten, aluminumMetric()), '价差处在近 10 年的 0% 分位，在底部区间（约）');
  assert.equal(lib.cyclePosition(mk(3651, i => 10000 + i), aluminumMetric()).position.percentile, 100);
  assert.deepEqual(lib.cyclePosition({ series: [mk(300, () => 1).series[0]] }, aluminumMetric()), { state: 'gap', reason: 'cmdty:SHFE.AO日线取不到' });
  assert.deepEqual(lib.cyclePosition(null, aluminumMetric()), { state: 'gap', reason: 'cmdty:SHFE.AL日线取不到' });
  assert.match(lib.cyclePosition(mk(100, () => 20000), aluminumMetric()).reason, /只有 100 天，不够算分位/);
  const bad = mk(400, () => 20000); bad.series[0]!.points[5] = [day(5), 'oops'];
  assert.equal(lib.cyclePosition(bad, aluminumMetric()).position.days, 399, '坏数字那天跳过，不当 0');
});

test('周期位置页：一句话加底部—中位—高位刻度，现价差点在 79%；说明里写价差公式、期间与不含电价吨成本；只此一个橙点之外不新增橙色', async () => {
  const service = cycleServices();
  await show(service);
  const panel = container.querySelector('[data-chain-section="cycle"]') as HTMLElement;
  assert.ok(panel);
  assert.equal(text('[data-cycle-line]'), '价差处在近 3.3 年的 79% 分位，在高位区间（约）');
  assert.equal((container.querySelector('[data-cycle-dot]') as HTMLElement).style.left, '79%');
  assert.deepEqual([...panel.querySelectorAll('.chain-cycle-scale > span')].map(item => item.textContent), ['底部', '中位', '高位']);
  assert.match(text('[data-cycle-note]'), /1\.93.*现在 17,884\.45.*2023-06-19 至 2026-10-19.*806 个交易日.*未扣除其余成本/);
  assert.ok(service.requested.includes(lib.cycleRoute(aluminumMetric())));
  assert.match(lib.cycleRoute(aluminumMetric()), /^\/market\/futures-daily\?ids=cmdty%3ASHFE\.AL,cmdty%3ASHFE\.AO&years=10$/);
  // 周期位置排在共同驱动之后、试算之前。
  const order = [...container.querySelectorAll('[data-chain-section]')].map(item => item.getAttribute('data-chain-section'));
  assert.deepEqual(order, ['cycle', 'nodes', 'drivers', 'companies', 'calc']);
  assert.doesNotMatch(panel.textContent!, /买入|卖出|建议|undefined|NaN|null/);
});

test('周期位置页：日线读不到只那一节写缺口加重试，其余照常；重试后补上；链上没有铝价与氧化铝驱动就没有这一节', async () => {
  let fail = true;
  const base = cycleServices();
  const service = { ...base, read: async (route: string, signal?: AbortSignal) => { if (route === lib.cycleRoute(aluminumMetric()) && fail) throw new Error('502'); return base.read(route, signal); } };
  await show(service);
  assert.match(text('[data-gap="cycle"]'), /日线暂时读取不到。重试/);
  assert.ok(container.querySelector('[data-chain-section="companies"]') && container.querySelector('[data-chain-section="calc"]'));
  fail = false;
  await React.act(async () => { (container.querySelector('[data-gap="cycle"] button') as HTMLElement).click(); });
  await React.act(async () => { await new Promise(resolve => setTimeout(resolve, 20)); });
  assert.match(text('[data-cycle-line]'), /79% 分位/);
  // 部分合约失败：Stock 的 failed 里有氧化铝，series 只有沪铝。
  await show(cycleServices({ series: [futures.series[0]], failed: [{ id: 'cmdty:SHFE.AO', message: 'x' }] }));
  assert.equal(text('[data-gap="cycle"]').startsWith('cmdty:SHFE.AO日线取不到'), true);
  const noDrivers = structuredClone(contract.chain); noDrivers.transmission = noDrivers.transmission.filter((item: any) => item.driver !== '氧化铝');
  await show(cycleServices(futures, { [UROUTE]: userRaw(noDrivers) }));
  assert.match(text('[data-cycle-line]'), /79% 分位/, '画像周期不再依赖驱动名');
});

test('水泥、电力缺序列；成长型与缺失画像；出处使用固定版本原文，检索标约，公司带环节位置', async () => {
  const chain = structuredClone(contract.chain);
  chain.nodes = [
    { industry_code: '801711.SI', industry_name: '水泥', companies: [] },
    { industry_code: '801161.SI', industry_name: '电力', companies: [] },
    { industry_code: '801081.SI', industry_name: '半导体', companies: ['000933.SZ'] },
    { industry_code: 'missing', industry_name: '未知行业', companies: [] },
  ];
  const service = services({ [UROUTE]: userRaw(chain), ...Object.fromEntries(Object.entries(profiles).map(([code, value]) => [`/industries/profiles/current?industry_code=${code}`, value])), '/industries/profiles/current?industry_code=missing': {} });
  await show(service);
  assert.match(text('[data-cycle-stage="801711.SI"]'), /没有序列，看 数字水泥网/);
  assert.match(text('[data-cycle-stage="801161.SI"]'), /没有序列，看 公司发电量/);
  assert.match(text('[data-cycle-stage="801081.SI"]'), /景气阶段：.*瓶颈在：/);
  assert.match(text('[data-cycle-stage="missing"]'), /这个行业的周期资料还没整理/);
  assert.match(row('000933.SZ').textContent!, /瓶颈环节/);
  assert.ok(container.querySelector('a[href^="/my-reports/read/"][href*="revision="][href*="hash="][href*="block="]'));
  assert.match(text('[data-cycle-stage="801711.SI"]'), /（约）/);
  assert.equal(container.querySelector('[data-profit-concentration]'), null, '没有利润数据不作利润集中判断');
});

test('画像价差缺失时改用已登记单指标；季节性不把历史年份外推；历史只选最近明确顶底', async () => {
  const knowledge = structuredClone(profiles['801055.SI'].cycle);
  knowledge.margin_logic = [];
  const metric = lib.cycleMetric(knowledge);
  assert.equal(metric.a, 'cmdty:SHFE.AL');
  assert.equal(metric.margin, false);
  const single = lib.cyclePosition(futures, metric);
  assert.equal(single.state, 'ok');
  const points = futures.series.find((item: any) => item.id === metric.a).points;
  const now = Number(points.at(-1)[1]);
  const expected = Math.round(points.reduce((sum: number, item: any) => sum + (Number(item[1]) < now ? 1 : Number(item[1]) === now ? .5 : 0), 0) / points.length * 100);
  assert.equal(single.position.percentile, expected);
  assert.match(lib.seasonalityLine(profiles['801711.SI'].cycle.seasonality[0], 10), /10 月，旺季/);
  assert.match(lib.seasonalityLine(profiles['801711.SI'].cycle.seasonality[0], 1), /1 月，淡季/);
  assert.match(lib.seasonalityLine(profiles['801161.SI'].cycle.seasonality[0], 3), /3 月，枯水期/);
  for (const month of [1, 2, 3, 4, 12]) assert.match(lib.seasonalityLine(profiles['801161.SI'].cycle.seasonality[0], month), new RegExp(`${month} 月，枯水期`));
  for (const month of [5, 11]) assert.match(lib.seasonalityLine(profiles['801161.SI'].cycle.seasonality[0], month), new RegExp(`${month} 月，平水期`));
  for (const month of [6, 7, 8, 9, 10]) assert.match(lib.seasonalityLine(profiles['801161.SI'].cycle.seasonality[0], month), new RegExp(`${month} 月，丰水期`));
  assert.match(lib.seasonalityLine(profiles['801055.SI'].cycle.seasonality[0], 10), /未给统一旺淡季月历/);
  assert.equal(lib.nearestTurningPoint(knowledge, new Date('2026-10-29')).item.year, '2021');
  assert.equal(lib.nearestTurningPoint(profiles['801161.SI'].cycle, new Date('2026-10-29')).item.year, '2021', '修复描述提及往年底部，不把修复年当成新顶底');
});

test('分位出处对应本次实际日线：两序列、截止日收盘、口径、来源时间及下载均保留原输入，不重新取价', async () => {
  const service = cycleServices();
  await show(service);
  const sources = container.querySelector('[data-cycle-inputs]')!;
  assert.match(sources.textContent!, /2023-06-19 至 2026-10-19，806 个共同交易日/);
  assert.match(sources.textContent!, /sina.domestic.*AO0/);
  for (const series of futures.series) {
    const source = sources.querySelector(`[data-cycle-source="${series.id}"]`)!;
    assert.ok(source.textContent!.includes(series.points.find(([day]: string[]) => day === '2026-10-19')[1]));
    assert.ok(source.textContent!.includes(series.basis));
    assert.ok(source.textContent!.includes(series.source.fetched_at));
    assert.equal(source.querySelector('a')!.getAttribute('href'), series.source.urls[0]);
    assert.equal(source.querySelector('a')!.textContent, '行情提供方接口', '提供方裸接口不声称能直接回放具体合约');
  }
  const csv = decodeURIComponent(sources.querySelector('[data-cycle-download]')!.getAttribute('href')!.split(',').slice(1).join(','));
  for (const series of futures.series) for (const [day, close] of series.points) assert.ok(csv.includes(`"${series.id}","${series.name}","${day}","${close}"`));
  assert.equal(service.requested.filter((route: string) => route.startsWith('/market/futures-daily')).length, 1);
});

test('利润集中：缺一环指标、省略；同日可比且分位唯一最高时才输出；单价格、日期不同或并列均省略', () => {
  const chain = { nodes: [{ industry_code: 'a', industry_name: '上游' }, { industry_code: 'b', industry_name: '下游' }] };
  const stage = (percentile: number, extra = {}) => ({ metric: { margin: true }, cycle: { state: 'ok', position: { percentile, asOf: '2026-10-19' } }, ...extra });
  assert.equal(lib.profitConcentration(chain, { a: stage(80) }), '');
  assert.match(lib.profitConcentration(chain, { a: stage(80), b: stage(20) }), /利润现在集中在上游环节/);
  assert.equal(lib.profitConcentration(chain, { a: stage(80), b: stage(20, { metric: { margin: false } }) }), '');
  assert.equal(lib.profitConcentration(chain, { a: stage(80), b: stage(80) }), '');
  assert.equal(lib.profitConcentration(chain, { a: stage(80), b: stage(20, { cycle: { state: 'ok', position: { percentile: 20, asOf: '2026-10-18' } } }) }), '');
});

test('试算变量按使用公司数选价格；并列保留原序；百分比、产量不参与', () => {
  const variable = (id: string, unit = '元/吨') => ({ id, name: id, unit, current: 10, min: 1, max: 20, step: 1 });
  const company = (variables: any[]) => ({ model: { variables } });
  const a = variable('price:a'), b = variable('price:b'), percentage = variable('pct', '%'), volume = variable('volume', '万吨');
  assert.equal(lib.calcSetup([company([a, b]), company([b])]).id, 'price:b');
  assert.equal(lib.calcSetup([company([a, b])]).id, 'price:a');
  assert.equal(lib.calcSetup([company([percentage, volume])]), null);
});
