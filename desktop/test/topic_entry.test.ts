import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { dirname } from "node:path";
import { readFileSync } from "node:fs";
import test from "node:test";

const require = createRequire(import.meta.url);

async function loadResearchModule() {
  const vitePackage = require.resolve("vite/package.json");
  const esbuildPath = require.resolve("esbuild", { paths: [dirname(vitePackage)] });
  const { build } = require(esbuildPath);
  const result = await build({
    entryPoints: [new URL("../src/verticals/finance/lib/research.ts", import.meta.url).pathname],
    bundle: true,
    format: "esm",
    platform: "browser",
    write: false,
  });
  const source = result.outputFiles[0]?.text;
  if (!source) throw new Error("esbuild did not return bundled research module");
  return import(`data:text/javascript;base64,${Buffer.from(source).toString("base64")}`);
}

const researchModule = loadResearchModule();

test("首次发起保留用户问题，不补日期、标题或匹配文本", async () => {
  const { topicRouteRequest } = await researchModule;
  const request = topicRouteRequest("  容量电价如何影响火电盈利稳定性？  ");
  assert.deepEqual(request, {
    question: "容量电价如何影响火电盈利稳定性？",
    subjects: [],
    research_intent: true,
    confirm_new: false,
  });
  assert.equal("title" in request, false);
  assert.equal("match_text" in request, false);
});

test("只有同对象选择分支允许确认新建", async () => {
  const { canConfirmNewTopic } = await researchModule;
  const choose = { action: "choose", topic: null, candidates: [], reason: "same_subject_requires_choice" };
  assert.equal(canConfirmNewTopic(choose), true);
  assert.equal(canConfirmNewTopic({ ...choose, reason: "ambiguous_title_or_claim_match" }), false);
  assert.equal(canConfirmNewTopic({ action: "create", topic: { topic_id: "topic:abc" } }), false);
});

test("创建、复用和恢复分别返回真实状态", async () => {
  const { topicRouteSuccess } = await researchModule;
  assert.deepEqual(topicRouteSuccess({ action: "create", topic: { topic_id: "topic:a" } }), {
    topicId: "topic:a", message: "议题已创建，正在打开…",
  });
  assert.deepEqual(topicRouteSuccess({ action: "touch", topic: { topic_id: "topic:b" } }), {
    topicId: "topic:b", message: "已复用现有议题，正在打开…",
  });
  assert.deepEqual(topicRouteSuccess({ action: "restore", topic: { topic_id: "topic:c" } }), {
    topicId: "topic:c", message: "已恢复归档议题，正在打开…",
  });
  assert.equal(topicRouteSuccess({ action: "choose", topic: null }), null);
});

test("HTTP 失败只发送一次 POST，并透传取消信号", async (t) => {
  const { routeResearchTopic, topicRouteRequest } = await researchModule;
  const originalFetch = globalThis.fetch;
  const calls: Array<{ input: string; init?: RequestInit }> = [];
  t.after(() => { globalThis.fetch = originalFetch; });
  globalThis.fetch = async (input, init) => {
    calls.push({ input: String(input), init });
    return new Response(JSON.stringify({ detail: "route failed" }), {
      status: 503,
      headers: { "Content-Type": "application/json" },
    });
  };
  const controller = new AbortController();
  await assert.rejects(() => routeResearchTopic(topicRouteRequest("持续跟踪盈利传导"), controller.signal), /route failed/);
  assert.equal(calls.length, 1);
  assert.equal(calls[0]?.input, "/finance-research/wiki/research-topics/route");
  assert.equal(calls[0]?.init?.method, "POST");
  assert.equal(calls[0]?.init?.signal, controller.signal);
});

test("首次发起先查归档；候选和读取失败都不会 POST", async (t) => {
  const { startResearchTopic, topicRouteRequest } = await researchModule;
  const originalFetch = globalThis.fetch;
  const calls: Array<{ input: string; init?: RequestInit }> = [];
  t.after(() => { globalThis.fetch = originalFetch; });

  globalThis.fetch = async (input, init) => {
    calls.push({ input: String(input), init });
    return new Response(JSON.stringify({
      items: [{ topic_id: "topic:archived123", title: "容量电价盈利传导", pool_state: "archived" }],
    }), { status: 200, headers: { "Content-Type": "application/json" } });
  };
  const question = "容量电价如何影响火电盈利稳定性？";
  const choice = await startResearchTopic(topicRouteRequest(question));
  assert.equal(choice.action, "choose");
  assert.equal(choice.reason, "archived_text_search");
  assert.equal(choice.candidates?.[0]?.topic_id, "topic:archived123");
  assert.equal(calls.length, 1);
  assert.equal(calls[0]?.init?.method, undefined);
  assert.match(calls[0]?.input ?? "", /pool=archived/);
  assert.match(calls[0]?.input ?? "", new RegExp(`query=${encodeURIComponent(question)}`));

  calls.length = 0;
  globalThis.fetch = async (input, init) => {
    calls.push({ input: String(input), init });
    return new Response(JSON.stringify({
      action: "restore",
      topic: { topic_id: "topic:archived123" },
      candidates: [],
    }), { status: 200, headers: { "Content-Type": "application/json" } });
  };
  const restored = await startResearchTopic(topicRouteRequest(question, { matchedTopicId: "topic:archived123" }));
  assert.equal(restored.action, "restore");
  assert.equal(calls.length, 1);
  assert.equal(calls[0]?.init?.method, "POST");
  assert.deepEqual(JSON.parse(String(calls[0]?.init?.body)), {
    question,
    subjects: [],
    research_intent: true,
    matched_topic_id: "topic:archived123",
    confirm_new: false,
  });

  calls.length = 0;
  globalThis.fetch = async (input, init) => {
    calls.push({ input: String(input), init });
    return new Response(JSON.stringify({ detail: "archive unavailable" }), {
      status: 503,
      headers: { "Content-Type": "application/json" },
    });
  };
  await assert.rejects(() => startResearchTopic(topicRouteRequest(question)), /archive unavailable/);
  assert.equal(calls.length, 1);
  assert.equal(calls[0]?.init?.method, undefined);
});

test("页面卸载、输入变化和延迟导航都有旧响应保护", () => {
  const source = readFileSync(new URL("../src/verticals/finance/pages/MyResearch.tsx", import.meta.url), "utf8");
  assert.match(source, /topicRouteController\.current\?\.abort\(\)/);
  assert.match(source, /topicRouteAttempt\.current \+= 1/);
  assert.match(source, /!topicRouteMounted\.current \|\| attempt !== topicRouteAttempt\.current/);
  assert.match(source, /topicRouteMounted\.current && attempt === topicRouteAttempt\.current/);
  assert.match(source, /startResearchTopic\(request, controller\.signal\)/);
  assert.match(source, /topicRouteBusy \|\| topicRouteController\.current/);
  assert.match(source, /if \(value === "notes"\) cancelTopicRoute\(\)/);
});
