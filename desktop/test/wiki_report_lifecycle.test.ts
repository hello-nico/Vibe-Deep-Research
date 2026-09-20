// Component-level lifecycle tests for the generated-report pane and the
// Company Wiki research tracker. Async behaviour is driven by deferred fetches
// and manually flushed timers — no real network, no wall-clock waits.
import assert from 'node:assert/strict';
import test from 'node:test';
import { createServer } from 'vite';
import { createServer as createHttpServer } from 'node:http';
import { fileURLToPath } from 'node:url';
import { createElement } from 'react';
import { Window } from 'happy-dom';

const HASH_A = 'a'.repeat(64);
const HASH_B = 'b'.repeat(64);

test('图文报告只打开当前版本，不提供历史下拉', async () => {
  const env = await boot();
  try {
    const a = 'report:' + 'a'.repeat(32), b = 'report:' + 'b'.repeat(32);
    globalThis.fetch = async url => {
      const u = String(url);
      if (u.includes('/wiki/reports?')) return Response.json({ items: [
        { report_id: a, title: 'A', created_at: '2026-09-10', input_hash: HASH_A, current: true },
        { report_id: b, title: 'B', created_at: '2026-09-11', input_hash: HASH_B, current: false },
      ] });
      if (u.includes(encodeURIComponent(b))) throw new Error('不得请求旧版本报告');
      return Response.json({ report_id: a, html: '<p>CURRENT_BODY</p>', refs: [] });
    };
    await env.render(createElement(env.Provider, { value: sessionMock() },
      createElement(env.pane.WikiReportPane, { page: page('companies/a'), fallback: '研究页' })));
    const frame = env.container.querySelector('iframe');
    assert.ok(frame, '应打开当前版本');
    assert.match(frame.getAttribute('srcdoc') || '', /CURRENT_BODY/);
    assert.equal(env.container.querySelector('select'), null);
    assert.ok(!env.container.textContent.includes('旧版本'));
    assert.ok(env.container.textContent.includes('重新生成'));
  } finally { await env.cleanup(); }
});

for (const [status, expected] of [['partial', '后台整理部分完成'], ['awaiting_authorization', '研究草案已生成，待审阅']]) {
  test(`后台 ${status} 保留真实业务状态，不宣告 Wiki 已发布`, async () => {
    const env = await bootCompany();
    try {
      const { CompanyWiki } = await env.serverLoad('/src/verticals/finance/pages/CompanyWiki.tsx');
      let running = true;
      let started = false;
      globalThis.fetch = companyFetch(() => [{ id: 'bg-review', parent_session_id: 's-review', display_status: status }]);
      const sessions = sessionMock({
        start: async () => { started = true; return { sessionId: 's-review', status: 'started' }; },
        findCompanySession: async () => started ? { sessionId: 's-review', running } : null,
        sessionState: () => started ? { running } : null,
      });
      await env.render(createElement(env.Provider, { value: sessions }, createElement(env.MemoryRouter,
        { initialEntries: ['/research?company=' + COMPANY_SLUG] }, createElement(CompanyWiki))));
      await env.act(async () => { [...env.container.querySelectorAll('button')].find(b => b.textContent.includes('开始研究')).click(); });
      running = false;
      await env.runTimers(5);
      assert.ok(env.container.textContent.includes(expected));
      assert.ok(!env.container.textContent.includes('研究成果已沉淀'));
      assert.ok(env.container.textContent.includes('查看任务记录'));
      assert.ok(!env.container.textContent.includes('后台正在整理'));
    } finally { await env.cleanup(); }
  });
}

test('四类生成任务继承各自底稿的叙事与产品样式', async () => {
  const env = await boot();
  try {
    for (const [type, expected] of [['company', '指标×报告期'], ['industry', '分类来源'], ['theme', '催化与证伪'], ['comparison', '对比矩阵']]) {
      const input = page('companies/test'); input.spec.type = type;
      const prompt = env.pane.reportPrompt(input);
      assert.ok(prompt.includes(expected), type);
      assert.ok(prompt.includes('1120px'));
      assert.ok(prompt.includes('lieflat-r01'));
      assert.ok(prompt.includes('内部代码'));
      assert.ok(prompt.includes('逐字复制一个完整引用 ID'));
      assert.ok(prompt.includes('禁止用 | 拼接'));
      assert.ok(prompt.includes('URL 编码'));
      assert.ok(!prompt.includes('data-ref="claim:...|'));
    }
  } finally { await env.cleanup(); }
});

function deferred() {
  let resolve, reject;
  const promise = new Promise((res, rej) => { resolve = res; reject = rej; });
  return { promise, resolve, reject };
}

function page(slug, inputHash = HASH_A) {
  return {
    markdown: '# page', published: true, input_hash: inputHash,
    spec: { slug, title: '测试页', type: 'company', as_of: '2026-09-01', blocks: [] },
  };
}

function sessionMock(overrides = {}) {
  return {
    startCalls: [],
    processCalls: [],
    cancelCalls: [],
    start(...args) { this.startCalls.push(args); return deferred().promise; },
    findReportTask: async () => null,
    sessionState: () => null,
    openSession: async () => {},
    openTaskProcess(task) { this.processCalls.push(task); },
    closeTaskProcess() { this.processCalls.push({ close: true }); },
    getTaskProcess: () => null,
    subscribeTaskProcess: () => () => {},
    trajectory: () => ({ subscribe: () => () => {}, getSnapshot: () => ({ running: false, failed: false, openState: 'open', hasMore: false, loadingOlder: false, runningCalls: [], steps: [], streaming: false }), loadOlder: async () => {} }),
    cancelTask: async () => { this.cancelCalls.push('cancel'); },
    subscribeSessionList: () => () => {},
    ...overrides,
  };
}

async function boot() {
  const win = new Window({ url: 'http://localhost/' });
  const previous = {
    window: globalThis.window, document: globalThis.document,
    localStorage: globalThis.localStorage, sessionStorage: globalThis.sessionStorage,
    MessageEvent: globalThis.MessageEvent, CustomEvent: globalThis.CustomEvent,
    HTMLElement: globalThis.HTMLElement, IS_REACT_ACT_ENVIRONMENT: globalThis.IS_REACT_ACT_ENVIRONMENT,
    fetch: globalThis.fetch,
  };
  Object.assign(globalThis, {
    window: win, document: win.document,
    localStorage: win.localStorage, sessionStorage: win.sessionStorage,
    MessageEvent: win.MessageEvent, CustomEvent: win.CustomEvent,
    HTMLElement: win.HTMLElement, IS_REACT_ACT_ENVIRONMENT: true,
  });
  const server = await createServer({ configFile: false, root: fileURLToPath(new URL('../', import.meta.url)),
    resolve: { alias: [{ find: '@', replacement: fileURLToPath(new URL('../src/verticals/finance', import.meta.url)) }] },
    server: { middlewareMode: true, hmr: { server: createHttpServer() }, watch: null }, appType: 'custom',
    ssr: { noExternal: ['react-router-dom', 'react-router'], resolve: { conditions: ['module-sync', 'node', 'import', 'development'] } } });
  const reactDomClient = await import('react-dom/client');
  const testUtils = await import('react-dom/test-utils');
  const routerDom = await server.ssrLoadModule('react-router-dom');
  const pane = await server.ssrLoadModule('/src/verticals/finance/components/WikiReportPane.tsx');
  const { act } = testUtils;
  const container = win.document.createElement('div');
  win.document.body.appendChild(container);
  const root = reactDomClient.createRoot(container);
  const render = async element => { await act(async () => { root.render(element); }); };
  const cleanup = async () => {
    await act(async () => { root.unmount(); });
    await server.close();
    Object.assign(globalThis, previous);
    win.close();
  };
  return { win, container, render, cleanup, act, pane, serverLoad: (p) => server.ssrLoadModule(p), MemoryRouter: routerDom.MemoryRouter, Provider: (await server.ssrLoadModule('/src/verticals/finance/dsh/research-session.tsx')).ResearchSessionContext.Provider };
}

test('晚到的列表响应不会覆盖已切换的页面版本', async () => {
  const env = await boot();
  try {
    const listA = deferred();
    const listB = deferred();
    globalThis.fetch = async (url) => {
      const u = String(url);
      if (u.includes('slug=companies%2Fa')) return listA.promise;
      if (u.includes('slug=companies%2Fb')) return listB.promise;
      if (u.includes('/wiki/reports/report')) return Response.json({ report_id: 'report:' + '1'.repeat(32), html: '<p>B</p>', refs: [], allowed_refs: [], input_hash: HASH_B, title: 'B', created_at: '2026-09-10', current: true });
      return Response.json({ items: [] });
    };
    const sessions = sessionMock();
    const wrap = child => createElement(env.Provider, { value: sessions }, child);
    await env.render(wrap(createElement(env.pane.WikiReportPane, { page: page('companies/a'), fallback: '研究页' })));
    await env.render(wrap(createElement(env.pane.WikiReportPane, { page: page('companies/b'), fallback: '研究页' })));
    await env.act(async () => { listB.resolve(Response.json({ items: [{ report_id: 'report:' + '1'.repeat(32), title: 'B版', created_at: '2026-09-10', input_hash: HASH_B, current: true }] })); });
    // A 的响应在切换后才返回 —— 绝不能把 A 的空列表写回，否则 B 的生成版会消失并触发重复发起。
    await env.act(async () => { listA.resolve(Response.json({ items: [] })); });
    await env.act(async () => {});
    assert.ok(env.container.querySelector('iframe'), 'B 版本生成版应展示');
    assert.ok(env.container.textContent.includes('对应当前 Wiki'), '应标注对应当前 Wiki');
    assert.deepEqual(sessions.startCalls.map(c => c[2]), [], '迟到的空列表不得触发重复发起: ' + JSON.stringify(sessions.startCalls.map(c => c[0]?.slice?.(0,60))));
  } finally { await env.cleanup(); }
});

test('已有运行中任务时不重复发起生成', async () => {
  const env = await boot();
  try {
    globalThis.fetch = async () => Response.json({ items: [] });
    const sessions = sessionMock({
      findReportTask: async () => ({ sessionId: 's-1', slug: 'companies/a', inputHash: HASH_A, running: true }),
    });
    await env.render(createElement(env.Provider, { value: sessions },
      createElement(env.pane.WikiReportPane, { page: page('companies/a'), fallback: '研究页' })));
    await env.act(async () => {});
    assert.equal(sessions.startCalls.length, 0, '任务已在执行时不得再次 start');
    assert.ok(env.container.textContent.includes('正在生成'));
  } finally { await env.cleanup(); }
});

test('任务结束后：发现当前版本制品则选中，执行失败只显示通用文案', async () => {
  const env = await boot();
  try {
    const detailId = 'report:' + '3'.repeat(32);
    let running = true;
    globalThis.fetch = async (url) => {
      const u = String(url);
      if (u.includes('/wiki/reports?')) return Response.json({ items: running ? [] : [{ report_id: detailId, title: '新报告', created_at: '2026-09-12', input_hash: HASH_A, current: true }] });
      if (u.includes('/wiki/reports/report')) return Response.json({ report_id: detailId, html: '<p data-ref="claim:ok">正文</p>', refs: ['claim:ok'], allowed_refs: ['claim:ok'], input_hash: HASH_A, title: '新报告', created_at: '2026-09-12', current: true });
      return Response.json({ items: [] });
    };
    let listListener = () => {};
    const sessions = sessionMock({
      findReportTask: async () => ({ sessionId: 's-9', slug: 'companies/a', inputHash: HASH_A, running }),
      sessionState: () => ({ running, lastAgentError: running ? null : 'internal stack trace', promptError: null, removed: false, awaitingFirstTurn: false }),
      subscribeSessionList: (listener) => { listListener = listener; return () => {}; },
    });
    await env.render(createElement(env.Provider, { value: sessions },
      createElement(env.pane.WikiReportPane, { page: page('companies/a'), fallback: '研究页' })));
    await env.act(async () => {}); // first check registers running=true
    running = false;
    await env.act(async () => { listListener(); }); // task ended → artifact refresh
    await env.act(async () => {});
    assert.ok(env.container.querySelector('iframe'), '应展示生成版 iframe');
    // sessionState 暴露的原始错误不得出现在界面上
    assert.ok(!env.container.textContent.includes('internal stack trace'));
  } finally { await env.cleanup(); }
});

test('运行中任务绑定的是旧版本时提示而非发起新版本', async () => {
  const env = await boot();
  try {
    globalThis.fetch = async () => Response.json({ items: [] });
    const sessions = sessionMock({
      findReportTask: async () => ({ sessionId: 's-2', slug: 'companies/a', inputHash: HASH_B, running: true }),
    });
    await env.render(createElement(env.Provider, { value: sessions },
      createElement(env.pane.WikiReportPane, { page: page('companies/a', HASH_A), fallback: '研究页' })));
    await env.act(async () => {});
    assert.equal(sessions.startCalls.length, 0);
    assert.ok(env.container.textContent.includes('另一版本'));
  } finally { await env.cleanup(); }
});

test('引用点击只放行当前制品白名单内的引用', async () => {
  const env = await boot();
  try {
    const detailId = 'report:' + '4'.repeat(32);
    globalThis.fetch = async (url) => {
      const u = String(url);
      if (u.includes('/wiki/reports?')) return Response.json({ items: [{ report_id: detailId, title: 'R', created_at: '2026-09-12', input_hash: HASH_A, current: true }] });
      if (u.includes('/wiki/reports/report')) return Response.json({ report_id: detailId, html: '<p>正文</p>', refs: ['claim:ok'], allowed_refs: ['claim:ok', 'evidence:e2'], input_hash: HASH_A, title: 'R', created_at: '2026-09-12', current: true });
      return Response.json({ items: [] });
    };
    const sessions = sessionMock();
    const evidence = [];
    env.win.addEventListener('finance-open-evidence', event => evidence.push(event.detail));
    await env.render(createElement(env.Provider, { value: sessions },
      createElement(env.pane.WikiReportPane, { page: page('companies/a'), fallback: '研究页' })));
    await env.act(async () => {});
    const frame = env.container.querySelector('iframe');
    assert.ok(frame, 'iframe 应已挂载');
    const dispatch = (data, source) => env.win.dispatchEvent(new env.win.MessageEvent('message', { data, source }));
    // 白名单内引用放行
    dispatch({ source: 'vibe-wiki-report', type: 'cite', ref: 'claim:ok' }, frame.contentWindow);
    assert.deepEqual(evidence, ['claim:ok']);
    // 运行时注入的未知引用被拒（内联脚本可伪造 data-ref）
    dispatch({ source: 'vibe-wiki-report', type: 'cite', ref: 'claim:injected' }, frame.contentWindow);
    assert.equal(evidence.length, 1);
    // 非本 iframe 来源被拒
    dispatch({ source: 'vibe-wiki-report', type: 'cite', ref: 'claim:ok' }, env.win);
    assert.equal(evidence.length, 1);
  } finally { await env.cleanup(); }
});

// ─── CompanyWiki 沉淀状态机：执行结束 ≠ 完成 ───

async function bootCompany() {
  const env = await boot();
  const timers = [];
  env.win.setTimeout = (cb) => { timers.push(cb); return timers.length; };
  env.runTimers = async (max = 20) => {
    for (let i = 0; i < max && timers.length; i++) {
      const cb = timers.shift();
      await env.act(async () => { cb(); });
      await env.act(async () => {});
    }
  };
  return env;
}

const COMPANY_SLUG = 'companies/600900-sh';

function companyFetch(bgTasks, pageHash = HASH_A) {
  return async (url, init) => {
    const u = String(url);
    if (u.includes('/wiki/pages?')) return Response.json({ items: [], total: 0 });
    if (u.includes('/wiki/pages/ensure')) return Response.json({ slug: COMPANY_SLUG, action: 'created' });
    if (u.includes('/wiki/pages/read')) return Response.json({ markdown: '# p', published: true, input_hash: pageHash, spec: { slug: COMPANY_SLUG, title: '长江电力', type: 'company', as_of: '2026-09-01', blocks: [] } });
    if (u.includes('/finance-background-tasks') || u.includes('background-tasks')) return Response.json({ items: bgTasks() });
    return Response.json({});
  };
}

test('会话结束后：后台整理中 → 无新增确认 → done；原始错误不外泄', async () => {
  const env = await bootCompany();
  try {
    const CompanyWiki = (await (await env.serverLoad('/src/verticals/finance/pages/CompanyWiki.tsx'))).CompanyWiki;
    let running = true;
    let started = false;
    let tasks = [];
    globalThis.fetch = companyFetch(() => tasks);
    const sessions = sessionMock({
      start: async () => { started = true; return { sessionId: 's-co-1', status: 'started' }; },
      findCompanySession: async () => started ? { sessionId: 's-co-1', title: 'x', running } : null,
      sessionState: () => started ? { running, lastAgentError: null, promptError: null, removed: false, awaitingFirstTurn: false } : null,
    });
    const element = createElement(env.Provider, { value: sessions },
      createElement(env.MemoryRouter, { initialEntries: ['/research?company=' + COMPANY_SLUG] },
        createElement(CompanyWiki, {})));
    await env.render(element);
    await env.act(async () => {});
    const startButton = [...env.container.querySelectorAll('button')].find(b => b.textContent.includes('开始研究'));
    assert.ok(startButton, '缺页应展示开始研究入口');
    await env.act(async () => { startButton.click(); });
    await env.act(async () => {});
    assert.ok(env.container.querySelector('.research-loading-scan'), '缺页执行中应使用 Wiki 等待扫描');
    assert.ok(env.container.textContent.includes('研究进行中'), '应进入执行中');
    // 执行结束 → 进入后台整理语义，不是 done。
    running = false;
    tasks = [{ id: 'bg-1', parent_session_id: 's-co-1', display_status: 'running', started_at: '2026-09-12T00:00:00Z' }];
    await env.runTimers(4);
    assert.ok(env.container.textContent.includes('后台正在整理'), '执行结束后应显示后台整理中');
    // 沉淀确认：无新增。
    tasks = [{ id: 'bg-1', parent_session_id: 's-co-1', display_status: 'no_increment', started_at: '2026-09-12T00:00:00Z' }];
    await env.runTimers(4);
    assert.ok(env.container.textContent.includes('没有产生新增内容'), '应如实报告本轮无新增');
  } finally { await env.cleanup(); }
});

test('查不到后台任务且页面未变：超时后明确"尚未确认"而非 done', async () => {
  const env = await bootCompany();
  try {
    const CompanyWiki = (await (await env.serverLoad('/src/verticals/finance/pages/CompanyWiki.tsx'))).CompanyWiki;
    let running = true;
    let started = false;
    globalThis.fetch = companyFetch(() => []);
    const sessions = sessionMock({
      start: async () => { started = true; return { sessionId: 's-co-2', status: 'started' }; },
      findCompanySession: async () => started ? { sessionId: 's-co-2', title: 'x', running } : null,
      sessionState: () => started ? { running, lastAgentError: null, promptError: null, removed: false, awaitingFirstTurn: false } : null,
    });
    const realNow = Date.now;
    let offset = 0;
    Date.now = () => realNow() + offset;
    try {
      await env.render(createElement(env.Provider, { value: sessions },
        createElement(env.MemoryRouter, { initialEntries: ['/research?company=' + COMPANY_SLUG] },
          createElement(CompanyWiki, {}))));
      await env.act(async () => {});
      const startButton = [...env.container.querySelectorAll('button')].find(b => b.textContent.includes('开始研究'));
      await env.act(async () => { startButton.click(); });
      await env.act(async () => {});
      running = false;
      await env.runTimers(2); // researching → settling（settleAt 以此刻为准）
      assert.ok(env.container.textContent.includes('后台正在整理'), '应先进入后台整理中');
      offset = 200_000; // 沉淀窗口之外
      await env.runTimers(4);
      assert.ok(env.container.textContent.includes('尚未确认'), '超时后应显示结果待确认而非完成');
    } finally { Date.now = realNow; }
  } finally { await env.cleanup(); }
});

test('生成过程打开只读面板，不调用 openSession，关闭不中止', async () => {
  const env = await boot();
  try {
    globalThis.fetch = async () => Response.json({ items: [] });
    let opened = 0;
    const sessions = sessionMock({
      findReportTask: async () => ({ sessionId: 's-report', slug: 'companies/a', inputHash: HASH_A, running: true }),
      openSession: async () => { opened += 1; },
    });
    await env.render(createElement(env.Provider, { value: sessions },
      createElement(env.pane.WikiReportPane, { page: page('companies/a'), fallback: '研究页' })));
    await env.act(async () => {});
    const button = [...env.container.querySelectorAll('button')].find(b => b.textContent.includes('生成过程'));
    assert.ok(button, '运行中应提供生成过程入口');
    await env.act(async () => { button.click(); });
    assert.equal(opened, 0);
    assert.equal(sessions.processCalls[0]?.sessionId, 's-report');
    assert.equal(sessions.processCalls[0]?.kind, 'report');
    assert.deepEqual(sessions.cancelCalls, []);
    sessions.closeTaskProcess();
    assert.deepEqual(sessions.cancelCalls, []);
    assert.equal(opened, 0);
  } finally { await env.cleanup(); }
});

test('已结束且无制品的旧任务不显示刚刚生成完，也不自动重跑', async () => {
  const env = await boot();
  try {
    globalThis.fetch = async () => Response.json({ items: [] });
    const sessions = sessionMock({
      findReportTask: async () => ({ sessionId: 's-old', slug: 'companies/a', inputHash: HASH_A, running: false }),
    });
    const wrap = (active: boolean) => createElement(env.Provider, { value: sessions },
      createElement(env.pane.WikiReportPane, { page: page('companies/a'), fallback: '研究页正文', active }));
    await env.render(wrap(false));
    await env.act(async () => {});
    await env.render(wrap(true));
    await env.act(async () => {});
    assert.equal(sessions.startCalls.length, 0, '旧任务不得在打开图文报告时自动重跑');
    assert.ok(!env.container.textContent.includes('尚未确认'), '不得把未生成过的旧绑定说成刚刚结束');
    assert.ok(!env.container.textContent.includes('报告生成失败'));
    assert.ok(env.container.textContent.includes('生成报告'));
    assert.ok(env.container.textContent.includes('生成过程'));
    assert.ok(env.container.textContent.includes('还没有图文报告'));
    assert.ok(!env.container.textContent.includes('研究页正文'));
  } finally { await env.cleanup(); }
});

test('空报告区点击即发起生成，启动成功后即使索引尚未回读也保持正在生成', async () => {
  const env = await boot();
  try {
    globalThis.fetch = async () => Response.json({ items: [] });
    let resolveStart: (value: { sessionId: string; status: string }) => void = () => {};
    const sessions = sessionMock({
      findReportTask: async () => ({ sessionId: 's-old', slug: 'companies/a', inputHash: HASH_A, running: false }),
      start(...args: unknown[]) {
        this.startCalls.push(args);
        return new Promise(resolve => { resolveStart = resolve; });
      },
    });
    await env.render(createElement(env.Provider, { value: sessions },
      createElement(env.pane.WikiReportPane, { page: page('companies/a'), fallback: '研究页正文' })));
    await env.act(async () => {});
    const hit = env.container.querySelector('.wiki-report-empty-hit');
    assert.ok(hit, '空报告文案应可点击');
    await env.act(async () => { hit.click(); });
    assert.equal(sessions.startCalls.length, 1);
    assert.ok(env.container.textContent.includes('正在生成图文报告'));
    await env.act(async () => { resolveStart({ sessionId: 's-new', status: 'started' }); });
    assert.ok(env.container.textContent.includes('正在生成图文报告'), 'start 返回后不得弹回空态');
    assert.ok(env.container.textContent.includes('生成过程'));
    assert.ok(!env.container.textContent.includes('还没有图文报告'));
  } finally { await env.cleanup(); }
});

test('本页目击的运行结束后若无制品，才提示尚未确认', async () => {
  const env = await boot();
  try {
    globalThis.fetch = async () => Response.json({ items: [] });
    let running = true;
    let listListener = () => {};
    const sessions = sessionMock({
      findReportTask: async () => ({ sessionId: 's-live', slug: 'companies/a', inputHash: HASH_A, running }),
      sessionState: () => ({ running, lastAgentError: null, promptError: null, removed: false, awaitingFirstTurn: false }),
      subscribeSessionList: (listener) => { listListener = listener; return () => {}; },
    });
    await env.render(createElement(env.Provider, { value: sessions },
      createElement(env.pane.WikiReportPane, { page: page('companies/a'), fallback: '研究页正文' })));
    await env.act(async () => {});
    assert.ok(env.container.textContent.includes('正在生成'));
    running = false;
    await env.act(async () => { listListener(); });
    await env.act(async () => {});
    assert.ok(env.container.textContent.includes('尚未确认'));
    assert.ok(env.container.textContent.includes('研究页原文可随时切回去看') || env.container.textContent.includes('原文还在「研究页」里'));
    assert.ok(!env.container.textContent.includes('研究页正文'));
    assert.equal(sessions.startCalls.length, 0);
  } finally { await env.cleanup(); }
});
