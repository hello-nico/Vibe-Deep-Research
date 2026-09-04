import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import "../src/finance/register.ts";
import { addReport } from "../src/report_library.ts";
import { runUnifiedTask } from "../src/task_service.ts";
import { ServiceError, type ServiceContext } from "../src/service.ts";

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), "vra-task-service-"));
const ctx = (dataRoot: string): ServiceContext => ({ repoRoot: REPO, dataRoot,
  python: path.join(REPO, "..", ".venv", "bin", "python"), node: process.execPath, providerEnvKey: null });
const task = (id: string, requestedMode: "auto" | "quick" | "deep" = "auto") => ({
  schemaVersion: 1, id: "task-api-1", kind: "locate_passages", requestedMode,
  objective: "定位收入变化的原文", evidenceScope: "existing", workflow: "single_step",
  inputRefs: [{ kind: "report", id }], outputFormat: "text", operation: null,
});

test("统一任务入口用真实研报适配器路由并执行 Quick，响应不回显密钥", async () => {
  const dataRoot = tmp();
  const rec = await addReport(dataRoot, { name: "收入.md", content: Buffer.from("收入同比增长。", "utf8").toString("base64") });
  const routed = await runUnifiedTask(ctx(dataRoot), { task: task(rec.id), execute: false });
  const result = await runUnifiedTask(ctx(dataRoot), {
    task: task(rec.id), execute: true, expectedRouteFingerprint: routed.route.routeFingerprint,
  }, undefined, {
    quickProvider: { name: "fixture", baseURL: "https://example.invalid/v1", apiKey: "secret-test-key", model: "fixture", structuredOutput: "prompt" },
    complete: async (request) => {
      const payload = JSON.parse(String(request.messages[1]?.content));
      const excerpt = payload.materials[0].excerpts[0];
      return { message: { role: "assistant", content: JSON.stringify({ selections: [{
        kind: payload.materials[0].kind, id: payload.materials[0].id, revision: payload.materials[0].revision,
        excerptId: excerpt.excerptId,
      }] }) }, finishReason: "stop", usage: { total_tokens: 12 }, durationMs: 3 };
    },
  });
  assert.equal(result.status, "completed");
  assert.equal(result.route.target, "quick");
  assert.deepEqual(result.events.map((event) => event.type), ["started", "artifact", "completed"]);
  assert.equal(JSON.stringify(result).includes("secret-test-key"), false);
});

test("Deep 在 M2 只返回透明路由结果，不伪装成已经执行；旧研究入口不受影响", async () => {
  const dataRoot = tmp();
  const rec = await addReport(dataRoot, { name: "深研.md", content: Buffer.from("正文。", "utf8").toString("base64") });
  const result = await runUnifiedTask(ctx(dataRoot), { task: task(rec.id, "deep"), execute: false });
  assert.equal(result.status, "routed");
  assert.equal(result.executionAvailable, false);
  assert.equal(result.route.target, "deep");
  assert.deepEqual(result.events, []);
});

test("确定性计算由统一任务入口真实执行，不把成功路由冒充成已处理", async () => {
  const dataRoot = tmp();
  const calcTask = {
    schemaVersion: 1, id: "task-calc-1", kind: "calculate", requestedMode: "auto",
    objective: "计算前瞻倍数", evidenceScope: "existing", workflow: "single_step", inputRefs: [],
    outputFormat: "data", operation: { kind: "calculate", functionId: "forward_pe",
      args: { price: 100, eps_forecast: 5 } },
  };
  const routed = await runUnifiedTask(ctx(dataRoot), { task: calcTask, execute: false });
  const result = await runUnifiedTask(ctx(dataRoot), {
    task: calcTask, execute: true, expectedRouteFingerprint: routed.route.routeFingerprint,
  });
  assert.equal(result.status, "completed");
  assert.equal(result.executionAvailable, true);
  assert.equal(result.route.target, "deterministic");
  assert.deepEqual(result.events.map((event) => event.type), ["started", "artifact", "completed"]);
  const artifact = result.events.find((event) => event.type === "artifact");
  assert.equal(((artifact?.payload?.result as { output?: { value?: unknown } })?.output?.value), 20);
});

test("execute=false 只完成确定性路由；已取消的请求不会进入计算", async () => {
  const dataRoot = tmp();
  const calcTask = {
    schemaVersion: 1, id: "task-calc-route", kind: "calculate", requestedMode: "auto",
    objective: "只判断路径", evidenceScope: "existing", workflow: "single_step", inputRefs: [],
    outputFormat: "data", operation: { kind: "calculate", functionId: "forward_pe",
      args: { price: 100, eps_forecast: 5 } },
  };
  const routed = await runUnifiedTask(ctx(dataRoot), { task: calcTask, execute: false });
  assert.equal(routed.status, "routed");
  assert.deepEqual(routed.events, []);
  const controller = new AbortController();
  controller.abort();
  await assert.rejects(() => runUnifiedTask(ctx(dataRoot), {
    task: calcTask, execute: true, expectedRouteFingerprint: routed.route.routeFingerprint,
  }, controller.signal),
    (error: unknown) => error instanceof ServiceError && error.code === "cancelled");
});

test("两段式执行必须与第一次路由指纹一致，不一致时拒绝而不是换路线", async () => {
  const dataRoot = tmp();
  const rec = await addReport(dataRoot, { name: "会变化.md", content: Buffer.from("原始正文。", "utf8").toString("base64") });
  const routed = await runUnifiedTask(ctx(dataRoot), { task: task(rec.id), execute: false });
  await assert.rejects(() => runUnifiedTask(ctx(dataRoot), {
    task: task(rec.id), execute: true, expectedRouteFingerprint: "f".repeat(64),
    llm: { provider: "fixture", apiKey: "secret", model: "fixture" },
  }), (error: unknown) => error instanceof ServiceError && error.code === "route_changed");
  assert.match(routed.route.routeFingerprint, /^[a-f0-9]{64}$/);
});

test("统一任务请求拒绝注入依赖、非法 llm 与契约外字段", async () => {
  const dataRoot = tmp();
  for (const request of [
    { task: {}, materials: {} },
    { task: {}, execute: "yes" },
    { task: {}, expectedRouteFingerprint: "short" },
    { task: {}, execute: false, llm: { provider: "mimo" } },
    { task: {}, llm: { provider: "mimo", apiKey: "x", resolver: "evil" } },
  ]) {
    await assert.rejects(() => runUnifiedTask(ctx(dataRoot), request),
      (error: unknown) => error instanceof ServiceError && error.code === "invalid_task_request");
  }
  const rec = await addReport(dataRoot, { name: "两阶段.md", content: Buffer.from("正文。", "utf8").toString("base64") });
  await assert.rejects(() => runUnifiedTask(ctx(dataRoot), { task: task(rec.id), execute: true }),
    (error: unknown) => error instanceof ServiceError && error.code === "invalid_task_request");
});
