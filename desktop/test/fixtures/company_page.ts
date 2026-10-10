import type { CompanyPageData, CompanyPageResearch, CompanyPageResearchRead, CompanyPageServices, CompanyPageTask } from '../../src/verticals/finance/lib/companyPage.ts';

// Synthetic values and references, not a Huaneng financial snapshot.
export const fixtureResearch: CompanyPageResearch = {
  companyType: 'leveraged_cyclical_utility', researchedAt: '2026-10-10T01:00:00Z', basisVersion: 'a'.repeat(64),
  sections: [
    { id: 0, summary: '煤价与电价的价差决定利润，现金回收仍需核对。', change: '最新定期报告后更新', details: '判断以已披露经营口径为准。' },
    { id: 1, summary: '发电收入是主要收入来源，燃料成本影响利润传导。', components: {
      markdown: '```vibe\n<flow><step>发电售电</step><step>回收现金</step></flow>\n```',
      check: { turn: 1, blocks: [{ index: 0, ok: true, elements: [
        { path: '0', component: 'flow', status: 'ok' }, { path: '0.0', component: 'step', status: 'ok' }, { path: '0.1', component: 'step', status: 'ok' },
      ] }] },
    } },
    { id: 2, summary: '利润取决于售电量 × 单位价差，再扣除固定成本与财务费用。', details: '煤价趋势下行；原因需要核对采购结构。', components: {
      markdown: '```vibe\n<stat><item label="入炉煤价" ref="claim:fixture-coal"/></stat>\n```',
      check: { turn: 1, blocks: [{ index: 0, ok: true, elements: [
        { path: '0', component: 'stat', status: 'ok' },
        { path: '0.0', component: 'item', status: 'ok', values: { 'claim:fixture-coal': { value: 550, unit: '元/吨', period: '夹具报告期', source_title: '测试夹具' } } },
      ] }] },
    } },
    { id: 3, summary: '每单位成本的变化，需要通过计算凭据核对利润影响。', details: '其他条件不变；不在前端进行敏感性计算。', refs: ['evidence:fixture-calculation'] },
    { id: 4, summary: '经营现金流需要覆盖资本开支后，再观察分红。' },
    { id: 5, summary: '当前倍数与盈利口径一起看，历史分位缺失。' },
    { id: 6, summary: '继续观察电价与煤价；价差收窄是证伪条件。' },
  ],
  related: [{ topicId: 'topic:123456abcdef', title: '电价与煤价传导' }],
};
// Backend response has no task; the fixture projects DSH task state separately.
export const fixturePageResearch: Omit<CompanyPageResearchRead, 'task'> = { research: fixtureResearch, stale: false, basisVersion: fixtureResearch.basisVersion };
export const fixtureFacts = {
  symbol: '600863.SH', identity: { symbol: '600863.SH', name: '华能蒙电（夹具）', entity_id: null, industry_code: null, industry_name: null },
  as_of: '2026-10-10', known_at: '2026-10-10T01:00:00Z',
  profile_code: null, profile_status: null, profile_ref: null, page_slug: null,
  facts: {
    operating_facts: [{ metric: '入炉煤价', value: 550, unit: '元/吨', period: '2026-06-30', scope: null, source: 'claim', claim_id: 'fixture-coal', evidence_ids: [], provider: null, ref: 'claim:fixture-coal', observed_at: null, stale: false }],
    financial_facts: [{ metric: 'revenue', value: 7100000000, unit: '元', period: '2026-06-30', scope: null, source: 'claim', claim_id: 'fixture-revenue', evidence_ids: [], provider: null, ref: 'claim:fixture-revenue', observed_at: null, stale: false }],
    valuation_facts: [{ metric: 'pe_ttm', value: 9.5, unit: '倍', period: '2026-10-10', scope: null, source: 'provider', claim_id: null, evidence_ids: [], provider: 'hithink', ref: null, observed_at: '2026-10-10T01:00:00Z', stale: false }],
  },
  relations: [], undated_relations: [], gaps: [], market: {},
};
export const fixtureData: CompanyPageData = {
  quote: { name: '华能蒙电（夹具）', price: 4.28, change_pct: 1.2, currency: 'CNY', market: 'CN', fetched_at: '2026-10-10T09:00:00+08:00', last_close: null,
    pe_ttm: null, pb: null, mcap_yi: null, turnover_pct: null, limit_up: null, limit_down: null, float_mcap_yi: null, amount_yuan: null },
  snapshot: { symbol: '600863.SH', as_of: '2026-10-10', sections: {
    financials: { status: 'ok', data: { items: [
      { metric: 'revenue', value: 7100000000, unit: '元', period: '2026-06-30', provider: 'hithink' },
      { metric: 'operating_cash_flow', value: 1800000000, unit: '元', period: '2026-06-30', provider: 'hithink' },
    ] } },
    valuation: { status: 'ok', data: { values: { pe_ttm: 9.5, pb: 1.1 }, source: 'hithink' } },
  } },
  facts: fixtureFacts,
  documents: { items: [{ document_id: 'a'.repeat(32), title: '夹具半年报', reporting_period: '2026-06-30', document_type: 'annual_report' }] },
};
export function companyPageFixture(initial: Omit<CompanyPageResearchRead, 'task'> = { research: null, stale: false, basisVersion: 'b'.repeat(64) }) {
  let response = initial;
  let projectedTask: CompanyPageTask | undefined;
  const starts: { symbol: string; name: string; version: string }[] = [];
  const task: CompanyPageTask = { sessionId: 'fixture-session', status: 'researching', stage: '核对利润变量' };
  const services: CompanyPageServices = {
    data: {
      quote: async () => fixtureData.quote, snapshot: async () => fixtureData.snapshot,
      facts: async () => fixtureData.facts, documents: async () => fixtureData.documents,
    },
    readResearch: async () => ({ ...response, task: projectedTask }),
    startResearch: async (symbol, name, version) => { starts.push({ symbol, name, version }); projectedTask = task; return task; },
  };
  return { services, starts, task, set: (value: Omit<CompanyPageResearchRead, 'task'>) => { response = value; }, setTask: (value?: CompanyPageTask) => { projectedTask = value; } };
}
