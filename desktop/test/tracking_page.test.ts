// 跟踪页（正在盯的 / 研究）、资料页「记录」、设置页「记忆」。
// 变量数据用 fixtures/tracking_variables.json（A 线真实响应）；研究记录是按任务记录 R2 形状写的替身。
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
let page: Record<string, any>, lib: Record<string, any>, lib2: Record<string, any>, router: Record<string, any>, pageContext: Record<string, any>, sessionModule: Record<string, any>, native: Record<string, any>, reports: Record<string, any>;
const previous = { window: globalThis.window, document: globalThis.document, fetch: globalThis.fetch, IS_REACT_ACT_ENVIRONMENT: globalThis.IS_REACT_ACT_ENVIRONMENT };
before(async () => {
  win = new Window();
  Object.assign(globalThis, { window: win, document: win.document, IS_REACT_ACT_ENVIRONMENT: true });
  server = await createServer({ configFile: false, root: fileURLToPath(new URL('../', import.meta.url)),
    resolve: { alias: { '@': fileURLToPath(new URL('../src/verticals/finance', import.meta.url)) } },
    server: { middlewareMode: true, hmr: { server: createHttpServer() }, watch: null }, appType: 'custom',
    ssr: { noExternal: ['react-router-dom', 'react-router'], resolve: { conditions: ['module-sync', 'node', 'import', 'development'] } } });
  page = await server.ssrLoadModule('/src/verticals/finance/pages/Tracking.tsx');
  lib = await server.ssrLoadModule('/src/verticals/finance/lib/researchTasks.ts');
  lib2 = await server.ssrLoadModule('/src/verticals/finance/lib/trackingItems.ts');
  native = await server.ssrLoadModule('/src/verticals/finance/dsh/NativeDsh.tsx');
  reports = await server.ssrLoadModule('/src/verticals/finance/pages/UploadedReports.tsx');
  sessionModule = await server.ssrLoadModule('/src/verticals/finance/dsh/research-session.tsx');
  pageContext = await server.ssrLoadModule('/src/core/ai/pageContext.tsx');
  const apiModule = await server.ssrLoadModule('/src/verticals/finance/lib/api.ts');
  apiModule.api.quote = async (codes: string) => Object.fromEntries(codes.split(',').filter(code => code === '601899').map(code => [code, { name: '紫金矿业股份' }]));
  router = await server.ssrLoadModule('react-router-dom');
  container = win.document.createElement('div') as unknown as HTMLElement;
  win.document.body.append(container);
  root = (await import('react-dom/client')).createRoot(container);
});
after(async () => { await React.act(async () => root?.unmount()); await server?.close(); win?.happyDOM.abort(); Object.assign(globalThis, previous); });

const STEPS = ['收集资料', '读报告', '算价格对利润的影响', '估值与判断', '保存资料', '整理结论'];
function record(symbol: string, name: string, over: Record<string, unknown> = {}) {
  const status = (over.status as string) ?? 'running';
  const current = (over.current_step as number) ?? 2;
  return { task_id: `task:${symbol}`, kind: 'company_research', symbol, slug: `companies/${symbol.slice(0, 6)}`, title: `公司研究 · ${name}`, status, current_step: current,
    steps: STEPS.map((label, index) => ({ key: ['fetch', 'read_report', 'key_variables', 'valuation', 'save', 'settle'][index], label, attempts: 0, finished_at: null, outputs: {},
      status: index + 1 < current ? 'done' : index + 1 === current ? (status === 'running' ? 'running' : 'pending') : 'pending' })),
    sessions: ['s1'], host_boot_id: 'boot', trigger_note: null, reason: null, created_at: '2026-10-14T01:00:00Z', updated_at: '2026-10-14T02:00:00Z', finished_at: null, ...over };
}

const catalog: string[][] = [['cmdty:SHFE.AL', '沪铝', '元/吨'], ['cmdty:SHFE.AO', '氧化铝', '元/吨'], ['cmdty:DCE.JM', '焦煤', '元/吨'], ['cmdty:DCE.J', '焦炭', '元/吨'], ['cmdty:SHFE.CU', '沪铜', '元/吨'], ['macro:DXY', '美元指数', '指数点']];
/** 把变量夹具（A 线真实响应）改写成清单接口的形状：价格项带序列、提醒与公司；没有行情的变量清单里没有。 */
function itemsOf(extra: unknown[] = [], over: Record<string, unknown> = {}) {
  const data = trackingFixture;
  const prices = data.variables.filter((item: any) => item.status === 'ok').map((item: any) => ({
    id: `price:${item.var_id}`, kind: 'price', var_id: item.var_id, name: item.name, unit: item.unit, source: 'research', started_at: '2026-09-15', started_at_index: 0,
    series: item.series, status: 'ok', cards: data.cards.filter((card: any) => card.var_id === item.var_id), flips: [], companies: item.companies, muted_at: null }));
  return { as_of: data.as_of, items: [...prices, ...extra], muted: [], ...over };
}
const observation = (over: Record<string, unknown> = {}) => ({ id: 'obs:topic:abc:nickel', topic_id: 'topic:abc', tracking_key: 'nickel', topic_title: '华友钴业利润来源', kind: 'observation', name: '华友：镍环节还算不算利润支柱', hypothesis: '镍价下行时利润支柱可能转移', source: 'user', started_at: '2026-10-20', muted_at: null,
  signals: [{ id: 's1', date: '2026-10-21', text: '印尼镍产量上调', kind: '削弱', by: 'jev' }, { id: 's2', date: '2026-10-24', text: '镍价跌破成本线', kind: '削弱', by: 'jev' }, { id: 's3', date: '2026-10-25', text: '公司披露钴业务扩产', kind: '无关', by: 'jev' }], ...over });
function mockFetch(options: { reports?: unknown; catalogFail?: boolean; items?: any; itemsFail?: boolean; postFail?: boolean; records?: unknown[] | 'fail'; variables?: unknown; grades?: Record<string, string | null>; previous?: Record<string, string | null>; topics?: unknown[] | 'fail' }) {
  const requested: string[] = [];
  globalThis.fetch = (async (url: string, init?: RequestInit) => {
    const path = String(url);
    const method = (init?.method ?? 'GET').toUpperCase();
    requested.push(method === 'GET' ? path : `${method} ${path} ${init?.body ?? ''}`.trim());
    if (path.startsWith('/finance-research/tracking/catalog')) return options.catalogFail ? Response.json({ detail: 'x' }, { status: 503 }) : Response.json({ items: catalog.map(([id, name, unit]) => ({ id, name, unit, exchange: 'X' })) });
    if (path.startsWith('/finance-research/tracking/next-reports')) return options.reports === 'fail' ? Response.json({ detail: 'x' }, { status: 503 }) : Response.json({ items: options.reports ?? [] });
    if (path.startsWith('/finance-research/tracking/items')) {
      const store = options.items ?? (options.items = itemsOf());
      if (method === 'GET') return options.itemsFail ? Response.json({ detail: 'x' }, { status: 503 }) : Response.json(store);
      if (options.postFail) return Response.json({ detail: { message: '该价格已在跟踪清单中' } }, { status: 422 });
      const body = JSON.parse(String(init?.body));
      if (method === 'POST') {
        const meta = catalog.find(row => row[0] === body.var_id)!;
        const created = { id: `price:${body.var_id}`, kind: 'price', var_id: body.var_id, name: meta[1], unit: meta[2], source: 'user', started_at: '2026-10-26', started_at_index: 0, series: null, status: 'gap', reason: '行情取数失败', cards: [], flips: [], companies: [], muted_at: null };
        store.items.push(created);
        return Response.json(created);
      }
      const route = decodeURIComponent(path.split('/finance-research/tracking/items/')[1]!.split('?')[0]!);
      const [id, signalId] = route.split('/signals/');
      const hit = [...store.items, ...store.muted].find((item: any) => item.id === id);
      if (signalId) { const signal = hit.signals.find((item: any) => item.id === signalId); signal.kind = body.kind; signal.by = 'user'; return Response.json(signal); }
      hit.muted_at = body.muted ? '2026-10-26T01:00:00Z' : null;
      store.items = store.items.filter((item: any) => item !== hit); store.muted = store.muted.filter((item: any) => item !== hit);
      (body.muted ? store.muted : store.items).push(hit);
      return Response.json(hit);
    }
    if (path.startsWith('/finance-research-tasks')) return options.records === 'fail' ? Response.json({}, { status: 503 }) : Response.json({ items: options.records ?? [] });
    if (path.includes('/page-research')) {
      const symbol = /companies\/([^/]+)\//.exec(path)![1]!;
      const grade = options.grades?.[symbol];
      return Response.json({ research: grade ? { valuation: { grade }, researchedAt: '2026-10-26T01:30:00Z' } : null, stale: false, basisVersion: 'v', previousGrade: options.previous?.[symbol] ?? null });
    }
    if (path.startsWith('/finance-research/wiki/research-topics?pool=active')) return options.topics === 'fail' ? Response.json({}, { status: 503 }) : Response.json({ items: options.topics ?? [], next_offset: null });
    if (path.startsWith('/finance-research/tracking/variables')) return Response.json(options.variables ?? trackingFixture);
    if (path.includes('client') || path.includes('watch')) return Response.json({ symbols: ['000933', '601899'] });
    return Response.json({ detail: 'unused' }, { status: 404 });
  }) as typeof fetch;
  return requested;
}
const h = React.createElement;
async function render(element: React.ReactElement, initial = '/') {
  const sessions = { start: async () => ({ sessionId: 's', status: 'started' }), openSession: async () => {} };
  await React.act(async () => root.render(null));
  await React.act(async () => root.render(h(router.MemoryRouter, { initialEntries: [initial] },
    h(pageContext.AiPageProvider, {}, h(sessionModule.ResearchSessionContext.Provider, { value: sessions }, element)))));
  await React.act(async () => { await new Promise(resolve => setTimeout(resolve, 0)); });
  await React.act(async () => {});
}
const text = (selector: string) => container.querySelector(selector)?.textContent ?? '';

test('研究记录：每家公司只取最新一条，按更新时间倒序，最多 10 家；一句话按状态写', () => {
  const items = [
    record('000933.SZ', '神火股份', { updated_at: '2026-10-14T01:00:00Z' }),
    record('000933.SZ', '神火股份', { updated_at: '2026-10-14T03:00:00Z', status: 'completed' }),
    record('000807.SZ', '云铝股份', { updated_at: '2026-10-14T02:00:00Z' }),
    ...Array.from({ length: 12 }, (_, i) => record(`60000${i % 10}.SH`.replace(/^(\d{6})\.SH$/, `6${String(i).padStart(5, '0')}.SH`), `公司${i}`, { updated_at: `2026-10-13T0${i % 10}:00:00Z` })),
  ];
  const latest = lib.latestPerCompany(items);
  assert.equal(latest.length, 10);
  assert.deepEqual(latest.slice(0, 2).map((r: any) => [r.symbol, r.status]), [['000933.SZ', 'completed'], ['000807.SZ', 'running']]);
  const line = (over: Record<string, unknown>, grade?: string) => lib.researchLine(record('000933.SZ', '神火股份', over), grade);
  assert.equal(line({ current_step: 2 }), '2/6 · 读报告');
  assert.equal(line({ status: 'interrupted' }), '继续中');
  assert.equal(line({ status: 'completed' }, '合理'), '完成 · 估值合理');
  assert.equal(line({ status: 'completed' }), '完成');
  assert.equal(line({ status: 'failed', reason: '最新定期报告还没入库' }), '最新定期报告还没入库');
  assert.equal(line({ status: 'cancelled' }), '已中止');
});

test('研究记录读不到、状态不认识时抛错，不当作没有记录', async () => {
  mockFetch({ records: 'fail' });
  await assert.rejects(lib.loadResearchTasks({ limit: 50 }));
  globalThis.fetch = (async () => Response.json({ items: [{ ...record('000933.SZ', '神火股份'), status: 'settling' }] })) as typeof fetch;
  await assert.rejects(lib.loadResearchTasks());
});

test('跟踪页：页首只有标题；组名在卡片外，没有「研究」区', async () => {
  mockFetch({ records: [record('000933.SZ', '神火股份')] });
  await render(h(page.Tracking));
  assert.equal(text('h1'), '跟踪');
  assert.equal(container.querySelector('.page-head-sub'), null);
  assert.deepEqual([...container.querySelectorAll('.section-label')].map(label => label.firstElementChild!.textContent), ['价格']);
  assert.ok([...container.querySelectorAll('.section-label')].every(label => !label.closest('.card')), '组名在卡片外');
  assert.doesNotMatch(container.textContent!, /研究里自动产生的价格/);
  assert.equal(container.querySelector('[data-tracking="research"]'), null);
  assert.doesNotMatch(container.textContent!, /研究进度/);
});

test('正在盯的：有提醒的排前并写那一次；点开看走势、开始盯的位置和各公司影响；各行独立展开', async () => {
  mockFetch({});
  await render(h(page.Tracking));
  const rows = [...container.querySelectorAll('[data-tracking="watching"] [data-variable-row]')] as HTMLElement[];
  assert.deepEqual(rows.map(row => row.dataset.variableRow), ['cmdty:SHFE.AL', 'cmdty:SHFE.AO']);
  assert.match(rows[0]!.textContent!, /沪铝10-08 跌 445 元\/吨 · 神火/);
  assert.match(rows[1]!.textContent!, /^氧化铝神火股份/);
  assert.equal(rows[1]!.querySelector('.status-dot')!.getAttribute('aria-label'), '平稳');
  assert.equal(rows[0]!.querySelector('.tracking-price')!.textContent, '23,465−5', '一行里只有最新价与涨跌（从序列末尾取）');
  assert.ok(rows.every(row => row.querySelector('.tracking-detail') === null && row.querySelector('button.tracking-row')!.getAttribute('aria-expanded') === 'false'), '默认全部折叠');
  assert.equal(container.querySelector('[data-trend]'), null, '走势在展开里');
  assert.ok(rows.every(row => !row.querySelector('.tracking-tag')), '研究带出的不标「我添加的」');
  await React.act(async () => (rows[0]!.querySelector('button.tracking-row') as HTMLButtonElement).click());
  assert.match(rows[0]!.querySelector('.tracking-detail')!.textContent!, /神火股份 · 每涨 1,000 元\/吨\+8\.27 亿元/);
  const trend = rows[0]!.querySelector('[data-trend] svg')!;
  assert.equal(trend.getAttribute('aria-label'), '沪铝 2026-08-10 至 2026-10-12 收盘走势，最新 23,465');
  assert.equal(trend.querySelector('polyline')!.getAttribute('points')!.split(' ').length, 40);
  assert.equal(trend.querySelectorAll('.tracking-trend-alert').length, 1, '提醒过的 10-08 一个空心点');
  assert.equal(trend.querySelectorAll('.tracking-trend-now').length, 1);
  assert.equal(trend.querySelectorAll('.tracking-trend-start').length, 1, '开始盯的位置一根竖线');
  assert.match(rows[0]!.querySelector('.tracking-trend-text')!.textContent!, /08-10 至 10-12 · 09-15 加入/);
  await React.act(async () => (rows[1]!.querySelector('button.tracking-row') as HTMLButtonElement).click());
  assert.ok(rows[0]!.querySelector('.tracking-detail'), '各行独立展开，不互相收起');
  await React.act(async () => (rows[0]!.querySelector('button.tracking-row') as HTMLButtonElement).click());
  assert.equal(rows[0]!.querySelector('.tracking-detail'), null, '再点收起');
  assert.doesNotMatch(container.textContent!, /系数|凭据|数据版本|编号|undefined/);
});

test('开始盯的日子在走势之后（今天刚加、还没有新收盘）时不画开始线，也不写「开始盯」', async () => {
  const items = itemsOf(); for (const item of items.items) item.started_at = '2026-10-26';
  mockFetch({ items });
  await render(h(page.Tracking));
  await React.act(async () => (container.querySelector('[data-variable-row="cmdty:SHFE.AL"] button.tracking-row') as HTMLButtonElement).click());
  assert.equal(container.querySelectorAll('.tracking-trend-start').length, 0);
  assert.doesNotMatch(text('.tracking-trend-text'), /加入/);
});

test('正在盯的：多于 6 条时其余收进「显示另外 N 项」', async () => {
  const [al, ao] = itemsOf().items;
  const many = Array.from({ length: 9 }, (_, i) => ({ ...(i % 2 ? ao : al), id: `price:v${i}`, var_id: `v${i}`, name: `变量${i}`, cards: [] }));
  mockFetch({ items: { as_of: '2026-10-26', items: many, muted: [] } });
  await render(h(page.Tracking));
  assert.equal(container.querySelectorAll('[data-tracking="watching"] [data-variable-row]').length, 6);
  const more = container.querySelector('.tracking-more') as HTMLButtonElement;
  assert.equal(more.textContent, '另外 3 项');
  await React.act(async () => more.click());
  assert.equal(container.querySelectorAll('[data-tracking="watching"] [data-variable-row]').length, 9);
  assert.equal(container.querySelector('.tracking-more'), null);
});

test('清单读不到：一句话加重试；没有任何项：一句引导，仍可添加', async () => {
  mockFetch({ itemsFail: true });
  await render(h(page.Tracking));
  assert.match(container.querySelector('[data-tracking="watching"]')!.textContent!, /读取失败/);
  mockFetch({ items: { as_of: '2026-10-26', items: [], muted: [] } });
  await render(h(page.Tracking));
  assert.match(container.textContent!, /研究过的公司会带出价格/);
  assert.ok([...container.querySelectorAll('button')].some(button => button.textContent === '添加'));
});

test('观察项：一行写名称、为什么重要和倾向；展开看时间轴与信号列表；信号类型可改', async () => {
  const requested = mockFetch({ items: itemsOf([observation()]) });
  await render(h(page.Tracking));
  const row = container.querySelector('[data-observing-row]') as HTMLElement;
  assert.ok(row);
  assert.equal(row.querySelector('b')!.textContent, '华友：镍环节还算不算利润支柱');
  assert.match(row.textContent!, /镍价下行时利润支柱可能转移/);
  assert.equal(row.querySelector('.tracking-tilt')!.textContent, '不利 2');
  assert.equal(row.querySelector('.tracking-detail'), null);
  assert.deepEqual([...container.querySelectorAll('[data-tracking="watching"] .tracking-item')].map(item => item.getAttribute('data-item-id')).slice(-1), ['obs:topic:abc:nickel'], '观察项排在价格后面');
  await React.act(async () => (row.querySelector('button.tracking-row') as HTMLButtonElement).click());
  assert.match(text('.tracking-legend'), /▲ 支持　▼ 不利　○ 无关/);
  const timeline = row.querySelector('.tracking-timeline')!;
  assert.equal(timeline.querySelectorAll('polygon.is-weak').length, 2);
  assert.equal(timeline.querySelectorAll('circle.is-none').length, 1);
  const signals = [...row.querySelectorAll('[data-signal]')];
  assert.deepEqual(signals.map(li => [li.querySelector('time')!.textContent, (li.querySelector('select') as HTMLSelectElement).selectedOptions[0]!.textContent, li.querySelector('span')!.textContent]), [
    ['10-21', '不利', '印尼镍产量上调'], ['10-24', '不利', '镍价跌破成本线'], ['10-25', '无关', '公司披露钴业务扩产']]);
  assert.deepEqual([...signals[0]!.querySelectorAll('option')].map(option => option.textContent), ['支持', '不利', '无关', '未判断']);
  assert.doesNotMatch(container.textContent!, /加强|削弱|偏削弱|偏加强|方向不明/, '界面不出现倾向词');
  const select = signals[2]!.querySelector('select') as HTMLSelectElement;
  select.value = '加强'; // 选项的值仍是 Backend 的取值，显示的是「支持」
  await React.act(async () => { select.dispatchEvent(new win.Event('change', { bubbles: true }) as unknown as Event); });
  assert.ok(requested.some(entry => entry === 'PATCH /finance-research/tracking/items/obs%3Atopic%3Aabc%3Anickel/signals/s3 {"kind":"加强"}'));
  assert.equal(text('[data-summary]'), '支持 1 · 不利 2');
});

test('观察项汇总：两种都有、只有一种、都没有；时间轴居中', async () => {
  const sum = lib2.summaryOf;
  const sig = (kind: string) => ({ id: kind, date: '2026-10-21', text: 'x', kind });
  assert.equal(sum([]), '暂无消息');
  assert.equal(sum([sig('加强'), sig('加强'), sig('削弱'), sig('无关')]), '支持 2 · 不利 1');
  assert.equal(sum([sig('削弱'), sig('削弱'), sig('无关')]), '不利 2');
  assert.equal(sum([sig('加强'), sig('待定')]), '支持 1');
  assert.equal(sum([sig('无关'), sig('待定')]), '暂无消息', '支持和不利都没有');
  assert.deepEqual(lib2.timelineOf([{ ...sig('加强'), date: '2026-10-21' }]).map((dot: any) => dot.x), [210], '只有一个日期居中');
});

test('用户观察按同一研究分组，组名只出现一次', async () => {
  mockFetch({ items: itemsOf([
    observation(), observation({ id: 'obs:topic:abc:cobalt', tracking_key: 'cobalt', name: '钴业务的利润来源' }),
    observation({ id: 'obs:topic:def:cash', topic_id: 'topic:def', topic_title: '现金与分红', tracking_key: 'cash', name: '现金覆盖投资' }),
  ]) });
  await render(h(page.Tracking));
  const groups = [...container.querySelectorAll('[data-observation-group]')];
  assert.deepEqual(groups.map(group => group.querySelector('.tracking-observation-title')!.textContent), ['华友钴业利润来源', '现金与分红']);
  assert.deepEqual(groups.map(group => group.querySelectorAll('[data-observing-row]').length), [2, 1]);
  assert.equal(container.querySelectorAll('.tracking-observation-title').length, 2);
});

test('沪铜多公司按影响绝对值排序、前三家与另外 N 家展开，统一整档不把非零影响写成零', async () => {
  const price = structuredClone(itemsOf().items[0]);
  Object.assign(price, { id: 'price:cmdty:SHFE.CU', var_id: 'cmdty:SHFE.CU', name: '沪铜', cards: [], series: [['2026-10-01', '79000'], ['2026-10-02', '80000']],
    companies: [300000, 4000, -2000, 500].map((coef, index) => ({ ...price.companies[0], symbol: `60000${index}.SH`, name: `公司${index}股份`,
      coef_per_unit: String(coef), step: '10', profit_per_step: String(coef * 10), impact_vs_anchor: String([-100, 300, 200, 50][index]! * 1e8) })) });
  const original = JSON.stringify(price.companies);
  mockFetch({ items: { as_of: '2026-10-02', items: [price], muted: [] } });
  await render(h(page.Tracking));
  const row = container.querySelector('[data-variable-row]')!;
  await React.act(async () => (row.querySelector('button.tracking-row') as HTMLButtonElement).click());
  assert.deepEqual([...row.querySelectorAll('[data-company]')].map(node => node.getAttribute('data-company')), ['600001.SH', '600002.SH', '600000.SH']);
  const more = [...row.querySelectorAll('button')].find(button => button.textContent === '另外 1 家')!;
  await React.act(async () => more.click());
  const details = [...row.querySelectorAll('[data-company]')];
  assert.equal(details.length, 4);
  assert.ok(details.every(node => /每涨 1,000 元\/吨/.test(node.textContent!)));
  assert.doesNotMatch(details.map(node => node.firstElementChild!.textContent).join(''), /[+−]0\.00 亿元/);
  assert.match(details[3]!.textContent!, /\+不足 0\.01 亿元/);
  assert.equal(JSON.stringify(price.companies), original, '只改显示，不改模型');
});

test('不再盯与恢复：悬停的胶囊停掉一项，列表底部「已不再盯 · N 项」里可恢复；失败写一句话', async () => {
  const requested = mockFetch({});
  await render(h(page.Tracking));
  assert.equal(container.querySelector('.tracking-row .tracking-mute, .tracking-line .tracking-mute'), null, '行上没有按钮，触屏也能点：按钮在展开区');
  await React.act(async () => (container.querySelector('[data-variable-row="cmdty:SHFE.AO"] button.tracking-row') as HTMLButtonElement).click());
  const mute = container.querySelector('[data-variable-row="cmdty:SHFE.AO"] .tracking-detail .tracking-mute') as HTMLButtonElement;
  assert.equal(mute.getAttribute('aria-label'), '移出 氧化铝');
  await React.act(async () => mute.click());
  assert.ok(requested.includes('PATCH /finance-research/tracking/items/price%3Acmdty%3ASHFE.AO {"muted":true}'));
  assert.equal(container.querySelector('[data-variable-row="cmdty:SHFE.AO"]'), null);
  assert.equal(text('[data-tracking-muted] > .tracking-more'), '已移出 1 项');
  await React.act(async () => (container.querySelector('[data-tracking-muted] > .tracking-more') as HTMLButtonElement).click());
  assert.equal(text('[data-muted-row]'), '氧化铝恢复');
  await React.act(async () => ([...container.querySelectorAll('[data-muted-row] button')].find(button => button.textContent === '恢复') as HTMLButtonElement).click());
  assert.ok(requested.includes('PATCH /finance-research/tracking/items/price%3Acmdty%3ASHFE.AO {"muted":false}'));
  assert.ok(container.querySelector('[data-variable-row="cmdty:SHFE.AO"]'));
  assert.equal(container.querySelector('[data-tracking-muted]'), null, '没有不再盯的就不出现');
  // 失败：整页清单不动，写一句话。
  const store = itemsOf();
  mockFetch({ items: store });
  await render(h(page.Tracking));
  const original = globalThis.fetch;
  globalThis.fetch = (async (url: string, init?: RequestInit) => init?.method === 'PATCH' ? Response.json({ detail: 'x' }, { status: 503 }) : original(url, init)) as typeof fetch;
  await React.act(async () => (container.querySelector('[data-variable-row="cmdty:SHFE.AO"] button.tracking-row') as HTMLButtonElement).click());
  await React.act(async () => (container.querySelector('[data-variable-row="cmdty:SHFE.AO"] .tracking-mute') as HTMLButtonElement).click());
  assert.match(text('[role="alert"]'), /没成功/);
  assert.ok(container.querySelector('[data-variable-row="cmdty:SHFE.AO"]'));
});

test('添加要盯的：搜价格目录，点一个就加入并标「我添加的」；已在清单里的不再出现；失败写一句话', async () => {
  const requested = mockFetch({});
  await render(h(page.Tracking));
  assert.equal(container.querySelector('[data-tracking-add]'), null, '默认不展开');
  const open = () => React.act(async () => ([...container.querySelectorAll('button')].find(button => button.textContent === '添加') as HTMLButtonElement).click());
  await open();
  const options = () => [...container.querySelectorAll('[data-tracking-add] .tracking-add-options button')].map(button => button.textContent);
  assert.ok(options().includes('焦煤') && options().includes('沪铜'));
  assert.ok(!options().includes('沪铝') && !options().includes('氧化铝'), '已在清单里的不再出现');
  const input = container.querySelector('.tracking-add-input') as HTMLInputElement;
  await React.act(async () => { (Object.getOwnPropertyDescriptor(win.HTMLInputElement.prototype, 'value')!.set as (v: string) => void).call(input, '焦'); input.dispatchEvent(new win.Event('input', { bubbles: true }) as unknown as Event); });
  assert.deepEqual(options(), ['焦煤', '焦炭']);
  await React.act(async () => (container.querySelector('[data-tracking-add] .tracking-add-options button') as HTMLButtonElement).click());
  assert.ok(requested.includes('POST /finance-research/tracking/items {"var_id":"cmdty:DCE.JM"}'));
  assert.equal(container.querySelector('[data-tracking-add]'), null, '加完收起');
  const added = container.querySelector('[data-variable-row="cmdty:DCE.JM"]') as HTMLElement;
  assert.equal(added.querySelector('.tracking-tag')!.textContent, '我添加的');
  // 暂时取不到行情：展开写原因，不画图。
  await React.act(async () => (added.querySelector('button.tracking-row') as HTMLButtonElement).click());
  assert.match(added.querySelector('.tracking-detail')!.textContent!, /行情取数失败/);
  assert.equal(added.querySelector('[data-trend]'), null);
  // 加不上。
  mockFetch({ postFail: true });
  await render(h(page.Tracking));
  await open();
  await React.act(async () => (container.querySelector('[data-tracking-add] .tracking-add-options button') as HTMLButtonElement).click());
  assert.match(text('[role="alert"]'), /没成功/);
});

test('展开状态按行记在本机：展开后重开页面仍展开，收起后不再展开', async () => {
  const store = new Map<string, string>();
  const original = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
  Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: { getItem: (key: string) => store.get(key) ?? null, setItem: (key: string, value: string) => void store.set(key, value), removeItem: (key: string) => void store.delete(key) } });
  try {
    mockFetch({});
    await render(h(page.Tracking));
    await React.act(async () => (container.querySelector('[data-variable-row="cmdty:SHFE.AL"] button.tracking-row') as HTMLButtonElement).click());
    assert.deepEqual(JSON.parse(store.get('finance.trackingOpen')!), ['price:cmdty:SHFE.AL']);
    await render(h(page.Tracking));
    assert.ok(container.querySelector('[data-variable-row="cmdty:SHFE.AL"] .tracking-detail'));
    assert.equal(container.querySelector('[data-variable-row="cmdty:SHFE.AO"] .tracking-detail'), null);
    await React.act(async () => (container.querySelector('[data-variable-row="cmdty:SHFE.AL"] button.tracking-row') as HTMLButtonElement).click());
    assert.deepEqual(JSON.parse(store.get('finance.trackingOpen')!), []);
  } finally {
    if (original) Object.defineProperty(globalThis, 'localStorage', original); else delete (globalThis as Record<string, unknown>).localStorage;
  }
});

test('/insights 重定向到 /tracking，议题页路由保留；导航第三项是「跟踪」', () => {
  const source = readFileSync(new URL('../src/verticals/finance/router.tsx', import.meta.url), 'utf8');
  assert.match(source, /path: "\/tracking", lazy: async \(\) => \(\{ Component: \(await import\("@\/pages\/Tracking"\)\)\.Tracking \}\)/);
  assert.match(source, /path: "\/insights", element: <Navigate to="\/tracking" replace \/>/);
  assert.match(source, /path: "\/insights\/\*", element: <Navigate to="\/tracking" replace \/>/);
  assert.match(source, /path: "\/insights\/topics\/:topicHex", lazy/);
  const layout = readFileSync(new URL('../src/verticals/finance/components/layout/Layout.tsx', import.meta.url), 'utf8');
  assert.match(layout, /\{ to: "\/tracking", icon: \w+, label: "跟踪"/);
  assert.doesNotMatch(layout, /洞悉|待处理/);
});

test('资料页分段「记录」可打开，列出你保存的记录', async () => {
  const requested: string[] = [];
  globalThis.fetch = (async (url: string) => {
    requested.push(String(url));
    if (String(url).includes('/notes?')) return Response.json({ items: [{ id: 'n1', category: 'assistant', title: '问助手 · 铝价', content: '## 问题\n铝价？\n## 回答\n偏强', excerpt: '偏强', created_at: '2026-10-13T01:00:00Z' }], total: 1, next_offset: null });
    return Response.json({ items: [], total: 0 });
  }) as typeof fetch;
  await render(h(reports.UploadedReports), '/my-reports?tab=notes');
  assert.equal(text('h1'), '资料');
  assert.deepEqual([...container.querySelectorAll('.segmented [role="tab"]')].map(tab => tab.textContent), ['资料', '记录']);
  assert.equal(container.querySelector('.segmented [aria-selected="true"]')!.textContent, '记录');
  assert.ok(requested.some(url => url.includes('/notes?')), requested.join('\n'));
  assert.ok(container.querySelector('.rl-note, .rl-notes, [placeholder="搜索记录标题或正文"]'));
});

test('设置页分段「关于我 / 模型 / 连接」，默认「关于我」，切到「模型」才显示模型入口', async () => {
  globalThis.fetch = (async () => Response.json({ detail: 'unused' }, { status: 404 })) as typeof fetch;
  await render(h(native.ModelSettings), '/settings');
  assert.deepEqual([...container.querySelectorAll('.segmented [role="tab"]')].map(tab => tab.textContent), ['关于我', '模型', '连接']);
  assert.equal(container.querySelector('.segmented [aria-selected="true"]')!.textContent, '关于我');
  assert.ok(container.querySelector('.page-head-actions .segmented'), '分段在页首右组，与标题同一行');
  assert.equal(container.querySelector('.page-head-title h1')!.textContent, '设置');
  assert.equal(container.querySelector('[data-assistant-slot]'), null, '设置页没有助手落点');
  const layoutSource = readFileSync(new URL('../src/verticals/finance/components/layout/Layout.tsx', import.meta.url), 'utf8');
  assert.match(layoutSource, /pathname !== "\/settings"/, '设置页不显示「问助手」');
  await React.act(async () => { await new Promise(resolve => setTimeout(resolve, 50)); });
  assert.ok(container.querySelector('input[aria-label="补充关于我"]'));
  assert.doesNotMatch(container.textContent!, /打开模型设置/);
  await React.act(async () => ([...container.querySelectorAll('.segmented [role="tab"]')].find(tab => tab.textContent === '模型') as HTMLElement).click());
  assert.match(container.textContent!, /打开模型设置/);
});

test('设置页分段「连接」：令牌不回显，保存与三种测试结果各一句话，页面不出现技术细节', async () => {
  const calls: { method: string; path: string; body: string }[] = [];
  let outcome = 'ok';
  let saved = { url: '', has_token: true };
  globalThis.fetch = (async (url: string, init?: RequestInit) => {
    const path = String(url);
    calls.push({ method: init?.method ?? 'GET', path, body: String(init?.body ?? '') });
    if (path.endsWith('/test')) return Response.json({ status: outcome });
    if (init?.method === 'PUT') { const body = JSON.parse(String(init.body)); saved = { url: body.url, has_token: body.token === '' ? false : body.token ? true : saved.has_token }; return Response.json(saved); }
    return Response.json(saved);
  }) as typeof fetch;
  await render(h(native.ModelSettings), '/settings');
  await React.act(async () => ([...container.querySelectorAll('.segmented [role="tab"]')].find(tab => tab.textContent === '连接') as HTMLElement).click());
  await React.act(async () => { await new Promise(resolve => setTimeout(resolve, 50)); });
  assert.match(container.textContent!, /不填就用本机/);
  const token = container.querySelector('input[aria-label="访问令牌"]') as HTMLInputElement;
  assert.equal(token.type, 'password');
  assert.equal(token.value, '');
  assert.equal(token.placeholder, '已保存');
  const buttons = () => [...container.querySelectorAll('button')] as HTMLButtonElement[];
  const click = async (label: string) => { await React.act(async () => { buttons().find(button => button.textContent === label)!.click(); await new Promise(resolve => setTimeout(resolve, 20)); }); };
  const type = async (input: HTMLInputElement, value: string) => React.act(async () => {
    Object.getOwnPropertyDescriptor(win.HTMLInputElement.prototype, 'value')!.set!.call(input, value);
    input.dispatchEvent(new win.Event('input', { bubbles: true }));
  });
  await type(container.querySelector('input[aria-label="服务器地址"]') as HTMLInputElement, 'https://backend.example.com/api/v1');
  await type(token, 'secret-token');
  await click('保存');
  const put = calls.find(call => call.method === 'PUT')!;
  assert.deepEqual(JSON.parse(put.body), { url: 'https://backend.example.com/api/v1', token: 'secret-token' });
  assert.equal((container.querySelector('input[aria-label="访问令牌"]') as HTMLInputElement).value, '', '保存后不回显令牌');
  assert.match(container.textContent!, /已保存/);
  for (const [value, line] of [['ok', '已连接'], ['unreachable', '连不上这个地址'], ['unauthorized', '访问令牌不对']]) {
    outcome = value;
    await click('测试连接');
    assert.equal(container.querySelector('.connection-message')!.textContent, line);
  }
  const before = calls.length;
  await click('清除令牌');
  assert.deepEqual(JSON.parse(calls.slice(before).find(call => call.method === 'PUT')!.body), { url: 'https://backend.example.com/api/v1', token: '' });
  assert.equal((container.querySelector('input[aria-label="访问令牌"]') as HTMLInputElement).placeholder, '');
  assert.doesNotMatch(container.textContent!, /Authorization|Bearer|401|finance-backend|请求头|接口/);
});

test('状态点提示挂到 body、固定定位：任何容器裁切或贴边都挡不住；各页不再单独覆盖提示位置', () => {
  const css = readFileSync(new URL('../src/verticals/finance/pages/tracking.css', import.meta.url), 'utf8');
  const research = readFileSync(new URL('../src/verticals/finance/pages/my-research.css', import.meta.url), 'utf8');
  const dot = readFileSync(new URL('../src/verticals/finance/components/ui/status-dot.css', import.meta.url), 'utf8');
  assert.doesNotMatch(css + research, /status-dot-tip/);
  assert.match(dot, /\.status-dot-tip \{ position: fixed;/);
});

test('下次报告要验什么：每家一行「要看：…」与「报告 · 日期」，不折叠没有按钮；预约日未公布写待公布；脚注一句', async () => {
  const reports = [
    { symbol: '000807.SZ', name: '云铝股份', report: '三季报', date: '2026-10-30', date_note: '', checks: ['沪铝', '电力成本', '单季归母净利'], researched_at: '2026-10-20' },
    { symbol: '601288.SH', name: '农业银行', report: '年报', date: null, date_note: '预约日待公布', checks: ['净息差', '不良率', '净资产收益率', '股息率'] },
    { symbol: '000933.SZ', name: '神火股份', report: '三季报', date: '2026-10-31', checks: [] },
  ];
  const requested = mockFetch({ reports });
  await render(h(page.Tracking));
  const group = container.querySelector('[data-tracking="next-reports"]')!;
  assert.equal(group.querySelector('.section-label')!.firstElementChild!.textContent, '下次财报 · 3 家');
  const rows = [...group.querySelectorAll('[data-report-row]')];
  assert.deepEqual(rows.map(row => [row.querySelector('b')!.textContent, row.querySelector('.tracking-text > span')?.textContent ?? '', row.querySelector('time')!.textContent]), [
    ['云铝股份', '沪铝、电力成本、单季归母净利', '三季报 · 10-30'],
    ['农业银行', '净息差、不良率、净资产收益率、股息率', '年报 · 预约日待公布'],
    ['神火股份', '', '三季报 · 10-31']]);
  assert.equal(group.querySelector('button'), null, '无按钮');
  assert.ok(requested.some(entry => /tracking\/next-reports\?symbols=000933\.SZ,601899\.SH$/.test(entry)));
  const order = [...container.querySelectorAll('[data-tracking]')].map(node => node.getAttribute('data-tracking'));
  assert.deepEqual(order, ['watching', 'next-reports'], '在「正在盯的」之后');
  assert.ok(container.querySelector('[data-tracking="watching"]')!.compareDocumentPosition(group) & 4 || container.querySelector('[data-tracking="watching"]')!.contains(group));
  assert.doesNotMatch(container.textContent!, /按报告检查/);
  assert.doesNotMatch(container.textContent!, /暂无数据源/);
});

test('下次报告：没有或读不到时整组不出现，其余照常', async () => {
  mockFetch({ reports: [] });
  await render(h(page.Tracking));
  assert.equal(container.querySelector('[data-tracking="next-reports"]'), null);
  mockFetch({ reports: 'fail' });
  await render(h(page.Tracking));
  assert.equal(container.querySelector('[data-tracking="next-reports"]'), null);
  assert.ok(container.querySelector('[data-variable-row]'));
});

test('价格目录读接口：读不到写一句话加重试', async () => {
  mockFetch({ catalogFail: true });
  await render(h(page.Tracking));
  await React.act(async () => ([...container.querySelectorAll('button')].find(button => button.textContent === '添加') as HTMLButtonElement).click());
  assert.match(text('[data-tracking-add]'), /读取失败/);
  assert.ok([...container.querySelectorAll('[data-tracking-add] button')].some(button => button.textContent === '重试'));
});
