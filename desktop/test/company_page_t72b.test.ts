// T7.2b C 线：先显后补、中文标签、阈值种类、研报标题评级尾巴。夹具取自真实运行（.local/t72-runs/raw/rerun）。
import assert from 'node:assert/strict';
import test, { before, after } from 'node:test';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { createServer as createHttpServer } from 'node:http';
import { createServer } from 'vite';
import * as React from 'react';
import { Window } from 'happy-dom';
import { companyPageFixture, fixtureResearch } from './fixtures/company_page.ts';

const real = JSON.parse(readFileSync(new URL('./fixtures/t72b_real.json', import.meta.url), 'utf8')) as {
  packets: Record<string, any>; reportTitles: string[]; plainTitles: string[];
};

let server: Awaited<ReturnType<typeof createServer>>, win: Window, root: ReturnType<typeof import('react-dom/client')['createRoot']>;
let ui: Record<string, any>, serviceModule: Record<string, any>, packetModule: Record<string, any>, titleModule: Record<string, any>, router: Record<string, any>;
let container: HTMLElement;
const previous = { window: globalThis.window, document: globalThis.document, fetch: globalThis.fetch, sessionStorage: globalThis.sessionStorage, requestAnimationFrame: globalThis.requestAnimationFrame, cancelAnimationFrame: globalThis.cancelAnimationFrame, IS_REACT_ACT_ENVIRONMENT: globalThis.IS_REACT_ACT_ENVIRONMENT };
before(async () => {
  win = new Window();
  Object.assign(globalThis, { window: win, document: win.document, sessionStorage: win.sessionStorage, requestAnimationFrame: win.requestAnimationFrame.bind(win), cancelAnimationFrame: win.cancelAnimationFrame.bind(win), IS_REACT_ACT_ENVIRONMENT: true });
  server = await createServer({ configFile: false, root: fileURLToPath(new URL('../', import.meta.url)),
    resolve: { alias: { '@': fileURLToPath(new URL('../src/verticals/finance', import.meta.url)) } },
    server: { middlewareMode: true, hmr: { server: createHttpServer() }, watch: null }, appType: 'custom',
    ssr: { noExternal: ['react-router-dom', 'react-router'], resolve: { conditions: ['module-sync', 'node', 'import', 'development'] } } });
  ui = await server.ssrLoadModule('/src/verticals/finance/pages/CompanyPage.tsx');
  serviceModule = await server.ssrLoadModule('/src/verticals/finance/lib/companyPageServices.ts');
  packetModule = await server.ssrLoadModule('/src/verticals/finance/lib/companyPacket.ts');
  titleModule = await server.ssrLoadModule('/src/verticals/finance/lib/documentTitle.ts');
  router = await server.ssrLoadModule('react-router-dom');
  container = win.document.createElement('div') as unknown as HTMLElement;
  win.document.body.append(container);
  root = (await import('react-dom/client')).createRoot(container);
});
after(async () => { await React.act(async () => root?.unmount()); await server?.close(); win?.happyDOM.abort(); Object.assign(globalThis, previous); });

const ENGLISH_KEY = /\b[a-z]+_[a-z_]+\b|(?:^|[^A-Za-z])(?:sales|driver|lens|bank)[:_]/;

test('真实数据包里的每个指标键、驱动键和字段身份都有中文标签，不露英文键名', () => {
  const { fieldLabel, fieldIdLabel } = packetModule;
  for (const [code, packet] of Object.entries(real.packets)) {
    const keys = [...Object.keys(packet.fields), ...Object.keys(packet.industry_drivers.fields), packet.industry_drivers.calculation.metric,
      ...packet.industry_drivers.definition.metrics.map((item: { metric: string }) => item.metric)];
    for (const key of keys) {
      const label = fieldLabel(key);
      assert.doesNotMatch(label, ENGLISH_KEY, `${code} ${key} -> ${label}`);
      assert.notEqual(label, '这项数据');
    }
    const ids: string[] = [];
    const walk = (node: any) => {
      if (Array.isArray(node)) node.forEach(walk);
      else if (node && typeof node === 'object') { if (typeof node.field_id === 'string') ids.push(node.field_id); Object.values(node).forEach(walk); }
    };
    walk(packet.fields); walk(packet.lenses); walk(packet.industry_drivers);
    assert.ok(ids.length > 60);
    for (const id of ids) assert.doesNotMatch(fieldIdLabel(id), ENGLISH_KEY, `${code} ${id} -> ${fieldIdLabel(id)}`);
  }
});

test('驱动键 sales:<产品> 显示为「<产品>销量」，银行字段与镜头有固定中文名，未知键用中文泛称', () => {
  const { fieldLabel, fieldIdLabel, gapText } = packetModule;
  assert.equal(fieldLabel('sales:动力电池'), '动力电池销量');
  assert.equal(fieldLabel('driver:sales:动力电池'), '动力电池销量');
  assert.equal(fieldIdLabel('driver:sales:动力电池'), '动力电池销量');
  assert.equal(fieldLabel('product_price'), '产品单价');
  assert.equal(fieldLabel('average_earning_assets'), '生息资产平均余额');
  assert.equal(fieldLabel('net_interest_margin'), '净息差');
  assert.equal(fieldLabel('credit_cost'), '信贷成本');
  assert.equal(fieldLabel('common_equity'), '普通股归母权益');
  assert.equal(fieldLabel('ttm_profit'), '滚动归母净利润（TTM）');
  assert.equal(fieldIdLabel('lens:peer_comparison.pe'), '同业市盈率中位数');
  assert.equal(fieldIdLabel('lens:peer_comparison.roe'), '同业净资产收益率中位数');
  assert.equal(fieldIdLabel('lens:single_quarters.2026Q2.revenue'), '2026 年第二季度营业收入（单季）');
  assert.equal(fieldIdLabel('lens:cash_conversion.cash_conversion'), '现金转化率');
  assert.equal(fieldIdLabel('lens:valuation_percentile.pe'), '市盈率历史分位');
  for (const unknown of ['mystery_metric', 'foo:bar', 'driver:unknown_metric', 'lens:other.revenue', 'sales:abc', '']) {
    assert.equal(fieldLabel(unknown) === '这项数据' || ENGLISH_KEY.test(fieldLabel(unknown)), false, unknown);
  }
  assert.equal(fieldLabel('mystery_metric'), '相关指标');
  assert.equal(fieldIdLabel('lens:other.revenue'), '相关指标');
  assert.equal(gapText({ metric: 'sales:动力电池', status: 'gap', reason: 'provider failed field_id' }), '暂时取不到动力电池销量');
  assert.equal(gapText({ metric: 'mystery_metric', status: 'gap' }), '暂时取不到相关指标');
});

test('阈值：yoy_pct 显示「同比 ±x%」，level 按字段单位，缺 kind 按 level', () => {
  const { thresholdText } = packetModule;
  assert.equal(thresholdText({ kind: 'yoy_pct', value: '5', unit: '%' }), '同比 ±5.00%');
  assert.equal(thresholdText({ kind: 'yoy_pct', value: '-10', unit: '%' }), '同比 -10.00%');
  assert.equal(thresholdText({ kind: 'yoy_pct', value: '+3', unit: '%' }), '同比 +3.00%');
  assert.equal(thresholdText({ kind: 'level', value: '20', unit: '%' }), '20.00 %');
  assert.equal(thresholdText({ kind: 'level', value: '3200000000000', unit: '元' }), '32,000.00 亿元');
  assert.equal(thresholdText({ value: '0.70', unit: '倍' }), '0.70 倍');
  assert.equal(thresholdText({ value: '0', unit: '元' }), '0.00 元');
  assert.equal(thresholdText(null), '');
  assert.equal(thresholdText({ kind: 'yoy_pct', value: 'x', unit: '%' }), '');
});

test('研报标题去掉评级尾巴；没有评级的标题原样；只改显示', () => {
  const { reportTitleForDisplay } = titleModule;
  assert.deepEqual(real.reportTitles.map(reportTitleForDisplay), ['2季度出货超预期，关注盈利修复节奏及供需变化', '1季度业绩超预期，盈利维持韧性']);
  for (const title of real.plainTitles) assert.equal(reportTitleForDisplay(title), title);
  const cases: [string, string][] = [
    ['公司点评：盈利改善；首次覆盖：增持', '公司点评：盈利改善'],
    ['宁德时代深度报告：龙头优势 首次覆盖：增持', '宁德时代深度报告：龙头优势'],
    ['业绩超预期，盈利改善-维持增持', '业绩超预期，盈利改善'],
    ['业绩超预期，盈利改善（维持买入）', '业绩超预期，盈利改善'],
    ['业绩超预期，盈利改善｜给予买入评级', '业绩超预期，盈利改善'],
    ['业绩超预期_强烈推荐', '业绩超预期'],
    ['景气上行，盈利改善；上调至买入', '景气上行，盈利改善'],
    ['半年报点评：龙头优势；维持跑赢行业', '半年报点评：龙头优势'],
    ['推荐关注的三条主线，买入逻辑未变', '推荐关注的三条主线，买入逻辑未变'],
    ['中性情景下的盈利预测更新', '中性情景下的盈利预测更新'],
    ['买入评级', '买入评级'],
  ];
  for (const [input, expected] of cases) assert.equal(reportTitleForDisplay(input), expected, input);
});

test('R6 先显后补：首读数据包立即返回，ensure 在后台；每股每日一次，并发去重，完成后通知订阅者', async t => {
  t.mock.timers.enable({ apis: ['Date'], now: new Date('2026-10-12T03:00:00Z').getTime() });
  const originalFetch = globalThis.fetch;
  serviceModule.resetPacketEnsureMemory();
  const posts: string[] = [];
  let release!: () => void;
  const gate = new Promise<void>(resolve => { release = resolve; });
  let snapshots: { observed_at: string }[] = [{ observed_at: '2026-10-11T09:00:00+08:00' }];
  globalThis.fetch = async (input, init) => {
    const url = new URL(String(input), 'http://fixture');
    if (url.pathname.endsWith('/coverage/ensure')) { posts.push(url.pathname); await gate; snapshots = [{ observed_at: '2026-10-12T11:00:00+08:00' }]; return Response.json({ ok: true }); }
    return Response.json({ ...real.packets['601288'], symbol: '601288.SH', as_of: url.searchParams.get('as_of'), provider_snapshots: snapshots });
  };
  try {
    let startedWith: string | undefined;
    const services = serviceModule.createCompanyPageServices({ taskRunning: () => false, start: async (text: string) => { startedWith = text; return { sessionId: 's', status: 'started' }; } });
    let notified = 0;
    const unsubscribe = services.subscribePacket('601288', () => { notified += 1; });
    const signal = new AbortController().signal;
    // ensure 被挡住期间，包已经返回（含「旧」快照时点）。
    const [a, b] = await Promise.all([services.data.packet('601288', signal), services.data.packet('601288', signal)]);
    assert.equal(a.as_of, '2026-10-12');
    assert.equal(b.provider_snapshots[0].observed_at, '2026-10-11T09:00:00+08:00');
    await new Promise(resolve => setTimeout(resolve, 10));
    assert.equal(posts.length, 1);
    assert.equal(notified, 0);
    // 研究启动等同一个后台 ensure，不再发第二次。
    const starting = services.startResearch('601288', '农业银行', 'v1');
    await new Promise(resolve => setTimeout(resolve, 10));
    assert.equal(startedWith, undefined);
    release();
    await starting;
    assert.match(startedWith!, /农业银行/);
    assert.equal(posts.length, 1);
    assert.equal(notified, 1);
    const fresh = await services.data.packet('601288', signal);
    assert.equal(fresh.provider_snapshots[0].observed_at, '2026-10-12T11:00:00+08:00');
    await new Promise(resolve => setTimeout(resolve, 10));
    assert.equal(posts.length, 1, '当日已 ensure，再读不再发起');
    unsubscribe();
  } finally { globalThis.fetch = originalFetch; serviceModule.resetPacketEnsureMemory(); t.mock.timers.reset(); }
});

test('ensure 失败不通知也不重试；页面保留首读数据', async t => {
  t.mock.timers.enable({ apis: ['Date'], now: new Date('2026-10-12T03:00:00Z').getTime() });
  const originalFetch = globalThis.fetch;
  serviceModule.resetPacketEnsureMemory();
  let posts = 0;
  globalThis.fetch = async (input) => {
    const url = new URL(String(input), 'http://fixture');
    if (url.pathname.endsWith('/coverage/ensure')) { posts += 1; return Response.json({ detail: 'down' }, { status: 503 }); }
    return Response.json({ ...real.packets['300750'], as_of: url.searchParams.get('as_of'), provider_snapshots: [] });
  };
  try {
    const services = serviceModule.createCompanyPageServices({ taskRunning: () => false });
    let notified = 0;
    services.subscribePacket('300750', () => { notified += 1; });
    await services.data.packet('300750', new AbortController().signal);
    await new Promise(resolve => setTimeout(resolve, 20));
    await services.data.packet('300750', new AbortController().signal);
    await new Promise(resolve => setTimeout(resolve, 20));
    assert.equal(posts, 1);
    assert.equal(notified, 0);
  } finally { globalThis.fetch = originalFetch; serviceModule.resetPacketEnsureMemory(); t.mock.timers.reset(); }
});

async function mount(services: any, symbol = '300750', name = '宁德时代') {
  await React.act(async () => root.render(React.createElement(router.MemoryRouter, null,
    React.createElement(ui.CompanyPage, { key: services, symbol, name, services, onTask: () => {} }))));
}

test('页面用真实形态：驱动、银行字段、引用字段与阈值都是中文，研报标题无评级、链接不变', async () => {
  const fixture = companyPageFixture({ research: {
    ...fixtureResearch,
    pillars: [{ id: 'p1', text: '销量增长是利润支柱。', fieldIds: ['driver:sales:动力电池', 'lens:peer_comparison.pe', 'lens:single_quarters.2026Q2.revenue', 'driver:credit_cost', 'mystery_metric'] }],
    falsifiers: [
      { pillarId: 'p1', text: '同比下滑会推翻支柱。', fieldId: 'revenue', threshold: { kind: 'yoy_pct', value: '5', unit: '%' }, window: '2026-10-30 披露的三季报' },
      { pillarId: 'p1', text: '毛利率跌破阈值。', fieldId: 'gross_margin', threshold: { kind: 'level', value: '20', unit: '%' }, window: '下一份定期报告' },
    ],
  }, stale: false, basisVersion: 'real' });
  const documents = { items: [
    { document_id: '4d734ec60b5741a69046891eb4d14c2c', title: real.reportTitles[0], document_type: 'research_report' },
    { document_id: '390e0c2a31e848d49763a882df68ac06', title: real.reportTitles[1], document_type: 'research_report' },
    { document_id: 'a'.repeat(32), title: real.plainTitles[0], document_type: 'research_report' },
    { document_id: 'b'.repeat(32), title: '2026年半年度报告', reporting_period: '2026H1', document_type: 'quarterly_report' },
  ] };
  fixture.services.data.packet = async () => real.packets['300750'];
  fixture.services.data.documents = async () => documents;
  await mount(fixture.services);
  const text = container.textContent!;
  assert.match(text, /动力电池销量/);
  assert.match(text, /生息资产|动力电池销量/);
  assert.doesNotMatch(text, /sales:|driver:|lens:|mystery_metric|这项数据|bank|commodity_cycle|scarce_asset_rent|field_id/);
  const pillar = container.querySelector('[data-pillar="p1"]')!.textContent!;
  assert.match(pillar, /动力电池销量/);
  assert.match(pillar, /同业市盈率中位数/);
  assert.match(pillar, /2026 年第二季度营业收入（单季）/);
  assert.match(pillar, /暂时取不到信贷成本|信贷成本/);
  assert.match(pillar, /暂时取不到相关指标/);
  const falsifiers = [...container.querySelectorAll('[data-falsifier]')].map(item => item.textContent!);
  assert.match(falsifiers[0]!, /同比 ±5\.00% · 2026-10-30 披露的三季报/);
  assert.match(falsifiers[1]!, /20\.00 % · 下一份定期报告/);
  const links = [...container.querySelectorAll('a[href^="/my-reports/read/"]')];
  const shown = links.map(link => link.textContent!.replace('↗', '').trim());
  assert.deepEqual(shown.slice(0, 3), ['2季度出货超预期，关注盈利修复节奏及供需变化', '1季度业绩超预期，盈利维持韧性', real.plainTitles[0]]);
  assert.doesNotMatch(container.textContent!, /维持买入/);
  assert.match(links[0]!.getAttribute('href')!, /^\/my-reports\/read\/4d734ec60b5741a69046891eb4d14c2c\?from=/);
  assert.ok(shown.includes('2026年半年度报告'));
});

test('页面银行真实形态：银行驱动字段中文，缺口写「暂时取不到…」不露键名', async () => {
  const fixture = companyPageFixture({ research: { companyType: 'bank', thesis: '息差决定利润。', researchedAt: '2026-10-12T00:00:00Z' }, stale: false, basisVersion: 'bank' });
  fixture.services.data.packet = async () => real.packets['601288'];
  await mount(fixture.services, '601288', '农业银行');
  const text = container.querySelector('[data-company-section="profit_formula"]')!.textContent!;
  assert.match(text, /净息差/);
  assert.match(text, /生息资产平均余额/);
  assert.match(text, /信贷成本/);
  assert.doesNotMatch(container.textContent!, /average_earning_assets|net_interest_margin|credit_cost|bank_interest|这项数据/);
});

test('R6 页面：后台 ensure 完成后静默替换数据，不回到加载骨架', async () => {
  const early = structuredClone(real.packets['300750']);
  early.fields.revenue = { ...early.fields.revenue, value: '100000000', status: 'sourced' };
  const late = structuredClone(real.packets['300750']);
  late.fields.revenue = { ...late.fields.revenue, value: '4200000000', status: 'verified' };
  let current = early;
  const listeners = new Set<() => void>();
  const fixture = companyPageFixture({ research: null, stale: false, basisVersion: 'quiet' });
  fixture.services.data.packet = async () => current;
  fixture.services.subscribePacket = (_symbol: string, listener: () => void) => { listeners.add(listener); return () => { listeners.delete(listener); }; };
  await mount(fixture.services);
  assert.match(container.querySelector('[data-company-section="business"]')!.textContent!, /1\.00 亿元/);
  assert.equal(listeners.size, 1);
  current = late;
  let sawSkeleton = false;
  const observer = new win.MutationObserver(() => { if (container.querySelector('.company-page-skeleton')) sawSkeleton = true; });
  observer.observe(container as unknown as Node, { childList: true, subtree: true });
  await React.act(async () => { listeners.forEach(listener => listener()); await new Promise(resolve => setTimeout(resolve, 10)); });
  observer.disconnect();
  assert.match(container.querySelector('[data-company-section="business"]')!.textContent!, /42\.00 亿元/);
  assert.equal(sawSkeleton, false);
  await React.act(async () => root.render(React.createElement('div')));
  assert.equal(listeners.size, 0, '离开页面即退订');
});
