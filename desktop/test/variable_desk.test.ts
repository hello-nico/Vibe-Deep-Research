// T12a B 线：动态页「关键变量」分段、卡片文案、表格排序与灰显、讨论入口。
// 夹具 fixtures/tracking_variables.json 是 A 线 track_variables 对 tests/fixtures/t12a/ 三份真实凭据（神火敏感性、沪铝、氧化铝行情）算出的真实响应，
// 结构以 Stock-Research/backend/tests/fixtures/tracking-variables.schema.json 为准。重新生成（在 Stock-Research/backend 目录）：
//   uv run python -c "import sys, json; sys.path.insert(0, 'tests'); import test_tracking_variables as t;
//     coal = {**t.load(t.SENSITIVITY)['payload']['calculation']['extra']['variables'][0], 'var_id': '000933.SZ:coal_price', 'name': '煤炭售价'};
//     r = t.run([t.company(extra_variable=coal), t.company('601899.SH', '紫金矿业', research=False)]).model_dump(by_alias=True);
//     json.dump(r, open('<Vibe>/desktop/test/fixtures/tracking_variables.json', 'w'), ensure_ascii=False, indent=1)"
// 其中煤炭售价是神火自述的公司自有变量（无公开日行情），紫金矿业是没有敏感性研究的关注公司。
import assert from 'node:assert/strict';
import test, { before, after } from 'node:test';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { createServer as createHttpServer } from 'node:http';
import { createServer } from 'vite';
import * as React from 'react';
import { Window } from 'happy-dom';
const trackingFixture = JSON.parse(readFileSync(new URL('./fixtures/tracking_variables.json', import.meta.url), 'utf8'));

let server: Awaited<ReturnType<typeof createServer>>, win: Window, root: ReturnType<typeof import('react-dom/client')['createRoot']>, container: HTMLElement;
let desk: Record<string, any>, lib: Record<string, any>, sessionModule: Record<string, any>, router: Record<string, any>, pageContext: Record<string, any>;
let asked: any = null;
const previous = { window: globalThis.window, document: globalThis.document, fetch: globalThis.fetch, IS_REACT_ACT_ENVIRONMENT: globalThis.IS_REACT_ACT_ENVIRONMENT };
before(async () => {
  win = new Window();
  Object.assign(globalThis, { window: win, document: win.document, IS_REACT_ACT_ENVIRONMENT: true });
  server = await createServer({ configFile: false, root: fileURLToPath(new URL('../', import.meta.url)),
    resolve: { alias: { '@': fileURLToPath(new URL('../src/verticals/finance', import.meta.url)) } },
    server: { middlewareMode: true, hmr: { server: createHttpServer() }, watch: null }, appType: 'custom',
    ssr: { noExternal: ['react-router-dom', 'react-router'], resolve: { conditions: ['module-sync', 'node', 'import', 'development'] } } });
  desk = await server.ssrLoadModule('/src/verticals/finance/pages/VariableDesk.tsx');
  lib = await server.ssrLoadModule('/src/verticals/finance/lib/trackingVariables.ts');
  sessionModule = await server.ssrLoadModule('/src/verticals/finance/dsh/research-session.tsx');
  router = await server.ssrLoadModule('react-router-dom');
  pageContext = await server.ssrLoadModule('/src/core/ai/pageContext.tsx');
  container = win.document.createElement('div') as unknown as HTMLElement;
  win.document.body.append(container);
  root = (await import('react-dom/client')).createRoot(container);
});
after(async () => { await React.act(async () => root?.unmount()); await server?.close(); win?.happyDOM.abort(); Object.assign(globalThis, previous); });

const started: string[] = [];
async function show(load: () => Promise<unknown>) {
  const sessions = { start: async (question: string) => { started.push(question); return { sessionId: 's', status: 'started' }; } };
  const Probe = () => { asked = pageContext.useAiQuestion().question; return null; };
  await React.act(async () => root.render(React.createElement(router.MemoryRouter, null,
    React.createElement(sessionModule.ResearchSessionContext.Provider, { value: sessions },
      React.createElement(pageContext.AiPageProvider, {}, React.createElement(Probe), React.createElement(desk.VariableDesk, { load }))))));
  await React.act(async () => {});
}

test('卡片一句话写清哪个变量动了多少、对谁的利润和中性价影响多少；亿元四舍五入', () => {
  assert.equal(lib.cardSentence(trackingFixture.cards[0]), '沪铝一天跌 445 元/吨（23,830 → 23,385，−1.87%），神火年化净利润约 −3.68 亿元（占对比期利润 5.3%），中性价约 −1.64 元。');
  const edge = { ...trackingFixture.cards[0], companies: [{ ...trackingFixture.cards[0].companies[0], impact: '-368500000' }] };
  assert.match(lib.cardSentence(edge), /约 −3\.69 亿元/, '3.685 亿进位，不截断');
  const up = { ...trackingFixture.cards[0], rule: 'five_day', from: '23000', to: '23300', change: '300', change_pct: '0.0130', companies: [{ symbol: '000933.SZ', name: '神火股份', impact: '248000000', pct_of_base: '0.036', neutral_price_delta: null }] };
  assert.equal(lib.cardSentence(up), '沪铝五天累计涨 300 元/吨（23,000 → 23,300，+1.30%），神火年化净利润约 +2.48 亿元（占对比期利润 3.6%）。');
});

test('「讨论」问句是自然问题：不提页面，也不提系统机制', () => {
  const question = lib.cardQuestion(trackingFixture.cards[0]);
  assert.equal(question, '沪铝 10 月 8 日跌了 445 元/吨，对神火影响多大？');
  assert.doesNotMatch(question, /页面|卡片|动态|系统|数据包|凭据|后端|接口/);
});

test('行情来源是目录原文：交易所代码换成中文，其余原样', () => {
  assert.equal(lib.sourceText('SHFE 主力连续，未复权，收盘价'), '上期所 主力连续，未复权，收盘价');
  assert.equal(lib.sourceText('DCE/ZCE/GFEX/INE 收盘价'), '大商所/郑商所/广期所/上期能源 收盘价');
  assert.equal(lib.sourceText('CFETS 收盘价'), 'CFETS 收盘价');
  assert.equal(lib.sourceText(null), '');
});

test('关注名单补上交易所后缀，去重，认不出的不请求，最多 50 家', () => {
  assert.deepEqual(lib.qualifiedWatch(['601899', '000933', '000933', 'abc', '600519']), ['601899.SH', '000933.SZ', '600519.SH']);
  assert.equal(lib.qualifiedWatch(Array.from({ length: 60 }, (_, i) => String(600000 + i))).length, 50);
});

test('卡片标题写事情本身，第二行写碰到哪些关注公司和方向；金额不在第一层', () => {
  const [card] = trackingFixture.cards;
  assert.equal(lib.cardTitle(card), '沪铝一天跌 445 元/吨（−1.9%）');
  assert.equal(lib.cardTouch(card), '关注中：神火 · 对利润偏负面');
  const five = { ...card, rule: 'five_day', change: '300', change_pct: '0.0130', companies: [{ ...card.companies[0], impact: '248000000' }] };
  assert.equal(lib.cardTitle(five), '沪铝五天累计涨 300 元/吨（+1.3%）');
  assert.equal(lib.cardTouch(five), '关注中：神火 · 对利润偏正面');
  const mixed = { ...card, companies: [card.companies[0], { symbol: '000807.SZ', name: '云铝股份', impact: '500000000', pct_of_base: null, neutral_price_delta: null }] };
  assert.equal(lib.cardTouch(mixed), '关注中：神火、云铝 · 对利润影响方向不同');
  assert.equal(lib.cardTitle({ ...card, change_pct: null }), '沪铝一天跌 445 元/吨');
  assert.doesNotMatch(lib.cardTitle(card) + lib.cardTouch(card), /亿元|中性价/);
});

test('跟踪页一行的最新情况：有卡片写日期方向幅度，没有写平静，没有行情与取不到各一句', () => {
  const [al, ao, coal] = trackingFixture.variables;
  assert.equal(lib.variableLine(al, trackingFixture.cards), '10 月 8 日 跌 445 元/吨，已提醒');
  assert.equal(lib.variableLine(ao, []), '近一个月没有大到需要提醒的变动');
  assert.equal(lib.lastCloseLabel(al), '10-12 收盘 23,465');
  assert.equal(lib.lastCloseLabel(coal), '');
  assert.equal(lib.variableLine(coal, trackingFixture.cards), '没有公开行情，跟着财报更新');
  assert.equal(lib.variableLine({ ...ao, status: 'gap' }, []), '暂时取不到行情');
  assert.deepEqual(lib.orderWatching([coal, ao, al], trackingFixture.cards).map((v: any) => v.var_id), ['cmdty:SHFE.AL', '000933.SZ:coal_price', 'cmdty:SHFE.AO']);
});

test('卡片：价格变动卡不描边；展开才看金额；看个股页进入该公司；讨论打开问助手面板而不是新开对话', async () => {
  await show(async () => trackingFixture);
  const card = container.querySelector('[data-variable-card]')!;
  assert.doesNotMatch(card.closest('.card')!.className, /card-alert/, '纯价格变动卡不描边');
  assert.equal(container.querySelectorAll('.card-alert').length, 0);
  assert.ok(card.querySelector('.variable-card-title .is-down'), '不利：跌色');
  assert.equal(card.querySelector('.variable-card-title .is-down')!.textContent, '445 元/吨（−1.9%）');
  assert.equal(card.querySelector('.variable-card-touch .is-down')!.textContent, '对利润偏负面');
  assert.equal(card.querySelector('.variable-card-title')!.textContent, '沪铝一天跌 445 元/吨（−1.9%）');
  assert.equal(card.querySelector('.variable-card-touch')!.textContent, '关注中：神火 · 对利润偏负面');
  assert.match(card.querySelector('.variable-card-foot')!.textContent!, /^10 月 8 日/);
  assert.equal(card.querySelector('.variable-card-effects'), null, '金额点展开才看');
  assert.doesNotMatch(card.textContent!, /亿元|中性价/);
  assert.doesNotMatch(container.textContent!, /系数|出卡线|系数 × 变动/, '第一层不露内部机制');
  const toggle = [...card.querySelectorAll('button')].find(b => b.textContent === '展开')!;
  await React.act(async () => toggle.click());
  assert.equal(card.querySelector('.variable-card-effects')!.textContent, '神火年化净利润约 −3.68 亿元（占对比期利润 5.3%），中性价约 −1.64 元');
  assert.ok(card.querySelector('.variable-card-effects b.is-down'), '沿用涨红跌绿配色');
  await React.act(async () => [...card.querySelectorAll('button')].find(b => b.textContent === '收起')!.click());
  assert.equal(card.querySelector('.variable-card-effects'), null);
  assert.equal(card.querySelector('a')!.getAttribute('href'), '/watch/000933');
  const discuss = [...card.querySelectorAll('button')].find(b => b.textContent === '讨论')!;
  await React.act(async () => discuss.click());
  assert.deepEqual(started, [], '不新开深度对话');
  assert.equal(asked.pageKey, 'feed:variables');
  assert.equal(asked.draft, '沪铝 10 月 8 日跌了 445 元/吨，对神火影响多大？', '输入框预填问句');
  assert.equal(asked.reference.title, '沪铝一天跌 445 元/吨（−1.9%）', '卡片标题随本轮带入');
  assert.match(asked.reference.text, /^关注中：神火 · 对利润偏负面\n沪铝一天跌 445 元\/吨/);
});

test('动态页只留卡片：没有变量表和覆盖区；没有卡片时显示一句空态', async () => {
  await show(async () => trackingFixture);
  assert.equal(container.querySelector('table'), null);
  assert.equal(container.querySelector('[data-cover]'), null);
  await show(async () => ({ ...trackingFixture, cards: [] }));
  assert.match(container.textContent!, /最近 20 个交易日没有足以影响利润的价格变动/);
  assert.equal(container.querySelector('[data-variable-card]'), null);
});

test('加载中显示骨架；没有关注显示引导；读取失败一句话加重试', async () => {
  let release!: (value: unknown) => void;
  await show(() => new Promise(resolve => { release = resolve; }));
  assert.equal(container.querySelector('[aria-busy="true"]')?.getAttribute('aria-label'), '正在加载');
  await React.act(async () => release(null));
  assert.match(container.textContent!, /关注公司后/);
  assert.equal(container.querySelector('a')!.getAttribute('href'), '/watch');
  let attempts = 0;
  await show(async () => { attempts += 1; if (attempts === 1) throw new Error('down'); return trackingFixture; });
  assert.match(container.querySelector('[role="alert"]')!.textContent!, /暂时读取不到/);
  await React.act(async () => (container.querySelector('[role="alert"] button') as HTMLButtonElement).click());
  assert.equal(attempts, 2);
  assert.ok(container.querySelector('[data-variable-card]'));
});

test('请求走 Backend 读取通道：关注名单补后缀后请求 /tracking/variables', async () => {
  const requested: string[] = [];
  globalThis.fetch = (async (url: string) => {
    requested.push(String(url));
    return String(url).startsWith('/finance-research/') ? Response.json(trackingFixture) : Response.json({ symbols: ['000933', '601899'] });
  }) as typeof fetch;
  try {
    assert.deepEqual(await lib.loadTrackingVariables(), trackingFixture);
    assert.ok(requested.includes('/finance-research/tracking/variables?symbols=000933.SZ,601899.SH'), requested.join('\n'));
  } finally { globalThis.fetch = previous.fetch; }
});

test('动态页：「行情」是第一个分段且为默认；「资讯」保留，「市场」已移除', () => {
  const feed = readFileSync(new URL('../src/verticals/finance/pages/Feed.tsx', import.meta.url), 'utf8');
  assert.match(feed, /\[\{ value: "variables", label: "行情" \}, \{ value: "intel", label: "资讯" \}\]/);
  assert.match(feed, /params\.get\("tab"\) === "intel" \? "intel" : "variables"/);
  assert.match(feed, /<Intel sub=\{params\.get\("sub"\)\} onSub=\{selectSub\} \/>/);
});

test('宿主研究代理放行关键变量读取', async () => {
  const { researchRoute } = await import('../dsh/finance-ui/research.mjs');
  assert.equal(researchRoute('GET', '/tracking/variables'), true);
  assert.equal(researchRoute('POST', '/tracking/variables'), false);
});

test('设计原则 4：提醒卡也不用品牌橙描边，样式与普通动态卡一致（判断改变的卡同样）', async () => {
  const [card] = trackingFixture.cards;
  const data = { ...trackingFixture, cards: [{ ...card, judgment_changed: true }, { ...card, var_id: 'cmdty:X', judgment_changed: true }] };
  await show(async () => data);
  assert.equal(container.querySelectorAll('.card-alert').length, 0);
  assert.equal(container.querySelectorAll('[data-variable-card]').length, 2);
  for (const element of container.querySelectorAll('[data-variable-card]')) assert.equal(element.closest('.card')!.className.trim(), 'card');
  // 源码里也不留这条路：Card / ObjectCard 没有 alert，样式表没有 .card-alert。
  const read = (path: string) => readFileSync(new URL(path, import.meta.url), 'utf8');
  assert.doesNotMatch(read('../src/index.css'), /card-alert/);
  assert.doesNotMatch(read('../src/verticals/finance/components/ui/Card.tsx'), /alert/);
  assert.doesNotMatch(read('../src/verticals/finance/components/ui/ObjectCard.tsx'), /alert/);
  assert.doesNotMatch(read('../src/verticals/finance/pages/VariableDesk.tsx'), /card-alert|alert=/);
});

test('标题与第二行按对利润方向着色：不利跌色、有利涨色、方向不同不着色', () => {
  const [card] = trackingFixture.cards;
  const mk = (...impacts: string[]) => ({ ...card, companies: impacts.map((impact, i) => ({ ...card.companies[0], symbol: `00000${i}.SZ`, impact })) });
  const tones = (c: any) => [lib.cardTitlePieces(c), lib.cardTouchPieces(c)].map(p => p.find((x: any) => x.tone)?.tone);
  assert.deepEqual(tones(mk('-368500000')), ['down', 'down']);
  assert.deepEqual(tones(mk('248000000')), ['up', 'up']);
  assert.deepEqual(tones(mk('-368500000', '500000000')), [undefined, undefined]);
});
