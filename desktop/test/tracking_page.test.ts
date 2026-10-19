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
let page: Record<string, any>, lib: Record<string, any>, router: Record<string, any>, pageContext: Record<string, any>, sessionModule: Record<string, any>, native: Record<string, any>, reports: Record<string, any>;
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

const STEPS = ['取数', '读报告', '计算关键变量', '估值与论点', '保存到个股页', '整理结论'];
function record(symbol: string, name: string, over: Record<string, unknown> = {}) {
  const status = (over.status as string) ?? 'running';
  const current = (over.current_step as number) ?? 2;
  return { task_id: `task:${symbol}`, kind: 'company_research', symbol, slug: `companies/${symbol.slice(0, 6)}`, title: `公司研究 · ${name}`, status, current_step: current,
    steps: STEPS.map((label, index) => ({ key: ['fetch', 'read_report', 'key_variables', 'valuation', 'save', 'settle'][index], label, attempts: 0, finished_at: null, outputs: {},
      status: index + 1 < current ? 'done' : index + 1 === current ? (status === 'running' ? 'running' : 'pending') : 'pending' })),
    sessions: ['s1'], host_boot_id: 'boot', trigger_note: null, reason: null, created_at: '2026-10-14T01:00:00Z', updated_at: '2026-10-14T02:00:00Z', finished_at: null, ...over };
}

function mockFetch(options: { records?: unknown[] | 'fail'; variables?: unknown; grades?: Record<string, string | null> }) {
  const requested: string[] = [];
  globalThis.fetch = (async (url: string) => {
    const path = String(url);
    requested.push(path);
    if (path.startsWith('/finance-research-tasks')) return options.records === 'fail' ? Response.json({}, { status: 503 }) : Response.json({ items: options.records ?? [] });
    if (path.includes('/page-research')) {
      const symbol = /companies\/([^/]+)\//.exec(path)![1]!;
      const grade = options.grades?.[symbol];
      return Response.json({ research: grade ? { valuation: { grade } } : null, stale: false, basisVersion: 'v' });
    }
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
  assert.equal(line({ current_step: 2 }), '第 2 步，共 6 步 · 读报告');
  assert.equal(line({ status: 'interrupted' }), '正在接着上次的进度继续');
  assert.equal(line({ status: 'completed' }, '合理'), '完成，估值「合理」');
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

test('跟踪页：页首只有标题；两块组名在卡片外', async () => {
  mockFetch({ records: [record('000933.SZ', '神火股份')] });
  await render(h(page.Tracking));
  assert.equal(text('h1'), '跟踪');
  assert.equal(container.querySelector('.page-head-sub'), null);
  assert.deepEqual([...container.querySelectorAll('.section-label')].map(label => label.firstElementChild!.textContent), ['正在盯的', '研究']);
  assert.ok([...container.querySelectorAll('.section-label')].every(label => !label.closest('.card')), '组名在卡片外');
  assert.match(text('.section-label:nth-of-type(1)') || container.textContent!, /研究里自动产生的价格和指标/);
});

test('正在盯的：有卡片的排前并写那一次；没有的写平静；没有行情的写跟着财报；点开看各公司影响', async () => {
  mockFetch({ records: [] });
  await render(h(page.Tracking));
  const rows = [...container.querySelectorAll('[data-tracking="watching"] [data-variable-row]')] as HTMLElement[];
  assert.deepEqual(rows.map(row => row.dataset.variableRow), ['cmdty:SHFE.AL', 'cmdty:SHFE.AO', '000933.SZ:coal_price']);
  assert.match(rows[0]!.textContent!, /沪铝10 月 8 日 跌 445 元\/吨，已提醒 · 神火/);
  assert.match(rows[1]!.textContent!, /本周没有大的波动 · 神火/);
  assert.match(rows[2]!.textContent!, /没有公开行情，跟着财报更新 · 神火/);
  assert.match(rows[0]!.textContent!, /2026-10-12$/, '右侧灰字是最新数据日期');
  assert.equal(rows[0]!.querySelector('.tracking-detail'), null);
  await React.act(async () => (rows[0]!.querySelector('button.tracking-row') as HTMLButtonElement).click());
  assert.match(rows[0]!.querySelector('.tracking-detail')!.textContent!, /神火股份 · 每涨 1,000 元\/吨\+8\.27 亿元/);
  await React.act(async () => (rows[2]!.querySelector('button.tracking-row') as HTMLButtonElement).click());
  assert.match(rows[2]!.querySelector('.tracking-detail')!.textContent!, /无公开日行情，靠财报与对话更新/);
  assert.equal(rows[0]!.querySelector('.tracking-detail'), null, '一次只展开一行');
  const foot = text('.tracking-foot');
  assert.match(foot, /紫金矿业.*没有研究/, '取得到名字就显示简称');
  assert.doesNotMatch(foot, /601899/);
  assert.equal(container.querySelector('.tracking-foot a')!.textContent, '去研究');
  assert.equal(container.querySelector('.tracking-foot a')!.getAttribute('href'), '/watch/601899', '只有一家：直达该公司个股页');
  assert.doesNotMatch(container.textContent!, /系数|凭据|数据版本|编号/);
});

test('没研究的公司有多家：「去研究」跳到关注列表', async () => {
  const variables = { ...trackingFixture, coverage: { ...trackingFixture.coverage, unresearched: ['601899.SH', '600519.SH'] } };
  mockFetch({ records: [], variables });
  await render(h(page.Tracking));
  const link = container.querySelector('.tracking-foot a')!;
  assert.equal(link.textContent, '去研究');
  assert.equal(link.getAttribute('href'), '/watch');
});

test('正在盯的：多于 6 条时其余收进「显示另外 N 项」', async () => {
  const [al, ao, coal] = trackingFixture.variables;
  const many = Array.from({ length: 9 }, (_, i) => ({ ...(i % 2 ? ao : al), var_id: `v${i}`, name: `变量${i}` }));
  mockFetch({ records: [], variables: { ...trackingFixture, variables: [...many, coal], cards: [] } });
  await render(h(page.Tracking));
  assert.equal(container.querySelectorAll('[data-tracking="watching"] [data-variable-row]').length, 6);
  const more = container.querySelector('.tracking-more') as HTMLButtonElement;
  assert.equal(more.textContent, '显示另外 4 项');
  await React.act(async () => more.click());
  assert.equal(container.querySelectorAll('[data-tracking="watching"] [data-variable-row]').length, 10);
  assert.equal(container.querySelector('.tracking-more'), null);
});

test('研究：五种状态的一句话、进度条只给进行中的、完成时带估值五档', async () => {
  mockFetch({
    records: [
      record('000933.SZ', '神火股份', { updated_at: '2026-10-14T05:00:00Z', current_step: 2 }),
      record('000807.SZ', '云铝股份', { updated_at: '2026-10-14T04:00:00Z', status: 'completed', current_step: 6 }),
      record('603993.SH', '洛阳钼业', { updated_at: '2026-10-14T03:00:00Z', status: 'interrupted', current_step: 3 }),
      record('600111.SH', '北方稀土', { updated_at: '2026-10-14T02:00:00Z', status: 'failed', reason: '最新定期报告还没入库' }),
      record('002460.SZ', '赣锋锂业', { updated_at: '2026-10-14T01:00:00Z', status: 'cancelled' }),
    ],
    grades: { '000807.SZ': '合理' },
  });
  await render(h(page.Tracking));
  const rows = [...container.querySelectorAll('[data-research-row]')] as HTMLElement[];
  assert.deepEqual(rows.map(row => row.querySelector('b')!.textContent), ['神火股份', '云铝股份', '洛阳钼业', '北方稀土', '赣锋锂业']);
  assert.deepEqual(rows.map(row => row.querySelector('.tracking-text > span')!.textContent), [
    '第 2 步，共 6 步 · 读报告', '完成，估值「合理」', '正在接着上次的进度继续', '最新定期报告还没入库', '已中止']);
  assert.equal(container.querySelectorAll('[role="progressbar"]').length, 1);
  assert.equal(rows[0]!.querySelector('[role="progressbar"] u')!.getAttribute('style'), 'width: 16.666666666666664%;');
  assert.equal(container.querySelector('[data-research-row="000933.SZ"] [data-tracking]'), null);
});

test('研究：点开显示六步；读报告附报告标题，关键变量附变量名，其余输出一概不显示；去个股页', async () => {
  const done = record('000933.SZ', '神火股份', { status: 'running', current_step: 4 });
  done.steps[0]!.outputs = { packet_as_of: '2026-10-14' };
  done.steps[1]!.outputs = { title: '2026 年半年度报告', document_id: 'doc-secret', parse_revision_id: 'rev-secret', parsed_content_sha256: 'sha-secret' };
  done.steps[2]!.outputs = { variables: ['沪铝', '氧化铝', '电价'], sensitivity_ref: 'result:secret', scenario_ref: 'result:secret2' };
  mockFetch({ records: [done] });
  await render(h(page.Tracking));
  await React.act(async () => (container.querySelector('[data-research-row] button.tracking-row') as HTMLButtonElement).click());
  const steps = [...container.querySelectorAll('.tracking-steps li')];
  assert.deepEqual(steps.map(li => li.children[1]!.textContent), ['取数', '读报告2026 年半年度报告', '计算关键变量沪铝、氧化铝、电价', '估值与论点', '保存到个股页', '整理结论']);
  assert.deepEqual(steps.map(li => li.querySelector('em')!.textContent), ['完成', '完成', '完成', '进行中', '等待', '等待']);
  assert.doesNotMatch(container.textContent!, /secret|packet_as_of|2026-10-14|document_id|sha|result:|session/i);
  assert.equal([...container.querySelectorAll('.tracking-detail a')].find(a => a.textContent === '去个股页')!.getAttribute('href'), '/watch/000933');
});

test('研究：没有任何记录时一句引导加「去关注」；读取失败一句话加重试', async () => {
  mockFetch({ records: [] });
  await render(h(page.Tracking));
  const block = container.querySelector('[data-tracking="research"]')!;
  assert.match(block.textContent!, /关注公司后，研究进度和结果会出现在这里/);
  assert.equal(block.querySelector('a')!.getAttribute('href'), '/watch');
  mockFetch({ records: 'fail' });
  await render(h(page.Tracking));
  assert.match(container.querySelector('[data-tracking="research"]')!.textContent!, /研究进度暂时读取不到/);
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

test('设置页分段「记忆」可打开，原样显示画像与近期记忆', async () => {
  globalThis.fetch = (async () => Response.json({ detail: 'unused' }, { status: 404 })) as typeof fetch;
  await render(h(native.ModelSettings), '/settings');
  assert.deepEqual([...container.querySelectorAll('.segmented [role="tab"]')].map(tab => tab.textContent), ['模型', '连接', '记忆']);
  assert.match(container.textContent!, /打开模型设置/);
  assert.ok(container.querySelector('.page-head-actions .segmented'), '分段在页首右组，与标题同一行');
  assert.equal(container.querySelector('.page-head-title h1')!.textContent, '设置');
  assert.equal(container.querySelector('[data-assistant-slot]'), null, '设置页没有助手落点');
  const layoutSource = readFileSync(new URL('../src/verticals/finance/components/layout/Layout.tsx', import.meta.url), 'utf8');
  assert.match(layoutSource, /pathname !== "\/settings"/, '设置页不显示「问助手」');
  await React.act(async () => ([...container.querySelectorAll('.segmented [role="tab"]')].find(tab => tab.textContent === '记忆') as HTMLElement).click());
  await React.act(async () => { await new Promise(resolve => setTimeout(resolve, 50)); });
  assert.match(container.textContent!, /助手回答时会参考这里的内容/);
  assert.match(container.textContent!, /用户画像/);
  assert.doesNotMatch(container.textContent!, /打开模型设置/);
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

test('跟踪页状态点提示不被卡片裁切、不压住标题：卡片不 overflow hidden，提示以整行定位落在行的正上方', () => {
  const css = readFileSync(new URL('../src/verticals/finance/pages/tracking.css', import.meta.url), 'utf8');
  assert.match(css, /\.tracking-card \{ overflow: visible; \}/);
  assert.doesNotMatch(css, /\.tracking-card \{ overflow: hidden/);
  assert.match(css, /\.tracking-row \{ position: relative; \}/);
  assert.match(css, /\.tracking-row \.status-dot-tip \{ left: 12px; bottom: calc\(100% \+ 4px\);/);
});
