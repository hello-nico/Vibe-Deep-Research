import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { readFileSync } from "node:fs";
import test from "node:test";
import { researchRoute } from "../dsh/finance-ui/research.mjs";
import { bindTopicSession, displayBackgroundStatus, loadBackgroundTasks, loadTopicSessions, overlayIngestStatus } from "../dsh/finance-ui/host-state.mjs";

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
  assert.doesNotMatch(company, /打开六阶段研究|research\/legacy/);
  assert.match(company, /在深度对话中研究/);
  assert.match(company, /Boolean\(current\?\.hasWiki\) && readerState === 'loading'/);
  assert.doesNotMatch(company, /取消选择不会删除 Wiki/);
  assert.doesNotMatch(company, /从自选开始/);
  const mine = readFileSync(new URL("../src/verticals/finance/pages/MyResearch.tsx", import.meta.url), "utf8");
  assert.match(mine, /status === "archived"/);
  assert.match(mine, /已归档/);
  assert.match(mine, /研究中/);
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
  assert.match(source, /finance-session-action/);
  assert.doesNotMatch(source, /<PageHeader/);
  assert.doesNotMatch(source, /xl:grid-cols-\[minmax/);
  const css = readFileSync(new URL("../src/index.css", import.meta.url), "utf8");
  assert.match(css, /\[data-expanded="true"\]\[data-split="true"\] \{ display: flex/);
});

test("开发代理把宿主绑定和发布入口转到 DSH", () => {
  const source = readFileSync(new URL("../dsh-dev.ts", import.meta.url), "utf8");
  for (const route of ["/finance-note-digest", "/finance-topic-sessions", "/finance-background-tasks", "/finance-notes", "/finance-wiki-publish"]) {
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
