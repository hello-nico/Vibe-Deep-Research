// 动态与跟踪改读模板驱动：农行（bank_pb）、长江电力（infra_yield）、神火（commodity_pe）三家；框架回包用 Stock 主目录 ValuationTemplates 的真实输出。
import assert from 'node:assert/strict';
import test, { before, after } from 'node:test';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { createServer as createHttpServer } from 'node:http';
import { createServer } from 'vite';
import * as React from 'react';
import { Window } from 'happy-dom';
import { companyPageFixture, fixtureData } from './fixtures/company_page.ts';

const frameworks = JSON.parse(readFileSync(new URL('./fixtures/frameworks_real.json', import.meta.url), 'utf8'));
const real = JSON.parse(readFileSync(new URL('./fixtures/t73_real.json', import.meta.url), 'utf8'));
const trackingFixture = JSON.parse(readFileSync(new URL('./fixtures/tracking_variables.json', import.meta.url), 'utf8'));
const realBank = JSON.parse(readFileSync(new URL('./fixtures/t72b_real.json', import.meta.url), 'utf8')).packets['601288'];
const BANK = '801782.SI', POWER = '801161.SI', METAL = '801055.SI';

let server: Awaited<ReturnType<typeof createServer>>, win: Window, root: ReturnType<typeof import('react-dom/client')['createRoot']>, container: HTMLElement;
let lib: Record<string, any>, narrative: Record<string, any>, feedFactor: Record<string, any>, companyModule: Record<string, any>, tracking: Record<string, any>, router: Record<string, any>, pageContext: Record<string, any>, sessionModule: Record<string, any>;
const previous = { window: globalThis.window, document: globalThis.document, fetch: globalThis.fetch, sessionStorage: globalThis.sessionStorage, IS_REACT_ACT_ENVIRONMENT: globalThis.IS_REACT_ACT_ENVIRONMENT };
before(async () => {
  win = new Window();
  Object.assign(globalThis, { window: win, document: win.document, sessionStorage: win.sessionStorage, requestAnimationFrame: win.requestAnimationFrame.bind(win), cancelAnimationFrame: win.cancelAnimationFrame.bind(win), IS_REACT_ACT_ENVIRONMENT: true });
  server = await createServer({ configFile: false, root: fileURLToPath(new URL('../', import.meta.url)),
    resolve: { alias: { '@': fileURLToPath(new URL('../src/verticals/finance', import.meta.url)) } },
    server: { middlewareMode: true, hmr: { server: createHttpServer() }, watch: null }, appType: 'custom',
    ssr: { noExternal: ['react-router-dom', 'react-router'], resolve: { conditions: ['module-sync', 'node', 'import', 'development'] } } });
  lib = await server.ssrLoadModule('/src/verticals/finance/lib/templateDrivers.ts');
  narrative = await server.ssrLoadModule('/src/verticals/finance/lib/companyNarrative.ts');
  feedFactor = await server.ssrLoadModule('/src/verticals/finance/lib/feedFactor.ts');
  companyModule = await server.ssrLoadModule('/src/verticals/finance/pages/CompanyPage.tsx');
  tracking = await server.ssrLoadModule('/src/verticals/finance/pages/Tracking.tsx');
  sessionModule = await server.ssrLoadModule('/src/verticals/finance/dsh/research-session.tsx');
  router = await server.ssrLoadModule('react-router-dom');
  pageContext = await server.ssrLoadModule('/src/core/ai/pageContext.tsx');
  container = win.document.createElement('div') as unknown as HTMLElement;
  win.document.body.append(container);
  root = (await import('react-dom/client')).createRoot(container);
});
after(async () => { await React.act(async () => root?.unmount()); await server?.close(); win?.happyDOM.abort(); Object.assign(globalThis, previous); });

const set = (code: string) => lib.driverSetOf(frameworks[code]);

test('驱动名：去括号注释，按 / 与 及 × 拆开，结果指标（营业收入、净利润、毛利率、PB、PE、ROE…）不算驱动', () => {
  const t = lib.driverTokens;
  assert.deepEqual(t('净息差与净利息收入'), ['净息差', '净利息收入']);
  assert.deepEqual(t('不良率/分项不良/拨备覆盖率'), ['不良率', '分项不良', '拨备覆盖率']);
  assert.deepEqual(t('装机容量 / 权益装机（水电/火电/新能源分类）'), ['装机容量', '权益装机']);
  assert.deepEqual(t('度电成本 / 毛利率 / 吨煤毛利'), ['度电成本', '吨煤毛利'], '拆开后只去掉结果那一项，成本驱动留着');
  assert.deepEqual(t('目标价：紫光/2025-2027/2.0%/行业规模'), ['行业规模'], '年份区间、百分数、目标价不是驱动');
  for (const result of ['营业收入/归母净利润', 'PB与DDM假设', 'PE / EPS 预测', 'ROE / 市净率', '毛利率/净利率', '现金分红/股息率']) assert.deepEqual(t(result), [], result);
});

test('三家真实框架：农行只留息差与资产质量，电力留量价成本，神火留产量与价格；没有逐条说明时只写模板级影响，不带数字', () => {
  const bank = set(BANK), power = set(POWER), metal = set(METAL);
  assert.deepEqual(bank.drivers.map((item: any) => item.name), ['净息差', '不良率']);
  assert.equal(bank.templateId, 'bank_pb');
  assert.deepEqual(power.drivers.map((item: any) => item.name).slice(0, 5), ['装机容量', '发电量', '利用小时', '上网电价', '度电成本']);
  assert.ok(power.drivers.every((item: any) => !/营业收入|净利润/.test(item.name)));
  assert.deepEqual(metal.drivers.map((item: any) => item.name), ['金属产量', '金属价格']);
  assert.match(bank.drivers[0].question, /净息差/, '核心问题里点名该驱动的那条放进悬停');
  assert.equal(lib.driverSetOf(null), null);
  assert.equal(lib.driverSetOf({ template: { id: 'bank_pb' }, drivers: [{ name: 'PB与DDM假设' }] }), null, '只剩结果指标就当没有');
  assert.equal(lib.impactOf('bank_pb'), '利润和净资产，进而影响市净率');
  assert.equal(lib.impactOf('unknown_template'), '利润，进而影响估值');
});

test('动态：标题碰到行业驱动写“碰到X：影响…”；价格变量的一句优先；没命中不写', () => {
  const bank = set(BANK), power = set(POWER);
  assert.equal(lib.driverNote(bank, '农业银行：上半年净息差降至1.28%，净利息收入同比下降'), '碰到净息差：影响利润和净资产，进而影响市净率');
  assert.equal(lib.driverNote(bank, '多家银行披露三季度不良率下降'), '碰到不良率：影响利润和净资产，进而影响市净率');
  assert.equal(lib.driverNote(bank, '农业银行 NIM 企稳'), '碰到净息差：影响利润和净资产，进而影响市净率', '常见的另一种说法');
  assert.equal(lib.driverNote(power, '长江电力：三季度发电量同比增长5%'), '碰到发电量：影响电量、价格和现金回报，进而影响收益率');
  assert.equal(lib.driverNote(power, '长江电力：市场化交易电价上调'), '碰到上网电价：影响电量、价格和现金回报，进而影响收益率', '电价的常见说法命中“上网电价”那一项');
  assert.equal(lib.driverNote(bank, '农业银行召开股东大会'), '');
  assert.equal(lib.driverNote(null, '净息差'), '');
  assert.equal(lib.driverNote(bank, ''), '');
  // 价格变量先：神火标题同时碰到沪铝，用 factorNote 的原句。
  const model = narrative.parseSensitivity(real.shenhuo.sensitivityResult);
  const title = '沪铝大涨，神火股份发电量也增加';
  const factor = feedFactor.factorNote(model, title);
  assert.match(factor, /^碰到沪铝：每 \+1,000 元\/吨，净利润 \+9\.96 亿元$/);
  assert.equal(factor || lib.driverNote(set(METAL), title), factor);
});

test('接下来盯什么：无价格模型时数据包里有数的驱动先列，不够再补行业驱动（最多三个），最后是下一次报告；有价格模型的不变', () => {
  const at = new Date('2026-10-20T04:00:00Z');
  const bankPacket = structuredClone(realBank);
  bankPacket.fields.revenue = { ...bankPacket.fields.revenue, period: 'FY2025' };
  const items = narrative.watchItems({ packet: bankPacket, now: at, drivers: set(BANK) });
  assert.deepEqual(items.map((item: any) => item.title), ['净息差', '不良率', '下一次报告'], '净息差已有数值，框架里的净息差不重复');
  assert.equal(items[0].value, '1.28%');
  assert.deepEqual([items[1].value, items[1].sub], ['', ''], '没有数值只写名字与影响什么');
  assert.equal(items[1].note, '影响利润和净资产，进而影响市净率');
  assert.equal(items[1].hint, undefined, '核心问题里没有点名不良率的，不放悬停');
  // 电力：数据包里的驱动全是缺口，取框架前三项。
  const huaneng = structuredClone(real.huaneng.packet);
  const power = narrative.watchItems({ packet: huaneng, now: at, drivers: set(POWER) });
  assert.deepEqual(power.map((item: any) => item.title), ['装机容量', '发电量', '利用小时', '下一次报告']);
  assert.ok(power.slice(0, 3).every((item: any) => item.note === '影响电量、价格和现金回报，进而影响收益率'));
  // 神火有价格模型：只列价格变量与下一次报告，框架驱动不出现。
  const model = narrative.parseSensitivity(real.shenhuo.sensitivityResult);
  const shenhuo = narrative.watchItems({ model, packet: huaneng, now: at, drivers: set(METAL) });
  assert.deepEqual(shenhuo.map((item: any) => item.title), ['沪铝', '氧化铝', '煤炭售价', '下一次报告']);
  // 没有框架：与以前一样。
  assert.deepEqual(narrative.watchItems({ packet: huaneng, now: at }).map((item: any) => item.title), ['下一次报告']);
});

const h = React.createElement;
async function openCompany(symbol: string, packet: any, fetchImpl: typeof fetch) {
  globalThis.fetch = fetchImpl;
  const fixture = companyPageFixture({ research: { companyType: 'bank', thesis: '息差决定利润。', researchedAt: '2026-10-12T00:00:00Z' } as any, new_material: null, basisVersion: 'v' });
  fixture.services.data.packet = async () => packet;
  fixture.services.data.quote = async () => ({ ...fixtureData.quote!, price: 7.5 });
  await React.act(async () => root.render(h(router.MemoryRouter, null, h(companyModule.CompanyPage, { key: symbol + Math.random(), symbol, name: '测试', services: fixture.services }))));
  await React.act(async () => { await new Promise(resolve => setTimeout(resolve, 30)); });
}
const frameworkFetch = (known: Record<string, unknown>) => (async (url: string) => {
  const route = String(url).replace('/finance-research', '');
  const body = Object.entries(known).find(([prefix]) => route.startsWith(prefix))?.[1];
  return body ? Response.json(body) : Response.json({ detail: 'x' }, { status: 404 });
}) as typeof fetch;

test('个股页（农行）：「接下来盯什么」出现净息差等驱动，没有数值的驱动不带数字；框架读不到时只剩下一次报告', async () => {
  lib.clearDriverSets();
  const packet = structuredClone(realBank);
  packet.identity = { ...packet.identity, industry_code: BANK };
  await openCompany('601288', packet, frameworkFetch({ [`/wiki/industries/${BANK}/valuation-framework`]: frameworks[BANK] }));
  const cards = [...container.querySelectorAll('[data-watch]')];
  assert.deepEqual(cards.map(card => card.getAttribute('data-watch')).slice(-1), ['next-report']);
  const titles = cards.map(card => card.querySelector('.narrative-track-title b')!.textContent);
  assert.deepEqual(titles.slice(0, 2), ['净息差', '不良率']);
  const noNumber = cards.find(card => card.getAttribute('data-watch') === 'driver:不良率')!;
  assert.equal(noNumber.querySelector('.narrative-track-now'), null, '没有数值的驱动不画数');
  assert.equal(noNumber.querySelector('.narrative-track-note')!.textContent, '影响利润和净资产，进而影响市净率');
  assert.doesNotMatch(container.querySelector('[data-chart="watch"]')!.textContent!, /undefined|NaN|PB|营业收入|净利润/);
  // 框架读不到：与以前一样，只剩数据包里有数的驱动和下一次报告。
  lib.clearDriverSets();
  await openCompany('601288', packet, frameworkFetch({}));
  assert.ok(!container.querySelector('[data-watch="driver:不良率"]'));
  assert.ok(container.querySelector('[data-watch="next-report"]'));
});

const STEPS = ['收集资料', '读报告', '算价格对利润的影响', '估值与判断', '保存资料', '整理结论'];
test('读取：公司页 identity 里的行业代码 → 行业框架，同一公司、同一行业只读一次；读不到返回空且不缓存失败', async () => {
  lib.clearDriverSets();
  const asked: string[] = [];
  const known: Record<string, unknown> = {
    '/wiki/pages/read?slug=companies%2F601288-sh': { spec: { blocks: [{ kind: 'identity', content: { industry_code: BANK } }] } },
    [`/wiki/industries/${BANK}/valuation-framework`]: frameworks[BANK],
  };
  const read = async (route: string) => { asked.push(route); if (!(route in known)) throw new Error('404'); return known[route]; };
  const memo = new Map(), industryMemo = new Map();
  const first = await lib.loadDriverSet('601288', read, memo, industryMemo);
  assert.deepEqual(first.drivers.map((item: any) => item.name), ['净息差', '不良率']);
  await lib.loadDriverSet('601288', read, memo, industryMemo);
  assert.equal(asked.length, 2, '第二次读走缓存');
  assert.equal(await lib.loadDriverSet('000000', read, memo, industryMemo), null, '没有公司页');
  assert.equal(await lib.loadDriverSet('abc', read, memo, industryMemo), null, '不是 A 股代码');
  assert.equal(await lib.loadDriverSetByIndustry('', read, industryMemo), null);
  delete known[`/wiki/industries/${BANK}/valuation-framework`];
  const retry = new Map(), retryIndustry = new Map();
  assert.equal(await lib.loadDriverSet('601288', read, retry, retryIndustry), null);
  known[`/wiki/industries/${BANK}/valuation-framework`] = frameworks[BANK];
  assert.ok(await lib.loadDriverSet('601288', read, retry, retryIndustry), '失败没有被缓存，下次可重试');
});
