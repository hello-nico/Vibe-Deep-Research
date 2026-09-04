import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { backend, type ResearchTaskRequest } from "../src/verticals/finance/lib/backend.ts";

const page = readFileSync(new URL("../src/verticals/finance/pages/MyReports.tsx", import.meta.url), "utf8");

const task = (): ResearchTaskRequest => ({
  schemaVersion: 1,
  id: "report-task-test",
  kind: "locate_passages",
  requestedMode: "auto",
  objective: "定位收入变化原文",
  evidenceScope: "existing",
  workflow: "single_step",
  inputRefs: [{ kind: "report", id: "report-a" }],
  outputFormat: "text",
  operation: null,
});

const routed = {
  status: "routed", executionAvailable: true, events: [],
  route: {
    target: "quick", requestedMode: "auto", reasonCode: "prepared_bounded_task",
    reason: "材料完备且任务有界", routeFingerprint: "a".repeat(64), materialState: "ready",
  },
};

test("routeTask 只提交高层任务与 execute=false，不发送模型配置或 engine", async () => {
  const oldFetch = globalThis.fetch;
  const seen: { url: string; body: Record<string, unknown> }[] = [];
  globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
    seen.push({ url: String(input), body: JSON.parse(String(init?.body)) as Record<string, unknown> });
    return new Response(JSON.stringify(routed), { status: 200, headers: { "content-type": "application/json" } });
  }) as typeof fetch;
  try {
    await backend.routeTask(task());
    assert.equal(seen[0]?.url, "/api/tasks");
    assert.equal(seen[0]?.body.execute, false);
    assert.equal("llm" in seen[0]!.body, false);
    assert.equal("engine" in seen[0]!.body, false);
    assert.equal("engine" in (seen[0]!.body.task as Record<string, unknown>), false);
  } finally { globalThis.fetch = oldFetch; }
});

test("runTask 的 Quick 配置直接发给统一任务入口，不预检本地订阅 Agent", async () => {
  const oldFetch = globalThis.fetch;
  const paths: string[] = [];
  let body: Record<string, unknown> = {};
  globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
    paths.push(String(input));
    body = JSON.parse(String(init?.body)) as Record<string, unknown>;
    return new Response(JSON.stringify({ ...routed, status: "completed" }), {
      status: 200, headers: { "content-type": "application/json" },
    });
  }) as typeof fetch;
  try {
    await backend.runTask(task(), "a".repeat(64), undefined, {
      provider: "deepseek", apiKey: "test-key", baseURL: "https://api.example.test", model: "test-model",
    });
    assert.deepEqual(paths, ["/api/tasks"]);
    assert.equal(body.execute, true);
    assert.equal(body.expectedRouteFingerprint, "a".repeat(64));
    assert.deepEqual(body.llm, {
      provider: "deepseek", apiKey: "test-key", baseURL: "https://api.example.test", model: "test-model",
    });
    assert.equal("engine" in body, false);
  } finally { globalThis.fetch = oldFetch; }
});

test("我的研报展示 Auto / Quick / Deep、路由理由与 M2 Deep 未执行边界", () => {
  assert.match(page, /auto: "Auto", quick: "Quick", deep: "Deep"/);
  assert.match(page, /routeDecision\.reason/);
  assert.match(page, /Deep 执行器将在 M3 接入/);
  assert.match(page, /本次只完成路由判断，未启动长流程/);
  assert.match(page, /backend\.routeTask\(task/);
  assert.match(page, /backend\.runTask\(task/);
  assert.doesNotMatch(page, /backend\.startResearch/);
  assert.doesNotMatch(page, /["']engine["']\s*:/);
});
