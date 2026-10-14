// T7.3 C 线：五节问题结构、句中数字、专用图、关键变量滑块、写回悬停与撤回、跟踪卡。
// 夹具：华能蒙电为 .local/t72b-runs/raw/600863 的真实数据包、研究回读与情景回读；神火 sensitivity 按接口先行构造，数值取样张。
import assert from 'node:assert/strict';
import test, { before, after } from 'node:test';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { createServer as createHttpServer } from 'node:http';
import { createServer } from 'vite';
import * as React from 'react';
import { Window } from 'happy-dom';
import { companyPageFixture, fixtureData } from './fixtures/company_page.ts';
import { researchRoute } from '../dsh/finance-ui/research.mjs';

const real = JSON.parse(readFileSync(new URL('./fixtures/t73_real.json', import.meta.url), 'utf8')) as Record<string, any>;
const huaneng = real.huaneng, shenhuo = real.shenhuo;
const sensitivityRef = shenhuo.sensitivityResult.result_id as string;
const scenarioRef = shenhuo.scenarioResult.result_id as string;

let server: Awaited<ReturnType<typeof createServer>>, win: Window, root: ReturnType<typeof import('react-dom/client')['createRoot']>;
let ui: Record<string, any>, narrative: Record<string, any>, packetModule: Record<string, any>, serviceModule: Record<string, any>, router: Record<string, any>;
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
  narrative = await server.ssrLoadModule('/src/verticals/finance/lib/companyNarrative.ts');
  packetModule = await server.ssrLoadModule('/src/verticals/finance/lib/companyPacket.ts');
  serviceModule = await server.ssrLoadModule('/src/verticals/finance/lib/companyPageServices.ts');
  router = await server.ssrLoadModule('react-router-dom');
  container = win.document.createElement('div') as unknown as HTMLElement;
  win.document.body.append(container);
  root = (await import('react-dom/client')).createRoot(container);
});
after(async () => { await React.act(async () => root?.unmount()); await server?.close(); win?.happyDOM.abort(); Object.assign(globalThis, previous); });

const quote = (price: number) => ({ ...fixtureData.quote!, name: '夹具', price, change_pct: 1.2 });
function services(opts: { packet: any; research: any; quote?: any; results?: Record<string, unknown>; scenario?: any; revert?: (symbol: string, version?: string) => Promise<void>; envelope?: Record<string, unknown> }) {
  const fixture = companyPageFixture({ research: opts.research, stale: false, basisVersion: 'v1', ...opts.envelope });
  fixture.services.data.packet = async () => opts.packet;
  fixture.services.data.quote = async () => opts.quote ?? quote(5.21);
  fixture.services.readScenario = async () => opts.scenario ?? null;
  fixture.services.readResult = async ref => opts.results?.[ref] ?? null;
  if (opts.revert) fixture.services.revertResearch = opts.revert;
  return fixture;
}
async function mount(fixture: ReturnType<typeof companyPageFixture>, symbol = '600863', name = '华能蒙电') {
  await React.act(async () => root.render(React.createElement(router.MemoryRouter, null,
    React.createElement(ui.CompanyPage, { key: fixture.services, symbol, name, services: fixture.services }))));
  await React.act(async () => { await new Promise(resolve => setTimeout(resolve, 5)); });
}
const section = (id: string) => container.querySelector(`[data-company-section="${id}"]`) as HTMLElement | null;
async function slide(input: Element, value: number) {
  await React.act(async () => {
    const setter = Object.getOwnPropertyDescriptor(win.HTMLInputElement.prototype, 'value')!.set!;
    setter.call(input, String(value));
    input.dispatchEvent(new win.Event('input', { bubbles: true }));
  });
}

// ------------------------------------------------------------------ 纯逻辑

test('句中占位：字段与计算凭据按取值填入，缺口为 null；占位以外原样保留', () => {
  const { splitSentence, resolveSlot, calcRefsIn } = narrative;
  const text = '毛利率只有{gross_margin}，现金转化{lens:cash_conversion.cash_conversion}，股本{shares}，铝价每涨一千约{calc:' + sensitivityRef + '.rule_of_thumb.0.profit_delta}。';
  const parts = splitSentence(text);
  assert.deepEqual(parts.filter((part: any) => part.kind === 'slot').map((part: any) => part.token), ['gross_margin', 'lens:cash_conversion.cash_conversion', 'shares', `calc:${sensitivityRef}.rule_of_thumb.0.profit_delta`]);
  assert.deepEqual(calcRefsIn(text), [sensitivityRef]);
  const calcs = { [sensitivityRef]: shenhuo.sensitivityResult };
  assert.match(resolveSlot('gross_margin', huaneng.packet, calcs).text, /23\.15/);
  assert.match(resolveSlot('lens:cash_conversion.cash_conversion', huaneng.packet, calcs).text, /2\.69/);
  assert.match(resolveSlot('shares', huaneng.packet, calcs).text, /78\.35 亿|7,835|78\.35/);
  assert.match(resolveSlot('gross_margin', huaneng.packet, calcs).title, /毛利率/);
  assert.equal(resolveSlot('dividend_paid', huaneng.packet, calcs), null);
  assert.equal(resolveSlot('lens:missing.revenue', huaneng.packet, calcs), null);
  assert.equal(resolveSlot(`calc:${sensitivityRef}.rule_of_thumb.0.profit_delta`, huaneng.packet, calcs)?.text, '9.96 亿元');
  assert.equal(resolveSlot(`calc:${sensitivityRef}.rule_of_thumb.9.profit_delta`, huaneng.packet, calcs), null);
  assert.equal(resolveSlot(`calc:${sensitivityRef}.rule_of_thumb.0.profit_delta`, huaneng.packet, {}), null);
});

test('计算占位按路径末段的键名定单位：神火真实 profit_delta 显示为亿元', () => {
  const { resolveSlot } = narrative;
  const ref = 'result:' + 'a'.repeat(32);
  const calcs = { [ref]: { extra: {
    rule_of_thumb: [{ var_id: 'cmdty:SHFE.AL', delta: 1000, profit_delta: 827213777.939459 }],
    variables: [{ var_id: 'cmdty:SHFE.AL', unit: '元/吨', current: 23465, anchor: 21000.5 }],
    base_profit: 2.5e9, profit_at_current: 3.1e9, price: 12.345, eps: 1.234, implied: { pe: 14.25, pb: 0.96, multiple: 7.98 }, shares: 2250000000,
  } } };
  const text = (path: string) => resolveSlot(`calc:${ref}.${path}`, undefined, calcs)?.text;
  assert.equal(text('rule_of_thumb.0.profit_delta'), '8.27 亿元');
  assert.equal(text('base_profit'), '25.00 亿元');
  assert.equal(text('profit_at_current'), '31.00 亿元');
  assert.equal(text('price'), '12.35 元');
  assert.equal(text('eps'), '1.23 元/股');
  assert.equal(text('variables.0.current'), '23,465 元/吨');
  assert.equal(text('variables.0.anchor'), '21,000.50 元/吨');
  assert.equal(text('shares'), '2,250,000,000', '其他键原样显示');
  assert.equal(text('implied.pe'), '14.3 倍');
  assert.equal(text('implied.pb'), '1.0 倍');
  assert.equal(text('implied.multiple'), '8.0 倍');
  assert.equal(text('rule_of_thumb.0.delta'), '1,000');
  // 亿元四舍五入到两位小数，不截断：8.275 亿 → 8.28，8.274 亿 → 8.27，负数对称
  assert.equal(narrative.yiText(827_500_000), '8.28 亿元');
  assert.equal(narrative.yiText(827_400_000), '8.27 亿元');
  assert.equal(narrative.yiText(996_999_999), '9.97 亿元');
  assert.equal(narrative.yiText(0), '0.00 亿元');
});

test('敏感性：页面只做 基数 + Σ 系数 × 变动 与 ÷ 股本；神火样张数值', () => {
  const model = narrative.parseSensitivity(shenhuo.sensitivityResult);
  assert.equal(model.variables.length, 3);
  const base = narrative.initialSliderValues(model);
  assert.deepEqual(base, { 'cmdty:SHFE.AL': 23465, 'cmdty:SHFE.AO': 3150, '000933.SZ:coal_price': 655 }, '滑块初始位置是今天');
  // 零变动点是基数期均价 anchor：滑块在今天时的利润 = 基数 + Σ 系数 × (今天 − anchor)，与 Backend 给的 profit_at_current 一致。
  assert.equal(narrative.profitAt(model, base), 9238174000);
  assert.equal(narrative.profitAt(model, base), model.profitAtCurrent);
  const anchors = Object.fromEntries(model.variables.map((item: any) => [item.id, item.anchor]));
  assert.equal(narrative.profitAt(model, anchors), 9562000000, '取值在 anchor 时回到基数');
  const al = narrative.profitAt(model, { ...base, 'cmdty:SHFE.AL': 23465 + 1000 });
  assert.equal(al - 9238174000, 996000000, '铝价每 +1000 元/吨 ≈ +9.96 亿元');
  const ao = narrative.profitAt(model, { ...base, 'cmdty:SHFE.AO': 3150 + 100 });
  assert.equal(ao - 9238174000, -192000000, '氧化铝每 +100 元/吨 ≈ -1.92 亿元');
  assert.equal(narrative.epsAt(model, 9562000000), 9562000000 / 2249004399);
  assert.equal(narrative.impliedPe(54.4, 0), null);
  assert.ok(Math.abs(narrative.impliedPe(54.4, 9562000000 / 2249004399) - 54.4 / (9562000000 / 2249004399)) < 1e-9);
  assert.equal(model.variables[0].anchorLabel, '基数期均价');
  assert.equal(narrative.ruleOfThumbText(model, model.variables[0]), '每 +1,000 元/吨，归母净利 +9.96 亿元');
  assert.equal(narrative.ruleOfThumbText(model, model.variables[1]), '每 +100 元/吨，归母净利 -1.92 亿元');
  assert.deepEqual(model.tiers.map((tier: any) => tier.name), ['悲观', '中性', '乐观']);
  // 形态不完整：返回 null，页面用单季柱图兜底。
  assert.equal(narrative.parseSensitivity({ payload: { calculation: { extra: { base_profit: '1', shares: '0', variables: [] } } } }), null);
  assert.equal(narrative.parseSensitivity(null), null);
  assert.equal(narrative.parseSensitivity({ payload: { calculation: { extra: { base_profit: '1', shares: '10', variables: [{ var_id: 'x', current: 'abc' }] } } } }), null);
  // 缺 anchor（含旧形态的 reference）按缺口：该变量 anchor 为 null、不计入利润，不退回 reference 或 current。
  const gapModel = narrative.parseSensitivity({ payload: { calculation: { extra: { base_profit: '100', shares: '10', variables: [
    { var_id: 'a', name: 'A', unit: '元', current: '5', anchor: '4', coef_per_unit: '2', range: ['0', '10'], step: '1' },
    { var_id: 'b', name: 'B', unit: '元', current: '7', reference: '6', coef_per_unit: '3', range: ['0', '10'], step: '1' }] } } } });
  assert.deepEqual(gapModel.variables.map((item: any) => [item.anchor, item.anchorLabel]), [[4, '基数期均价'], [null, '基数期均价']]);
  assert.equal(narrative.profitAt(gapModel, { a: 5, b: 9 }), 102, '缺 anchor 的变量不计入利润');
  assert.deepEqual(narrative.contributions(gapModel, { a: 5, b: 9 }).map((item: any) => item.profit), [2, 0]);
});

test('跟踪状态：按 threshold.direction 判越线；缺省或缺当前值为待定（null）；窗口按披露截止推算', () => {
  const { trackingState, windowPassed, thresholdLine, pendingReason } = narrative;
  const now = new Date('2026-10-12T04:00:00Z');
  const down = { kind: 'level', direction: 'down', value: '20', unit: '%' };
  const up = { kind: 'level', direction: 'up', value: '25', unit: '%' };
  assert.equal(trackingState({ current: 23.2, threshold: down, window: 'FY2026年报', now }), '更稳');
  assert.equal(trackingState({ current: 18, threshold: down, window: 'FY2026年报', now }), '打折扣');
  assert.equal(trackingState({ current: 18, threshold: down, window: '2026-09-30', now }), '不成立');
  assert.equal(trackingState({ current: 23, threshold: up, window: '2026-09-30', now }), '更稳');
  assert.equal(trackingState({ current: 26, threshold: up, window: '2026年半年报', now }), '不成立');
  assert.equal(trackingState({ current: 26, threshold: up, window: '2026年三季报', now }), '打折扣');
  assert.equal(trackingState({ current: 26, threshold: up, window: '2026-12-31', now }), '打折扣');
  // 向下的线不会因为当前值偏高而越线，向上的线不会因为偏低而越线：方向只看 direction，不看证伪句措辞。
  assert.equal(trackingState({ current: 30, threshold: down, window: '2026-09-30', now }), '更稳');
  assert.equal(trackingState({ current: 10, threshold: up, window: '2026-09-30', now }), '更稳');
  // 同比类阈值：当前值取年内累计同比镜头。
  assert.equal(trackingState({ current: -8, threshold: { kind: 'yoy_pct', direction: 'down', value: '-5', unit: '%' }, window: '2026年三季报', now }), '打折扣');
  assert.equal(trackingState({ current: -2, threshold: { kind: 'yoy_pct', direction: 'down', value: '-5', unit: '%' }, window: '2026年三季报', now }), '更稳');
  // 缺 direction（旧研究）、缺当前值、没有阈值：不判状态。
  assert.equal(trackingState({ current: 18, threshold: { kind: 'level', value: '20', unit: '%' }, window: '2026-09-30', now }), null);
  assert.equal(trackingState({ current: null, threshold: down, window: '2026-09-30', now }), null);
  assert.equal(trackingState({ current: 10, threshold: null, now }), null);
  assert.equal(pendingReason({ current: 18, threshold: { kind: 'level', value: '20', unit: '%' } }), '研究没有写明越线方向');
  assert.equal(pendingReason({ current: null, threshold: down }), '当前值暂缺');
  assert.equal(thresholdLine(down), '跌破 20.00 %');
  assert.equal(thresholdLine(up), '突破 25.00 %');
  assert.equal(thresholdLine({ kind: 'level', value: '20', unit: '%' }), '20.00 %');
  assert.equal(narrative.breachDirection, undefined, '不再按措辞猜方向');
  for (const [window, expected] of [['FY2026年报', false], ['FY2025年报', true], ['2026年半年报', true], ['2026年三季报', false], ['2026年一季报', true], ['下一次定期报告', false], ['', false], ['2026-10-11', true], ['2026-10-12', false]] as const)
    assert.equal(windowPassed(window, now), expected, window);
});

test('判断变化行：无变化写某日更新：判断没变；对话来源可撤回', () => {
  const { changeLine, conversationHint } = narrative;
  assert.equal(changeLine(huaneng.research.research).text, '10-12 更新：判断没变');
  assert.equal(changeLine(huaneng.research.research).revertable, false);
  const talked = changeLine({ researchedAt: '2026-10-12T08:00:00+00:00', changes: { valuation: '铝价下调到二万一后重算中性价' },
    sensitivity: { drivers: [{ var_id: 'cmdty:SHFE.AL', origin: 'conversation', sessionId: 'session-abc', confirmedAt: '2026-10-12T07:55:00+00:00' }] } });
  assert.equal(talked.text, '10-12 更新：铝价下调到二万一后重算中性价');
  assert.equal(talked.revertable, true);
  assert.equal(conversationHint(talked.conversation), '来自对话确认 · 2026-10-12 · 会话 session-abc');
  // 研究读口顶层的 changedFrom / canRevert 优先：没有对话变量时也能撤回，悬停带原因。
  const viaEnvelope = changeLine({ researchedAt: '2026-10-12T08:00:00+00:00' }, { changedFrom: { origin: 'conversation', sessionId: 'session-xyz', confirmedAt: '2026-10-12T09:30:00+00:00', reason: '用户讨论：铝价跌到 21000 时的影响' }, canRevert: true });
  assert.equal(viaEnvelope.revertable, true);
  assert.equal(conversationHint(viaEnvelope.conversation), '来自对话确认 · 2026-10-12 · 会话 session-xyz · 用户讨论：铝价跌到 21000 时的影响');
  assert.equal(changeLine({ researchedAt: '2026-10-12T08:00:00+00:00', sensitivity: { drivers: [{ var_id: 'x', origin: 'conversation' }] } }, { canRevert: false }).revertable, false);
  assert.equal(changeLine({ gapNote: '缺口', researchedAt: '2026-10-12' } as any), null);
  assert.equal(changeLine(null), null);
  // 多处变化：第一层一句人话，各节明细进悬停；内部说法换成用户能懂的话。
  const many = changeLine({ researchedAt: '2026-10-14T08:00:00+00:00', changes: { valuation: '估值从偏低改为合理', variables: '改用沪铝、氧化铝、焦煤的行情目录变量，三档情景重算' } });
  assert.equal(many.text, '10-14 更新：2 处判断有变化');
  assert.equal(many.detail, '估值：估值从偏低改为合理\n关键变量：改用沪铝、氧化铝、焦煤的价格数据，悲观、中性、乐观三种情况重算');
  assert.doesNotMatch(many.text + many.detail, /口径|行情目录变量|三档情景/);
  assert.equal(changeLine({ researchedAt: '2026-10-14T08:00:00+00:00', changes: { valuation: '估值从偏低改为合理' } }).text, '10-14 更新：估值从偏低改为合理');
});

test('单季柱图兜底数据与去向条按数据包取值', () => {
  const { quarterSeries, flowItems, quarterLabel } = narrative;
  const bars = quarterSeries(huaneng.packet);
  assert.ok(bars.length >= 2 && bars.length <= 4);
  assert.deepEqual(bars.map((bar: any) => bar.period), [...bars.map((bar: any) => bar.period)].sort());
  assert.ok(bars.every((bar: any) => bar.revenue != null));
  assert.equal(quarterLabel('2026Q2'), '2026 年第二季度');
  assert.equal(narrative.compositionOf, undefined, '不读自拟的业务分部镜头');
  const flow = flowItems(huaneng.packet);
  // 剩余现金缺口时用「资本开支后现金」镜头，并标明未扣分红。
  assert.deepEqual(flow.map((item: any) => [item.key, item.value != null]), [['operating_cash_flow', true], ['capex_cash', true], ['dividend_paid', false], ['residual_cash', true]]);
  assert.equal(flow[3].label, '剩余（未扣分红）');
  assert.equal(flowItems({ ...huaneng.packet, lenses: {} })[3].value, null);
  assert.deepEqual(narrative.GRADES, ['明显低估', '偏低', '合理', '偏高', '明显高估']);
  assert.equal(narrative.periodLabel('FY2025'), '2025 年报');
  assert.equal(narrative.periodLabel('2026-10-12'), '10 月 12 日');
  assert.equal(narrative.peerMedian(huaneng.packet, 'pe') != null, true);
});

/** 真实夹具是 direction 出现之前保存的；按证伪句的意思补方向，模拟新保存的研究。 */
function directed(research: any, direction: 'down' | 'up' = 'down') {
  const copy = structuredClone(research);
  for (const item of copy.falsifiers ?? []) if (item.threshold) item.threshold.direction = direction;
  return copy;
}

// ------------------------------------------------------------------ 页面：华能真实数据

test('华能真实形态：五节先答问题；回答句、专用图、收起的数据；第一层每节关键数 ≤3', async () => {
  const scenario = packetModule.scenarioTable(huaneng.scenarioResult);
  const research = structuredClone(huaneng.research.research);
  research.sections.business.summary = '毛利率只有{gross_margin}，营业收入{revenue}，分红{dividend_paid}取不到';
  research.sections.cash.summary = '经营现金流约为归母净利的{lens:cash_conversion.cash_conversion}';
  const fixture = services({ packet: huaneng.packet, research: { research, stale: false, basisVersion: 'v1' }.research, scenario, quote: quote(5.21) });
  await mount(fixture);
  assert.deepEqual([...container.querySelectorAll('[data-company-section]')].map(item => item.getAttribute('data-company-section')), ['thesis', 'business', 'variables', 'cash', 'valuation', 'tracking']);
  const titles = [...container.querySelectorAll('.company-page-section .panel-title')].slice(0, 5).map(item => item.textContent);
  assert.deepEqual(titles, ['它靠什么赚钱', '关键变量动一下，利润变多少', '利润是不是真金白银', '现在的价格在赌什么', '接下来盯什么']);
  // 页首：thesis、五档结论、判断变化行。
  const lead = section('thesis')!.textContent!;
  assert.match(lead, /量价成本差决定盈利/);
  assert.match(lead, /合理/);
  assert.match(lead, /10-12 更新：判断没变/);
  assert.equal(lead.indexOf('合理') < lead.indexOf('更新：'), true, '五档结论与判断变化行同一行，结论在前');
  assert.match(container.querySelector('.company-page-code')!.textContent!, /600863.* · 高杠杆周期公用事业/);
  assert.match(container.querySelector('.company-page-quote-time')!.textContent!, /行情/);
  // 回答句里的占位：加粗等宽、悬停给期间与出处；缺口灰色「暂缺」。
  const business = section('business')!;
  const slots = [...business.querySelectorAll('.narrative-slot')];
  assert.match(slots[0]!.textContent!, /23\.15/);
  assert.match(slots[0]!.getAttribute('title')!, /毛利率 · FY2025 · .* · 来源/);
  assert.match(slots[1]!.textContent!, /210\.50 亿元/);
  const gap = business.querySelector('.narrative-slot.is-gap')!;
  assert.equal(gap.textContent, '暂缺');
  assert.doesNotMatch(business.textContent!, /\{|\}/);
  assert.match(section('cash')!.textContent!, /约为归母净利的\s*2\.69 倍/);
  // 第一层关键数最多三个；其余收进「查看数据」。
  for (const id of ['business', 'cash', 'valuation']) {
    const numbers = section(id)!.querySelectorAll('[data-key-numbers] .metric');
    assert.ok(numbers.length <= 3 && numbers.length >= 1, `${id} ${numbers.length}`);
  }
  assert.deepEqual([...section('valuation')!.querySelectorAll('[data-key-numbers] .metric-label > span:first-child')].map(item => item.textContent), ['市盈率', '市净率', '股息率']);
  for (const id of ['business', 'variables', 'cash', 'valuation']) {
    const detail = section(id)!.querySelector('details.company-page-detail');
    if (detail) { assert.equal((detail as HTMLDetailsElement).open, false); assert.equal(detail.querySelector('summary')!.textContent, '查看数据'); }
  }
  // 专用图：关键变量节无敏感性时兜底为单季柱图；现金为去向条，缺项灰色；估值为区间带，现价与每档位置。
  assert.ok(section('variables')!.querySelector('[data-chart="quarters"]'));
  assert.equal(section('variables')!.querySelector('input[type="range"]'), null);
  const flow = section('cash')!.querySelector('[data-chart="flow"]')!;
  assert.match(flow.querySelector('[data-flow="dividend_paid"]')!.textContent!, /暂缺/);
  assert.ok(flow.querySelector('[data-flow="dividend_paid"].is-gap'));
  assert.ok(flow.querySelector('.narrative-flowbar [data-flow="capex_cash"]'), '去向条一条：资本开支段');
  assert.match(flow.querySelector('.narrative-flowbar [data-flow="residual_cash"]')!.textContent!, /剩余（未扣分红）/);
  assert.equal(flow.querySelector('.narrative-flowbar [data-flow="dividend_paid"]'), null, '缺项不画段');
  assert.match(flow.querySelector('[data-flow="operating_cash_flow"]')!.textContent!, /经营现金流 67\.31 亿元/);
  // 没有业务分部数据：生意节只有回答句与关键数，没有构成条。
  assert.equal(section('business')!.querySelector('[data-chart]'), null);
  // 区间带图注与五档并排，当前档用品牌浅底。
  assert.match(section('valuation')!.querySelector('[data-band-caption]')!.textContent!, /橙点为现价/);
  const pills = section('valuation')!.querySelector('[data-grade-pills]')!;
  assert.deepEqual([...pills.querySelectorAll('.tag')].map(item => item.textContent), ['明显低估', '偏低', '合理', '偏高', '明显高估']);
  assert.equal(pills.querySelectorAll('.tone-brand').length, 1);
  assert.equal(pills.querySelector('.tone-brand')!.textContent, '合理');
  // 节标题右侧写口径：年报与行情日期。
  assert.equal(section('business')!.querySelector('.panel-meta')!.textContent, '2025 年报');
  assert.match(section('valuation')!.querySelector('.panel-meta')!.textContent!, /\d+ 月 \d+ 日/);
  assert.match(section('valuation')!.querySelector('[data-key-numbers]')!.textContent!, /同业中位 \d/);
  assert.match(section('valuation')!.textContent!, /什么情况会改判断/);
  const band = section('valuation')!.querySelector('[data-chart="band"]')!;
  assert.equal(band.querySelectorAll('.narrative-band-tick').length, 3);
  assert.ok(band.querySelector('[data-band-price]'));
  assert.equal(band.querySelector('[data-band-adjusted]'), null);
  assert.match(band.textContent!, /悲观[\s\S]*3\.45[\s\S]*中性[\s\S]*5\.19[\s\S]*乐观[\s\S]*7\.21/);
  assert.match(band.querySelector('[data-tier="中性"]')!.textContent!, /每股收益 0\.34 元\/股 → 15\.13 倍 → 5\.19 元\/股/);
  // 页面不露内部键名，不再平铺指标墙。
  assert.doesNotMatch(container.textContent!, /field_id|source_ref|lens:|driver:|leveraged_cyclical|basisVersion|这项数据/);
  assert.equal(container.querySelectorAll('[data-company-section="business"] .metric').length >= 3, true);
});

test('跟踪卡：每个支柱一张，状态按 direction 由页面判断；旧研究缺 direction 显示状态待定；点开看支柱与证伪条件', async () => {
  const research = directed(huaneng.research.research);
  const fixture = services({ packet: huaneng.packet, research, scenario: packetModule.scenarioTable(huaneng.scenarioResult) });
  await mount(fixture);
  const cards = [...container.querySelectorAll('[data-pillar]')];
  assert.equal(cards.length, 5);
  // p1 是同比类警戒线（跌破 -5%），当前值取年内累计同比镜头（-5.8%）：越线且窗口（三季报）未到，打折扣。
  assert.deepEqual(cards.map(card => card.getAttribute('data-track-state')), ['打折扣', '更稳', '更稳', '更稳', '更稳']);
  const p2 = container.querySelector('[data-pillar="p2"]')!.textContent!;
  assert.match(p2, /毛利率/);
  assert.match(p2, /23\.15 %/);
  assert.match(p2, /警戒 跌破 20\.00 % · FY2026年报/);
  const p1 = container.querySelector('[data-pillar="p1"]')!.textContent!;
  assert.match(p1, /营业收入同比/);
  assert.match(p1, /-5\.80 %/);
  assert.match(p1, /警戒 跌破 同比 -5\.00% · /);
  assert.equal(container.querySelectorAll('[data-pillar] .status-pill').length, 5);
  assert.equal(container.querySelector('[data-pillar="p1"] .status-pill')!.textContent, '打折扣');
  // 点开看支柱与不成立的条件；默认收起。
  const p5 = container.querySelector('[data-pillar="p5"]')!;
  assert.equal(p5.querySelector('.narrative-track-more'), null);
  await React.act(async () => { (p5.querySelector('.narrative-track-head') as HTMLElement).click(); });
  assert.match(p5.querySelector('.narrative-track-more')!.textContent!, /支柱：.*不成立的条件：/);
  // 没有年内累计同比镜头时，同比类警戒线当前值暂缺、状态待定。
  const bare = structuredClone(huaneng.packet);
  delete bare.lenses.ytd_yoy;
  await mount(services({ packet: bare, research, scenario: packetModule.scenarioTable(huaneng.scenarioResult) }));
  assert.equal(container.querySelector('[data-pillar="p1"]')!.getAttribute('data-track-state'), null);
  assert.match(container.querySelector('[data-pillar="p1"]')!.textContent!, /暂缺[\s\S]*状态待定|状态待定[\s\S]*暂缺/);
  // 旧研究没有 direction：不按措辞猜，全部状态待定，悬停说明原因；警戒线不加「跌破」。
  await mount(services({ packet: huaneng.packet, research: huaneng.research.research }));
  const legacyCards = [...container.querySelectorAll('[data-pillar]')];
  assert.deepEqual(legacyCards.map(card => card.getAttribute('data-track-state')), [null, null, null, null, null]);
  assert.deepEqual(legacyCards.map(card => card.querySelector('.status-pill')!.textContent), Array(5).fill('状态待定'));
  assert.equal(legacyCards[1]!.querySelector('.status-pill')!.parentElement!.getAttribute('title'), '研究没有写明越线方向');
  assert.doesNotMatch(legacyCards[1]!.textContent!, /跌破|突破/);
  await mount(fixture);
  // 阈值被页面判成越线时：窗口未到打折扣，窗口已过不成立；向上的线按 up 判。
  const worse = directed(huaneng.research.research);
  worse.falsifiers[1].threshold = { kind: 'level', direction: 'down', value: '30', unit: '%' };
  worse.falsifiers[2] = { ...worse.falsifiers[2], threshold: { kind: 'level', direction: 'down', value: '3', unit: '倍' }, window: '2025-12-31' };
  worse.falsifiers[3] = { ...worse.falsifiers[3], threshold: { ...worse.falsifiers[3].threshold, direction: 'up', value: '0.1' } };
  await mount(services({ packet: huaneng.packet, research: worse }));
  assert.equal(container.querySelector('[data-pillar="p2"]')!.getAttribute('data-track-state'), '打折扣');
  assert.equal(container.querySelector('[data-pillar="p3"]')!.getAttribute('data-track-state'), '不成立');
  assert.equal(container.querySelector('[data-pillar="p4"]')!.getAttribute('data-track-state'), '打折扣');
  assert.match(container.querySelector('[data-pillar="p4"]')!.textContent!, /突破/);
  assert.match(container.querySelector('[data-pillar="p3"] .status-pill')!.textContent!, /不成立/);
});

test('缺口研究与无研究：数据照常显示，只留应有的节', async () => {
  await mount(services({ packet: huaneng.packet, research: null }));
  assert.equal(section('tracking'), null);
  assert.ok(section('business')!.querySelector('[data-key-numbers]'));
  assert.equal(section('business')!.querySelector('[data-company-summary]'), null);
  assert.match(section('thesis')!.textContent!, /论点/);
  await mount(services({ packet: huaneng.packet, research: { companyType: 'bank', gapNote: '核心字段暂不可用', researchedAt: '2026-10-12T08:00:00+00:00' } }));
  assert.match(section('thesis')!.textContent!, /核心字段暂不可用/);
  assert.equal(container.querySelector('[data-change-line]'), null);
});

// ------------------------------------------------------------------ 页面：神火关键变量

function shenhuoResearch() {
  const research = structuredClone(huaneng.research.research);
  research.thesis = '铝价与氧化铝价差决定利润';
  research.sections.variables = { summary: '铝价每涨一千，归母净利约增加{calc:' + sensitivityRef + '.rule_of_thumb.0.profit_delta}', fieldIds: ['net_profit_attributable'], calculationRefs: [sensitivityRef] };
  research.sections.profit_formula = { summary: '利润随铝价上升、氧化铝价下降而增加', fieldIds: [] };
  research.valuation.scenarioRef = scenarioRef;
  research.sensitivity = { resultRef: sensitivityRef, drivers: [
    { var_id: 'cmdty:SHFE.AL', name: '沪铝', quote: '受电解铝、煤炭产品售价同比上涨、主要原材料氧化铝价格同比下降等因素影响', origin: 'report' },
    { var_id: 'cmdty:SHFE.AO', name: '氧化铝', origin: 'conversation', sessionId: 'session-7f3a', confirmedAt: '2026-10-12T07:55:00+00:00' },
  ] };
  research.changes = { valuation: '铝价下调后重算中性价' };
  return research;
}
const shenhuoServices = (extra: Partial<Parameters<typeof services>[0]> = {}) => services({
  packet: huaneng.packet, research: shenhuoResearch(), quote: quote(Number(shenhuo.quote.price)),
  results: { [sensitivityRef]: shenhuo.sensitivityResult }, scenario: packetModule.scenarioTable(shenhuo.scenarioResult), ...extra,
});

test('神火关键变量：公式行、滑块按真实单位，滑轨标参考价；初始值为当前值', async () => {
  await mount(shenhuoServices(), '000933', '神火股份');
  const variables = section('variables')!;
  assert.match(variables.querySelector('[data-company-summary]')!.textContent!, /铝价每涨一千，归母净利约增加\s*9\.96 亿元/);
  assert.equal(variables.querySelector('.narrative-slot')!.getAttribute('title'), '来源 计算凭据');
  const formula = variables.querySelector('[data-formula]')!.textContent!;
  assert.match(formula, /年化归母净利 ≈ 基数/);
  assert.match(formula, /沪铝[\s\S]*每 \+1,000 元\/吨，归母净利 \+9\.96 亿元/);
  assert.match(formula, /氧化铝[\s\S]*每 \+100 元\/吨，归母净利 -1\.92 亿元/);
  const inputs = [...variables.querySelectorAll('input[type="range"]')] as HTMLInputElement[];
  assert.equal(inputs.length, 3);
  assert.deepEqual(inputs.map(input => [input.min, input.max, input.step, input.value]), [['20000', '28000', '50', '23465'], ['2500', '4500', '10', '3150'], ['450', '850', '5', '655']]);
  const al = variables.querySelector('[data-variable="cmdty:SHFE.AL"]')!;
  // 样张：名称后小字写来源与今天价，右侧写取值与较基数期均价的差；滑轨下方标基数期均价；两端是范围。
  assert.match(al.querySelector('.narrative-slider-head')!.textContent!, /沪铝[\s\S]*今天 23,465 元\/吨/);
  assert.match(al.querySelector('.narrative-slider-value strong')!.textContent!, /23,465 元\/吨/);
  assert.equal(al.querySelector('.narrative-slider-value small')!.textContent, '较基数期均价 -956');
  assert.ok(al.querySelector('.narrative-slider-value small.is-down'));
  assert.match(al.querySelector('.narrative-anchor-label')!.textContent!, /▲ 基数期均价 24,421 元\/吨/);
  assert.deepEqual([...al.querySelectorAll('.narrative-slider-foot span')].map(item => item.textContent), ['20,000 元/吨', '28,000 元/吨']);
  assert.ok(al.querySelector('[data-anchor]') && al.querySelector('[data-today]'));
  assert.notEqual(al.querySelector('[data-anchor]')!.getAttribute('style'), al.querySelector('[data-today]')!.getAttribute('style'));
  // 公司自述集中在一个框里，不再挂在每个滑块下。
  const says = variables.querySelector('[data-company-says]')!;
  assert.match(says.textContent!, /公司自己说[\s\S]*「受电解铝、煤炭产品售价同比上涨/);
  assert.equal(al.querySelector('.narrative-quote'), null);
  assert.deepEqual([...variables.querySelectorAll('.narrative-slider-actions button')].map(item => item.textContent), ['回到今天价格', '回到基数期均价']);
  const result = variables.querySelector('[data-result]')!.textContent!;
  assert.match(result, /年化归母净利（估算）\s*92\.38 亿元/);
  assert.match(result, /相对基数 -3\.24 亿元/);
  assert.match(result, /基数：2026 上半年 × 2/);
  assert.match(variables.querySelector('.narrative-result-pair')!.textContent!, /对应每股收益[\s\S]*现价 52\.67 元对应市盈率/);
  assert.equal(variables.closest('[data-company-section]')!.querySelector('.panel-meta')!.textContent, '基数：2026 上半年 × 2');
  assert.match(variables.querySelector('[data-eps]')!.textContent!, /4\.11 元\/股/);
  assert.match(variables.querySelector('[data-pe]')!.textContent!, /12\.8 倍/);
  const initial = [...variables.querySelectorAll('.narrative-contrib li')].map(item => item.textContent!);
  assert.match(initial[0]!, /沪铝-9\.52 亿元/);
  assert.match(initial[1]!, /氧化铝\+6\.34 亿元/);
  assert.match(variables.textContent!, /氧化铝单耗 1\.93 吨/);
  assert.equal(variables.querySelector('[data-chart="quarters"]'), null);
});

test('拖动滑块：利润、贡献正负条、每股收益、现价对应市盈率实时变化，估值区间带出现空心点；恢复当前值', async () => {
  await mount(shenhuoServices(), '000933', '神火股份');
  const variables = section('variables')!;
  const valuation = section('valuation')!;
  assert.equal(valuation.querySelector('[data-band-adjusted]'), null);
  const al = variables.querySelector('[data-variable="cmdty:SHFE.AL"] input')!;
  await slide(al, 25000);
  assert.match(variables.querySelector('[data-profit]')!.textContent!, /107\.67 亿元/);
  assert.match(variables.querySelector('[data-result]')!.textContent!, /相对基数 \+12\.05 亿元/);
  assert.match(variables.querySelector('[data-eps]')!.textContent!, /4\.79 元\/股/);
  assert.match(variables.querySelector('[data-pe]')!.textContent!, /11\.0 倍/);
  const contribution = [...variables.querySelectorAll('.narrative-contrib li')].map(item => item.textContent);
  assert.match(contribution[0]!, /沪铝\+5\.77 亿元/);
  assert.ok(variables.querySelector('.narrative-contrib-track .is-up'));
  const adjusted = valuation.querySelector('[data-band-adjusted]')!;
  assert.match(adjusted.getAttribute('title')!, /调整后的中性价 57\.45 元\/股/);
  // 氧化铝涨价使利润下降，贡献条为绿。
  await slide(variables.querySelector('[data-variable="cmdty:SHFE.AO"] input')!, 3900);
  assert.match([...variables.querySelectorAll('.narrative-contrib li')][1]!.textContent!, /氧化铝-8\.06 亿元/);
  assert.ok(variables.querySelector('.narrative-contrib-track .is-down'));
  assert.match(variables.querySelector('[data-profit]')!.textContent!, /93\.27 亿元/);
  // 回到基数期均价：利润回到基数，滑块在 anchor；回到今天价格：滑块回到今天，利润回到 profit_at_current。
  await React.act(async () => { (variables.querySelector('[data-reset="anchor"]') as HTMLElement).click(); });
  assert.match(variables.querySelector('[data-profit]')!.textContent!, /95\.62 亿元/);
  assert.match(variables.querySelector('[data-result]')!.textContent!, /与基数一致/);
  assert.deepEqual([...variables.querySelectorAll('input[type="range"]')].map(input => (input as HTMLInputElement).value), ['24421', '3480', '690']);
  assert.match(variables.querySelector('.narrative-slider-value small')!.textContent!, /与基数期均价持平/);
  await React.act(async () => { (variables.querySelector('[data-reset="today"]') as HTMLElement).click(); });
  assert.match(variables.querySelector('[data-profit]')!.textContent!, /92\.38 亿元/);
  assert.deepEqual([...variables.querySelectorAll('input[type="range"]')].map(input => (input as HTMLInputElement).value), ['23465', '3150', '655']);
  assert.equal(valuation.querySelector('[data-band-adjusted]'), null);
});

test('神火估值：每档变量取值 → 利润 → 倍数 → 目标价；回答句外另给现价隐含变量', async () => {
  await mount(shenhuoServices(), '000933', '神火股份');
  const valuation = section('valuation')!;
  const rows = [...valuation.querySelectorAll('[data-tier]')].map(item => item.textContent!);
  assert.equal(rows.length, 3);
  assert.match(rows[0]!, /悲观.*沪铝 21,000 元\/吨 → 利润 62\.94 亿元 → 9 倍（周期低点利润配低倍数） → 25\.19 元\/股/);
  assert.match(rows[1]!, /中性.*沪铝 23,500 元\/吨 → 利润 92\.73 亿元 → 12 倍（行业中枢倍数） → 49\.48 元\/股/);
  assert.match(rows[2]!, /乐观.*利润 115\.59 亿元 → 14 倍.* → 71\.96 元\/股/);
  assert.equal(valuation.querySelector('[data-grade-pills]')!.getAttribute('data-grade-pills'), '合理');
  assert.match(valuation.querySelector('[data-implied]')!.textContent!, /按中性倍数 12\.0 倍，现价相当于市场在赌沪铝约 24,100 元\/吨/);
  assert.ok(valuation.querySelector('[data-band-price]'));
  assert.equal(valuation.querySelectorAll('[data-key-numbers] .metric').length <= 3, true);
});

test('对话写回：变化处悬停显示来源对话与时间；撤回调用 revert 并重读，失败给一句话', async () => {
  let reverts = 0;
  let failing = false;
  const versions: (string | undefined)[] = [];
  const fixture = shenhuoServices({ revert: async (_symbol, version) => { reverts += 1; versions.push(version); if (failing) throw new Error('down'); },
    envelope: { researchVersion: 'rv-7', canRevert: true, changedFrom: { origin: 'conversation', sessionId: 'session-7f3a', confirmedAt: '2026-10-12T07:55:00+00:00', reason: '用户讨论：铝价跌到 21000 时的影响' } } });
  let reads = 0;
  const original = fixture.services.readResearch;
  fixture.services.readResearch = async symbol => { reads += 1; return original(symbol); };
  await mount(fixture, '000933', '神火股份');
  const line = container.querySelector('[data-change-line]')!;
  assert.match(line.textContent!, /10-12 更新：铝价下调后重算中性价/);
  assert.equal(line.querySelector('[data-change-hint]')!.getAttribute('title'), '来自对话确认 · 2026-10-12 · 会话 session-7f3a · 用户讨论：铝价跌到 21000 时的影响');
  const origin = section('variables')!.querySelector('[data-variable="cmdty:SHFE.AO"] .narrative-origin')!;
  assert.equal(origin.getAttribute('title'), '来自对话确认 · 2026-10-12 · 会话 session-7f3a');
  assert.match(origin.textContent!, /对话确认 · 2026-10-12/);
  assert.equal(section('variables')!.querySelector('[data-variable="cmdty:SHFE.AL"] .narrative-origin'), null);
  const before = reads;
  failing = true;
  await React.act(async () => { (line.querySelector('button') as HTMLElement).click(); await new Promise(resolve => setTimeout(resolve, 5)); });
  assert.equal(reverts, 1);
  assert.match(line.textContent!, /撤回没有成功/);
  assert.equal(reads, before, '撤回失败不重读');
  failing = false;
  await React.act(async () => { (line.querySelector('button') as HTMLElement).click(); await new Promise(resolve => setTimeout(resolve, 10)); });
  assert.equal(reverts, 2);
  assert.deepEqual(versions, ['rv-7', 'rv-7'], '撤回带上读到的研究版本，防并发覆盖');
  assert.ok(reads > before, '撤回成功后重读研究');
  assert.doesNotMatch(line.textContent!, /撤回没有成功/);
});

test('Backend 说没有上一版可恢复时不显示撤回', async () => {
  await mount(shenhuoServices({ envelope: { researchVersion: 'rv-1', canRevert: false } }), '000933', '神火股份');
  assert.equal(container.querySelector('[data-change-line] button'), null);
  assert.ok(container.querySelector('[data-change-line]'));
});

test('凭据缺基数期均价：该变量不可拖、贡献显示暂缺、不计入利润，不退回今天价', async () => {
  const raw = structuredClone(shenhuo.sensitivityResult);
  const variables = raw.payload.calculation.extra.variables;
  delete variables[1].anchor;
  variables[1].reference = '3480';
  await mount(shenhuoServices({ results: { [sensitivityRef]: raw } }), '000933', '神火股份');
  const panel = section('variables')!;
  const ao = panel.querySelector('[data-variable="cmdty:SHFE.AO"]')!;
  assert.ok(ao.hasAttribute('data-anchor-gap'));
  assert.equal((ao.querySelector('input') as HTMLInputElement).disabled, true);
  assert.match(ao.querySelector('.narrative-slider-value small')!.textContent!, /基数期均价暂缺，不可拖/);
  assert.equal(ao.querySelector('[data-anchor]'), null);
  assert.equal(ao.querySelector('.narrative-anchor-label'), null);
  assert.equal(ao.querySelector('[data-today]') != null, true);
  assert.match([...panel.querySelectorAll('.narrative-contrib li')][1]!.textContent!, /氧化铝暂缺/);
  // 利润只含有 anchor 的两个变量：基数 95.62 − 9.52（沪铝，今天）− 0.05（煤炭）≈ 86.05。
  assert.match(panel.querySelector('[data-profit]')!.textContent!, /86\.0\d 亿元/);
  assert.equal(((panel.querySelector('[data-variable="cmdty:SHFE.AL"] input') as HTMLInputElement).disabled), false);
  assert.equal((panel.querySelector('[data-reset="anchor"]') as HTMLButtonElement).disabled, false);
});

test('读不到敏感性凭据时回到单季柱图；未知占位显示暂缺且不露键名', async () => {
  const research = shenhuoResearch();
  research.sections.variables.summary = '铝价每涨一千约增加{calc:' + sensitivityRef + '.rule_of_thumb.0.profit_delta}，{mystery_metric}暂缺';
  await mount(services({ packet: huaneng.packet, research, quote: quote(5.21), scenario: packetModule.scenarioTable(huaneng.scenarioResult) }));
  const variables = section('variables')!;
  assert.equal(variables.querySelector('input[type="range"]'), null);
  assert.ok(variables.querySelector('[data-chart="quarters"]'));
  assert.equal(variables.querySelectorAll('.narrative-slot.is-gap').length, 2);
  assert.doesNotMatch(variables.textContent!, /mystery_metric|rule_of_thumb|result:/);
});

// ------------------------------------------------------------------ 接口与路由

test('服务：readResult 读回计算凭据；撤回走 POST …/page-research/revert；代理放行并带授权头', async t => {
  const originalFetch = globalThis.fetch;
  const calls: { path: string; method: string; body?: string }[] = [];
  globalThis.fetch = async (input, init) => {
    const url = new URL(String(input), 'http://fixture');
    calls.push({ path: url.pathname, method: init?.method ?? 'GET', ...(init?.body ? { body: String(init.body) } : {}) });
    if (url.pathname.endsWith('/revert')) return Response.json({ saved: true });
    return url.pathname.includes(sensitivityRef.replace('result:', '')) ? Response.json(shenhuo.sensitivityResult) : Response.json({ detail: 'missing' }, { status: 404 });
  };
  try {
    const built = serviceModule.createCompanyPageServices({ taskRunning: () => false });
    const read = await built.readResult(sensitivityRef);
    assert.equal(read.result_id, sensitivityRef);
    assert.equal(await built.readResult('result:' + 'f'.repeat(32)), null);
    assert.equal(await built.readResult('not-a-ref'), null);
    await built.revertResearch('000933', 'rv-7');
    assert.deepEqual(calls.at(-1), { path: '/finance-research/wiki/companies/000933.SZ/page-research/revert', method: 'POST', body: '{"expectedResearchVersion":"rv-7"}' });
    await built.revertResearch('000933');
    assert.equal(calls.at(-1)!.body, '{}');
    await assert.rejects(built.revertResearch('AAPL'), /A 股/);
  } finally { globalThis.fetch = originalFetch; t.mock.reset(); }
  assert.equal(researchRoute('POST', '/wiki/companies/000933.SZ/page-research/revert'), true);
  assert.equal(researchRoute('GET', '/wiki/companies/000933.SZ/page-research/revert'), false);
  assert.equal(researchRoute('POST', '/wiki/companies/000933/page-research/revert'), false);
  assert.equal(researchRoute('POST', '/wiki/companies/000933.SZ/page-research'), false);
  assert.equal(researchRoute('POST', '/wiki/companies/../x/page-research/revert'), false);
});
