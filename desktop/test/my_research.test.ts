import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { readFileSync } from "node:fs";
import test from "node:test";
import { researchRoute } from "../dsh/finance-ui/research.mjs";
import { bindTopicSession, loadTopicSessions, readNoteLedger } from "../dsh/finance-ui/host-state.mjs";

test("我的研究 facade 允许 Topic 冒号 ID 与确认关联，仍拒绝浏览器直传发布", () => {
  assert.equal(researchRoute("GET", "/wiki/research-topics/topic:24ff5def6bf2"), true);
  assert.equal(researchRoute("GET", "/wiki/research-topics/topic%3A24ff5def6bf2"), true);
  assert.equal(researchRoute("POST", "/wiki/research-topics/route"), true);
  assert.equal(researchRoute("POST", "/wiki/research-topics/topic:24ff5def6bf2"), true);
  assert.equal(researchRoute("GET", "/wiki/industries/nbs"), true);
  assert.equal(researchRoute("POST", "/wiki/research-links/confirm"), true);
  assert.equal(researchRoute("POST", "/wiki/page-drafts/publish"), false);
  assert.equal(researchRoute("GET", "/wiki/research-topics/../secrets"), false);
});

test("Topic 会话绑定落在宿主文件，不按标题猜测", t => {
  const previous = process.env.DSH_HOME;
  const home = fs.mkdtempSync(path.join(os.tmpdir(), "vibe-topic-bind-"));
  process.env.DSH_HOME = home;
  t.after(() => {
    if (previous === undefined) delete process.env.DSH_HOME;
    else process.env.DSH_HOME = previous;
    fs.rmSync(home, { recursive: true, force: true });
  });
  const bound = bindTopicSession({ topic_id: "topic:24ff5def6bf2", session_id: "sess-power-1", title: "电力容量电价" });
  assert.equal(bound.active_session_id, "sess-power-1");
  const stored = loadTopicSessions();
  assert.equal(stored.sessions["sess-power-1"].topic_id, "topic:24ff5def6bf2");
  assert.equal(stored.topics["topic:24ff5def6bf2"].session_ids.length, 1);
  assert.throws(() => bindTopicSession({ topic_id: "电力议题", session_id: "sess-power-1" }), /invalid topic/);
  assert.throws(() => bindTopicSession({ topic_id: "topic:aaaaaaaaaaaa", session_id: "sess-power-1" }), /already belongs/);
});

test("沉淀记录摘要有界且不含任意路径", t => {
  const previousHome = process.env.DSH_HOME;
  const previousNotes = process.env.STOCK_RESEARCH_PRODUCT_NOTES;
  const previousWorkspace = process.env.STOCK_RESEARCH_WORKSPACE;
  const home = fs.mkdtempSync(path.join(os.tmpdir(), "vibe-notes-"));
  const workspace = fs.mkdtempSync(path.join(os.tmpdir(), "vibe-notes-ws-"));
  process.env.DSH_HOME = home;
  process.env.STOCK_RESEARCH_WORKSPACE = workspace;
  process.env.STOCK_RESEARCH_PRODUCT_NOTES = path.join(home, "note.json");
  t.after(() => {
    if (previousHome === undefined) delete process.env.DSH_HOME;
    else process.env.DSH_HOME = previousHome;
    if (previousNotes === undefined) delete process.env.STOCK_RESEARCH_PRODUCT_NOTES;
    else process.env.STOCK_RESEARCH_PRODUCT_NOTES = previousNotes;
    if (previousWorkspace === undefined) delete process.env.STOCK_RESEARCH_WORKSPACE;
    else process.env.STOCK_RESEARCH_WORKSPACE = previousWorkspace;
    fs.rmSync(home, { recursive: true, force: true });
    fs.rmSync(workspace, { recursive: true, force: true });
  });
  const file = process.env.STOCK_RESEARCH_PRODUCT_NOTES;
  fs.writeFileSync(file, JSON.stringify({ kind: "note", records: Array.from({ length: 50 }, (_, i) => ({ id: `note-${i}`, title: `t${i}`, body: "x".repeat(800), category: "ask", created_at: new Date(i).toISOString() })) }));
  const ledger = readNoteLedger();
  assert.equal(ledger.index.length, 50);
  assert.equal(ledger.notes["note-40"].content.length, 800);
  fs.writeFileSync(file, JSON.stringify({ kind: "note", records: [] }));
  assert.equal(readNoteLedger().index.length, 0, "删除后直接读到台账现状，不保留正文快照");
  fs.writeFileSync(file, "broken");
  assert.throws(() => readNoteLedger(), SyntaxError);
  assert.equal(fs.existsSync(path.join(workspace, "research")), false);
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
});

test("开发代理把宿主绑定和发布入口转到 DSH", () => {
  const source = readFileSync(new URL("../dsh-dev.ts", import.meta.url), "utf8");
  for (const route of ["/finance-note-digest", "/finance-topic-sessions", "/finance-notes", "/finance-wiki-publish"]) {
    assert.match(source, new RegExp(route.replace("/", "\\/")));
  }
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
  assert.match(source, /Navigate replace to="\/my-research\?tab=notes"/);
});
