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

test('质检提示在报告顶部可见并保留入场动画', async () => {
  const env = await boot();
  try {
    const id = 'report:' + 'e'.repeat(32);
    globalThis.fetch = async url => String(url).includes('/wiki/reports?')
      ? Response.json({items:[{report_id:id,title:'报告',created_at:'2026-09-26',input_hash:HASH_A,current:true}]})
      : Response.json({report_id:id,html:'<p style="animation:enter 1s">正文</p>',quality_warnings:[{check:'text_clipped'}]});
    await env.render(createElement(env.Provider,{value:sessionMock()},createElement(env.pane.WikiReportPane,{page:page('companies/a')})));
    assert.match(env.container.textContent,/这份报告有 1 处排版待核，可重新生成/);
    assert.match(env.container.querySelector('iframe')?.getAttribute('srcdoc') || '',/animation:enter 1s/);
  } finally { await env.cleanup(); }
});

test('待核引用显示顶部提示并给引用追加标记说明', async () => {
  const env = await boot();
  try {
    const id = 'report:' + 'f'.repeat(32);
    globalThis.fetch = async url => String(url).includes('/wiki/reports?')
      ? Response.json({ items: [{ report_id: id, title: '报告', created_at: '2026-09-26', input_hash: HASH_A, current: true }] })
      : Response.json({ report_id: id, html: '<p data-ref="source:a">8亿元</p>', refs: ['source:a'], unverified_refs: ['source:a'] });
    await env.render(createElement(env.Provider, { value: sessionMock() }, createElement(env.pane.WikiReportPane, { page: page('companies/a') })));
    assert.match(env.container.textContent, /有 1 处引用待核/);
    const html = env.container.querySelector('iframe')?.getAttribute('srcdoc') || '';
    assert.match(html, /mark.textContent='待核'/);
    assert.match(html, /这条引用的原文里没有找到对应数字/);
    const document = new Window({ settings: { enableJavaScriptEvaluation: true } });
    document.document.body.innerHTML = '<p data-ref="source:a">8亿元</p><p data-ref="source:b">正常</p>';
    document.eval(html.match(/<script data-product-report-verification>([\s\S]*?)<\/script>/)?.[1] || '');
    assert.equal(document.document.querySelectorAll('small').length, 1);
    assert.equal(document.document.querySelector('small')?.textContent, '待核');
    assert.equal(document.document.querySelector('small')?.title, '数字对不上：这条引用的原文里没有找到对应数字');
    document.happyDOM.abort();
  } finally { await env.cleanup(); }
});

test('语义待核与数字共用一个标记，失败不标，悬停区分原因', async () => {
  const env = await boot();
  try {
    const checks = [
      {ref:'source:a',status:'completed',probabilities:{support:0.69}},
      {ref:'source:b',status:'completed',probabilities:{support:0.71}},
      {ref:'source:c',status:'failed',probabilities:{support:0}},
    ];
    assert.deepEqual(env.pane.semanticUnverifiedRefs(checks), ['source:a']);
    const html = env.pane.reportWithNarrowLayout('<p data-ref="source:a">结论</p><p data-ref="source:b">正确</p><p data-ref="source:c">失败</p>', ['source:a'], checks);
    const document = new Window({settings:{enableJavaScriptEvaluation:true}});
    document.document.body.innerHTML = '<p data-ref="source:a">结论</p><p data-ref="source:b">正确</p><p data-ref="source:c">失败</p>';
    document.eval(html.match(/<script data-product-report-verification>([\s\S]*?)<\/script>/)?.[1] || '');
    assert.equal(document.document.querySelectorAll('small').length, 1);
    assert.match(document.document.querySelector('small')?.title || '', /数字对不上.*语义可能不一致/);
    document.happyDOM.abort();
    const id = 'report:'+'f'.repeat(32);
    globalThis.fetch = async url => String(url).includes('/wiki/reports?')
      ? Response.json({items:[{report_id:id,title:'报告',created_at:'2026-09-26',input_hash:HASH_A,current:true}]})
      : Response.json({report_id:id,html:'<p data-ref="source:a">结论</p>',semantic_checks:checks});
    await env.render(createElement(env.Provider,{value:sessionMock()},createElement(env.pane.WikiReportPane,{page:page('companies/a')})));
    assert.match(env.container.textContent,/有 1 处引用待核/);
  } finally { await env.cleanup(); }
});

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

test('旧报告的 srcDoc 追加产品侧窄屏封面规则', async () => {
  const env = await boot();
  try {
    const id = 'report:' + 'e'.repeat(32);
    const oldHtml = '<!doctype html><html><body><style>.lf-spine{display:flex}</style><div class="lf-sheet"><div class="lf-spine">华能蒙电</div><h1>华能蒙电</h1></div></body></html>';
    globalThis.fetch = async url => String(url).includes('/wiki/reports?')
      ? Response.json({ items: [{ report_id: id, title: '旧报告', created_at: '2026-09-23', input_hash: HASH_A, current: true }] })
      : Response.json({ report_id: id, html: oldHtml, refs: [] });
    await env.render(createElement(env.Provider, { value: sessionMock() },
      createElement(env.pane.WikiReportPane, { page: page('companies/a') })));
    const srcDoc = env.container.querySelector('iframe')?.getAttribute('srcdoc') || '';
    assert.ok(srcDoc.includes(oldHtml.slice(0, 40)), '旧报告正文仍被渲染');
    assert.match(srcDoc, /@media \(max-width: 760px\)/);
    assert.match(srcDoc, /\.lf-spine \{ display: none !important; \}/);
    assert.ok(srcDoc.indexOf('data-product-report-layout') > srcDoc.indexOf('.lf-spine{display:flex}'));
  } finally { await env.cleanup(); }
});

test('议题报告显示旧版本并沿用报告面板', async () => {
  const env = await boot();
  try {
    const id = 'report:' + 'd'.repeat(32);
    globalThis.fetch = async url => {
      const u = String(url);
      if (u.includes('/wiki/reports?')) return Response.json({ items: [
        { report_id: id, title: '议题报告', created_at: '2026-09-23', input_hash: HASH_A, current: false },
      ] });
      return Response.json({ report_id: id, html: '<p>议题正文</p>', refs: [] });
    };
    const topicPage = page('topic:24ff5def6bf2', HASH_B);
    topicPage.spec.type = 'topic';
    await env.render(createElement(env.Provider, { value: sessionMock() },
      createElement(env.pane.WikiReportPane, { page: topicPage })));
    assert.match(env.container.textContent, /报告对应旧版本/);
    assert.match(env.container.querySelector('iframe')?.getAttribute('srcdoc') || '', /议题正文/);
    assert.match(env.container.textContent, /重新生成/);
  } finally { await env.cleanup(); }
});

test('重新生成立刻卸下旧报告 HTML，改显示生成中', async () => {
  const env = await boot();
  try {
    const current = 'report:' + 'c'.repeat(32);
    globalThis.fetch = async url => {
      const u = String(url);
      if (u.includes('/wiki/reports?')) return Response.json({ items: [
        { report_id: current, title: '当前', created_at: '2026-09-23', input_hash: HASH_A, current: true },
      ] });
      return Response.json({ report_id: current, html: '<p>OLD_REPORT_HTML</p>', refs: [] });
    };
    const sessions = sessionMock({ start() { this.startCalls.push([]); return deferred().promise; } });
    await env.render(createElement(env.Provider, { value: sessions },
      createElement(env.pane.WikiReportPane, { page: page('companies/a') })));
    assert.match(env.container.querySelector('iframe')?.getAttribute('srcdoc') || '', /OLD_REPORT_HTML/);
    await env.act(async () => { [...env.container.querySelectorAll('button')].find(button => button.textContent?.includes('重新生成')).click(); });
    assert.equal(env.container.querySelector('iframe'), null, '旧报告不得继续占着内容区');
    assert.ok(!env.container.innerHTML.includes('OLD_REPORT_HTML'));
    assert.ok(env.container.textContent.includes('正在生成图文报告'));
    assert.equal(sessions.startCalls.length, 1);
  } finally { await env.cleanup(); }
});

for (const [status, expected] of [['partial', '部分内容已整理'], ['awaiting_authorization', '你确认后才会显示']]) {
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
      assert.ok(!env.container.textContent.includes('正在整理结果'));
    } finally { await env.cleanup(); }
  });
}

test('报告任务首问只含用户可读的一句话，不含工具名与页面标识', async () => {
  const env = await boot();
  try {
    const prompt = env.pane.reportPrompt(page('companies/test'));
    assert.equal(prompt, '为《测试页》生成一份图文报告。');
    assert.ok(!/read_research_method|wiki_read|wiki_report_publish|data-ref|companies\//.test(prompt));
  } finally { await env.cleanup(); }
});

function deferred() {
  let resolve, reject;
  const promise = new Promise((res, rej) => { resolve = res; reject = rej; });
  return { promise, resolve, reject };
}

// 真实研究页带有可引用的依据；报告生成前会检查至少 3 条（见 WikiReportPane 的 citableRefCount）。
const CITED_BLOCKS = [{ kind: 'financial_facts', content: {}, refs: ['claim:a', 'claim:b', 'provider:x:1'] }];

function page(slug, inputHash = HASH_A, blocks = CITED_BLOCKS) {
  return {
    markdown: '# page', published: true, input_hash: inputHash,
    spec: { slug, title: '测试页', type: 'company', as_of: '2026-09-01', blocks },
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
    listRunningCompanySymbols: async () => [],
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
    fetch: globalThis.fetch, setInterval: globalThis.setInterval, clearInterval: globalThis.clearInterval,
  };
  const intervals = new Map();
  let nextInterval = 1;
  Object.assign(globalThis, {
    window: win, document: win.document,
    localStorage: win.localStorage, sessionStorage: win.sessionStorage,
    MessageEvent: win.MessageEvent, CustomEvent: win.CustomEvent,
    HTMLElement: win.HTMLElement, IS_REACT_ACT_ENVIRONMENT: true,
    setInterval: (callback) => { const id = nextInterval++; intervals.set(id, callback); return id; },
    clearInterval: (id) => { intervals.delete(id); },
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
  const tickIntervals = async () => {
    await act(async () => { for (const callback of [...intervals.values()]) callback(); });
    await act(async () => {});
  };
  const cleanup = async () => {
    await act(async () => { root.unmount(); });
    await server.close();
    Object.assign(globalThis, previous);
    win.close();
  };
  return { win, container, render, cleanup, act, tickIntervals, pane, serverLoad: (p) => server.ssrLoadModule(p), MemoryRouter: routerDom.MemoryRouter, Provider: (await server.ssrLoadModule('/src/verticals/finance/dsh/research-session.tsx')).ResearchSessionContext.Provider };
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
    assert.ok(env.container.textContent.includes('对应当前研究页'), '应标注对应当前研究页');
    assert.deepEqual(sessions.startCalls.map(c => c[2]), [], '迟到的空列表不得触发重复发起: ' + JSON.stringify(sessions.startCalls.map(c => c[0]?.slice?.(0,60))));
  } finally { await env.cleanup(); }
});

for (const outcome of ['started', 'failed', 'busy_other_version']) {
  test(`启动中切页不会接收旧页的 ${outcome} 结果`, async () => {
    const env = await boot();
    try {
      globalThis.fetch = async () => Response.json({ items: [] });
      const pending = deferred();
      const sessions = sessionMock({
        start: () => pending.promise,
        findReportTask: async slug => slug === 'companies/b'
          ? { sessionId: 'b-prior', slug, inputHash: HASH_B, running: false } : null,
      });
      const renderPage = slug => env.render(createElement(env.Provider, { value: sessions },
        createElement(env.pane.WikiReportPane, { page: page(slug) })));
      await renderPage('companies/a');
      // 打开图文报告页不自动生成，点「生成报告」才开始。
      assert.ok(!env.container.textContent.includes('正在生成'));
      const button = [...env.container.querySelectorAll('button')].find(item => item.textContent === '生成报告');
      assert.ok(button, '没有报告时应显示生成报告按钮');
      await env.act(async () => { button.click(); });
      assert.ok(env.container.textContent.includes('正在生成'));
      await renderPage('companies/b');
      const before = env.container.textContent;
      await env.act(async () => {
        if (outcome === 'failed') pending.reject(new Error('late failure'));
        else pending.resolve({ status: outcome, sessionId: 'a-late' });
      });
      assert.equal(env.container.textContent, before);
      assert.equal(sessions.processCalls.length, 0);
      assert.ok(!env.container.textContent.includes('生成过程'));
    } finally { await env.cleanup(); }
  });
}

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
    const sessions = sessionMock({
      findReportTask: async () => ({ sessionId: 's-9', slug: 'companies/a', inputHash: HASH_A, running }),
      sessionState: () => ({ running, lastAgentError: running ? null : 'internal stack trace', promptError: null, removed: false, awaitingFirstTurn: false }),
    });
    await env.render(createElement(env.Provider, { value: sessions },
      createElement(env.pane.WikiReportPane, { page: page('companies/a'), fallback: '研究页' })));
    await env.act(async () => {}); // first check registers running=true
    running = false;
    await env.tickIntervals(); // task ended → artifact refresh
    assert.ok(env.container.querySelector('iframe'), '应展示生成版 iframe');
    // sessionState 暴露的原始错误不得出现在界面上
    assert.ok(!env.container.textContent.includes('internal stack trace'));
  } finally { await env.cleanup(); }
});

test('运行结束后制品晚到时自动打开当前报告', async () => {
  const env = await boot();
  try {
    const detailId = 'report:' + '5'.repeat(32);
    let running = true;
    let published = false;
    globalThis.fetch = async (url) => {
      const u = String(url);
      if (u.includes('/wiki/reports?')) return Response.json({ items: published ? [{ report_id: detailId, title: '晚到报告', created_at: '2026-09-20', input_hash: HASH_A, current: true }] : [] });
      if (u.includes('/wiki/reports/report')) return Response.json({ report_id: detailId, html: '<p>LATE_BODY</p>', refs: [], input_hash: HASH_A, title: '晚到报告', created_at: '2026-09-20', current: true });
      return Response.json({ items: [] });
    };
    const sessions = sessionMock({
      findReportTask: async () => ({ sessionId: 's-late', slug: 'companies/a', inputHash: HASH_A, running }),
      sessionState: () => ({ running, lastAgentError: null, promptError: null, removed: false, awaitingFirstTurn: false }),
    });
    await env.render(createElement(env.Provider, { value: sessions },
      createElement(env.pane.WikiReportPane, { page: page('companies/a'), fallback: '研究页' })));
    await env.act(async () => {});
    assert.ok(env.container.textContent.includes('正在生成'));
    running = false;
    await env.tickIntervals();
    assert.ok(!env.container.querySelector('iframe'), '制品未到时不得假装已打开');
    published = true;
    await env.tickIntervals();
    const frame = env.container.querySelector('iframe');
    assert.ok(frame, '制品稍后出现时应自动打开');
    assert.match(frame.getAttribute('srcdoc') || '', /LATE_BODY/);
    assert.ok(!env.container.textContent.includes('正在生成图文报告'));
  } finally { await env.cleanup(); }
});

test('任务仍显示运行中但当前制品已在时立即打开报告', async () => {
  const env = await boot();
  try {
    const detailId = 'report:' + '6'.repeat(32);
    let listed = 0;
    globalThis.fetch = async (url) => {
      const u = String(url);
      if (u.includes('/wiki/reports?')) {
        listed += 1;
        return Response.json({ items: listed < 3 ? [] : [{ report_id: detailId, title: '已发布', created_at: '2026-09-20', input_hash: HASH_A, current: true }] });
      }
      if (u.includes('/wiki/reports/report')) return Response.json({ report_id: detailId, html: '<p>READY_BODY</p>', refs: [], input_hash: HASH_A, title: '已发布', created_at: '2026-09-20', current: true });
      return Response.json({ items: [] });
    };
    const sessions = sessionMock({
      findReportTask: async () => ({ sessionId: 's-still', slug: 'companies/a', inputHash: HASH_A, running: true }),
      sessionState: () => ({ running: true, lastAgentError: null, promptError: null, removed: false, awaitingFirstTurn: false }),
    });
    await env.render(createElement(env.Provider, { value: sessions },
      createElement(env.pane.WikiReportPane, { page: page('companies/a'), fallback: '研究页' })));
    await env.act(async () => {});
    assert.ok(env.container.textContent.includes('正在生成'));
    await env.tickIntervals();
    const frame = env.container.querySelector('iframe');
    assert.ok(frame, '当前制品已在时不得继续卡在正在生成');
    assert.match(frame.getAttribute('srcdoc') || '', /READY_BODY/);
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

test('已有研究页可从工具栏继续公司研究，进行中的任务会禁用入口', async () => {
  for (const kind of [null, 'research', 'report']) {
    const env = await bootCompany();
    try {
      let ensured = 0;
      const baseFetch = companyFetch(() => []);
      globalThis.fetch = async (url, init) => {
        const path = String(url);
        if (path.includes('/wiki/pages?')) return Response.json({ items: [{ slug: COMPANY_SLUG, title: '长江电力' }], total: 1 });
        if (path.includes('/finance-report-tasks')) return Response.json({ sessions: kind ? { active: { kind, slug: COMPANY_SLUG } } : {} });
        if (path.includes('/wiki/pages/ensure')) { ensured++; return Response.json({ slug: COMPANY_SLUG, action: 'exists' }); }
        if (path.includes('/finance-maintenance-refresh')) return Response.json(null);
        return baseFetch(url, init);
      };
      const sessions = sessionMock({
        taskRunning: id => id === 'active',
        findCompanySession: async () => null,
        start: async (...args) => { sessions.startCalls.push(args); return { sessionId: 'new-research', status: 'started' }; },
      });
      const CompanyWiki = (await env.serverLoad('/src/verticals/finance/pages/CompanyWiki.tsx')).CompanyWiki;
      await env.render(createElement(env.Provider, { value: sessions }, createElement(env.MemoryRouter,
        { initialEntries: ['/research?company=' + COMPANY_SLUG] }, createElement(CompanyWiki))));
      await env.act(async () => {});
      // 研究进行中时入口换成可点开任务过程的"研究中…"，而不是变灰的"公司研究"。
      const label = kind === 'research' ? '研究中…' : kind === 'report' ? '报告生成中…' : '公司研究';
      const action = [...env.container.querySelectorAll('button')].find(button => button.textContent === label);
      assert.ok(action, '已有研究页的工具栏应有公司研究入口');
      assert.equal(action.disabled, false);
      if (kind) assert.equal(action.title, kind === 'report' ? '查看图文报告的生成进度' : '查看这次研究的过程');
      else {
        await env.act(async () => { action.click(); });
        assert.equal(ensured, 1);
        assert.equal(sessions.startCalls.length, 1);
        assert.equal(sessions.startCalls[0][0], '按公司研究流程研究 长江电力（600900）');
      }
    } finally { await env.cleanup(); }
  }
});

test('刷新资料检查期间禁用已有研究页的公司研究入口', async () => {
  const env = await bootCompany();
  try {
    const baseFetch = companyFetch(() => []);
    let prepareStarted = false;
    globalThis.fetch = async (url, init) => {
      const path = String(url);
      if (path.includes('/wiki/pages?')) return Response.json({ items: [{ slug: COMPANY_SLUG, title: '长江电力' }], total: 1 });
      if (path.includes('/finance-report-tasks')) return Response.json({ sessions: {} });
      if (path.includes('/finance-maintenance-refresh')) {
        const body = JSON.parse(init.body);
        if (body.operation === 'prepare') { prepareStarted = true; return new Promise(() => {}); }
        return Response.json(null);
      }
      return baseFetch(url, init);
    };
    const CompanyWiki = (await env.serverLoad('/src/verticals/finance/pages/CompanyWiki.tsx')).CompanyWiki;
    await env.render(createElement(env.Provider, { value: sessionMock({ taskRunning: () => false, findCompanySession: async () => null }) }, createElement(env.MemoryRouter,
      { initialEntries: ['/research?company=' + COMPANY_SLUG] }, createElement(CompanyWiki))));
    await env.act(async () => {});
    const buttons = () => [...env.container.querySelectorAll('button')];
    assert.equal(buttons().find(button => button.textContent === '公司研究')?.disabled, false);
    await env.act(async () => { buttons().find(button => button.textContent === '刷新资料').click(); });
    assert.equal(prepareStarted, true);
    const action = buttons().find(button => button.textContent === '公司研究');
    assert.equal(action.disabled, true);
    assert.match(action.title, /资料刷新中/);
  } finally { await env.cleanup(); }
});

test('旧任务过程显示灰色清理说明，临时读取失败保留红色错误', async () => {
  for (const temporaryFailure of [false, true]) {
    const env = await boot();
    try {
      const registrations = new Map();
      const sessions = {
        refresh: async () => { if (temporaryFailure) throw new Error('network unavailable'); },
        refreshProjections: async () => {},
        subagentAddress: () => undefined,
        list: { getSnapshot: () => ({ byId: {}, projectionsBySession: {} }) },
        retain: () => { throw new Error('cleared task should not be retained'); },
      };
      const ctx = { sessions, slots: {
        inject: (_name, factory) => factory(),
        register: (options, Component) => { registrations.set(options.name, Component); },
      } };
      (await env.serverLoad('/src/verticals/finance/dsh/panel-conversation.tsx')).installPanelConversation(ctx, () => null);
      const PanelSeat = registrations.get('finance.panel.conversation');
      await env.render(createElement(PanelSeat, {
        sessionId: 'child', parentSessionId: 'host', SessionProvider: ({ children }) => children, renderSlot: () => null,
      }));
      await env.act(async () => {});
      const message = env.container.querySelector('p');
      assert.equal(message?.getAttribute('role'), temporaryFailure ? 'alert' : 'status');
      assert.match(message?.className || '', temporaryFailure ? /text-destructive/ : /text-muted-foreground/);
      assert.equal(message?.textContent, temporaryFailure ? '执行记录读取失败，请稍后重试' : '这次任务的执行记录已清理，无法查看过程');
      assert.equal(env.container.querySelector('button'), null);
    } finally { await env.cleanup(); }
  }
});

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
    assert.ok(env.container.textContent.includes('正在整理结果'), '执行结束后应显示后台整理中');
    // 沉淀确认：无新增。
    tasks = [{ id: 'bg-1', parent_session_id: 's-co-1', display_status: 'no_increment', started_at: '2026-09-12T00:00:00Z' }];
    await env.runTimers(4);
    assert.ok(env.container.textContent.includes('没有新增内容'), '应如实报告本轮无新增');
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
      assert.ok(env.container.textContent.includes('正在整理结果'), '应先进入后台整理中');
      offset = 200_000; // 沉淀窗口之外
      await env.runTimers(4);
      assert.ok(env.container.textContent.includes('结果还在整理'), '超时后应显示结果待确认而非完成');
    } finally { Date.now = realNow; }
  } finally { await env.cleanup(); }
});

test('生成中显示完整加载效果，不提供生成过程入口', async () => {
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
    assert.ok(env.container.querySelector('.research-loading'));
    assert.ok(env.container.textContent.includes('读取报告方法'));
    assert.ok(env.container.textContent.includes('保存报告'));
    assert.ok(!env.container.textContent.includes('生成过程'));
    assert.equal(opened, 0);
    assert.equal(sessions.processCalls.length, 0);
    assert.deepEqual(sessions.cancelCalls, []);
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
    assert.ok(!env.container.textContent.includes('生成过程'));
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
    const hit = [...env.container.querySelectorAll('button')].find(button => button.textContent === '生成报告');
    assert.ok(hit, '空报告区应有一个主按钮');
    await env.act(async () => { hit.click(); });
    assert.equal(sessions.startCalls.length, 1);
    assert.ok(env.container.textContent.includes('正在生成图文报告'));
    await env.act(async () => { resolveStart({ sessionId: 's-new', status: 'started' }); });
    assert.ok(env.container.textContent.includes('正在生成图文报告'), 'start 返回后不得弹回空态');
    assert.ok(!env.container.textContent.includes('生成过程'));
    assert.ok(!env.container.textContent.includes('还没有图文报告'));
  } finally { await env.cleanup(); }
});

test('本页目击的运行结束后若无制品，才提示尚未确认', async () => {
  const env = await boot();
  try {
    globalThis.fetch = async () => Response.json({ items: [] });
    let running = true;
    const sessions = sessionMock({
      findReportTask: async () => ({ sessionId: 's-live', slug: 'companies/a', inputHash: HASH_A, running }),
      sessionState: () => ({ running, lastAgentError: null, promptError: null, removed: false, awaitingFirstTurn: false }),
    });
    await env.render(createElement(env.Provider, { value: sessions },
      createElement(env.pane.WikiReportPane, { page: page('companies/a'), fallback: '研究页正文' })));
    await env.act(async () => {});
    assert.ok(env.container.textContent.includes('正在生成'));
    running = false;
    await env.tickIntervals();
    assert.ok(env.container.textContent.includes('尚未确认'));
    assert.ok(env.container.textContent.includes('研究页原文可随时切回去看') || env.container.textContent.includes('原文还在「研究页」里'));
    assert.ok(!env.container.textContent.includes('研究页正文'));
    assert.equal(sessions.startCalls.length, 0);
  } finally { await env.cleanup(); }
});

test('首轮轮询前已经失败的任务结束等待并允许重试', async () => {
  const env = await boot();
  try {
    globalThis.fetch = async () => Response.json({ items: [] });
    let started = false;
    const sessions = sessionMock({
      findReportTask: async () => started
        ? { sessionId: 'fast-failure', slug: 'companies/a', inputHash: HASH_A, running: false }
        : { sessionId: 'old', slug: 'companies/a', inputHash: HASH_A, running: false },
      start: async () => { started = true; return { sessionId: 'fast-failure', status: 'started' }; },
      sessionState: () => started ? { running: false, lastAgentError: 'private provider failure' } : null,
    });
    await env.render(createElement(env.Provider, { value: sessions }, createElement(env.pane.WikiReportPane, { page: page('companies/a') })));
    await env.act(async () => { [...env.container.querySelectorAll('button')].find(button => button.textContent === '生成报告').click(); });
    await env.tickIntervals();
    assert.ok(!env.container.textContent.includes('正在生成图文报告'));
    assert.ok(env.container.textContent.includes('报告生成失败'));
    assert.ok([...env.container.querySelectorAll('button')].some(button => button.textContent === '生成报告'));
    assert.ok(!env.container.textContent.includes('private provider failure'));
  } finally { await env.cleanup(); }
});

test('派生失败不把伪造文案写进原生 lastAgentError，面板仍显示失败', async () => {
  const env = await boot();
  try {
    globalThis.fetch = async () => Response.json({ items: [] });
    let started = false;
    const sessions = sessionMock({
      findReportTask: async () => started
        ? { sessionId: 'derived-failure', slug: 'companies/a', inputHash: HASH_A, running: false }
        : { sessionId: 'old', slug: 'companies/a', inputHash: HASH_A, running: false },
      start: async () => { started = true; return { sessionId: 'derived-failure', status: 'started' }; },
      sessionState: () => started ? { running: false, lastAgentError: null, promptError: null, failed: true } : null,
    });
    await env.render(createElement(env.Provider, { value: sessions }, createElement(env.pane.WikiReportPane, { page: page('companies/a') })));
    await env.act(async () => { [...env.container.querySelectorAll('button')].find(button => button.textContent === '生成报告').click(); });
    await env.tickIntervals();
    assert.ok(env.container.textContent.includes('报告生成失败'));
    assert.ok(!env.container.textContent.includes('任务未完成'));
  } finally { await env.cleanup(); }
});

test('任务状态一直缺失时明确待确认，不永久显示运行中', async () => {
  const env = await boot();
  const now = Date.now;
  let offset = 0;
  try {
    Date.now = () => now() + offset;
    globalThis.fetch = async () => Response.json({ items: [] });
    const sessions = sessionMock({
      findReportTask: async () => ({ sessionId: 'old', slug: 'companies/a', inputHash: HASH_A, running: false }),
      start: async () => ({ sessionId: 'missing', status: 'started' }),
    });
    await env.render(createElement(env.Provider, { value: sessions }, createElement(env.pane.WikiReportPane, { page: page('companies/a') })));
    await env.act(async () => { [...env.container.querySelectorAll('button')].find(button => button.textContent === '生成报告').click(); });
    offset = 16_000;
    await env.tickIntervals();
    assert.ok(!env.container.textContent.includes('正在生成图文报告'));
    assert.ok(env.container.textContent.includes('暂时无法确认报告任务状态'));
  } finally { Date.now = now; await env.cleanup(); }
});

test('报告状态检查只由首次读取和受控轮询驱动，不订阅 session list 自激', async () => {
  const env = await boot();
  try {
    globalThis.fetch = async () => Response.json({ items: [] });
    let finds = 0;
    let subscriptions = 0;
    const sessions = sessionMock({
      findReportTask: async () => { finds += 1; return { sessionId: 'stable', slug: 'companies/a', inputHash: HASH_A, running: true }; },
      subscribeSessionList: (listener) => {
        subscriptions += 1;
        queueMicrotask(listener);
        return () => {};
      },
    });
    await env.render(createElement(env.Provider, { value: sessions }, createElement(env.pane.WikiReportPane, { page: page('companies/a') })));
    await env.act(async () => {});
    assert.equal(subscriptions, 0, '报告面板不应用会话列表通知反过来触发刷新');
    assert.equal(finds, 1);
    await env.act(async () => { await Promise.resolve(); await Promise.resolve(); });
    assert.equal(finds, 1, '没有定时 tick 时不得自激检查');
    await env.tickIntervals();
    assert.equal(finds, 2, '每次受控轮询只增加一次检查');
  } finally { await env.cleanup(); }
});

test('已有报告生成中重新进入：旧报告不能当成新产出，成功后打开新报告', async () => {
  const env = await boot();
  try {
    const reportA = 'report:' + 'a'.repeat(32);
    const reportB = 'report:' + 'b'.repeat(32);
    let currentId = reportA;
    let running = true;
    globalThis.fetch = async (url) => {
      const u = String(url);
      if (u.includes('/wiki/reports?')) {
        return Response.json({ items: [{ report_id: currentId, title: currentId === reportA ? '旧报告' : '新报告', created_at: '2026-09-21', input_hash: HASH_A, current: true }] });
      }
      if (u.includes(encodeURIComponent(reportB))) return Response.json({ report_id: reportB, html: '<p>NEW_BODY</p>', refs: [], input_hash: HASH_A, title: '新报告', created_at: '2026-09-21', current: true });
      if (u.includes(encodeURIComponent(reportA))) return Response.json({ report_id: reportA, html: '<p>OLD_BODY</p>', refs: [], input_hash: HASH_A, title: '旧报告', created_at: '2026-09-21', current: true });
      return Response.json({ items: [] });
    };
    const sessions = sessionMock({
      findReportTask: async () => ({ sessionId: 's-regen', slug: 'companies/a', inputHash: HASH_A, running }),
      sessionState: () => ({ running, lastAgentError: null, promptError: null, failed: false, removed: false, awaitingFirstTurn: false }),
    });
    await env.render(createElement(env.Provider, { value: sessions }, createElement(env.pane.WikiReportPane, { page: page('companies/a') })));
    await env.act(async () => {});
    const first = env.container.querySelector('iframe');
    assert.ok(first, '重进时应仍展示已有报告');
    assert.match(first.getAttribute('srcdoc') || '', /OLD_BODY/);
    assert.ok(!env.container.textContent.includes('报告生成失败'));
    currentId = reportB;
    running = false;
    await env.tickIntervals();
    const next = env.container.querySelector('iframe');
    assert.ok(next, '新报告完成后应打开新产出');
    assert.match(next.getAttribute('srcdoc') || '', /NEW_BODY/);
    assert.ok(!env.container.textContent.includes('报告生成失败'));
    assert.ok(!env.container.textContent.includes('尚未确认'));
  } finally { await env.cleanup(); }
});

test('已有报告生成中重新进入：失败时保留旧报告并提示，不把旧报告当成本次产出', async () => {
  const env = await boot();
  try {
    const reportA = 'report:' + 'c'.repeat(32);
    let running = true;
    let failed = false;
    globalThis.fetch = async (url) => {
      const u = String(url);
      if (u.includes('/wiki/reports?')) {
        return Response.json({ items: [{ report_id: reportA, title: '旧报告', created_at: '2026-09-21', input_hash: HASH_A, current: true }] });
      }
      if (u.includes(encodeURIComponent(reportA))) return Response.json({ report_id: reportA, html: '<p>OLD_BODY</p>', refs: [], input_hash: HASH_A, title: '旧报告', created_at: '2026-09-21', current: true });
      return Response.json({ items: [] });
    };
    const sessions = sessionMock({
      findReportTask: async () => ({ sessionId: 's-regen-fail', slug: 'companies/a', inputHash: HASH_A, running }),
      sessionState: () => ({ running, lastAgentError: null, promptError: null, failed, removed: false, awaitingFirstTurn: false }),
    });
    await env.render(createElement(env.Provider, { value: sessions }, createElement(env.pane.WikiReportPane, { page: page('companies/a') })));
    await env.act(async () => {});
    assert.match(env.container.querySelector('iframe')?.getAttribute('srcdoc') || '', /OLD_BODY/);
    running = false;
    failed = true;
    await env.tickIntervals();
    assert.match(env.container.querySelector('iframe')?.getAttribute('srcdoc') || '', /OLD_BODY/);
    assert.ok(env.container.textContent.includes('报告生成失败'));
    assert.ok(!env.container.textContent.includes('尚未确认'));
  } finally { await env.cleanup(); }
});

test('研究页可引用的依据不足时不启动生成，并说明原因', async () => {
  const env = await boot();
  try {
    globalThis.fetch = async () => Response.json({ items: [] });
    const sessions = sessionMock({ start: async () => { throw new Error('must not start'); } });
    await env.render(createElement(env.Provider, { value: sessions },
      createElement(env.pane.WikiReportPane, { page: page('companies/a', HASH_A, [{ kind: 'identity', content: {}, refs: ['taxonomy:x'] }]) })));
    await env.act(async () => {});
    assert.ok(env.container.textContent.includes('可引用的数据还太少'));
    assert.ok(![...env.container.querySelectorAll('button')].some(button => button.textContent === '生成报告'));
  } finally { await env.cleanup(); }
});
