// 财报到达对账卡：神火式（价格模型）、宁德式（条件变量没算进去）、农行式（无价格模型）三种；14 天窗口；动态页呈现与展开。
import assert from 'node:assert/strict';
import test, { before, after } from 'node:test';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { createServer as createHttpServer } from 'node:http';
import { createServer } from 'vite';
import * as React from 'react';
import { Window } from 'happy-dom';

const trackingFixture = JSON.parse(readFileSync(new URL('./fixtures/tracking_variables.json', import.meta.url), 'utf8'));
/** Stock `quarter-reconciliation` 对神火冻结数据（2026Q3 单季 27.05 亿）的真实输出。 */
const shenhuo = JSON.parse(readFileSync(new URL('./fixtures/quarter_recon_shenhuo.json', import.meta.url), 'utf8'));
const NOW = new Date('2026-10-21T04:00:00Z');

let server: Awaited<ReturnType<typeof createServer>>, win: Window, root: ReturnType<typeof import('react-dom/client')['createRoot']>, container: HTMLElement;
let lib: Record<string, any>, desk: Record<string, any>, router: Record<string, any>, pageContext: Record<string, any>, sessionModule: Record<string, any>;
const previous = { window: globalThis.window, document: globalThis.document, fetch: globalThis.fetch, IS_REACT_ACT_ENVIRONMENT: globalThis.IS_REACT_ACT_ENVIRONMENT };
before(async () => {
  win = new Window();
  Object.assign(globalThis, { window: win, document: win.document, IS_REACT_ACT_ENVIRONMENT: true });
  server = await createServer({ configFile: false, root: fileURLToPath(new URL('../', import.meta.url)),
    resolve: { alias: { '@': fileURLToPath(new URL('../src/verticals/finance', import.meta.url)) } },
    server: { middlewareMode: true, hmr: { server: createHttpServer() }, watch: null }, appType: 'custom',
    ssr: { noExternal: ['react-router-dom', 'react-router'], resolve: { conditions: ['module-sync', 'node', 'import', 'development'] } } });
  lib = await server.ssrLoadModule('/src/verticals/finance/lib/quarterRecon.ts');
  desk = await server.ssrLoadModule('/src/verticals/finance/pages/VariableDesk.tsx');
  sessionModule = await server.ssrLoadModule('/src/verticals/finance/dsh/research-session.tsx');
  router = await server.ssrLoadModule('react-router-dom');
  pageContext = await server.ssrLoadModule('/src/core/ai/pageContext.tsx');
  container = win.document.createElement('div') as unknown as HTMLElement;
  win.document.body.append(container);
  root = (await import('react-dom/client')).createRoot(container);
});
after(async () => { await React.act(async () => root?.unmount()); await server?.close(); win?.happyDOM.abort(); Object.assign(globalThis, previous); });

const names = { '000933.SZ': '神火', '300750.SZ': '宁德时代', '601288.SH': '农业银行' };
const ningde = { symbol: '300750.SZ', status: 'ok', period: '2026Q2', previous_period: '2026Q1', actual: '22546292000', previous: '20737710000', change: '1808582000', reported_on: '2026-10-20',
  variables: [], unexplained: ['动力电池系统销售均价', '储能电池系统销售均价'], price_total: null, rest: null };
const nongxing = { symbol: '601288.SH', status: 'ok', period: '2026Q3', previous_period: '2026Q2', actual: '70000000000', previous: '72500000000', change: '-2500000000', reported_on: '2026-10-20',
  variables: [], unexplained: [], price_total: null, rest: null };

test('神火式：第一层一句话写单季与环比差额，半句写价格带来多少、其余来自量和成本等；展开逐项给均价与贡献', () => {
  const [card] = lib.reconCards([shenhuo], names, NOW);
  assert.equal(card.headline, '神火三季报：单季净利润 27.05 亿元，比上季多 2.14 亿元');
  assert.equal(card.explain, '沪铝、氧化铝变化约带来 -1.05 亿元，其余 +3.19 亿元来自量和成本等，报告未单独披露');
  assert.match(card.details[0], /^沪铝：本季均价 [\d,.]+，上季 [\d,.]+ 元\/吨，约带来 -1\.50 亿元$/);
  assert.match(card.details[1], /^氧化铝：.*约带来 \+0\.45 亿元$/);
  assert.match(card.details.join('\n'), /没有算进价格部分：无烟煤价格/);
  assert.match(card.details.at(-1), /只解释环比变化，不代表准确度/);
  assert.doesNotMatch(JSON.stringify(card), /买入|卖出|建议|准确率|undefined|NaN/);
  // 解释的价格部分与其余加起来就是环比差额（亿元，两位小数内）。
  assert.ok(Math.abs(Number(shenhuo.price_total) + Number(shenhuo.rest) - Number(shenhuo.change)) < 1);
});

test('宁德式：条件变量没算进去，只写差额并说明；农行式：无价格模型只写与上季差额，少了写“少”', () => {
  const [a] = lib.reconCards([ningde], names, NOW);
  assert.equal(a.headline, '宁德时代半年报：单季净利润 225.46 亿元，比上季多 18.09 亿元');
  assert.equal(a.explain, undefined);
  assert.match(a.details[0], /没有算进价格部分：动力电池系统销售均价、储能电池系统销售均价/);
  const [b] = lib.reconCards([nongxing], names, NOW);
  assert.equal(b.headline, '农业银行三季报：单季净利润 700.00 亿元，比上季少 25.00 亿元');
  assert.deepEqual([b.explain, b.details], [undefined, []]);
});

test('披露前走势：个股与板块涨跌写在展开末行；有财报后机构预测再加一句；不写好于差于预期', () => {
  const item = { ...nongxing, pre_disclosure: { start: '2026-07-28', end: '2026-10-17', days: 60, stock_change: '0.123', industry_name: '工业金属', industry_change: '-0.045', gap: null },
    forecast: { pre_report: false, basis_note: '三季报后 1 家机构', period: 'FY2026E', value: '4.302' } };
  const [card] = lib.reconCards([item], names, NOW);
  assert.match(card.details.join('\n'), /披露前约 60 个交易日，农业银行股价涨 12\.3%，同期工业金属跌 4\.5%；业绩变化可能已部分反映在股价里/);
  assert.match(card.details.join('\n'), /三季报后 1 家机构：2026 年预测每股 4\.30 元/);
  assert.doesNotMatch(card.details.join('\n'), /好于|差于|预期/);
  const [plain] = lib.reconCards([{ ...nongxing, pre_disclosure: { stock_change: null, gap: '个股日线暂时取不到' } }], names, NOW);
  assert.doesNotMatch(plain.details.join('\n'), /披露前约 60/);
});

test('只看披露日：最近 14 天内披露就出卡；缺口、日期不明、读不到名字都不报错', () => {
  const at = (day: string) => lib.reconCards([{ ...nongxing, reported_on: day }], names, NOW).length;
  assert.equal(at('2026-10-20'), 1);
  assert.equal(at('2026-10-07'), 1, '第 14 天');
  assert.equal(at('2026-10-06'), 0, '超过 14 天');
  assert.equal(at('2026-10-23'), 0, '日期在未来太多不出');
  assert.equal(lib.reconCards([{ ...nongxing, status: 'error' }, { ...nongxing, status: 'gap', reason: '还没有研究' }, { ...nongxing, reported_on: null }], names, NOW).length, 0);
  assert.equal(lib.reconCards([nongxing], {}, NOW)[0].headline.startsWith('601288三季报'), true, '没有名字时用代码，不空');
  assert.equal(lib.reconLabel('2026Q1'), '一季报');
});

const sessions = { start: async () => ({ sessionId: 's', status: 'started' }) };
async function show(loadRecon: () => Promise<unknown[]>, loadFlips: () => Promise<unknown[]> = async () => []) {
  await React.act(async () => root.render(null));
  await React.act(async () => root.render(React.createElement(router.MemoryRouter, null, React.createElement(sessionModule.ResearchSessionContext.Provider, { value: sessions },
    React.createElement(pageContext.AiPageProvider, {}, React.createElement(desk.VariableDesk, { load: async () => structuredClone(trackingFixture), loadFlips, loadRecon, loadFilings: async () => ({ rows: [], hidden: 0 }) }))))));
  await React.act(async () => { await new Promise(resolve => setTimeout(resolve, 5)); });
  await React.act(async () => {});
}

test('动态流：判断变化置顶，财报按披露日排在价格卡之前，不描边；展开看逐项；没有新季报时整块不出现；读取失败不影响其余', async () => {
  const cards = lib.reconCards([shenhuo, nongxing], names, NOW);
  const flip = { symbol: '000933.SZ', company: '神火', kind: 'near', text: '沪铝距 22,500 元/吨 只差 0.9%，越过后神火估值会从合理变为偏高' };
  await show(async () => cards, async () => [flip]);
  const types = [...container.querySelectorAll('[data-stream-card]')].map(card => card.getAttribute('data-stream-type'));
  assert.deepEqual(types, ['判断变化', '财报', '财报', '价格']);
  const recon = container;
  assert.equal(recon.querySelectorAll('.card-alert').length, 0, '对账卡不抢描边');
  assert.equal(recon.querySelectorAll('[data-recon-card]').length, 2);
  assert.equal(recon.querySelector('[data-recon-card="000933.SZ"] .variable-card-title')!.textContent, '神火三季报：单季净利润 27.05 亿元，比上季多 2.14 亿元');
  assert.match(recon.querySelector('[data-recon-card="000933.SZ"] .variable-card-touch')!.textContent!, /^涉及：神火 · 利润 · .*报告未单独披露/);
  assert.match(recon.querySelector('[data-recon-card="601288.SH"] .variable-card-touch')!.textContent!, /^涉及：.*· 利润 · /, '没有价格模型也有涉及一行');
  assert.equal([...recon.querySelectorAll('[data-recon-card="601288.SH"] button')].some(button => button.textContent === '展开'), false, '没有明细就没有展开');
  assert.ok([...recon.querySelectorAll('[data-recon-card="000933.SZ"] button')].some(button => button.textContent === '讨论'), '对账卡有讨论');
  assert.equal(recon.querySelector('[data-recon-card="000933.SZ"] .variable-card-effects'), null);
  await React.act(async () => ([...recon.querySelectorAll('[data-recon-card="000933.SZ"] button')].find(button => button.textContent === '展开') as HTMLButtonElement).click());
  assert.match(recon.querySelector('[data-recon-card="000933.SZ"] .variable-card-effects')!.textContent!, /沪铝：本季均价/);
  assert.equal(recon.querySelector('[data-recon-card="000933.SZ"] a')!.getAttribute('href'), '/watch/000933');
  await show(async () => []);
  assert.equal(container.querySelector('[data-recon-card]'), null);
  await show(async () => { throw new Error('boom'); });
  assert.equal(container.querySelector('[data-recon-card]'), null);
  assert.ok(container.querySelector('[data-variable-card]'), '价格变动卡照常');
});

test('loadReconCards：并发读各关注公司，跳过没研究的，读不到的公司不出卡，名字取自变量接口或行情', async () => {
  const requested: string[] = [];
  globalThis.fetch = (async (url: string) => {
    const path = String(url);
    requested.push(path);
    if (path.includes('client/watch')) return Response.json({ symbols: ['000933', '300750', '601288', '601899'] });
    if (path.endsWith('/000933.SZ/quarter-reconciliation')) return Response.json(shenhuo);
    if (path.endsWith('/300750.SZ/quarter-reconciliation')) return Response.json({ symbol: '300750.SZ', status: 'gap', reason: '还没有研究' });
    if (path.endsWith('/601288.SH/quarter-reconciliation')) return Response.json({ ...nongxing, symbol: '601288.SH' });
    return Response.json({ detail: 'x' }, { status: 404 });
  }) as typeof fetch;
  const data = structuredClone(trackingFixture);
  data.coverage.unresearched = ['601899.SH'];
  const result = await lib.loadReconCards(data, undefined, NOW);
  assert.deepEqual(result.map((card: any) => card.symbol), ['000933.SZ', '601288.SH']);
  assert.equal(requested.some(path => path.includes('601899')), false, '没研究的公司不请求');
  assert.ok(requested.every(path => !/ensure|startResearch|POST/.test(path)), '只读');
  assert.equal(result[0].headline.startsWith('神火三季报'), true);
  assert.equal(await lib.loadReconCards(null, undefined, NOW).then((items: unknown[]) => items.length), 0);
});

// ------------------------------------------------------------------ 出卡条件修正：只看披露日，研究是否已用上这份季报不影响

const real11 = JSON.parse(readFileSync(new URL('./fixtures/recon_real_11.json', import.meta.url), 'utf8')).companies as any[];
const allNames = Object.fromEntries(real11.map(item => [item.symbol, item.name.replace(/股份$/, '')]));

test('神火研究已经用上三季报（TTM:2026Q3）仍出卡，价格部分照算', () => {
  const item = real11.find(row => row.symbol === '000933.SZ');
  assert.equal(item.status, 'ok');
  assert.ok(item.variables.length > 0 && item.price_total != null, '真实输出里神火有价格部分');
  const [card] = lib.reconCards([item], allNames, NOW);
  assert.equal(card.headline, '神火三季报：单季净利润 27.05 亿元，比上季多 2.14 亿元');
  assert.match(card.explain, /变化约带来 [+-][\d.]+ 亿元，其余 [+-][\d.]+ 亿元来自量和成本等，报告未单独披露/);
});

test('11 家真实输出：披露后 14 天内每家都出卡且不空不报错；超过 14 天一家都不出；无敏感性的只写差额', () => {
  assert.equal(real11.length, 11);
  assert.ok(real11.every(item => item.status === 'ok' && item.reported_on), '每家都有披露日');
  for (const item of real11) {
    const day = new Date(`${item.reported_on}T04:00:00Z`);
    const inside = new Date(day.getTime() + 3 * 86400000), outside = new Date(day.getTime() + 20 * 86400000);
    const cards = lib.reconCards([item], allNames, inside);
    assert.equal(cards.length, 1, item.symbol);
    const [card] = cards;
    assert.match(card.headline, /^.+(一季报|半年报|三季报|年报)：单季净利润 [\d,.]+ 亿元，比上季(多|少) [\d,.]+ 亿元$/, item.symbol);
    assert.doesNotMatch(JSON.stringify(card), /undefined|NaN|null|归母/, item.symbol);
    assert.equal(Boolean(card.explain), (item.variables ?? []).length > 0 && item.price_total != null, `${item.symbol} 有价格部分才有解释半句`);
    if (!item.variables?.length) assert.equal(card.explain, undefined, `${item.symbol} 无敏感性只写差额`);
    assert.equal(lib.reconCards([item], allNames, outside).length, 0, `${item.symbol} 超过 14 天不出`);
  }
  // 当天（2026-10-21）只有神火在窗口内。
  assert.deepEqual(lib.reconCards(real11, allNames, NOW).map((card: any) => card.symbol), ['000933.SZ']);
});

// ------------------------------------------------------------------ 5930 上对账卡没出现：Backend 每家要现拉行情，慢的十几秒，原先等全部读完才显示

const live = JSON.parse(readFileSync(new URL('./fixtures/recon_live_shenhuo.json', import.meta.url), 'utf8'));

test('5930 实际返回的神火对账（2026Q3，披露日 10-20）在窗口内出卡', () => {
  assert.equal(live.status, 'ok');
  const [card] = lib.reconCards([live], names, new Date('2026-10-21T04:00:00Z'));
  assert.equal(card.headline, '神火三季报：单季净利润 27.05 亿元，比上季多 2.14 亿元');
  assert.equal(lib.reconCards([live], names, new Date('2026-11-05T04:00:00Z')).length, 0, '过了 14 天不出');
});

test('loadReconCards 逐家到达就交出当前已有的卡，不等最慢的一家；中途取消不再回调', async () => {
  const gates: Record<string, () => void> = {};
  const slow = new Promise<void>(resolve => { gates['000933.SZ'] = resolve; });
  globalThis.fetch = (async (url: string) => {
    const route = String(url);
    if (route.includes('client/watch')) return Response.json({ symbols: ['000933', '601288', '300750'] });
    if (route.endsWith('/000933.SZ/quarter-reconciliation')) { await slow; return Response.json(live); }
    if (route.endsWith('/601288.SH/quarter-reconciliation')) return Response.json({ ...nongxing, symbol: '601288.SH' });
    if (route.endsWith('/300750.SZ/quarter-reconciliation')) return Response.json({ symbol: '300750.SZ', status: 'gap', reason: '还没有研究' });
    return Response.json({ detail: 'x' }, { status: 404 });
  }) as typeof fetch;
  const data = structuredClone(trackingFixture);
  data.coverage.unresearched = [];
  const seen: string[][] = [];
  const done = lib.loadReconCards(data, undefined, NOW, (cards: any[]) => seen.push(cards.map(card => card.symbol)));
  await new Promise(resolve => setTimeout(resolve, 20));
  assert.deepEqual(seen, [['601288.SH']], '慢的神火还没回来，先出农行');
  gates['000933.SZ']!();
  const result = await done;
  assert.deepEqual(result.map((card: any) => card.symbol), ['000933.SZ', '601288.SH'], '最终按关注顺序');
  assert.deepEqual(seen.at(-1), ['000933.SZ', '601288.SH']);
  // 已取消：不再回调。
  const controller = new AbortController();
  const late: string[][] = [];
  const pending = lib.loadReconCards(data, controller.signal, NOW, (cards: any[]) => late.push(cards.map(card => card.symbol)));
  controller.abort();
  await pending;
  assert.deepEqual(late, []);
});

// ------------------------------------------------------------------ 卡片主体全部来自利润表（毛利变化、费用、减值、投资收益、公允价值变动、税、少数股东），其他 = 环比 − 合计；价格单列不相加
// 华友、紫金、神火 2026Q3 的真实拆分（Stock 对 2026-10-26 新浪利润表的输出）。

const huayou = JSON.parse(readFileSync(new URL('./fixtures/quarter_recon_huayou.json', import.meta.url), 'utf8'));
const zijinItems = JSON.parse(readFileSync(new URL('./fixtures/quarter_recon_zijin_items.json', import.meta.url), 'utf8'));
const shenhuoItems = JSON.parse(readFileSync(new URL('./fixtures/quarter_recon_shenhuo_items.json', import.meta.url), 'utf8'));
const NOW_OCT26 = new Date('2026-10-26T04:00:00Z');
const YI = 1e8;

test('华友式：首句先说利润表里最大的一项（毛利变化），税与少数股东损益不做首句；展开逐项，合计加其他等于环比', () => {
  const [card] = lib.reconCards([{ ...huayou, symbol: '603799.SH', reported_on: '2026-10-24' }], { '603799.SH': '华友' }, NOW_OCT26);
  assert.equal(card.headline, '华友三季报：单季净利润 8.03 亿元，比上季少 2.07 亿元');
  assert.equal(card.explain, '最大的一项是毛利变化，影响 -13.04 亿元；其他（税金及附加、其他收益、营业外等）-0.08 亿元');
  const text = card.details.join('\n');
  assert.match(text, /毛利变化：本季 .+亿元，上季 .+亿元，对净利润的影响 -13\.04 亿元/);
  assert.match(text, /资产减值：本季 -9\.88 亿元，上季 -3\.05 亿元，对净利润的影响 -6\.83 亿元/);
  assert.match(text, /公允价值变动：.*对净利润的影响 \+2\.52 亿元/);
  assert.match(text, /少数股东损益：本季 \+2\.09 亿元，上季 \+10\.05 亿元，对净利润的影响 \+7\.96 亿元/);
  assert.ok(text.indexOf('毛利变化') < text.indexOf('资产减值') && text.indexOf('资产减值') < text.indexOf('销售费用'), '按影响大小排');
  assert.match(text, /其他（税金及附加、其他收益、营业外等）：-0\.08 亿元；以上各项加起来等于比上季的变化/);
  assert.match(card.details.at(-1), /价格影响与减值可能部分重叠，没有去重/);
  assert.doesNotMatch(JSON.stringify(card), /归母|买入|卖出|建议|undefined|NaN|null/);
});

test('三家真实回包：已列科目合计加其他等于环比（亿元两位小数内），华友、紫金的其他很小', () => {
  for (const item of [huayou, zijinItems, shenhuoItems]) {
    const sum = item.items.reduce((total: number, line: any) => total + Number(line.impact), 0);
    assert.ok(Math.abs(sum + Number(item.rest) - Number(item.change)) < 1, item.symbol);
    assert.ok(Math.abs(Number(item.items_total) - sum) < 1, item.symbol);
  }
  assert.ok(Math.abs(Number(huayou.rest)) < 0.5 * YI && Math.abs(Number(zijinItems.rest)) < 2 * YI);
  const [zijin] = lib.reconCards([{ ...zijinItems, reported_on: '2026-10-24' }], { '601899.SH': '紫金' }, NOW_OCT26);
  assert.match(zijin.explain, /^最大的一项是公允价值变动，影响 \+20\.98 亿元；其他/);
  assert.match(zijin.details.join('\n'), /毛利变化：.*对净利润的影响 -18\.67 亿元/);
  assert.match(zijin.details.join('\n'), /公允价值变动：.*对净利润的影响 \+20\.98 亿元/);
});

test('神火式有科目缺口：资产减值、公允价值变动单季算不出就如实说明、归在其他里，不当零', () => {
  const [card] = lib.reconCards([shenhuoItems], names, NOW_OCT26);
  assert.match(card.explain, /^最大的一项是毛利变化，影响 \+2\.76 亿元；其他/);
  assert.ok(card.details.some((line: string) => line === '资产减值、公允价值变动的单季数据暂缺，没有单列，归在其他里'));
  assert.ok(!card.details.some((line: string) => line.startsWith('资产减值：')));
});

test('价格不参与加总：有价格模型时单独一行「研究模型估计…仅供参考」，没有价格模型不出', () => {
  const priced = { ...huayou, symbol: '603799.SH', reported_on: '2026-10-24', price_total: '-92000000',
    variables: [{ var_id: 'cmdty:CU', name: '沪铜', unit: '元/吨', previous_mean: '80000', mean: '78000', move: '-2000', contribution: '-92000000' }], unexplained: [] };
  const [card] = lib.reconCards([priced], { '603799.SH': '华友' }, NOW_OCT26);
  assert.equal(card.explain, '最大的一项是毛利变化，影响 -13.04 亿元；其他（税金及附加、其他收益、营业外等）-0.08 亿元', '首句不含价格');
  assert.ok(card.details.some((line: string) => line === '研究模型估计：价格变化影响约 -0.92 亿元（税后年化系数折季），仅供参考，不与上面各项相加'));
  const [none] = lib.reconCards([{ ...huayou, symbol: '603799.SH', reported_on: '2026-10-24' }], { '603799.SH': '华友' }, NOW_OCT26);
  assert.ok(!none.details.some((line: string) => line.includes('研究模型估计')));
});

test('没有科目时对账卡与以前一致：价格半句、没有价格只写差额', () => {
  const [card] = lib.reconCards([shenhuo], names, NOW);
  assert.equal(card.explain, '沪铝、氧化铝变化约带来 -1.05 亿元，其余 +3.19 亿元来自量和成本等，报告未单独披露');
  assert.ok(!card.details.some((line: string) => line.includes('其他（税金及附加')));
});
