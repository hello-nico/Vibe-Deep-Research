// 11 家真实研究（.local/verdict-check/generated.json，2026-10-20）提炼的夹具：页首判断与「它靠什么赚钱」都通顺、不空白、无禁用词。
// 夹具只留当时输出的主变量单位与数、分部毛利和研究原文；隐含值从当时输出的文字还原。
import assert from 'node:assert/strict';
import test, { before, after } from 'node:test';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { createServer as createHttpServer } from 'node:http';
import { createServer } from 'vite';
import * as React from 'react';
import { Window } from 'happy-dom';
import { companyPageFixture, fixtureData } from './fixtures/company_page.ts';

type Row = { symbol: string; name: string; grade: string; companyType: string; hasModel: boolean; impliedValue: number | null;
  variableUnits: { id: string; name: string; unit: string; current: number; coef: number }[];
  segments: { mode: string; period?: string; shown: { label: string; value: string; title: string }[] }; business: string; expected: { label: string; implied: string } };
const rows = (JSON.parse(readFileSync(new URL('./fixtures/verdict_check.json', import.meta.url), 'utf8')) as { rows: Row[] }).rows;
const BANNED = ['关键变量', '更稳', '打折扣', '警戒线', '基数期', '经营均价代理', '按请求口径', '基数', '整条', '归母', '年内累计'];

let server: Awaited<ReturnType<typeof createServer>>, win: Window, root: ReturnType<typeof import('react-dom/client')['createRoot']>, container: HTMLElement;
let ui: Record<string, any>, narrative: Record<string, any>, router: Record<string, any>;
const previous = { window: globalThis.window, document: globalThis.document, fetch: globalThis.fetch, sessionStorage: globalThis.sessionStorage, IS_REACT_ACT_ENVIRONMENT: globalThis.IS_REACT_ACT_ENVIRONMENT };
before(async () => {
  win = new Window();
  Object.assign(globalThis, { window: win, document: win.document, sessionStorage: win.sessionStorage, requestAnimationFrame: win.requestAnimationFrame.bind(win), cancelAnimationFrame: win.cancelAnimationFrame.bind(win), IS_REACT_ACT_ENVIRONMENT: true });
  server = await createServer({ configFile: false, root: fileURLToPath(new URL('../', import.meta.url)),
    resolve: { alias: { '@': fileURLToPath(new URL('../src/verticals/finance', import.meta.url)) } },
    server: { middlewareMode: true, hmr: { server: createHttpServer() }, watch: null }, appType: 'custom',
    ssr: { noExternal: ['react-router-dom', 'react-router'], resolve: { conditions: ['module-sync', 'node', 'import', 'development'] } } });
  ui = await server.ssrLoadModule('/src/verticals/finance/pages/CompanyPage.tsx');
  narrative = await server.ssrLoadModule('/src/verticals/finance/lib/companyNarrative.ts');
  router = await server.ssrLoadModule('react-router-dom');
  container = win.document.createElement('div') as unknown as HTMLElement;
  win.document.body.append(container);
  root = (await import('react-dom/client')).createRoot(container);
});
after(async () => { await React.act(async () => root?.unmount()); await server?.close(); win?.happyDOM.abort(); Object.assign(globalThis, previous); });

function modelOf(row: Row, flips: unknown[] = []) {
  if (!row.hasModel) return null;
  const variables = row.variableUnits.map(item => ({ ...item, min: -100000, max: 1000000, step: item.unit.includes('%') ? 1 : 10, anchor: item.unit.includes('%') ? 0 : item.current, anchorLabel: '对比期均价' }));
  return { baseProfit: 1, shares: 1, variables, ruleOfThumb: [], tiers: [], flips,
    implied: row.impliedValue == null ? undefined : { id: variables[0]!.id, value: row.impliedValue } };
}

test('R1 11 家页首：每家有判断，有隐含值的有数；百分比变量写“比对比期高/低约 x%”，不出现“现在 0%”', () => {
  assert.equal(rows.length, 11);
  for (const row of rows) {
    const verdict = narrative.verdictLine({ grade: row.grade, model: modelOf(row) });
    const headline = [verdict.label, verdict.implied, verdict.flip, verdict.gap].filter(Boolean).join('；');
    assert.equal(verdict.label, row.expected.label, row.symbol);
    assert.ok(verdict.implied || verdict.gap, `${row.symbol} 页首不能只有判断没有说明`);
    for (const word of BANNED) assert.ok(!headline.includes(word), `${row.symbol} 含禁用词 ${word}`);
    assert.doesNotMatch(headline, /undefined|NaN|null/, row.symbol);
    const percent = row.variableUnits[0]?.unit.includes('%');
    if (row.impliedValue != null) assert.match(verdict.implied, /\d/, row.symbol);
    if (percent) {
      assert.doesNotMatch(verdict.implied, /现在 0%|约 -/, `${row.symbol}：${verdict.implied}`);
      assert.match(verdict.implied, /^按现在的股价，大致对应.+比对比期(高|低)约 \d+\.\d%$/, row.symbol);
    } else if (row.impliedValue != null) assert.match(verdict.implied, /（研究时 [\d,.]+ \S+）$/, row.symbol);
  }
  const text = (symbol: string) => narrative.verdictLine({ grade: '合理', model: modelOf(rows.find(row => row.symbol === symbol)!) }).implied;
  assert.equal(text('600900.SH'), '按现在的股价，大致对应境内水电发电量比对比期低约 0.5%');
  assert.equal(text('300750.SZ'), '按现在的股价，大致对应动力电池系统销售均价比对比期高约 0.7%');
  assert.equal(text('600011.SH'), rows.find(row => row.symbol === '600011.SH')!.hasModel ? text('600011.SH') : '');
  assert.match(text('600011.SH'), /比对比期低约 0\.3%/);
  assert.match(text('600585.SH'), /比对比期高约 1\.3%/);
  assert.equal(text('000933.SZ'), '按现在的股价，大致对应 沪铝约 22,117 元/吨（研究时 22,970 元/吨）', '价格类写法不变');
});

test('R1 百分比变量的隐含值：持平、四舍五入一位、跳档半句写“再升/降 y%”并按百分点判接近', () => {
  const row = rows.find(item => item.symbol === '600900.SH')!;
  const at = (value: number, flips: unknown[] = [], grade = '偏高') => narrative.verdictLine({ grade, model: modelOf({ ...row, impliedValue: value } as Row, flips) });
  assert.equal(at(0).implied, '按现在的股价，大致对应境内水电发电量与对比期持平');
  assert.equal(at(0.04).implied, '按现在的股价，大致对应境内水电发电量与对比期持平');
  assert.equal(at(-0.049).implied, '按现在的股价，大致对应境内水电发电量与对比期持平', '|x| < 0.05 持平');
  assert.equal(at(-0.06).implied, '按现在的股价，大致对应境内水电发电量比对比期低约 0.1%');
  assert.equal(at(12.34).implied, '按现在的股价，大致对应境内水电发电量比对比期高约 12.3%');
  const id = row.variableUnits[0]!.id;
  const up = { id, value: 2, boundary: 'neutral_plus_10_pct' }, down = { id, value: -1.5, boundary: 'neutral_minus_10_pct' };
  assert.equal(at(0, [up]).flip, '境内水电发电量再升 2.0%，判断变为估值合理', '系数为正：升则利润变大，往低档走');
  assert.equal(at(0, [down], '偏低').flip, '境内水电发电量再降 1.5%，判断变为估值合理', '降则利润变小，回到高一档');
  assert.equal(at(0, [{ id, value: 8, boundary: 'neutral_plus_10_pct' }]).flip, '', '3 个百分点以外不写');
  assert.equal(at(0, [{ ...up, invalid: true }]).flip, '');
});

/** 按当时输出的分部毛利（“收入 X 亿元 · 成本 Y 亿元”）还原成数据包里的分部字段，其余用最常见的三个总量字段。 */
function packetOf(row: Row) {
  const yi = (text: string) => String(Math.round(Number(text.replace(/,/g, '')) * 1e8));
  const field = (id: string, value: string, unit: string, period: string) => ({ field_id: id, metric: id, value, unit, period, status: 'verified' });
  const fields: Record<string, any> = {
    revenue: field('revenue', '120000000000', '元', 'FY2025'), gross_margin: field('gross_margin', '23.15', '%', 'FY2025'), net_profit_attributable: field('net_profit_attributable', '9000000000', '元', 'FY2025'),
  };
  for (const item of row.segments.shown) {
    const name = item.label.replace(/毛利$/, '').replace(/收入$/, '');
    const [, revenue, cost] = /收入 ([\d,.]+) 亿元 · 成本 ([\d,.]+) 亿元/.exec(item.title) ?? [];
    if (!revenue) continue;
    fields[`segment:product:${name}.revenue`] = field(`segment:product:${name}.revenue`, yi(revenue), '元', row.segments.period ?? '2026H1');
    fields[`segment:product:${name}.cost`] = field(`segment:product:${name}.cost`, yi(cost!), '元', row.segments.period ?? '2026H1');
  }
  return { symbol: row.symbol, as_of: '2026-10-20', financial_period: 'FY2025', fields };
}

test('R2/R3 11 家“它靠什么赚钱”：有分部写各业务毛利，没有分部（万华、农行）回到营业收入、毛利率、净利润，都不空白、无禁用词', async () => {
  for (const row of rows) {
    const fixture = companyPageFixture({ research: { companyType: row.companyType, thesis: '夹具。', researchedAt: '2026-10-20T00:00:00Z', valuation: { grade: row.grade }, sections: { business: { summary: row.business.replace(/\{[^}]*\}/g, '') } } } as any, new_material: null, basisVersion: 'v' });
    fixture.services.data.packet = async () => packetOf(row) as any;
    fixture.services.data.quote = async () => ({ ...fixtureData.quote!, price: 10 });
    await React.act(async () => root.render(React.createElement(router.MemoryRouter, null, React.createElement(ui.CompanyPage, { key: row.symbol, symbol: row.symbol.slice(0, 6), name: row.name, services: fixture.services }))));
    await React.act(async () => { await new Promise(resolve => setTimeout(resolve, 5)); });
    const section = container.querySelector('[data-company-section="business"]') as HTMLElement;
    assert.ok(section, `${row.symbol} 有这一节`);
    const metrics = [...section.querySelectorAll('[data-key-numbers] .metric-label > span:first-child')].map(item => item.textContent);
    assert.ok(metrics.length >= 1 && metrics.length <= 3, `${row.symbol} 第一层 ${metrics.length} 个数`);
    // 紫金：当时唯一算出毛利的是「其他主营业务」−376.80 亿，被排除后第一层回到原关键数，不再显示怪数。
    if (row.symbol === '601899.SH') { assert.doesNotMatch(section.querySelector('[data-key-numbers]')!.textContent!, /其他主营业务|-376/); assert.deepEqual(metrics, ['营业收入', '毛利率', '净利润']); continue; }
    if (row.segments.mode === 'gross') assert.ok(metrics.every(label => /毛利$/.test(label!)), `${row.symbol} ${metrics}`);
    else assert.deepEqual(metrics, ['营业收入', '毛利率', '净利润'].filter(label => metrics.includes(label)), `${row.symbol} 回到原关键数`);
    if (row.segments.mode === 'none') assert.equal(metrics.length, 3, `${row.symbol} 没有分部也有三个数`);
    for (const word of BANNED) assert.ok(!section.textContent!.includes(word), `${row.symbol} 含禁用词 ${word}`);
    assert.doesNotMatch(section.textContent!, /undefined|NaN|\{|\}/, row.symbol);
  }
});

// ------------------------------------------------------------------ 数字细节修正二：S1 分部排除、S2 百分比盯的卡、S3 隐含值越界

const segField = (id: string, value: number, period = '2026H1') => ({ field_id: id, metric: id, value: String(value), unit: '元', period, status: 'verified' });
function segmentPacket(items: [string, number, number | null][]) {
  const fields: Record<string, any> = {};
  for (const [name, revenue, cost] of items) {
    fields[`segment:product:${name}.revenue`] = segField(`segment:product:${name}.revenue`, revenue * 1e8);
    fields[`segment:product:${name}.cost`] = cost == null ? { field_id: `segment:product:${name}.cost`, status: 'gap', value: null } : segField(`segment:product:${name}.cost`, cost * 1e8);
  }
  return { as_of: '2026-10-20', fields } as any;
}

test('S1 分部：其他 / 抵消 / 内部 / 合并调整，以及毛利为负且收入占比不到 5% 的分部不上第一层，仍留在 excluded 供「查看数据」列出', () => {
  const summary = narrative.segmentGross(segmentPacket([['主业', 1000, 600], ['其他业务', 200, 100], ['分部间抵消', 50, 20], ['内部交易', 80, 10], ['合并调整', 10, 5], ['小亏损业务', 30, 60], ['大亏损业务', 400, 500]]));
  assert.equal(summary.mode, 'gross');
  assert.deepEqual(summary.shown.map((row: any) => row.name), ['主业', '大亏损业务'], '占比不小的真实亏损业务仍显示');
  assert.deepEqual(summary.excluded.map((row: any) => row.name).sort(), ['其他业务', '分部间抵消', '内部交易', '小亏损业务', '合并调整'].sort());
  assert.equal(narrative.segmentLine(summary.shown[1], summary.mode).value, '-100.00 亿元');
  // 全是被排除的（紫金当时只有「其他主营业务」算出了毛利）：第一层不放，页面回到原关键数。
  const zijin = narrative.segmentGross(segmentPacket([['其他主营业务', 824.31, 1201.11]]));
  assert.deepEqual([zijin.mode, zijin.shown.length, zijin.excluded.length], ['none', 0, 1]);
  // 有收入的其他分部仍可用收入顶上：被排除的不进收入列表。
  const revenueOnly = narrative.segmentGross(segmentPacket([['冶炼产铜', 500, null], ['其他主营业务', 824, 1201]]));
  assert.deepEqual([revenueOnly.mode, revenueOnly.shown.map((row: any) => row.name)], ['revenue', ['冶炼产铜']]);
});

test('S2 百分比变量的「盯什么」卡：写持平或高 / 低 x%，不写「0 %」', () => {
  const variable = (current: number, anchor: number | null) => ({ id: 'v', name: '境内水电发电量', unit: '%', current, anchor, anchorLabel: '对比期均价', coef: 616385216, min: -50, max: 50, step: 1 });
  const model = (current: number, anchor: number | null) => ({ baseProfit: 1, shares: 1, variables: [variable(current, anchor)], ruleOfThumb: [{ id: 'v', delta: 10, profitDelta: 6163852160 }], tiers: [], flips: [] });
  const [flat] = narrative.watchItems({ model: model(0, 0), now: new Date('2026-10-20T04:00:00Z') });
  assert.deepEqual([flat.value, flat.sub], ['持平', '与对比期']);
  assert.match(flat.note, /^境内水电发电量与对比期持平；每 \+10%，净利润 \+61\.64 亿元$/);
  const [up] = narrative.watchItems({ model: model(1.5, 0), now: new Date('2026-10-20T04:00:00Z') });
  assert.equal(up.value, '高 1.5%');
  assert.match(up.note, /^境内水电发电量比对比期高 1\.5%，年化净利润多约 9\.25 亿元/);
  const [down] = narrative.watchItems({ model: model(-2, null), now: new Date('2026-10-20T04:00:00Z') });
  assert.equal(down.value, '低 2.0%', '没有对比期均价的百分比变量按 0 算');
  for (const card of [flat, up, down]) assert.doesNotMatch(`${card.value} ${card.sub} ${card.note}`, /(^|[^\d.])0 %|NaN|undefined/);
  // 价格类写法不变。
  const price = { baseProfit: 1, shares: 1, ruleOfThumb: [], tiers: [], flips: [], variables: [{ id: 'p', name: '沪铝', unit: '元/吨', current: 22970, anchor: 23501, anchorLabel: '对比期均价', coef: 911946, min: 18000, max: 28000, step: 10 }] };
  assert.equal(narrative.watchItems({ model: price, now: new Date('2026-10-20T04:00:00Z') })[0].note, '现价比对比期均价低 531 元/吨，年化净利润少约 4.84 亿元');
});

test('S3 隐含值越界：有 within_range 为假时写“按现价，市场隐含的…，低于 / 高于近年区间”；字段不存在或区间内保持原写法', () => {
  const extra = (implied: Record<string, unknown>, unit = '元/吨', current = 110990) => narrative.parseSensitivity({ body: { payload: { calculation: { extra: { base_profit: 1, shares: 1, implied,
    variables: [{ var_id: 'cmdty:SHFE.CU', name: '沪铜', unit, current, coef_per_unit: 1, range: [88000, 133000], step: 10 }] } } } } });
  const base = { var_id: 'cmdty:SHFE.CU', multiple: '12' };
  const verdict = (implied: Record<string, unknown>, unit?: string, current?: number) => narrative.verdictLine({ grade: '偏低', model: extra(implied, unit, current) }).implied;
  const below = extra({ ...base, value: '72000', within_range: false, range: ['88000', '133000'] });
  assert.deepEqual([below.implied.withinRange, below.implied.range], [false, [88000, 133000]]);
  assert.equal(verdict({ ...base, value: '72000', within_range: false, range: ['88000', '133000'] }), '按现价，市场隐含的沪铜约 72,000 元/吨，低于近年区间');
  assert.equal(verdict({ ...base, value: '150000', within_range: false, range: ['88000', '133000'] }), '按现价，市场隐含的沪铜约 150,000 元/吨，高于近年区间');
  assert.equal(verdict({ ...base, value: '99000', within_range: true, range: ['88000', '133000'] }), '按现在的股价，大致对应 沪铜约 99,000 元/吨（研究时 110,990 元/吨）');
  assert.equal(verdict({ ...base, value: '99000' }), '按现在的股价，大致对应 沪铜约 99,000 元/吨（研究时 110,990 元/吨）', '老凭据没有字段：保持现状');
  assert.equal(verdict({ ...base, value: '72000', within_range: false }), '按现价，市场隐含的沪铜约 72,000 元/吨，超出近年区间', '没有区间只说超出');
  assert.equal(verdict({ ...base, value: '28.5', within_range: false, range: ['-20', '20'] }, '%', 0), '按现价，市场隐含的沪铜比对比期高约 28.5%，高于近年区间');
  // 系数为零：value 为空，仍只写判断并说明原因。
  const gap = narrative.verdictLine({ grade: '偏低', model: extra({ var_id: 'cmdty:SHFE.CU', value: null, within_range: false, reason: '主变量系数为零，无法反解' }) });
  assert.equal(gap.implied, '');
  assert.match(gap.gap, /无大致对应的价格/);
});
