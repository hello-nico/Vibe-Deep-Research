import type { Quote } from '../../src/verticals/finance/lib/api.ts';
import type { DataPacket, ScenarioRow, ScenarioTableData } from '../../src/verticals/finance/lib/companyPacket.ts';
import type { CompanyPageData, CompanyPageResearch, CompanyPageResearchRead, CompanyPageServices, CompanyPageTask } from '../../src/verticals/finance/lib/companyPage.ts';

const field = (metric: string, value: string | number | null, unit: string | null, period: string, extra: Partial<DataPacket['fields'][string]> = {}) => ({
  metric, value, unit, period, status: value == null ? 'gap' : 'verified', field_id: metric,
  source_ref: value == null ? null : `claim:fixture-${metric}`,
  ref: value == null ? null : `claim:fixture-${metric}`, ...extra,
});

export const fixtureScenario: ScenarioRow[] = [
  { name: '悲观', multiple: '17', price: '22.23', earnings: '1.20', period: '2026' },
  { name: '中性', multiple: '19', price: '26.81', earnings: '1.41', period: '2026' },
  { name: '乐观', multiple: '21', price: '31.12', earnings: '1.48', period: '2028' },
];
export const fixtureScenarioTable: ScenarioTableData = { mode: 'per_share', rows: fixtureScenario };

export const fixtureResearch: CompanyPageResearch = {
  companyType: 'leveraged_cyclical_utility', thesis: '煤价与电价的价差决定利润，现金回收仍需核对。',
  researchedAt: '2026-10-10T01:00:00Z', basisVersion: 'a'.repeat(64),
  sections: {
    business: { summary: '发电收入是主要收入来源。', fieldIds: ['revenue'] },
    profit_formula: { summary: '利润取决于售电量、电价和单位成本。', fieldIds: ['net_profit_attributable'] },
    variables: { summary: '每单位成本的变化，需要通过计算凭据核对利润影响。', details: '其他条件不变。' },
    cash: { summary: '经营现金流需要覆盖资本开支后，再观察分红。' },
    valuation: { summary: '当前倍数与盈利口径一起看。' },
    tracking: { summary: '继续观察电价与煤价。' },
  },
  pillars: [{ id: 'spread', text: '价差能维持，是利润判断的支柱。', fieldIds: ['revenue'] }],
  falsifiers: [{ pillarId: 'spread', text: '价差收窄会推翻这条支柱。', fieldId: 'revenue', threshold: { value: '3000000000', unit: '元' }, window: '下一份定期报告' }],
  catalysts: [{ date: '2026-10-30', event: '三季报预约披露' }],
  valuation: { grade: '偏高', basis: ['同业位置'], conditions: '来水转枯或利率上行，判断会改档。', scenarioRef: 'result:' + 'ab'.repeat(16) },
  changes: { thesis: '最新定期报告后更新' },
  related: [{ topicId: 'topic:123456abcdef', title: '电价与煤价传导' }],
};
export const fixturePageResearch: Omit<CompanyPageResearchRead, 'task'> = { research: fixtureResearch, stale: false, basisVersion: fixtureResearch.basisVersion };

export const fixturePacket: DataPacket = {
  symbol: '600863.SH', as_of: '2026-10-10', financial_period: 'FY2025',
  fields: {
    revenue: field('revenue', 7100000000, '元', '2026-06-30'),
    gross_margin: field('gross_margin', 32.5, '%', 'FY2025'),
    net_profit_attributable: field('net_profit_attributable', 1800000000, '元', '2026-06-30'),
    operating_cash_flow: field('operating_cash_flow', 1800000000, '元', '2026-06-30'),
    capex_cash: field('capex_cash', 400000000, '元', 'FY2025'),
    dividend_paid: field('dividend_paid', null, null, 'FY2025', { status: 'gap', reason: '暂时取不到现金分红' }),
    residual_cash: field('residual_cash', 200000000, '元', 'FY2025'),
    price: field('price', 4.28, '元/股', '2026-10-10'),
    pe: field('pe', 9.5, '倍', '2026-10-10'),
    pb: field('pb', 1.1, '倍', '2026-10-10'),
    dividend_yield: field('dividend_yield', 3.2, '%', 'FY2025'),
    eps_ttm: field('eps_ttm', 0.45, '元/股', 'TTM'),
    eps_forecast: field('eps_forecast', 0.5, '元/股', '2026', { institution_count: 2, status: 'sourced' }),
    forward_pe: field('forward_pe', 8.6, '倍', '2026'),
    peers: { metric: 'peers', status: 'sourced', value: null, items: [
      { name: '同业甲', pe: field('pe', 11, '倍', '2026-10-10') },
    ] },
  },
  industry_drivers: {
    definition: { formula: { operation: 'volume_price_cost' } },
    fields: {
      power_sales: field('power_sales', null, null, 'FY2025', { field_id: 'driver:power_sales', status: 'gap', reason: '未匹配行业驱动行与单位', source_ref: null }),
      power_price: field('power_price', 321, '元/兆瓦时', 'FY2025', { field_id: 'driver:power_price', source_ref: 'claim:fixture-power-price' }),
    },
    calculation: field('industry_formula', null, null, 'FY2025', { field_id: 'driver:industry_formula', status: 'gap', reason: '缺已登记同口径行业公式输入，不填行业平均值', source_ref: null }),
  },
  lenses: {
    ttm_profit: field('ttm_profit', 3600000000, '元', 'TTM', { field_id: 'lens:ttm_profit.ttm_profit', source_ref: ['claim:fixture-ttm'] }),
    peer_comparison: { pe: field('pe', 12.5, '倍', '2026-10-10', { field_id: 'lens:peer_comparison.pe', source_ref: 'claim:fixture-peer-pe' }) },
    single_quarters: [field('revenue', 2500000000, '元', '2026Q1', { field_id: 'lens:single_quarters.2026Q1.revenue', source_ref: 'claim:fixture-q1-revenue' })],
    valuation_percentile: { pe: { status: 'gap', reason: '五年时点序列不可交付' } },
  },
  provider_snapshots: [{ observed_at: '2026-10-10T09:00:00+08:00' }],
};
export const fixtureQuote: Quote = {
  name: '华能蒙电（夹具）', price: 4.56, change_pct: 1.2, currency: 'CNY', market: 'CN', fetched_at: '2026-10-10T09:30:00+08:00', last_close: null,
  pe_ttm: null, pb: null, mcap_yi: null, turnover_pct: null, limit_up: null, limit_down: null, float_mcap_yi: null, amount_yuan: null,
};
export const fixtureData: CompanyPageData = {
  quote: fixtureQuote,
  packet: fixturePacket,
  documents: { items: [{ document_id: 'a'.repeat(32), title: '夹具半年报', reporting_period: '2026-06-30', document_type: 'annual_report' }] },
};
export function companyPageFixture(initial: Omit<CompanyPageResearchRead, 'task'> = { research: null, stale: false, basisVersion: 'b'.repeat(64) }) {
  let response = initial;
  let projectedTask: CompanyPageTask | undefined;
  const starts: { symbol: string; name: string; version: string }[] = [];
  const task: CompanyPageTask = { sessionId: 'fixture-session', status: 'researching', stage: '核对利润变量' };
  const services: CompanyPageServices = {
    data: {
      quote: async () => fixtureData.quote,
      packet: async () => fixtureData.packet,
      documents: async () => fixtureData.documents,
    },
    readResearch: async () => ({ ...response, task: projectedTask }),
    readScenario: async () => fixtureScenarioTable,
    startResearch: async (symbol, name, version) => { starts.push({ symbol, name, version }); projectedTask = task; return task; },
  };
  return { services, starts, task, set: (value: Omit<CompanyPageResearchRead, 'task'>) => { response = value; }, setTask: (value?: CompanyPageTask) => { projectedTask = value; } };
}
