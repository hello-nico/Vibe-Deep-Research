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
let desk: Record<string, any>, lib: Record<string, any>, sessionModule: Record<string, any>, router: Record<string, any>;
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
  container = win.document.createElement('div') as unknown as HTMLElement;
  win.document.body.append(container);
  root = (await import('react-dom/client')).createRoot(container);
});
after(async () => { await React.act(async () => root?.unmount()); await server?.close(); win?.happyDOM.abort(); Object.assign(globalThis, previous); });

const started: string[] = [];
async function show(load: () => Promise<unknown>) {
  const sessions = { start: async (question: string) => { started.push(question); return { sessionId: 's', status: 'started' }; } };
  await React.act(async () => root.render(React.createElement(router.MemoryRouter, null,
    React.createElement(sessionModule.ResearchSessionContext.Provider, { value: sessions },
      React.createElement(desk.VariableDesk, { load })))));
  await React.act(async () => {});
}

test('卡片一句话写清哪个变量动了多少、对谁的利润和中性价影响多少；亿元四舍五入', () => {
  assert.equal(lib.cardSentence(trackingFixture.cards[0]), '沪铝一天跌 445 元/吨（23,830 → 23,385，−1.87%），神火年化归母净利约 −3.68 亿元（占基数 5.3%），中性价约 −1.64 元。');
  const edge = { ...trackingFixture.cards[0], companies: [{ ...trackingFixture.cards[0].companies[0], impact: '-368500000' }] };
  assert.match(lib.cardSentence(edge), /约 −3\.69 亿元/, '3.685 亿进位，不截断');
  const up = { ...trackingFixture.cards[0], rule: 'five_day', from: '23000', to: '23300', change: '300', change_pct: '0.0130', companies: [{ symbol: '000933.SZ', name: '神火股份', impact: '248000000', pct_of_base: '0.036', neutral_price_delta: null }] };
  assert.equal(lib.cardSentence(up), '沪铝五天累计涨 300 元/吨（23,000 → 23,300，+1.30%），神火年化归母净利约 +2.48 亿元（占基数 3.6%）。');
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

test('没有日行情的变量排最后并灰显，写原因与引用公司；有行情的按后端顺序', async () => {
  const [al, ao, coal] = trackingFixture.variables;
  assert.deepEqual(lib.orderVariables([coal, al, ao]).map((v: any) => v.var_id), ['cmdty:SHFE.AL', 'cmdty:SHFE.AO', '000933.SZ:coal_price']);
  await show(async () => trackingFixture);
  const rows = [...container.querySelectorAll('[data-variable-row]')] as HTMLElement[];
  assert.deepEqual(rows.map(row => row.dataset.variableRow), ['cmdty:SHFE.AL', 'cmdty:SHFE.AO', '000933.SZ:coal_price']);
  assert.equal(container.querySelector('[data-variable-row="cmdty:SHFE.AL"] .variable-source')?.textContent, '上期所 主力连续，未复权，收盘价 · 2026-10-12', '来源里的交易所代码显示为中文');
  const last = rows.at(-1)!;
  assert.match(last.className, /is-nodata/);
  assert.match(last.textContent!, /无公开日行情，靠财报与对话更新/);
  assert.equal(last.querySelector('.tag')!.textContent, '神火股份', '公司胶囊不带影响');
  assert.equal(last.querySelectorAll('td')[2]!.textContent, '—');
  await React.act(async () => (last as HTMLElement).click());
  assert.match(container.querySelector('.variable-detail')!.textContent!, /无公开日行情，靠财报与对话更新/, '点开写原因');
  await React.act(async () => (last as HTMLElement).click());
});

test('表格：最新、较前一日、较基数期均价与影响的公司；涨红跌绿只看对利润的方向', () => {
  const al = container.querySelector('[data-variable-row="cmdty:SHFE.AL"]') as HTMLElement;
  const cells = [...al.querySelectorAll('td')].map(td => td.textContent);
  assert.match(cells[2]!, /23,465 元\/吨/);
  assert.equal(cells[3], '−5');
  assert.equal(cells[4], '−859.83', '23465 − 24324.83');
  assert.match(cells[5]!, /神火股份−7\.11 亿元/);
  assert.match(al.querySelector('td:nth-child(4) span')!.className, /is-down/, '铝价跌 → 利润减少 → 绿');
  const ao = container.querySelector('[data-variable-row="cmdty:SHFE.AO"]') as HTMLElement;
  assert.match(ao.querySelector('td:nth-child(5) span')!.className, /is-up/, '氧化铝低于基数期 → 利润增加 → 红');
  assert.ok(al.querySelector('svg.sparkline'));
});

test('点行展开每家公司的每步影响、较基数期影响、占基数比例与中性价影响', async () => {
  const row = container.querySelector('[data-variable-row="cmdty:SHFE.AL"]') as HTMLElement;
  await React.act(async () => row.click());
  const detail = container.querySelector('.variable-detail')!;
  assert.match(detail.textContent!, /神火股份 · 每涨 1,000 元\/吨\+8\.27 亿元/);
  assert.match(detail.textContent!, /较基数期均价 24,324\.83−7\.11 亿元/);
  assert.match(detail.textContent!, /占基数利润−10\.33%/);
  assert.match(detail.textContent!, /中性价影响−3\.16 元/);
  const ao = container.querySelector('[data-variable-row="cmdty:SHFE.AO"]') as HTMLElement;
  await React.act(async () => ao.click());
  assert.match(container.querySelector('.variable-detail')!.textContent!, /神火股份 · 每涨 100 元\/吨−2\.02 亿元/, '氧化铝每涨 100 元/吨，利润 −2.02 亿元');
  await React.act(async () => ao.click());
  const enter = () => React.act(async () => row.dispatchEvent(new win.KeyboardEvent('keydown', { key: 'Enter', bubbles: true }) as unknown as Event));
  await enter();
  assert.ok(container.querySelector('.variable-detail'), '键盘 Enter 也能展开');
  await enter();
  assert.equal(container.querySelector('.variable-detail'), null);
});

test('卡片：最近一张用品牌橙描边；看个股页进入该公司；讨论新开对话并带上问句', async () => {
  const card = container.querySelector('[data-variable-card]')!;
  assert.match(card.closest('.card')!.className, /card-alert/);
  assert.deepEqual([...card.querySelectorAll('.tag')].map(tag => tag.textContent), ['神火股份', '沪铝 · 日行情']);
  assert.match(card.querySelector('.variable-card-foot')!.textContent!, /^10 月 8 日/);
  assert.match(card.querySelector('.variable-card-sentence')!.getAttribute('title')!, /^系数来自 10 月 13 日的个股页研究，每涨 1,000 元\/吨，利润 \+8\.27 亿元$/, '出处收进悬停');
  assert.doesNotMatch(container.textContent!, /出卡线|系数 × 变动/, '第一层不露内部机制');
  assert.equal(container.querySelectorAll('.card-alert').length, 1, '同屏最多一张');
  assert.equal(card.querySelector('a')!.getAttribute('href'), '/watch/000933');
  const discuss = [...card.querySelectorAll('button')].find(b => b.textContent === '讨论')!;
  await React.act(async () => discuss.click());
  assert.deepEqual(started, ['沪铝 10 月 8 日跌了 445 元/吨，对神火影响多大？']);
});

test('没有卡片时显示一句空态；覆盖区写明自动盯的数量、没有日行情的变量与未研究的公司数', async () => {
  await show(async () => ({ ...trackingFixture, cards: [] }));
  assert.match(container.textContent!, /最近 20 个交易日没有足以影响利润的价格变动/);
  assert.equal(container.querySelector('[data-variable-card]'), null);
  const cover = (name: string) => container.querySelector(`[data-cover="${name}"]`)!.textContent;
  assert.equal(cover('watched'), '在自动盯的变量2沪铝、氧化铝');
  assert.equal(cover('uncovered'), '没有日行情的变量1煤炭售价（神火股份）');
  assert.match(cover('unresearched')!, /还没研究的关注公司1/);
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

test('动态页：「关键变量」是第一个分段且为默认；「资讯」「市场」不变', () => {
  const feed = readFileSync(new URL('../src/verticals/finance/pages/Feed.tsx', import.meta.url), 'utf8');
  assert.match(feed, /\[\{ value: "variables", label: "关键变量" \}, \{ value: "intel", label: "资讯" \}, \{ value: "market", label: "市场" \}\]/);
  assert.match(feed, /params\.get\("tab"\) === "market" \? "market" : params\.get\("tab"\) === "intel" \? "intel" : "variables"/);
  assert.match(feed, /<Intel sub=\{params\.get\("sub"\)\} onSub=\{selectSub\} \/>/);
});
