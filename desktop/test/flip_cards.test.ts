// 动态「行情」与跟踪页的跳档提醒：越过、接近、远离、无 flips、无价格模型五种情形；档位以已存研究为准，新档由跳档边界推出。
import assert from 'node:assert/strict';
import test, { before, after } from 'node:test';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { createServer as createHttpServer } from 'node:http';
import { createServer } from 'vite';
import * as React from 'react';
import { Window } from 'happy-dom';

const fixture = JSON.parse(readFileSync(new URL('./fixtures/tracking_variables.json', import.meta.url), 'utf8'));
const REF = fixture.variables[0].companies[0].result_ref as string;
let server: Awaited<ReturnType<typeof createServer>>, win: Window, root: ReturnType<typeof import('react-dom/client')['createRoot']>, container: HTMLElement;
let flipLib: Record<string, any>, narrative: Record<string, any>, desk: Record<string, any>, tracking: Record<string, any>, sessionModule: Record<string, any>, router: Record<string, any>, pageContext: Record<string, any>;
const previous = { window: globalThis.window, document: globalThis.document, fetch: globalThis.fetch, IS_REACT_ACT_ENVIRONMENT: globalThis.IS_REACT_ACT_ENVIRONMENT };
before(async () => {
  win = new Window();
  Object.assign(globalThis, { window: win, document: win.document, IS_REACT_ACT_ENVIRONMENT: true });
  server = await createServer({ configFile: false, root: fileURLToPath(new URL('../', import.meta.url)),
    resolve: { alias: { '@': fileURLToPath(new URL('../src/verticals/finance', import.meta.url)) } },
    server: { middlewareMode: true, hmr: { server: createHttpServer() }, watch: null }, appType: 'custom',
    ssr: { noExternal: ['react-router-dom', 'react-router'], resolve: { conditions: ['module-sync', 'node', 'import', 'development'] } } });
  flipLib = await server.ssrLoadModule('/src/verticals/finance/lib/flipCards.ts');
  narrative = await server.ssrLoadModule('/src/verticals/finance/lib/companyNarrative.ts');
  desk = await server.ssrLoadModule('/src/verticals/finance/pages/VariableDesk.tsx');
  tracking = await server.ssrLoadModule('/src/verticals/finance/pages/Tracking.tsx');
  sessionModule = await server.ssrLoadModule('/src/verticals/finance/dsh/research-session.tsx');
  router = await server.ssrLoadModule('react-router-dom');
  pageContext = await server.ssrLoadModule('/src/core/ai/pageContext.tsx');
  container = win.document.createElement('div') as unknown as HTMLElement;
  win.document.body.append(container);
  root = (await import('react-dom/client')).createRoot(container);
});
after(async () => { await React.act(async () => root?.unmount()); await server?.close(); win?.happyDOM.abort(); Object.assign(globalThis, previous); });

/** 研究时沪铝 23,465，系数为正（价格涨、利润涨）；flips 按 Backend 形态：边界名 + value + valid。 */
const flipsOf = (...rows: [string, number, boolean?][]) => rows.map(([boundary, value, valid]) => ({ boundary, var_id: 'cmdty:SHFE.AL', value: String(value), valid: valid ?? true }));
function sensitivity(flips: unknown[]) {
  return narrative.parseSensitivity({ body: { payload: { calculation: { extra: { base_profit: 1, shares: 1, flips,
    variables: [{ var_id: 'cmdty:SHFE.AL', name: '沪铝', unit: '元/吨', current: 23465, coef_per_unit: 827213.78, range: [18000, 28000], step: 10 }] } } } } });
}
/** 夹具里神火的沪铝实时价改成 live。 */
function dataAt(live: number) {
  const data = structuredClone(fixture);
  data.variables[0].latest = String(live);
  return data;
}
const cards = (live: number, flips: unknown[], grade: string | null = '合理', model = sensitivity(flips)) =>
  flipLib.flipCards({ data: dataAt(live), models: { [REF]: model }, grades: { '000933.SZ': grade } });
const NEUTRAL_PLUS = flipsOf(['neutral_plus_10_pct', 22500]);

test('越过：实时价跌破跳档价，写「跌破 X，公司估值从原档变为新档」；原档取已存研究，新档由边界推出', () => {
  const [card] = cards(22000, NEUTRAL_PLUS);
  assert.deepEqual([card.kind, card.symbol], ['crossed', '000933.SZ']);
  assert.equal(card.text, '沪铝跌破 22,500 元/吨，神火估值从合理变为偏高');
  // 涨过：研究时价在跳档价下方，实时价涨过它。利润变大 → 往低档走。
  const up = cards(24100, flipsOf(['neutral_minus_10_pct', 23800]), '合理');
  assert.equal(up[0].text, '沪铝涨过 23,800 元/吨，神火估值从合理变为偏低');
  // 一路越过多个：以最后跨过的边界（离研究价最远）为准。
  assert.equal(cards(20500, flipsOf(['neutral_plus_10_pct', 22500], ['optimistic_equal_spot', 21000]))[0].text, '沪铝跌破 21,000 元/吨，神火估值从合理变为明显高估');
});

test('接近：距最近的有效跳档价 ≤ 3% 写「距 X 只差 x%，越过后…会从原档变为新档」', () => {
  const [card] = cards(22700, NEUTRAL_PLUS);
  assert.deepEqual([card.kind, card.text], ['near', '沪铝距 22,500 元/吨 只差 0.9%，越过后神火估值会从合理变为偏高']);
  assert.equal(cards(23300, NEUTRAL_PLUS).length, 0, '3% 以外（3.4%）不出');
  assert.equal(cards(23100, NEUTRAL_PLUS).length, 1, '3% 以内（2.6%）算接近');
});

test('远离、无 flips、无效跳档价、无价格模型、价格取不到、档位推不出：不出卡或只写「估值判断会改变」，不报错', () => {
  assert.deepEqual(cards(25000, NEUTRAL_PLUS), []);
  assert.deepEqual(cards(22000, []), []);
  assert.deepEqual(cards(22000, flipsOf(['neutral_plus_10_pct', 22500, false])), [], '超出合理区间的根不展示');
  assert.deepEqual(cards(22000, NEUTRAL_PLUS, '合理', null), [], '华能、农行这类没有价格模型的公司');
  const noPrice = dataAt(22000); noPrice.variables[0].latest = null;
  assert.deepEqual(flipLib.flipCards({ data: noPrice, models: { [REF]: sensitivity(NEUTRAL_PLUS) }, grades: {} }), []);
  const gap = dataAt(22000); gap.variables[0].status = 'gap';
  assert.deepEqual(flipLib.flipCards({ data: gap, models: { [REF]: sensitivity(NEUTRAL_PLUS) }, grades: {} }), []);
  assert.equal(cards(22000, flipsOf(['unknown_edge', 22500]))[0].text, '沪铝跌破 22,500 元/吨，神火估值判断会改变', '边界认不出：不猜新档');
  assert.equal(cards(22000, NEUTRAL_PLUS, null)[0].text, '沪铝跌破 22,500 元/吨，神火估值变为偏高', '没有已存档位：不编原档');
  // 只比较主价格：研究的主价格不是这个变量时不出卡。
  const other = dataAt(22000); other.variables[0].var_id = 'cmdty:SHFE.AO';
  assert.deepEqual(flipLib.flipCards({ data: other, models: { [REF]: sensitivity(NEUTRAL_PLUS) }, grades: {} }), []);
});

test('越过排在接近之前，每家公司只出一张', () => {
  const data = dataAt(22700);
  const second = structuredClone(data.variables[0].companies[0]);
  Object.assign(second, { symbol: '000807.SZ', name: '云铝股份', result_ref: 'result:' + '1'.repeat(32) });
  data.variables[0].companies.push(second);
  const result = flipLib.flipCards({ data, models: { [REF]: sensitivity(NEUTRAL_PLUS), [second.result_ref]: sensitivity(flipsOf(['neutral_plus_10_pct', 22800])) }, grades: { '000933.SZ': '合理', '000807.SZ': '偏低' } });
  assert.deepEqual(result.map((card: any) => [card.company, card.kind]), [['云铝', 'crossed'], ['神火', 'near']]);
});

const sessions = { start: async () => ({ sessionId: 's', status: 'started' }), openSession: async () => {} };
const h = React.createElement;
async function render(element: React.ReactElement) {
  await React.act(async () => root.render(null));
  await React.act(async () => root.render(h(router.MemoryRouter, null, h(pageContext.AiPageProvider, {}, h(sessionModule.ResearchSessionContext.Provider, { value: sessions }, element)))));
  await React.act(async () => { await new Promise(resolve => setTimeout(resolve, 5)); });
  await React.act(async () => {});
}

test('动态「行情」：跳档提醒置顶、不描边，平时不出现；读取失败不影响其余卡片', async () => {
  const loadFlips = async (data: any) => flipLib.flipCards({ data, models: { [REF]: sensitivity(NEUTRAL_PLUS) }, grades: { '000933.SZ': '合理' } });
  const withJudgment = dataAt(22000); withJudgment.cards[0].judgment_changed = true;
  await render(h(desk.VariableDesk, { load: async () => withJudgment, loadFlips }));
  const first = container.querySelector('.variable-desk-cards')!;
  assert.equal(first.getAttribute('data-flip-cards'), '', '提醒在最上面');
  assert.equal(first.querySelector('.variable-card-title')!.textContent, '沪铝跌破 22,500 元/吨，神火估值从合理变为偏高');
  assert.equal(container.querySelectorAll('.card-alert').length, 0, '提醒卡不用品牌橙描边');
  assert.equal(first.querySelector('[data-flip-card="000933.SZ"]')!.closest('.card')!.className.trim(), 'card', '样式与普通动态卡一致');
  assert.doesNotMatch(first.querySelector('[data-flip-card]')!.textContent!, /已越过|接近/, '卡脚不再有“接近 / 越过”标签，句子本身已说明');
  assert.equal(first.querySelector('a')!.getAttribute('href'), '/watch/000933');
  assert.doesNotMatch(first.textContent!, /买入|卖出|建议|机会|减仓|加仓/);
  // 远离：不出提醒块，判断改变的描边照旧。
  await render(h(desk.VariableDesk, { load: async () => withJudgment, loadFlips: async () => [] }));
  assert.equal(container.querySelector('[data-flip-cards]'), null);
  assert.equal(container.querySelectorAll('.card-alert').length, 0);
  await render(h(desk.VariableDesk, { load: async () => dataAt(25000), loadFlips: async () => { throw new Error('boom'); } }));
  assert.equal(container.querySelector('[data-flip-cards]'), null);
  assert.ok(container.querySelector('[data-variable-card]'), '原有价格变动卡照常');
});

test('跟踪页「研究」：对应公司那行同步一句；没有提醒的公司那行不变；价格模型读不到不报错', async () => {
  const live = dataAt(22000);
  const calc = { body: { payload: { calculation: { extra: { base_profit: 1, shares: 1, flips: NEUTRAL_PLUS,
    variables: [{ var_id: 'cmdty:SHFE.AL', name: '沪铝', unit: '元/吨', current: 23465, coef_per_unit: 827213.78, range: [18000, 28000], step: 10 }] } } } } };
  const records = ['000933.SZ', '000807.SZ'].map((symbol, index) => ({ task_id: `task:${symbol}`, kind: 'company_research', symbol, slug: `companies/${symbol.slice(0, 6)}`, title: `公司研究 · ${index ? '云铝股份' : '神火股份'}`,
    status: 'completed', current_step: 6, steps: [], sessions: ['s1'], host_boot_id: 'b', trigger_note: null, reason: null, created_at: '2026-10-14T01:00:00Z', updated_at: `2026-10-14T0${3 - index}:00:00Z`, finished_at: null }));
  let calcOk = true;
  globalThis.fetch = (async (url: string) => {
    const path = String(url);
    if (path.startsWith('/finance-research-tasks')) return Response.json({ items: records });
    if (path.includes('/page-research')) return Response.json({ research: { valuation: { grade: '合理' } }, stale: false, basisVersion: 'v' });
    if (path.startsWith('/finance-research/tracking/variables')) return Response.json(live);
    if (path.startsWith('/finance-research/research-results/')) return calcOk ? Response.json(calc) : Response.json({ detail: 'x' }, { status: 404 });
    if (path.includes('client') || path.includes('watch')) return Response.json({ symbols: ['000933', '000807'] });
    return Response.json({ detail: 'unused' }, { status: 404 });
  }) as typeof fetch;
  await render(h(tracking.Tracking));
  const rows = (symbol: string) => container.querySelector(`[data-research-row="${symbol}"]`)!;
  assert.equal(rows('000933.SZ').querySelector('[data-flip-line]')!.textContent, '沪铝跌破 22,500 元/吨，神火估值从合理变为偏高');
  assert.equal(rows('000807.SZ').querySelector('[data-flip-line]'), null, '云铝没有提醒，那行不变');
  assert.match(rows('000933.SZ').querySelector('.tracking-text > span')!.textContent!, /完成，估值合理/, '原来的研究一句话仍在');
  calcOk = false;
  await render(h(tracking.Tracking));
  assert.equal(container.querySelector('[data-flip-line]'), null);
  assert.ok(container.querySelector('[data-research-row="000933.SZ"]'));
});
