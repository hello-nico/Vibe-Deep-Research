import assert from 'node:assert/strict';
import test from 'node:test';
import { createServer } from 'vite';
import { createServer as createHttpServer } from 'node:http';
import { fileURLToPath } from 'node:url';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

const COMPANY_SPEC = {
  title: '长江电力', type: 'company', subject_id: 'company:600900.SH', as_of: '2026-09-12',
  blocks: [
    { kind: 'identity', content: { symbol: '600900.SH', industry: '电力', parent_industry: '公用事业' }, refs: ['taxonomy:sw2:801161.SI:company:600900.SH'] },
    { kind: 'operating_facts', content: { status: 'pending' }, refs: [] },
    { kind: 'financial_facts', content: { status: 'ready', items: [
      { metric: 'revenue', value: 37929268927.18, period: '2026-06-30 年初至今', unit: '元', source: 'provider', provider: 'hithink', ref: 'provider:hithink:600900.SH:revenue:2026-06-30', observed_at: '2026-08-31T00:00:00+08:00' },
      { metric: 'revenue', value: '37929268927.18', period: 'FY2025', unit: '元', ref: 'claim:abc123' },
      { metric: 'net_profit_attributable', value: 0, period: 'FY2025', unit: '元', ref: 'claim:def456' },
      { metric: 'roe', value: 12.5, period: 'FY2025', unit: '%', ref: 'claim:ghi789' },
    ] }, refs: ['claim:abc123', 'claim:def456', 'provider:hithink:600900.SH:revenue:2026-06-30'] },
    { kind: 'valuation_facts', content: { status: 'ready', items: [
      { metric: 'pe_ttm', value: 19.350371, unit: '倍', period: 'TTM', source: 'provider', provider: 'hithink', ref: 'provider:hithink:600900.SH:pe_ttm:x' },
    ] }, refs: [] },
    { kind: 'observation_window', content: { status: 'closed', scales: [{ kind: 'stock', id: '600900.SH' }, { kind: 'benchmark', id: '000300.SH', name: '沪深300' }] }, refs: [] },
    { kind: 'source_timeline', content: { status: 'ready', items: [{ document_type: 'annual_report', title: '2025 年年度报告', reporting_period: 'FY2025' }] }, refs: [] },
    { kind: 'gaps', content: [{ metric: '现金分红', reason: 'required_basic_fact_missing' }], refs: [] },
  ],
  links: [{ to: 'industries/801161-si', type: 'belongs_to' }],
};

const COMPARISON_SPEC = {
  title: '长江电力 vs 湖北能源', type: 'comparison', subject_id: 'comparison:x', as_of: '2026-09-10', status: 'draft',
  comparison_scope: {
    question: '两公司并表口径是否可比？', horizon: 'FY2025',
    subjects: [{ entity_id: 'company:600900.SH', snapshot_as_of: '2026-06-30' }, { entity_id: 'company:000883.SZ', snapshot_as_of: '2026-06-30' }],
    dimensions: [{ id: 'consolidation_scope', title: '控股并表口径', basis: '附注十', direction: 'context_dependent' }],
  },
  comparability: { level: 'medium', reasons: ['口径披露完整度不同'] },
  blocks: [
    { kind: 'comparison_matrix', content: { rows: [
      { dimension_id: 'consolidation_scope', cells: [
        { subject: 'company:600900.SH', status: 'verified', value: '并表配售电平台' },
        { subject: 'company:000883.SZ', status: 'missing' },
      ] },
    ], unit_note: '按冻结口径比较' }, refs: ['claim:x'] },
    { kind: 'conclusion', content: '两者并表口径部分可比。', refs: ['evidence:e1'] },
    { kind: 'gaps', content: [], refs: [] },
  ],
};

const THEME_SPEC = {
  title: '水电资产重估', type: 'theme', subject_id: 'theme:x', as_of: '2026-09-01', status: 'active', valid_until: '2026-12-01',
  blocks: [
    { kind: 'thesis', content: '电价机制变化重估存量水电。', refs: ['claim:t1'] },
    { kind: 'mechanism', content: { items: [{ text: '电价上浮打开盈利弹性' }] }, refs: ['claim:t2'] },
    { kind: 'gaps', content: [], refs: [] },
  ],
};

async function render(component: unknown, props: Record<string, unknown>) {
  const server = await createServer({ configFile: false, root: fileURLToPath(new URL('../', import.meta.url)), server: { middlewareMode: true, hmr: { server: createHttpServer() }, watch: null }, appType: 'custom',
    ssr: { noExternal: ['react-router-dom', 'react-router'], resolve: { conditions: ['module-sync', 'node', 'import', 'development'] } } });
  try {
    const mod = await server.ssrLoadModule('/src/verticals/finance/components/WikiReport.tsx');
    const { MemoryRouter } = await server.ssrLoadModule('react-router-dom');
    const Comp = mod[component as string];
    return renderToStaticMarkup(createElement(MemoryRouter, null, createElement(Comp, { page: { markdown: '', published: true, spec: props.spec }, ...props })));
  } finally { await server.close(); }
}

test('公司底稿：首屏给关键读数，数值绑定依据', async () => {
  const html = await render('WikiReport', { spec: COMPANY_SPEC });
  assert.match(html, /长江电力/);
  assert.match(html, /600900\.SH/);
  assert.match(html, /wr-stat-value/);
  assert.match(html, /379\.29 亿元|379\.29亿元/);
  assert.match(html, /data-evidence-ref="provider:hithink:600900\.SH:revenue:2026-06-30"/);
});

test('公司底稿：缺失单元格显示占位而非零，零值如实显示', async () => {
  const html = await render('WikiReport', { spec: COMPANY_SPEC });
  // net_profit_attributable 只有 FY2025，2026-06-30 列应为占位符
  assert.match(html, /wr-empty/);
  // value 0 必须如实显示而非缺失占位
  assert.match(html, />0\.00 元</);
});

test('公司底稿：缺口与待补充块如实呈现', async () => {
  const html = await render('WikiReport', { spec: COMPANY_SPEC });
  assert.match(html, /缺口/);
  assert.match(html, /现金分红/);
  assert.match(html, /资料待补充/); // operating_facts pending
  assert.match(html, /尚未打开/); // observation_window closed
});

test('稀疏公司页：全部待补充时仍可阅读', async () => {
  const sparse = { title: '测试公司', type: 'company', as_of: '2026-09-01', blocks: [
    { kind: 'identity', content: { symbol: '000001.SZ', industry: '银行' }, refs: [] },
    { kind: 'financial_facts', content: { status: 'pending' }, refs: [] },
    { kind: 'source_timeline', content: { status: 'empty', items: [] }, refs: [] },
  ] };
  const html = await render('WikiReport', { spec: sparse });
  assert.match(html, /测试公司/);
  assert.match(html, /资料待补充/);
  assert.doesNotMatch(html, /undefined|NaN/);
});

test('对比底稿：首屏即比较问题，矩阵区分核验状态', async () => {
  const html = await render('WikiReport', { spec: COMPARISON_SPEC });
  assert.match(html, /两公司并表口径是否可比/);
  assert.match(html, /可比程度：中/);
  assert.match(html, /已核验：并表配售电平台/);
  assert.match(html, /待补充/);
  assert.match(html, /600900\.SH/);
  assert.match(html, /结论/);
});

test('主题底稿：thesis 进入首屏', async () => {
  const html = await render('WikiReport', { spec: THEME_SPEC });
  assert.match(html, /电价机制变化重估存量水电/);
  assert.match(html, /已复核/);
  assert.match(html, /电价上浮打开盈利弹性/);
  assert.match(html, /适用截止/);
});

test('未知类型返回空，由调用方回退旧壳', async () => {
  const html = await render('WikiReport', { spec: { title: 'x', type: 'topic', as_of: '2026-01-01', blocks: [] } });
  assert.equal(html, '');
});

test('容器消息只接受 cite/resize 的严格形态', async () => {
  const server = await createServer({ configFile: false, root: fileURLToPath(new URL('../', import.meta.url)), server: { middlewareMode: true, hmr: { server: createHttpServer() }, watch: null }, appType: 'custom',
    ssr: { noExternal: ['react-router-dom', 'react-router'], resolve: { conditions: ['module-sync', 'node', 'import', 'development'] } } });
  try {
    const { reportMessage } = await server.ssrLoadModule('/src/verticals/finance/components/WikiReportPane.tsx');
    assert.deepEqual(reportMessage({ source: 'vibe-wiki-report', type: 'cite', ref: 'claim:abc' }), { kind: 'cite', ref: 'claim:abc' });
    assert.deepEqual(reportMessage({ source: 'vibe-wiki-report', type: 'resize', height: 800 }), { kind: 'resize', height: 800 });
    assert.equal(reportMessage({ source: 'vibe-wiki-report', type: 'cite', ref: 'javascript:alert(1)' }), null);
    assert.equal(reportMessage({ source: 'vibe-wiki-report', type: 'cite', ref: 'http://evil' }), null);
    assert.equal(reportMessage({ source: 'other', type: 'cite', ref: 'claim:abc' }), null);
    assert.equal(reportMessage({ source: 'vibe-wiki-report', type: 'navigate', url: 'https://x' }), null);
    assert.equal(reportMessage(null), null);
    assert.equal(reportMessage('cite:claim:abc'), null);
    assert.equal(reportMessage({ source: 'vibe-wiki-report', type: 'resize', height: NaN }), null);
  } finally { await server.close(); }
});
