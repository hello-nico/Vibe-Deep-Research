import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { readFileSync } from "node:fs";
import test from "node:test";
import { assistantBindingForPage } from '../src/verticals/finance/assistant/binding.ts';
import { researchRoute } from "../dsh/finance-ui/research.mjs";
import { bindAssistantSession, bindReportTask, bindTopicSession, cancelReportRun, displayBackgroundStatus, disposeReportRuntime, loadAssistantSessions, loadBackgroundTasks, loadReportTasks, loadTopicSessions, overlayIngestStatus, reportTasksWithLineage, startReportRun, unwrapCreatedAgent } from "../dsh/finance-ui/host-state.mjs";

test("后台状态区分仍在执行的子会话和已结束后等待入库", async t => {
  t.mock.method(globalThis, "fetch", async () => new Response(JSON.stringify({ status: "ready", document_id: "report" })));
  const rows = await overlayIngestStatus([
    { status: "running", started_at: new Date().toISOString(), ingest: [] },
    { status: "waiting_ingest", finished_at: "2026-09-16T00:00:00Z", ingest: [{ job_id: "one", status: "pending" }] },
    { status: "waiting_ingest", draft_token: "draft", ingest: [{ job_id: "two", status: "pending" }] },
  ]);
  assert.equal(rows[0].display_status, "running");
  assert.equal(rows[1].display_status, "partial");
  assert.equal(rows[1].ingest[0].document_id, "report");
  assert.equal(rows[2].display_status, "awaiting_authorization");
});

test("Backend 入库仍运行或暂不可用时不推断为完成或子会话中断", async t => {
  t.mock.method(globalThis, "fetch", async () => new Response("{}", { status: 500 }));
  const rows = await overlayIngestStatus([{ status: "waiting_ingest", started_at: "2020-01-01", finished_at: "2020-01-01", ingest: [{ job_id: "one", status: "pending" }] }]);
  assert.equal(rows[0].display_status, "waiting_ingest");
});

test("我的研究 facade 允许 Topic 冒号 ID、确认关联与记录接口，仍拒绝浏览器直传发布", () => {
  assert.equal(researchRoute("GET", "/wiki/research-topics/topic:24ff5def6bf2"), true);
  assert.equal(researchRoute("GET", "/wiki/research-topics/topic%3A24ff5def6bf2"), true);
  assert.equal(researchRoute("POST", "/wiki/research-topics/route"), true);
  assert.equal(researchRoute("POST", "/wiki/research-topics/topic:24ff5def6bf2"), true);
  assert.equal(researchRoute("POST", "/wiki/research-topics/topic:24ff5def6bf2/archive"), true);
  assert.equal(researchRoute("POST", "/wiki/research-topics/topic:24ff5def6bf2/restore"), true);
  assert.equal(researchRoute("GET", "/wiki/industries/nbs"), true);
  assert.equal(researchRoute("POST", "/wiki/research-links/confirm"), true);
  assert.equal(researchRoute("GET", "/wiki/research-memory"), true);
  assert.equal(researchRoute("PUT", "/wiki/research-memory"), true);
  assert.equal(researchRoute("GET", "/wiki/research-candidates"), true);
  assert.equal(researchRoute("POST", "/wiki/research-candidates/cand-1/dispose"), true);
  assert.equal(researchRoute("POST", "/wiki/research-candidates/cand-1/adopt"), true);
  assert.equal(researchRoute("GET", "/wiki/research-candidates/cand-1"), true);
  assert.equal(researchRoute("GET", "/wiki/companies/002403.SZ/provider-snapshot"), true);
  assert.equal(researchRoute("POST", "/wiki/companies/002403.SZ/provider-snapshot"), false);
  assert.equal(researchRoute("GET", "/wiki/companies/002403/provider-snapshot"), false);
  assert.equal(researchRoute("POST", "/research-results/market/preview"), true);
  assert.equal(researchRoute("GET", "/research-results/market/preview"), false);
  assert.equal(researchRoute("GET", "/notes"), true);
  assert.equal(researchRoute("POST", "/notes"), true);
  assert.equal(researchRoute("GET", "/notes/note-11111111-1111-4111-8111-111111111111"), true);
  assert.equal(researchRoute("POST", "/notes/note-11111111-1111-4111-8111-111111111111/delete"), true);
  assert.equal(researchRoute("POST", "/wiki/page-drafts/publish"), false);
  assert.equal(researchRoute("GET", "/wiki/research-topics/../secrets"), false);
});

function writePersistedSession(home: string, sessionId: string) {
  const dir = path.join(home, "sessions", "ws", sessionId);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, "session.jsonl"), "\n");
}

test("Topic 会话绑定落在宿主文件，不按标题猜测", t => {
  const previous = process.env.DSH_HOME;
  const home = fs.mkdtempSync(path.join(os.tmpdir(), "vibe-topic-bind-"));
  process.env.DSH_HOME = home;
  t.after(() => {
    if (previous === undefined) delete process.env.DSH_HOME;
    else process.env.DSH_HOME = previous;
    fs.rmSync(home, { recursive: true, force: true });
  });
  writePersistedSession(home, "sess-power-1");
  const bound = bindTopicSession({ topic_id: "topic:24ff5def6bf2", session_id: "sess-power-1", title: "电力容量电价" });
  assert.equal(bound.active_session_id, "sess-power-1");
  const stored = loadTopicSessions();
  assert.equal(stored.sessions["sess-power-1"].topic_id, "topic:24ff5def6bf2");
  assert.equal(stored.topics["topic:24ff5def6bf2"].session_ids.length, 1);
  assert.throws(() => bindTopicSession({ topic_id: "电力议题", session_id: "sess-power-1" }), /invalid topic/);
  assert.throws(() => bindTopicSession({ topic_id: "topic:aaaaaaaaaaaa", session_id: "sess-power-1" }), /already belongs/);
  assert.throws(() => bindTopicSession({ topic_id: "topic:bbbbbbbbbbbb", session_id: "sess-missing-1" }), /session not found/);
  assert.equal(loadTopicSessions().sessions["sess-missing-1"], undefined);
});

test("报告任务绑定落在宿主文件，运行态探测失败不能挡住绑定", t => {
  const previous = process.env.DSH_HOME;
  const home = fs.mkdtempSync(path.join(os.tmpdir(), "vibe-report-bind-"));
  process.env.DSH_HOME = home;
  t.after(() => {
    if (previous === undefined) delete process.env.DSH_HOME;
    else process.env.DSH_HOME = previous;
    fs.rmSync(home, { recursive: true, force: true });
  });
  writePersistedSession(home, "session-report-1");
  const hash = "a".repeat(64);
  const bound = bindReportTask({
    session_id: "session-report-1",
    slug: "companies/600011-sh",
    input_hash: hash,
  }, { isRunning: () => { throw new Error('cannot get property "sessions" without inject'); } });
  assert.equal(bound.slug, "companies/600011-sh");
  assert.equal(loadReportTasks().sessions["session-report-1"].input_hash, hash);
  assert.throws(() => bindReportTask({
    session_id: "session-report-1",
    slug: "companies/600011-sh",
    input_hash: "b".repeat(64),
  }, { isRunning: () => true }), /session is running/);
});

test("问助手会话按 plugin×mode×target 绑定，取消 pending 抢占，运行中不能改模式", () => {
  const previous = process.env.DSH_HOME;
  const home = fs.mkdtempSync(path.join(os.tmpdir(), "vibe-assistant-"));
  process.env.DSH_HOME = home;
  try {
    fs.mkdirSync(path.join(home, "sessions", "ws"), { recursive: true });
    fs.mkdirSync(path.join(home, "sessions", "ws", "sess-ask-1"));
    fs.writeFileSync(path.join(home, "sessions", "ws", "sess-ask-1", "session.jsonl"), "");
    assert.throws(() => bindAssistantSession({ mode: "ask", page_key: "intel/filings", pending: true } as never), /invalid session/);
    const bound = bindAssistantSession({ session_id: "sess-ask-1", plugin: "intel", mode: "ask", page_key: "intel:filings" });
    assert.equal(bound.mode, "ask");
    assert.equal(bound.plugin, "intel");
    assert.equal(loadAssistantSessions().pages["intel:filings"].session_id, "sess-ask-1");
    const switched = bindAssistantSession({ session_id: "sess-ask-1", plugin: "intel", mode: "agent", page_key: "intel:filings" });
    assert.equal(switched.mode, "agent");
    assert.throws(() => bindAssistantSession({ session_id: "sess-ask-1", mode: "ask", page_key: "intel:filings" }, { isRunning: () => true }), /running/);
    assert.throws(() => bindAssistantSession({ mode: "chat" }), /invalid assistant mode/);
    fs.mkdirSync(path.join(home, "sessions", "ws", "sess-co-1"));
    fs.writeFileSync(path.join(home, "sessions", "ws", "sess-co-1", "session.jsonl"), "");
    const company = bindAssistantSession({ session_id: "sess-co-1", plugin: "company_wiki", mode: "agent", target: "companies/600900-sh", page_key: "company-wiki:companies/600900-sh" });
    assert.equal(company.plugin, "company_wiki");
    assert.equal(company.target, "companies/600900-sh");
    assert.equal(loadAssistantSessions().pages["company_wiki:companies/600900-sh"].session_id, "sess-co-1");
    const chineseTarget = 'industries/煤炭';
    const industry = bindAssistantSession({ session_id: 'sess-co-1', plugin: 'industry_wiki', mode: 'agent', target: chineseTarget, page_key: `industry-wiki:${chineseTarget}` });
    assert.equal(industry.target, chineseTarget);
    assert.throws(() => bindAssistantSession({ session_id: 'sess-co-1', plugin: 'industry_wiki', mode: 'agent', target: 'industries/coal?x=1', page_key: 'industry-wiki:industries/coal' }), /invalid assistant target/);
    fs.mkdirSync(path.join(home, "sessions", "ws", "sess-intel-1"));
    fs.writeFileSync(path.join(home, "sessions", "ws", "sess-intel-1", "session.jsonl"), "");
    const intel = bindAssistantSession({ session_id: "sess-intel-1", plugin: "intel", mode: "ask", page_key: "intel:radar" });
    assert.equal(intel.plugin, "intel");
    assert.equal(loadAssistantSessions().pages["intel:radar"].session_id, "sess-intel-1");
    fs.mkdirSync(path.join(home, "sessions", "ws", "sess-market-1"));
    fs.writeFileSync(path.join(home, "sessions", "ws", "sess-market-1", "session.jsonl"), "");
    const market = bindAssistantSession({ session_id: "sess-market-1", plugin: "market", mode: "ask", page_key: "market:daily-review" });
    assert.equal(market.plugin, "market");
  } finally {
    if (previous === undefined) delete process.env.DSH_HOME;
    else process.env.DSH_HOME = previous;
    fs.rmSync(home, { recursive: true, force: true });
  }
});

test('产业页面生成的 Profile 身份可经宿主绑定、读回和切换模式', () => {
  const previous = process.env.DSH_HOME;
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'vibe-profile-binding-'));
  process.env.DSH_HOME = home;
  try {
    const binding = assistantBindingForPage('industry-profile:801080.SI')!;
    const input = { session_id: 'profile-review-session', plugin: binding.plugin, target: binding.target, page_key: binding.bindKey };
    const deps = { sessionExists: () => true, isRunning: () => false };
    for (const mode of ['ask', 'agent']) {
      const bound = bindAssistantSession({ ...input, mode }, deps);
      assert.equal(bound.target, 'profile:sw2:801080.SI');
      assert.equal(bound.mode, mode);
      const saved = loadAssistantSessions();
      assert.equal(saved.sessions[input.session_id].target, binding.target);
      assert.equal(saved.pages[binding.bindKey].session_id, input.session_id);
    }
    assert.throws(() => bindAssistantSession({ ...input, mode: 'ask' }, { ...deps, isRunning: () => true }), /running/);
    assert.throws(() => bindAssistantSession({ ...input, plugin: 'company_wiki', mode: 'agent' }, deps), /Profile target requires/);
    for (const target of ['profile:sw2:', 'profile:sw2:801080.SI/..', 'profile:sw2:801080.SI?x=1'])
      assert.throws(() => bindAssistantSession({ ...input, target, mode: 'agent' }, deps), /invalid assistant target/);
  } finally {
    if (previous === undefined) delete process.env.DSH_HOME;
    else process.env.DSH_HOME = previous;
    fs.rmSync(home, { recursive: true, force: true });
  }
});

for (const window of ['create', 'spawn']) {
  test(`卸载覆盖 ${window} 等待窗口、排队请求和晚到的句柄`, async t => {
    const previous = process.env.DSH_HOME;
    const home = fs.mkdtempSync(path.join(os.tmpdir(), 'vibe-report-unload-'));
    process.env.DSH_HOME = home;
    t.after(async () => {
      await disposeReportRuntime();
      if (previous === undefined) delete process.env.DSH_HOME;
      else process.env.DSH_HOME = previous;
      fs.rmSync(home, { recursive: true, force: true });
    });
    let release!: () => void, entered!: () => void;
    const gate = new Promise<void>(resolve => { release = resolve; });
    const waiting = new Promise<void>(resolve => { entered = resolve; });
    let creates = 0, spawns = 0, hostDisposes = 0, runDisposes = 0;
    let spawnSignal: AbortSignal | undefined;
    const ctx = {
      agentDefaultModel: { currentSelection: () => ({ provider: 'test', model: 'test-model' }) },
      agents: {
        get() { return null; },
        async create({ sessionId }) {
          creates++;
          if (window === 'create') { entered(); await gate; }
          return { agent: { session: { id: sessionId } }, dispose: async () => { hostDisposes++; } };
        },
      },
      subagents: { async start(_provider, request) {
        spawns++;
        spawnSignal = request.signal;
        entered(); await gate;
        return { id: 'child-unload-test', result: Promise.reject(new Error('cancelled')), dispose: async () => { runDisposes++; } };
      } },
    };
    const input = { slug: 'companies/600011-sh', input_hash: 'a'.repeat(64), prompt: '生成报告' };
    const first = assert.rejects(startReportRun(ctx, input), /运行时已卸载/);
    const queued = assert.rejects(startReportRun(ctx, input), /运行时已卸载/);
    await waiting;
    await disposeReportRuntime();
    if (window === 'spawn') assert.equal(spawnSignal?.aborted, true);
    release();
    await Promise.all([first, queued]);
    await assert.rejects(startReportRun(ctx, input), /运行时已卸载/);
    assert.equal(creates, 1);
    assert.equal(spawns, window === 'spawn' ? 1 : 0);
    assert.equal(hostDisposes, 1);
    assert.equal(runDisposes, window === 'spawn' ? 1 : 0);
    assert.equal(loadReportTasks().pending, null);
  });
}

test("agents.create 返回 AgentHandle，不得把 handle 当成 Agent", () => {
  const agent = { session: { id: "host-1" } };
  assert.equal(unwrapCreatedAgent({ agent, dispose: async () => {} }), agent);
  assert.equal(unwrapCreatedAgent(agent), null);
  assert.equal(unwrapCreatedAgent({ dispose: async () => {} }), null);
});

test("create 返回裸 Agent 时首次启动失败，不会 spawn", async t => {
  const previous = process.env.DSH_HOME;
  const home = fs.mkdtempSync(path.join(os.tmpdir(), "vibe-report-handle-"));
  process.env.DSH_HOME = home;
  t.after(async () => {
    await disposeReportRuntime();
    if (previous === undefined) delete process.env.DSH_HOME;
    else process.env.DSH_HOME = previous;
    fs.rmSync(home, { recursive: true, force: true });
  });
  const starts = [];
  const ctx = {
    agentDefaultModel: { currentSelection: () => ({ provider: 'test', model: 'test-model' }) },
    agents: {
      get() { return null; },
      async create({ sessionId }) { return { session: { id: sessionId } }; },
    },
    subagents: { async start() { starts.push(1); return { id: "child-x", result: Promise.resolve({}), dispose: async () => {} }; } },
  };
  await assert.rejects(() => startReportRun(ctx, { slug: "companies/600011-sh", input_hash: "c".repeat(64), prompt: "生成报告" }), /任务宿主不可用/);
  assert.equal(starts.length, 0);
});

test("报告 spawn 在首请求前写入 pending，同版本去重，取消走 AbortSignal，失败清 pending", async t => {
  const previous = process.env.DSH_HOME;
  const home = fs.mkdtempSync(path.join(os.tmpdir(), "vibe-report-spawn-"));
  process.env.DSH_HOME = home;
  t.after(async () => {
    await disposeReportRuntime();
    if (previous === undefined) delete process.env.DSH_HOME;
    else process.env.DSH_HOME = previous;
    fs.rmSync(home, { recursive: true, force: true });
  });
  const hash = "c".repeat(64);
  const starts = [];
  let hostAgent = { session: { id: "host-task", header: { id: "host-task" } } };
  const hostDisposes = [];
  const runDisposes = [];
  const ctx = {
    agentDefaultModel: { currentSelection: () => ({ provider: 'test', model: 'test-model', reasoningEffort: 'high', temperature: 0.2, uiFlag: true }) },
    agents: {
      get(id) { return id === hostAgent.session.id ? hostAgent : null; },
      async create({ sessionId }) {
        hostAgent = { session: { id: sessionId, header: { id: sessionId } } };
        return { agent: hostAgent, dispose: async () => { hostDisposes.push(sessionId); } };
      },
    },
    subagents: {
      async start(provider, request) {
        starts.push({ provider, request, pending: loadReportTasks().pending });
        assert.equal(request.parent.session.id, hostAgent.session.id);
        const childId = "child-report-" + starts.length;
        const store = loadReportTasks();
        store.sessions[childId] = { slug: store.pending.slug, input_hash: store.pending.input_hash, bound_at: new Date().toISOString() };
        store.pending = null;
        fs.writeFileSync(path.join(home, "research", "report-tasks.json"), JSON.stringify(store, null, 2) + "\n");
        let settle;
        const result = new Promise(resolve => { settle = resolve; });
        request.signal.addEventListener("abort", () => settle({ stopReason: "aborted" }), { once: true });
        return { id: childId, result, dispose: async () => { runDisposes.push(childId); } };
      },
    },
  };
  const first = await startReportRun(ctx, { slug: "companies/600011-sh", input_hash: hash, prompt: "生成报告", title: "报告生成" });
  assert.equal(first.status, "started");
  assert.equal(starts[0].provider, "spawn");
  assert.deepEqual(starts[0].request.agentOptions, { provider: 'test', model: 'test-model', reasoningEffort: 'high' });
  assert.equal(starts[0].request.agentOptions.uiFlag, undefined);
  assert.equal(starts[0].request.agentOptions.temperature, undefined);
  assert.deepEqual(starts[0].request.toolFilter, { allow: [] });
  assert.equal(starts[0].pending.parent_id, starts[0].request.parent.session.id);
  assert.equal(starts[0].pending.slug, "companies/600011-sh");
  assert.equal(starts[0].request.prompt[0].text, "生成报告");
  const again = await startReportRun(ctx, { slug: "companies/600011-sh", input_hash: hash, prompt: "生成报告" });
  assert.equal(again.status, "running");
  assert.equal(starts.length, 1);
  const other = await startReportRun(ctx, { slug: "companies/600011-sh", input_hash: "d".repeat(64), prompt: "另一版" });
  assert.equal(other.status, "busy_other_version");
  assert.equal(starts.length, 1);
  const cancelled = cancelReportRun(first.session_id);
  assert.equal(cancelled.status, "cancelling");
  assert.equal(loadReportTasks().sessions[first.session_id].slug, "companies/600011-sh");
  await new Promise(resolve => setTimeout(resolve, 20));
  assert.deepEqual(runDisposes, [first.session_id]);

  ctx.agentDefaultModel.currentSelection = () => ({ provider: 'changed', model: 'new-model' });
  const changed = await startReportRun(ctx, { slug: 'companies/600011-sh', input_hash: hash, prompt: '再试' });
  assert.deepEqual(starts[1].request.agentOptions, { provider: 'changed', model: 'new-model' });
  cancelReportRun(changed.session_id);
  await new Promise(resolve => setTimeout(resolve, 20));
  ctx.agentDefaultModel.currentSelection = () => ({ provider: '', model: '' });
  await assert.rejects(startReportRun(ctx, { slug: 'companies/600011-sh', input_hash: hash, prompt: '再试' }), /配置默认模型/);
  assert.equal(starts.length, 2);
  assert.equal(loadReportTasks().pending, null);
  const inspected = [];
  const lineage = await reportTasksWithLineage({
    sessionPersistence: {
      list: async () => { throw new Error('must not list all sessions'); },
      inspect: async (id) => { inspected.push(id); return { meta: { id, parentSession: 'old-host' } }; },
    },
    sessions: { get: () => undefined },
  });
  assert.deepEqual([...inspected].sort(), Object.keys(loadReportTasks().sessions).sort());
  assert.ok(inspected.includes(first.session_id));
  assert.equal(lineage.sessions[first.session_id].parent_id, 'old-host');
  assert.equal(loadReportTasks().sessions[first.session_id].parent_id, undefined, '只投影原生身份，不另写副本');
  const liveLineage = await reportTasksWithLineage({
    sessionPersistence: { inspect: async () => { throw new Error('live session should not inspect'); } },
    sessions: { get: (id) => id === first.session_id ? { header: { parentSession: 'live-host' } } : undefined },
  });
  assert.equal(liveLineage.sessions[first.session_id].parent_id, 'live-host');
  ctx.agentDefaultModel.currentSelection = () => ({ provider: 'test', model: 'test-model' });

  ctx.subagents.start = async () => { throw Object.assign(new Error("spawn failed"), { status: 503 }); };
  await assert.rejects(() => startReportRun(ctx, { slug: "companies/600900-sh", input_hash: hash, prompt: "再试" }), /spawn failed/);
  assert.equal(loadReportTasks().pending, null);
  const stored = loadReportTasks();
  assert.ok(stored.sessions[first.session_id]);
  assert.ok(stored.host_session_id);
  await disposeReportRuntime();
  assert.equal(hostDisposes.length, 1);
});

test("沉淀记录宿主入口改走 Backend，不再读产品文件", () => {
  const host = readFileSync(new URL("../dsh/finance-ui/host-state.mjs", import.meta.url), "utf8");
  assert.match(host, /\/notes\?limit=40/);
  assert.match(host, /proxyNotes/);
  assert.doesNotMatch(host, /STOCK_RESEARCH_PRODUCT_NOTES/);
  assert.doesNotMatch(host, /note\.json|readNoteLedger|ledger\/note/);
  const research = readFileSync(new URL("../dsh/finance-ui/research.mjs", import.meta.url), "utf8");
  assert.match(research, /512_000/);
});

test("记录失败不能挡住工作台；议题工作区按 ID 读 Backend 全文", () => {
  const client = readFileSync(new URL("../src/verticals/finance/dsh/client.tsx", import.meta.url), "utf8");
  assert.match(client, /Promise\.all\(\[hydrateWatch\(\), hydrateRoster\(\), hydratePrefs\(\)\]\)/);
  assert.match(client, /void hydrateNotes\(\)\.catch/);
  assert.doesNotMatch(client, /Promise\.all\(\[hydrateNotes/);
  const source = readFileSync(new URL("../src/verticals/finance/pages/TopicWorkspace.tsx", import.meta.url), "utf8");
  assert.match(source, /getNote\(id\)/);
  assert.match(source, /<KnowledgeText markdown=\{selectedNote\.content\}/);
  assert.doesNotMatch(source, /fromWatchlist|从自选开始/);
  const company = readFileSync(new URL("../src/verticals/finance/pages/CompanyWiki.tsx", import.meta.url), "utf8");
  assert.match(company, /loadRoster\(\)/);
  assert.match(company, /quoteNames/);
  assert.match(company, /vr-company-roster-view/);
  assert.match(company, /LayoutGrid/);
  assert.match(company, /RECENT_LIMIT = 9/);
  assert.match(company, /搜索名称或代码/);
  assert.match(company, /xl:grid-cols-3/);
  assert.match(company, /DashboardCard/);
  assert.doesNotMatch(company, /DashboardPanel/);
  assert.match(company, /资料待生成/);
  assert.doesNotMatch(company, /setJoinOpen|加入研究<\//);
  assert.doesNotMatch(company, /setSlug\(row\.hasWiki \? row\.slug : row\.slug\)/);
  assert.doesNotMatch(company, /打开六阶段研究|research\/legacy/);
  assert.match(company, /在深度对话中研究/);
  assert.match(company, /WikiViewTabs/);
  assert.doesNotMatch(company, /report \? '研究页' : '图文报告'/);
  const reader = readFileSync(new URL("../src/verticals/finance/components/ResearchKnowledge.tsx", import.meta.url), "utf8");
  assert.match(reader, /图文报告/);
  assert.match(reader, /WikiViewTabs/);
  assert.match(company, /hideToggle/);
  const industry = readFileSync(new URL("../src/verticals/finance/pages/IndustryCenter.tsx", import.meta.url), "utf8");
  assert.match(industry, /WikiViewTabs/);
  assert.match(industry, /hideToggle/);
  assert.match(industry, /selected\.published && <WikiViewTabs/);
  assert.match(company, /WikiLoading/);
  assert.match(company, /ResearchRefreshStatus/);
  assert.doesNotMatch(company, /ResearchRefreshSurface/);
  assert.doesNotMatch(company, /holdResearchRefresh/);
  assert.match(company, /setNotice\(\{ slug: '', text: '已重新读取公司列表' \}\)/);
  assert.match(company, /CompanyRefreshConfirm/);
  assert.doesNotMatch(company, /researchRead[^\n]*refresh-api/);
  assert.match(company, /正在建立研究页/);
  assert.match(company, /Boolean\(current\?\.hasWiki\) && readerState === 'loading'/);
  assert.doesNotMatch(company, /取消选择不会删除 Wiki/);
  assert.doesNotMatch(company, /从自选开始/);
  const mine = readFileSync(new URL("../src/verticals/finance/pages/MyResearch.tsx", import.meta.url), "utf8");
  assert.match(mine, /status === "archived"/);
  assert.match(mine, /已归档/);
  assert.match(mine, /研究中/);
  assert.match(mine, /WorkspaceTabs/);
  assert.match(mine, /WorkspaceFilter/);
  assert.match(mine, /WorkspaceSearch/);
  assert.doesNotMatch(mine, /创建议题/);
  assert.doesNotMatch(mine, /const chip =/);
  assert.doesNotMatch(mine, /workspace-input/);
  const layout = readFileSync(new URL("../src/verticals/finance/components/layout/Layout.tsx", import.meta.url), "utf8");
  assert.match(layout, /label: "个股研究"/);
  assert.match(layout, /label: "我的资料"/);
  assert.doesNotMatch(layout, /GPU租金/);
  assert.match(mine, /value: "topics".*value: "notes".*value: "tasks".*value: "memory"/s);
  assert.match(mine, /保存纠正/);
  const node = readFileSync(new URL("../src/verticals/finance/dsh/result-node.tsx", import.meta.url), "utf8");
  assert.match(node, /loadCandidate/);
  assert.match(node, /CandidateChoiceNeeded/);
  assert.match(mine, /label: "任务"/);
  assert.doesNotMatch(mine, /后台任务/);
  assert.match(mine, /finance-background-tasks/);
  assert.match(mine, /setInterval/);
  assert.match(mine, /不会自动建立议题/);
  assert.match(mine, /openTaskProcess/);
  assert.match(mine, /查看过程/);
  assert.match(client, /startReportRun/);
  assert.doesNotMatch(client, /!archived.has\(id\) && id !== store.host_session_id/);
  assert.match(client, /isBackgroundChat/);
  assert.match(client, /openTaskProcess/);
  assert.match(client, /origin === 'subagent'/);
  assert.match(client, /item\?\.parentId/);
  assert.match(client, /item\?\.blank/);
  assert.match(client, /lastTrajectory/);
  assert.match(client, /status !== 'ready'/);
  assert.match(client, /research\.openSession/);
  assert.match(client, /ensureTaskHistory/);
  const history = readFileSync(new URL("../src/verticals/finance/lib/taskHistory.ts", import.meta.url), "utf8");
  assert.match(history, /face\?\.open/);
  assert.doesNotMatch(history, /sessions\.open\(/);
  assert.doesNotMatch(client, /bindReportTask\(id, task.slug/);
  const processPanel = readFileSync(new URL("../src/verticals/finance/components/TaskProcessPanel.tsx", import.meta.url), "utf8");
  const transcript = readFileSync(new URL("../src/verticals/finance/components/TaskTranscript.tsx", import.meta.url), "utf8");
  assert.match(processPanel, /TaskTranscript/);
  assert.match(transcript, /调用参数/);
  assert.match(transcript, /finance-assistant-transcript/);
  assert.doesNotMatch(processPanel, /react-router-dom/);
  assert.doesNotMatch(processPanel, /openSession/);
  assert.match(client, /prev\?\.steps\.length && !next.steps.length/);
  const host = readFileSync(new URL("../dsh/finance-ui/host-state.mjs", import.meta.url), "utf8");
  assert.match(host, /unwrapCreatedAgent/);
  assert.match(host, /watchReportRun/);
  assert.match(host, /disposeReportRuntime/);
});

test("后台任务列表把超时运行映射为中断，不读 DSH 原始日志", t => {
  const previous = process.env.DSH_HOME;
  const home = fs.mkdtempSync(path.join(os.tmpdir(), "vibe-bg-tasks-"));
  process.env.DSH_HOME = home;
  t.after(() => {
    if (previous === undefined) delete process.env.DSH_HOME;
    else process.env.DSH_HOME = previous;
    fs.rmSync(home, { recursive: true, force: true });
  });
  fs.mkdirSync(path.join(home, "research"), { recursive: true });
  fs.writeFileSync(path.join(home, "research", "background-tasks.json"), JSON.stringify({
    tasks: [
      { id: "child-old", status: "running", started_at: "2020-01-01T00:00:00.000Z", question: "旧任务" },
      { id: "child-done", status: "no_increment", started_at: "2026-09-16T00:00:00.000Z", finished_at: "2026-09-16T00:00:10.000Z", summary: "无新增" },
    ],
  }) + "\n");
  const items = loadBackgroundTasks();
  assert.equal(items.find(item => item.id === "child-old")?.display_status, "interrupted");
  assert.equal(items.find(item => item.id === "child-done")?.display_status, "no_increment");
  assert.equal(displayBackgroundStatus({ status: "awaiting_authorization", finished_at: "2026-09-16T00:00:00.000Z" }), "awaiting_authorization");
  assert.doesNotMatch(JSON.stringify(items), /session\.jsonl/);
});

test("议题工作区先恢复会话、审阅草案正文，并用 source_id 读 Wiki 材料", () => {
  const source = readFileSync(new URL("../src/verticals/finance/pages/TopicWorkspace.tsx", import.meta.url), "utf8");
  const client = readFileSync(new URL("../src/verticals/finance/dsh/client.tsx", import.meta.url), "utf8");
  const workspace = readFileSync(new URL("../src/verticals/finance/components/layout/ConversationWorkspace.tsx", import.meta.url), "utf8");
  assert.match(source, /restoreTopic/);
  assert.match(source, /topicSessionMatches/);
  assert.match(source, /source_id=\$\{encodeURIComponent\(topicId\)\}/);
  assert.match(source, /\/wiki\/page-drafts\/\$\{encodeURIComponent\(token\)\}/);
  assert.match(source, /reviewedToken !== item\.draft_token/);
  assert.doesNotMatch(source, /to=\{\`\/my-reports\`\}/);
  assert.match(client, /async restoreTopic/);
  assert.match(workspace, /data-blocked=\{blocked/);
  assert.match(workspace, /conversation-session-gate/);
  assert.match(workspace, /<PageHeader title=\{title\} subtitle=\{subtitle\} \/>/);
  assert.doesNotMatch(workspace, /actions=\{expandButton/);
  assert.match(source, /className="topic-panel"/);
  assert.match(source, /workspace-action workspace-action-primary/);
  assert.match(source, /<WikiViewTabs report=\{report\} onChange=\{setReport\}/);
  assert.match(source, /<WorkspaceMoreMenu actions=/);
  assert.doesNotMatch(source, /<PageHeader/);
  assert.doesNotMatch(source, /xl:grid-cols-\[minmax/);
  const css = readFileSync(new URL("../src/index.css", import.meta.url), "utf8");
  assert.match(workspace, /conversation-heading-slot/);
  assert.match(workspace, /conversation-footer-slot/);
  assert.match(workspace, /aria-expanded=\{expanded\}/);
  assert.doesNotMatch(workspace, /height: expanded \? 0/);
  assert.doesNotMatch(workspace, /hidden=\{active && expanded\}/);
  assert.match(css, /--conversation-expand-ease/);
  assert.match(css, /\.conversation-heading-slot:not\(\[hidden\]\), \.conversation-footer-slot/);
  assert.match(css, /\[data-expanded="true"\]\[data-split="true"\] \{ grid-template-columns: minmax\(0, 0fr\)/);
  assert.doesNotMatch(css, /\[data-expanded="true"\] \.conversation-heading \{ display: none/);
  assert.doesNotMatch(css, /\[data-expanded="true"\]\[data-split="true"\] \{ display: flex/);
});

test("开发代理把宿主绑定和发布入口转到 DSH", () => {
  const source = readFileSync(new URL("../dsh-dev.ts", import.meta.url), "utf8");
  for (const route of ["/finance-note-digest", "/finance-topic-sessions", "/finance-background-tasks", "/finance-notes", "/finance-wiki-publish", "/finance-report-runs"]) {
    assert.match(source, new RegExp(route.replace("/", "\\/")));
  }
  assert.doesNotMatch(source, /finance-stage-model/);
});

test("板块中心目录页不会把空 key 当成第一项行业", () => {
  const source = readFileSync(new URL("../src/verticals/finance/pages/IndustryCenter.tsx", import.meta.url), "utf8");
  assert.match(source, /const selected = key/);
  assert.doesNotMatch(source, /endsWith\(key \|\| ""\)/);
});

test("路由区分我的研究、议题工作区与 41 行业入口", () => {
  const source = readFileSync(new URL("../src/verticals/finance/router.tsx", import.meta.url), "utf8");
  assert.match(source, /path: "\/my-research"/);
  assert.match(source, /path: "\/my-research\/topics\/:topicHex"/);
  assert.match(source, /IndustryCenter/);
  assert.match(source, /path: "\/sectors\/profiles"/);
  assert.doesNotMatch(source, /notes\/legacy|sectors\/legacy/);
});
