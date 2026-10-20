// 个股页显示报告期：页首「数据截至…」；与页面报告期不同期的数字就地标自己的期间；旧 Backend 没有 page_period 时保持现状。
import assert from 'node:assert/strict';
import test, { before, after } from 'node:test';
import { fileURLToPath } from 'node:url';
import { createServer as createHttpServer } from 'node:http';
import { createServer } from 'vite';
import * as React from 'react';
import { Window } from 'happy-dom';
import { companyPageFixture, fixtureData, fixtureResearch } from './fixtures/company_page.ts';

let server: Awaited<ReturnType<typeof createServer>>, win: Window, root: ReturnType<typeof import('react-dom/client')['createRoot']>, container: HTMLElement;
let ui: Record<string, any>, packetLib: Record<string, any>, router: Record<string, any>;
const previous = { window: globalThis.window, document: globalThis.document, fetch: globalThis.fetch, sessionStorage: globalThis.sessionStorage, IS_REACT_ACT_ENVIRONMENT: globalThis.IS_REACT_ACT_ENVIRONMENT };
before(async () => {
  win = new Window();
  Object.assign(globalThis, { window: win, document: win.document, sessionStorage: win.sessionStorage, requestAnimationFrame: win.requestAnimationFrame.bind(win), cancelAnimationFrame: win.cancelAnimationFrame.bind(win), IS_REACT_ACT_ENVIRONMENT: true });
  server = await createServer({ configFile: false, root: fileURLToPath(new URL('../', import.meta.url)),
    resolve: { alias: { '@': fileURLToPath(new URL('../src/verticals/finance', import.meta.url)) } },
    server: { middlewareMode: true, hmr: { server: createHttpServer() }, watch: null }, appType: 'custom',
    ssr: { noExternal: ['react-router-dom', 'react-router'], resolve: { conditions: ['module-sync', 'node', 'import', 'development'] } } });
  ui = await server.ssrLoadModule('/src/verticals/finance/pages/CompanyPage.tsx');
  packetLib = await server.ssrLoadModule('/src/verticals/finance/lib/companyPacket.ts');
  router = await server.ssrLoadModule('react-router-dom');
  container = win.document.createElement('div') as unknown as HTMLElement;
  win.document.body.append(container);
  root = (await import('react-dom/client')).createRoot(container);
});
after(async () => { await React.act(async () => root?.unmount()); await server?.close(); win?.happyDOM.abort(); Object.assign(globalThis, previous); });

const field = (id: string, value: string, unit: string, period: string) => ({ field_id: id, metric: id, value, unit, period, status: 'verified' });
/** 神火式：页面统一到三季报（流量是近四季），分部只到半年报，分红按上一年度方案；价格与市盈率是行情时点。 */
function packet(page: string | undefined, flow: string, segment: string, annual: string) {
  const fields: Record<string, any> = {
    revenue: field('revenue', '120000000000', '元', flow), gross_margin: field('gross_margin', '23.15', '%', flow), net_profit_attributable: field('net_profit_attributable', '9000000000', '元', flow),
    dividend_yield: field('dividend_yield', '4.22', '%', annual), dividend_per_share: field('dividend_per_share', '0.22', '元/股', annual),
    pe: field('pe', '19.8', '倍', '2026-10-20'), pb: field('pb', '2.1', '倍', '2026-10-20'), price: field('price', '25.5', '元/股', '2026-10-20'),
  };
  for (const [name, revenue, cost] of [['电解铝', 17051000000, 9321000000], ['煤炭', 3130000000, 2389000000]] as const) {
    fields[`segment:product:${name}.revenue`] = field(`segment:product:${name}.revenue`, String(revenue), '元', segment);
    fields[`segment:product:${name}.cost`] = field(`segment:product:${name}.cost`, String(cost), '元', segment);
  }
  return { symbol: '000933.SZ', as_of: '2026-10-20', financial_period: flow.replace('TTM:', ''), ...(page ? { page_period: page } : {}), fields } as any;
}
async function show(data: any) {
  const fixture = companyPageFixture({ research: { ...fixtureResearch, sections: { ...fixtureResearch.sections, cash: { summary: '现金流够用。' } } } as any, stale: false, basisVersion: 'v' });
  fixture.services.data.packet = async () => data;
  fixture.services.data.quote = async () => ({ ...fixtureData.quote!, price: 25.5 });
  await React.act(async () => root.render(React.createElement(router.MemoryRouter, null, React.createElement(ui.CompanyPage, { key: Math.random(), symbol: '000933', name: '神火股份', services: fixture.services }))));
  await React.act(async () => { await new Promise(resolve => setTimeout(resolve, 5)); });
}
const metric = (section: string, label: string) => [...container.querySelectorAll(`[data-company-section="${section}"] [data-key-numbers] .metric`)].find(item => item.querySelector('.metric-label > span:first-child')?.textContent === label) as HTMLElement | undefined;
const tags = (item: HTMLElement | undefined) => [...(item?.querySelectorAll('.tag, .metric-tag') ?? [])].map(tag => tag.textContent);

test('报告期写法：季报、半年报、年报；分红写“年度方案”；TTM、YTD 按同一报告期比较；日期与空值不算报告期', () => {
  const { reportPeriodText, otherPeriodText, pagePeriodText } = packetLib;
  assert.deepEqual(['2026Q3', '2026H1', 'FY2025', '2026Q1', 'TTM:2026Q3', '2026YTDQ3'].map(period => reportPeriodText(period)),
    ['2026 年三季报', '2026 年半年报', '2025 年报', '2026 年一季报', '2026 年三季报', '2026 年三季报']);
  assert.equal(reportPeriodText('FY2025', true), '2025 年度方案');
  assert.equal(reportPeriodText('2026-10-20'), '');
  const page = { page_period: '2026Q3' } as any;
  assert.equal(otherPeriodText(page, { period: 'TTM:2026Q3' }), '', '近四季截至同一报告期：同期');
  assert.equal(otherPeriodText(page, { period: '2026YTDQ3' }), '');
  assert.equal(otherPeriodText(page, { period: '2026H1' }), '2026 年半年报');
  assert.equal(otherPeriodText(page, { field_id: 'dividend_yield', period: 'FY2025' }), '2025 年度方案');
  assert.equal(otherPeriodText(page, { field_id: 'revenue', period: 'FY2025' }), '2025 年报');
  assert.equal(otherPeriodText(page, { period: '2026-10-20' }), '', '行情时点不是报告期');
  assert.equal(otherPeriodText({} as any, { period: '2026H1' }), '', '旧 Backend 没有 page_period');
  assert.equal(pagePeriodText(page), '数据截至 2026 年三季报');
  assert.equal(pagePeriodText({} as any), '');
  assert.equal(pagePeriodText({ page_period: 'junk' } as any), '');
});

test('神火式：页首“数据截至 2026 年三季报”；分部旁标 2026 年半年报，分红旁标 2025 年度方案；同期与行情时点不标', async () => {
  await show(packet('2026Q3', 'TTM:2026Q3', '2026H1', 'FY2025'));
  assert.equal(container.querySelector('[data-page-period]')!.textContent, '数据截至 2026 年三季报');
  assert.ok(container.querySelector('[data-company-section="thesis"] [data-page-period]'), '与论点、判断变化同在页首');
  const segment = [...container.querySelectorAll('[data-company-section="business"] [data-segments] .metric')];
  assert.equal(segment.length, 2);
  for (const item of segment) assert.deepEqual(tags(item as HTMLElement), ['2026 年半年报']);
  assert.deepEqual(tags(metric('cash', '股息率')), ['2025 年度方案']);
  // 估值一节的市盈率、市净率是行情时点：不标。
  assert.deepEqual(tags(metric('valuation', '市盈率（近四季）')), []);
  assert.deepEqual(tags(metric('valuation', '市净率')), []);
  assert.doesNotMatch(container.textContent!, /page_period|undefined|NaN/);
});

test('只有年报：页面、分部、分红都是年报，页首写“数据截至 2025 年报”，数字旁一个期间小字都没有', async () => {
  await show(packet('FY2025', 'FY2025', 'FY2025', 'FY2025'));
  assert.equal(container.querySelector('[data-page-period]')!.textContent, '数据截至 2025 年报');
  for (const item of container.querySelectorAll('[data-company-section="business"] [data-segments] .metric')) assert.deepEqual(tags(item as HTMLElement), []);
  assert.deepEqual(tags(metric('cash', '股息率')), [], '同为年度，不标');
});

test('旧 Backend 没有 page_period：页首不写，数字旁保持原来的写法，不报错', async () => {
  await show(packet(undefined, 'FY2025', '2026H1', 'FY2025'));
  assert.equal(container.querySelector('[data-page-period]'), null);
  const first = container.querySelector('[data-company-section="business"] [data-segments] .metric') as HTMLElement;
  assert.deepEqual(tags(first), ['2026 半年报'], '保持现状');
  assert.ok(container.querySelector('[data-company-section="business"]'));
});

const meta = (section: string) => container.querySelector(`[data-company-section="${section}"] .panel-meta`)?.textContent ?? null;

test('节标题右侧口径：与页面报告期同期不重复写，不同期才写；行情日期照写；旧 Backend 保持原写法', async () => {
  const { sectionMeta } = packetLib;
  const page = { page_period: '2026Q3' } as any;
  assert.equal(sectionMeta(page, { period: 'TTM:2026Q3' }), '');
  assert.equal(sectionMeta(page, { period: '2026H1' }), '2026 年半年报');
  assert.equal(sectionMeta(page, { field_id: 'dividend_yield', period: 'FY2025' }), '2025 年度方案');
  assert.equal(sectionMeta(page, { period: '2026-10-20' }), '10 月 20 日');
  assert.equal(sectionMeta({} as any, { period: 'FY2025' }), '2025 年报');
  assert.equal(sectionMeta(page, { period: null }), '');
  // 神火式：生意节有分部（只到半年报）→ 写 2026 年半年报；现金节第一个数是年度分红 → 2025 年度方案；估值节是行情日期。
  await show(packet('2026Q3', 'TTM:2026Q3', '2026H1', 'FY2025'));
  assert.deepEqual([meta('business'), meta('cash'), meta('valuation')], ['2026 年半年报', '2025 年度方案', '10 月 20 日']);
  // 没有分部、流量就是页面报告期：生意节不再重复。
  const noSegments = packet('2026Q3', 'TTM:2026Q3', '2026H1', 'FY2025');
  for (const key of Object.keys(noSegments.fields)) if (key.startsWith('segment:')) delete noSegments.fields[key];
  await show(noSegments);
  assert.equal(meta('business'), null);
  // 只有年报：同期都不写。
  await show(packet('FY2025', 'FY2025', 'FY2025', 'FY2025'));
  assert.deepEqual([meta('business'), meta('cash')], [null, null]);
  // 旧 Backend：保持原写法。
  await show(packet(undefined, 'FY2025', 'FY2025', 'FY2025'));
  assert.deepEqual([meta('business'), meta('cash')], ['2025 年报', '2025 年报']);
});
