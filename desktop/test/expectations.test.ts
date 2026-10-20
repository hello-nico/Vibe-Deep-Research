// 个股页估值节的三方预期对比：机构（研报一致预期）、模型（三档与档位）、股价隐含；三方都有、机构缺失、隐含价越界。
import assert from 'node:assert/strict';
import test, { before, after } from 'node:test';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { createServer as createHttpServer } from 'node:http';
import { createServer } from 'vite';
import * as React from 'react';
import { Window } from 'happy-dom';
import { companyPageFixture, fixtureData, fixtureResearch, fixturePacket } from './fixtures/company_page.ts';

const real = JSON.parse(readFileSync(new URL('./fixtures/t73_real.json', import.meta.url), 'utf8'));
const shenhuo = real.shenhuo;
const SENS = shenhuo.sensitivityResult.result_id as string, SCEN = shenhuo.scenarioResult.result_id as string;

let server: Awaited<ReturnType<typeof createServer>>, win: Window, root: ReturnType<typeof import('react-dom/client')['createRoot']>, container: HTMLElement;
let narrative: Record<string, any>, packetLib: Record<string, any>, ui: Record<string, any>, router: Record<string, any>;
const previous = { window: globalThis.window, document: globalThis.document, fetch: globalThis.fetch, sessionStorage: globalThis.sessionStorage, IS_REACT_ACT_ENVIRONMENT: globalThis.IS_REACT_ACT_ENVIRONMENT };
before(async () => {
  win = new Window();
  Object.assign(globalThis, { window: win, document: win.document, sessionStorage: win.sessionStorage, requestAnimationFrame: win.requestAnimationFrame.bind(win), cancelAnimationFrame: win.cancelAnimationFrame.bind(win), IS_REACT_ACT_ENVIRONMENT: true });
  server = await createServer({ configFile: false, root: fileURLToPath(new URL('../', import.meta.url)),
    resolve: { alias: { '@': fileURLToPath(new URL('../src/verticals/finance', import.meta.url)) } },
    server: { middlewareMode: true, hmr: { server: createHttpServer() }, watch: null }, appType: 'custom',
    ssr: { noExternal: ['react-router-dom', 'react-router'], resolve: { conditions: ['module-sync', 'node', 'import', 'development'] } } });
  narrative = await server.ssrLoadModule('/src/verticals/finance/lib/companyNarrative.ts');
  packetLib = await server.ssrLoadModule('/src/verticals/finance/lib/companyPacket.ts');
  ui = await server.ssrLoadModule('/src/verticals/finance/pages/CompanyPage.tsx');
  router = await server.ssrLoadModule('react-router-dom');
  container = win.document.createElement('div') as unknown as HTMLElement;
  win.document.body.append(container);
  root = (await import('react-dom/client')).createRoot(container);
});
after(async () => { await React.act(async () => root?.unmount()); await server?.close(); win?.happyDOM.abort(); Object.assign(globalThis, previous); });

const field = (value: number | null, period = 'FY2026E', count = 4) => ({ field_id: 'eps_forecast', metric: 'eps_forecast', value: value == null ? null : String(value), unit: '元/股', period, status: value == null ? 'gap' : 'sourced', institution_count: count });
const packetWith = (eps: ReturnType<typeof field> | null, next = 4.2) => ({ as_of: '2026-10-20', fields: { ...(eps ? { eps_forecast: eps, eps_forecast_next: { field_id: 'eps_forecast_next', metric: 'eps_forecast_next', value: String(next), unit: '元/股', period: 'FY2027E', status: 'sourced' } } : {}) } }) as any;
const scenarios = (neutralEps: number | null, multiple = 12, mode = 'per_share') => ({ mode, rows: [
  { name: '悲观', multiple: '9', price: '25.19', earnings: '2.80', period: 'FY2026E' },
  { name: '中性', multiple: String(multiple), price: '49.48', earnings: neutralEps == null ? undefined : String(neutralEps), period: 'FY2026E' },
  { name: '乐观', multiple: '14', price: '71.96', earnings: '5.14', period: 'FY2026E' }] }) as any;
const model = () => narrative.parseSensitivity(shenhuo.sensitivityResult);
const text = (row: any) => row.pieces.map((piece: any) => piece.text).join('');

test('三方都有：机构每股收益、模型中性价与档位、股价隐含各一句；分歧最大的一方比另外两方高低多少', () => {
  const m = model(), verdict = narrative.verdictLine({ grade: '偏高', model: m });
  const view = narrative.expectations({ packet: packetWith(field(4.12)), scenarios: scenarios(3.9), model: m, price: 39.3, grade: '偏高', verdict });
  assert.deepEqual(view.rows.map((row: any) => row.key), ['institution', 'model', 'market']);
  assert.equal(text(view.rows[0]), '机构预期：2026 年每股收益 4.12 元（4 家）');
  assert.equal(text(view.rows[1]), '模型：中性价 49.48 元/股，估值偏高');
  assert.equal(text(view.rows[2]), '股价隐含：市场在赌沪铝约 24,100 元/吨，现在 23,465 元/吨');
  assert.deepEqual(view.rows.map((row: any) => row.pieces.filter((piece: any) => piece.strong).length), [1, 1, 0], '前两行各一个加粗的数');
  // 同口径每股收益：机构 4.12、模型中性 3.90、股价隐含 39.3 ÷ 12 = 3.275。
  assert.equal(view.difference, '股价隐含与另外两方分歧最大：每股收益 3.28 元，比机构预期（4.12 元）低 20.5%，比模型中性（3.90 元）低 16.0%');
  assert.doesNotMatch(view.difference, /买入|卖出|建议|机会/);
  assert.equal(view.details.length, 3);
  assert.match(view.details[0], /研报一致预期（中位数），2026 年每股收益 4\.12 元，4 家机构；下一年 4\.20 元/);
  assert.match(view.details[1], /中性倍数 12\.0 倍.*利润期间 2026 年预测.*中性每股收益 3\.90 元/);
  assert.match(view.details[2], /现价 ÷ 中性倍数得每股收益 3\.28 元/);
});

test('机构少于 3 家写“样本少”；机构缺失写“暂无机构预期”不估，分歧只比剩下两方；两方也缺则不写分歧', () => {
  const m = model(), verdict = narrative.verdictLine({ grade: '合理', model: m });
  const few = narrative.expectations({ packet: packetWith(field(0.343, 'FY2026E', 1)), scenarios: scenarios(0.34), model: m, price: 4.2, grade: '合理', verdict });
  assert.equal(text(few.rows[0]), '机构预期：2026 年每股收益 0.34 元（1 家，样本少）');
  const none = narrative.expectations({ packet: packetWith(null), scenarios: scenarios(3.9), model: m, price: 39.3, grade: '合理', verdict });
  assert.equal(text(none.rows[0]), '暂无机构预期');
  assert.equal(none.difference, '模型中性每股收益 3.90 元，比股价隐含（3.28 元）高 19.1%');
  assert.match(none.details[0], /没有可用的研报一致预期/);
  const gap = narrative.expectations({ packet: packetWith(field(null)), scenarios: null, model: null, price: null, grade: null, verdict: narrative.verdictLine({ grade: null, model: null }) });
  assert.deepEqual(gap.rows.map(text), ['暂无机构预期', '模型：暂无三档价', '股价隐含：暂无市场在赌的价格']);
  assert.equal(gap.difference, '');
  assert.match(gap.details[2], /没有利润试算凭据|缺现价/);
  // 非正的每股收益（亏损）不参与比较。
  const loss = narrative.expectations({ packet: packetWith(field(-0.3)), scenarios: scenarios(3.9), model: m, price: 39.3, grade: '合理', verdict });
  assert.equal(text(loss.rows[0]), '暂无机构预期');
});

test('三方相差不到 5% 只写相差不到 5%；模型是总利润口径时按股本折成每股；机构样本口径不同年份只显示自己的年份', () => {
  const m = model(), verdict = narrative.verdictLine({ grade: '合理', model: m });
  const close = narrative.expectations({ packet: packetWith(field(4.12)), scenarios: scenarios(4.1), model: m, price: 49.2, grade: '合理', verdict });
  assert.equal(close.difference, '三方的每股收益相差不到 5%');
  // total 口径：中性利润 92.4 亿 ÷ 股本 22.49 亿 = 4.108
  const total = narrative.expectations({ packet: packetWith(field(4.12)), scenarios: scenarios(9.24e9, 12, 'total'), model: m, price: 49.2, grade: '合理', verdict });
  assert.equal(total.difference, '三方的每股收益相差不到 5%');
  assert.match(total.details[1], /中性每股收益 4\.11 元/);
  const other = narrative.expectations({ packet: packetWith(field(4.5, 'FY2027E')), scenarios: scenarios(4.1), model: m, price: 49.2, grade: '合理', verdict });
  assert.equal(text(other.rows[0]), '机构预期：2027 年每股收益 4.50 元（4 家）');
});

test('隐含价越界：照写数值并说明低于 / 高于近年区间，分歧仍用同口径每股收益', () => {
  const extra = (implied: Record<string, unknown>) => narrative.parseSensitivity({ body: { payload: { calculation: { extra: { base_profit: 1, shares: 2249004399, implied,
    variables: [{ var_id: 'cmdty:SHFE.AL', name: '沪铝', unit: '元/吨', current: 23465, coef_per_unit: 1, range: [20000, 28000], step: 10 }] } } } } });
  for (const [value, word] of [['15000', '低于'], ['31000', '高于']] as const) {
    const m = extra({ var_id: 'cmdty:SHFE.AL', value, multiple: '12', within_range: false, range: ['20000', '28000'] });
    const view = narrative.expectations({ packet: packetWith(field(4.12)), scenarios: scenarios(4.1), model: m, price: 49.2, grade: '偏低', verdict: narrative.verdictLine({ grade: '偏低', model: m }) });
    assert.equal(text(view.rows[2]), `股价隐含：按现价，市场隐含的沪铝约 ${value === '15000' ? '15,000' : '31,000'} 元/吨，${word}近年区间`);
    assert.equal(view.difference, '三方的每股收益相差不到 5%');
  }
});

const SERVICES = (packet: any, over: Record<string, any> = {}) => {
  const research = { ...fixtureResearch, valuation: { grade: '偏高', basis: ['x'], conditions: '来水转枯。', scenarioRef: SCEN }, sensitivity: { resultRef: SENS, drivers: [] }, ...over };
  const fixture = companyPageFixture({ research: research as any, stale: false, basisVersion: 'v' });
  fixture.services.data.packet = async () => packet;
  fixture.services.data.quote = async () => ({ ...fixtureData.quote!, price: 49.2 });
  fixture.services.readScenario = async () => packetLib.scenarioTable(shenhuo.scenarioResult);
  fixture.services.readResult = async ref => ref === SENS ? shenhuo.sensitivityResult : null;
  return fixture;
};
async function open(fixture: ReturnType<typeof companyPageFixture>) {
  await React.act(async () => root.render(React.createElement(router.MemoryRouter, null, React.createElement(ui.CompanyPage, { key: Math.random(), symbol: '000933', name: '神火股份', services: fixture.services }))));
  await React.act(async () => { await new Promise(resolve => setTimeout(resolve, 30)); });
}
const valuation = () => container.querySelector('[data-company-section="valuation"]') as HTMLElement;

test('个股页（神火真实凭据）：估值节区间带上方出现三行与分歧，来源与期间在“查看数据”；无研究时不出现', async () => {
  const packet = structuredClone(fixturePacket) as any;
  packet.fields.eps_forecast = field(4.12);
  packet.fields.eps_forecast_next = { ...packet.fields.eps_forecast_next, value: '4.20', period: 'FY2027E' };
  await open(SERVICES(packet));
  const lines = [...valuation().querySelectorAll('[data-expect]')].map(node => node.textContent);
  assert.deepEqual(lines, ['机构预期：2026 年每股收益 4.12 元（4 家）', '模型：中性价 49.47 元/股，估值偏高', '股价隐含：市场在赌沪铝约 24,100 元/吨，现在 23,465 元/吨']);
  assert.match(valuation().querySelector('[data-expect-diff]')!.textContent!, /^.+分歧最大：每股收益 [\d.]+ 元，比.+（[\d.]+ 元）(高|低) [\d.]+%，比.+（[\d.]+ 元）(高|低) [\d.]+%$|^三方的每股收益相差不到 5%$/);
  // 位置：三行在区间带之前。
  const order = [...valuation().querySelectorAll('[data-expectation], [data-chart="band"]')].map(node => node.hasAttribute('data-expectation') ? 'rows' : 'band');
  assert.deepEqual(order, ['rows', 'band']);
  // 第二层：来源与期间放在“查看数据”里，默认收起。
  const detail = valuation().querySelector('details.company-page-detail')!;
  assert.equal((detail as HTMLDetailsElement).open, false);
  assert.equal(detail.querySelectorAll('[data-expect-detail]').length, 3);
  // 不描边、不用橙色。
  assert.equal(valuation().querySelector('[data-expectation]')!.closest('.card-alert'), null);
  assert.doesNotMatch(readFileSync(new URL('../src/verticals/finance/pages/company-page.css', import.meta.url), 'utf8').split('\n').filter(line => line.startsWith('.narrative-expect')).join('\n'), /brand|border:|box-shadow/);
  assert.doesNotMatch(valuation().textContent!, /买入|卖出|undefined|NaN/);
  // 没有研究：不出现三行。
  const bare = companyPageFixture({ research: null, stale: false, basisVersion: 'v' });
  bare.services.data.packet = async () => packet;
  bare.services.data.quote = async () => ({ ...fixtureData.quote!, price: 49.2 });
  await open(bare);
  assert.equal(container.querySelector('[data-expectation]'), null);
});

test('个股页：机构预期缺失的公司写“暂无机构预期”，其余两行照常', async () => {
  const packet = structuredClone(fixturePacket) as any;
  delete packet.fields.eps_forecast; delete packet.fields.eps_forecast_next;
  await open(SERVICES(packet));
  const lines = [...valuation().querySelectorAll('[data-expect]')].map(node => node.textContent);
  assert.equal(lines[0], '暂无机构预期');
  assert.match(lines[1]!, /^模型：中性价 49\.47 元\/股/);
  assert.match(lines[2]!, /^股价隐含：市场在赌沪铝/);
});

// ---- 真实回包修正（云铝、华能蒙电、华友钴业的真实形状）
const shapes = JSON.parse(readFileSync(new URL('./fixtures/expect_real_shapes.json', import.meta.url), 'utf8')).cases;
const caseOf = (name: string) => {
  const { mode, scenarios: rows, eps_forecast } = shapes[name];
  const table = packetLib.scenarioTable({ payload: { calculation: { extra: { mode, scenarios: rows } } } });
  return { table, packet: { as_of: '2026-10-20', fields: { eps_forecast } } as any };
};
const verdictOf = (implied: string) => ({ implied, gap: '' }) as any;

test('X1 股价隐含行写“暂无”时，差异句也不纳入股价隐含（华能蒙电）；只剩一方不写差异句', () => {
  const { table, packet } = caseOf('mengdian');
  const view = narrative.expectations({ packet, scenarios: table, price: 4.9, grade: '合理', verdict: verdictOf('') });
  assert.equal(text(view.rows[2]), '股价隐含：暂无市场在赌的价格');
  assert.doesNotMatch(view.difference, /股价隐含|三方/);
  assert.equal(view.difference, '机构预期与模型中性的每股收益相差不到 5%');
  assert.match(view.details[2], /暂无市场在赌的价格/);
  const alone = narrative.expectations({ packet: { as_of: '2026-10-20', fields: {} } as any, scenarios: table, price: 4.9, verdict: verdictOf('') });
  assert.equal(alone.difference, '', '机构也缺：只剩模型一方，不写差异句');
  // 行有隐含价时内容不变：仍纳入。
  const withImplied = narrative.expectations({ packet, scenarios: table, price: 4.9, grade: '合理', verdict: verdictOf('市场在赌某价格约 1 元') });
  assert.match(withImplied.difference, /三方|股价隐含/);
});

test('X2 机构预测年与模型利润期间不同：差异句末尾说明口径，相同不加（华友钴业 / 华能蒙电）', () => {
  const { table, packet } = caseOf('huayou');
  const view = narrative.expectations({ packet, scenarios: table, price: 32.2, grade: '偏低', verdict: verdictOf('市场在赌沪镍约 105,441 元/吨，现在 115,240 元/吨') });
  assert.match(view.difference, /^机构预期与另外两方分歧最大：每股收益 4\.70 元，比模型中性（3\.42 元）高 37\.\d%，比股价隐含（2\.93 元）高 60\.\d%（机构为 2026 年预测，模型按近 12 个月利润，口径不同）$/);
  const same = caseOf('mengdian');
  assert.doesNotMatch(narrative.expectations({ packet: same.packet, scenarios: same.table, price: 4.9, verdict: verdictOf('') }).difference, /口径不同/);
  // 机构年份、模型期间按实际写。
  const half = structuredClone(table); half.rows.forEach((row: any) => { row.period = 'FY2025'; });
  assert.match(narrative.expectations({ packet, scenarios: half, price: 32.2, verdict: verdictOf('x') }).difference, /（机构为 2026 年预测，模型按 2025 年报利润，口径不同）$/);
});

test('X3 期间码一律中文：查看数据与期间函数不出现 TTM: 与 FY2026E', () => {
  assert.equal(packetLib.periodLabel('FY2026E'), '2026 年预测');
  assert.equal(packetLib.periodLabel('TTM:2026Q3'), '近四季（截至 2026 三季报）');
  const { table, packet } = caseOf('huayou');
  const view = narrative.expectations({ packet, scenarios: table, price: 32.2, grade: '偏低', verdict: verdictOf('x') });
  assert.match(view.details[1], /利润期间 近四季（截至 2026 半年报）/);
  assert.doesNotMatch(view.details.join('\n'), /TTM|FY20\d\dE/);
});

test('X4 云铝悲观档亏损无价：三档表仍在，该档写“亏损，不给价”，其余两档与模型行照常', async () => {
  const { table, packet } = caseOf('yunlv');
  assert.equal(table.rows.length, 3);
  assert.deepEqual(table.rows.map((row: any) => [row.name, row.price, row.gapNote]), [['悲观', '', '亏损，不给价'], ['中性', '26.786130', undefined], ['乐观', '23.529038', undefined]]);
  const view = narrative.expectations({ packet, scenarios: table, price: 23.3, grade: '偏高', verdict: verdictOf('市场在赌沪铝约 23,306 元/吨，现在 23,320 元/吨') });
  assert.equal(text(view.rows[1]), '模型：中性价 26.78 元/股，估值偏高');
  const { ScenarioTable } = await server.ssrLoadModule('/src/verticals/finance/components/ScenarioTable.tsx');
  await React.act(async () => root.render(React.createElement(ScenarioTable, { rows: table.rows, mode: table.mode })));
  const cells = [...container.querySelectorAll('tbody tr')].map(tr => [...tr.children].map(cell => cell.textContent));
  assert.equal(cells.length, 3);
  assert.equal(cells[0]![3], '亏损，不给价');
  assert.match(cells[1]![3]!, /26\.78/);
  assert.match(cells[2]![3]!, /23\.52/);
});

test('X4 个股页：云铝悲观档无价，档位行写“亏损，不给价”，区间带只画有价的两档，三档表仍在', async () => {
  const { table, packet: yunPacket } = caseOf('yunlv');
  const packet = structuredClone(fixturePacket) as any;
  packet.fields.eps_forecast = yunPacket.fields.eps_forecast;
  const fixture = SERVICES(packet);
  fixture.services.readScenario = async () => table;
  fixture.services.readResult = async () => null;
  await open(fixture);
  const tier = valuation().querySelector('[data-tier="悲观"]')!;
  assert.match(tier.textContent!, /亏损，不给价/);
  assert.deepEqual([...valuation().querySelectorAll('.narrative-band-tick em')].map(node => node.textContent), ['乐观', '中性']);
  assert.match(valuation().querySelector('[data-expect="model"]')!.textContent!, /^模型：中性价 26\.78 元\/股/);
  assert.match(valuation().querySelector('[data-scenario="table"]')!.textContent!, /亏损，不给价/);
  // 同一个三档价同页只有一种写法：模型行、档位行、区间带标签、三档表都是 26.78（截断到两位，不四舍五入）。
  assert.match(valuation().querySelector('[data-expect="model"]')!.textContent!, /26\.78 元\/股/);
  assert.match(valuation().querySelector('[data-tier="中性"]')!.textContent!, /26\.78 元\/股/);
  assert.deepEqual([...valuation().querySelectorAll('.narrative-band-tick b')].map(node => node.textContent), ['23.52', '26.78']);
  assert.match(valuation().querySelector('[data-scenario="table"] tbody tr:nth-child(2)')!.textContent!, /26\.78/);
  assert.doesNotMatch(valuation().textContent!, /26\.79|23\.53/);
});
