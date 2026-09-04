import assert from "node:assert/strict";
import fs from "node:fs";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";

import "../src/finance/register.ts";
import { DirectStageAgent, writtenPathsOf } from "../src/engines/direct_stage_agent.ts";
import { directCapabilityOf } from "../src/providers.ts";
import type { Stage } from "../src/config.ts";

/**
 * **直连阶段执行器的故障矩阵**(双引擎方案 v2 第 5 步)。
 *
 * 按 v2 的要求:**先跑单阶段故障矩阵,不直接跑六阶段 happy path** ——
 * happy path 只能证明"顺利时能跑",而这一层真正的风险全在不顺利的时候:
 * 模型把参数写坏、工具报错、结果太大、轮数用尽、端点抽风。这些每一条处理错了,
 * 表现都是"研究莫名其妙没产出",而不是一条清楚的错误。
 *
 * 假的只有**模型端点**;工具是真的、文件系统是真的 —— 否则测不出接线问题。
 */

const STAGE = "profile" as Stage;

/** 建一个最小但真实的运行目录:受控工具靠 .vibe/hook-context.json 判当前阶段 */
function makeRunDir(): string {
  const runDir = fs.mkdtempSync(path.join(fs.realpathSync(os.tmpdir()), "vra-direct-run-"));
  fs.mkdirSync(path.join(runDir, ".vibe"), { recursive: true });
  fs.mkdirSync(path.join(runDir, "fetch"), { recursive: true });
  fs.writeFileSync(path.join(runDir, ".vibe", "hook-context.json"), JSON.stringify({
    stage: STAGE, attempt: 1, run_id: "t1", repo_root: runDir, data_root: runDir, run_dir: runDir,
    python: "python3", scripts_rel: "scripts", forbidden_path_patterns: [], allowed_path_prefixes: [],
    written_at: new Date().toISOString(),
  }));
  fs.writeFileSync(path.join(runDir, "fetch", "quote.json"), JSON.stringify({ hello: "world" }));
  return runDir;
}

/** 按脚本逐轮返回预设回复的假模型端点;记录每次收到的请求体 */
async function scriptedEndpoint(replies: unknown[]) {
  const seen: Record<string, unknown>[] = [];
  let i = 0;
  const server = http.createServer((req, res) => {
    let raw = "";
    req.on("data", (c) => { raw += c; });
    req.on("end", () => {
      seen.push(JSON.parse(raw || "{}"));
      const body = replies[Math.min(i, replies.length - 1)];
      i += 1;
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify(body));
    });
  });
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  const port = (server.address() as { port: number }).port;
  return { baseURL: `http://127.0.0.1:${port}/v1`, seen, close: () => new Promise<void>((r) => { server.close(() => r()); }) };
}

const toolCallReply = (name: string, args: string, id = "call_1") => ({
  choices: [{ message: { role: "assistant", content: null, tool_calls: [{ id, type: "function", function: { name, arguments: args } }] }, finish_reason: "tool_calls" }],
  usage: { total_tokens: 10 },
});
const textReply = (content: string) => ({ choices: [{ message: { role: "assistant", content }, finish_reason: "stop" }], usage: { total_tokens: 5 } });

function makeAgent(runDir: string, baseURL: string, extra: Record<string, unknown> = {}) {
  return new DirectStageAgent({
    runId: "t1",
    toolCtx: { runDir, repoRoot: runDir, python: "python3" },
    capability: { ...directCapabilityOf(null), supported: true, unverified: false, baseURL, structuredOutput: "prompt", model: "m", reason: "test" },
    apiKey: "sk-test-abcdefghijklmnop", model: "m",
    eventsPath: path.join(runDir, "events.jsonl"),
    requestTimeoutMs: 5_000,
    ...extra,
  });
}

test("正常一轮:调工具 → 拿结果 → 给最终回复", async () => {
  const runDir = makeRunDir();
  const ep = await scriptedEndpoint([toolCallReply("list_run_files", "{}"), textReply("共 1 个文件")]);
  try {
    const out = await makeAgent(runDir, ep.baseURL).runTurn(STAGE, 1, "看看有什么文件");
    assert.equal(out.failed, null);
    assert.equal(out.finalResponse, "共 1 个文件");
    assert.equal(out.itemCount, 2, "两轮模型往返");
    assert.deepEqual(out.commands, [], "直连没有 shell,commands 必须是空的(塞工具名进去是假的审计等价)");
    assert.deepEqual(out.fileChanges, [], "读类工具不产生文件变更");
    assert.equal(out.threadId, null, "per_stage_session:没有跨阶段线程");
    // 第二次请求里必须带上 tool 角色的结果
    const second = ep.seen[1].messages as { role: string; content?: string }[];
    assert.equal(second.at(-1)?.role, "tool");
    assert.match(String(second.at(-1)?.content), /quote\.json/);
  } finally { await ep.close(); fs.rmSync(runDir, { recursive: true, force: true }); }
});

test("🔴 模型把 arguments 写成非法 JSON:回喂 invalid_arguments,**不静默换成 {}**", async () => {
  const runDir = makeRunDir();
  const ep = await scriptedEndpoint([toolCallReply("list_run_files", "{不是JSON"), textReply("好的")]);
  try {
    const out = await makeAgent(runDir, ep.baseURL).runTurn(STAGE, 1, "p");
    assert.equal(out.failed, null, "参数写坏不该让整轮失败 —— 要给模型改的机会");
    const second = ep.seen[1].messages as { role: string; content?: string }[];
    const toolMsg = second.at(-1);
    assert.equal(toolMsg?.role, "tool");
    assert.match(String(toolMsg?.content), /invalid_arguments/,
      "静默换成 {} 会让'模型传错参数'变成'工具行为异常',而且模型永远学不到自己错在哪");
  } finally { await ep.close(); fs.rmSync(runDir, { recursive: true, force: true }); }
});

test("工具报错:回喂结构化错误,循环继续(不是整轮崩掉)", async () => {
  const runDir = makeRunDir();
  // 读一个不在白名单里的路径 → 实现层拒
  const ep = await scriptedEndpoint([toolCallReply("read_run_file", JSON.stringify({ path: "../../etc/passwd" })), textReply("换个方式")]);
  try {
    const out = await makeAgent(runDir, ep.baseURL).runTurn(STAGE, 1, "p");
    assert.equal(out.failed, null);
    assert.equal(out.finalResponse, "换个方式");
    const toolMsg = (ep.seen[1].messages as { role: string; content?: string }[]).at(-1);
    assert.match(String(toolMsg?.content), /path_not_allowed/, "工具的失败原因要原样告诉模型");
  } finally { await ep.close(); fs.rmSync(runDir, { recursive: true, force: true }); }
});

test("未知工具名:按 registry 拒绝,并把可用工具告诉模型", async () => {
  const runDir = makeRunDir();
  const ep = await scriptedEndpoint([toolCallReply("rm_rf", "{}"), textReply("抱歉")]);
  try {
    await makeAgent(runDir, ep.baseURL).runTurn(STAGE, 1, "p");
    const toolMsg = (ep.seen[1].messages as { role: string; content?: string }[]).at(-1);
    assert.match(String(toolMsg?.content), /unknown_tool/);
    assert.match(String(toolMsg?.content), /list_run_files/, "要列出可用工具,否则模型只能瞎猜");
  } finally { await ep.close(); fs.rmSync(runDir, { recursive: true, force: true }); }
});

test("轮数用尽:最后一次请求**不带工具**,逼模型用现有材料收尾", async () => {
  const runDir = makeRunDir();
  // 每轮都要工具 → 撞上限
  const ep = await scriptedEndpoint([toolCallReply("list_run_files", "{}")]);
  try {
    const out = await makeAgent(runDir, ep.baseURL, { maxToolRounds: 2 }).runTurn(STAGE, 1, "p");
    // 2 轮工具 + 1 轮收尾
    assert.equal(ep.seen.length, 3);
    assert.ok(ep.seen[0].tools, "前两轮要带工具");
    assert.equal(ep.seen[2].tools, undefined, "最后一轮必须不带工具,否则它会继续要工具、永远收不了尾");
    assert.equal(out.failed, "模型给出了空回复", "收尾轮仍只给 tool_calls 而无内容 → 如实判失败");
  } finally { await ep.close(); fs.rmSync(runDir, { recursive: true, force: true }); }
});

test("端点失败:turn 判失败并带上原因,而不是抛异常炸穿编排器", async () => {
  const runDir = makeRunDir();
  const server = http.createServer((_q, s) => { s.writeHead(500); s.end('{"error":"boom"}'); });
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  const port = (server.address() as { port: number }).port;
  try {
    const out = await makeAgent(runDir, `http://127.0.0.1:${port}/v1`).runTurn(STAGE, 1, "p");
    assert.match(String(out.failed), /http_error/);
    assert.equal(out.finalResponse, "", "失败时不许编一个回复出来");
  } finally { await new Promise<void>((r) => { server.close(() => r()); }); fs.rmSync(runDir, { recursive: true, force: true }); }
});

test("空回复要判失败(空字符串不是产出)", async () => {
  const runDir = makeRunDir();
  const ep = await scriptedEndpoint([textReply("   ")]);
  try {
    const out = await makeAgent(runDir, ep.baseURL).runTurn(STAGE, 1, "p");
    assert.equal(out.failed, "模型给出了空回复");
  } finally { await ep.close(); fs.rmSync(runDir, { recursive: true, force: true }); }
});

test("事件流:关键节点都要落盘,且摘要随之变化(审计账本)", async () => {
  const runDir = makeRunDir();
  const ep = await scriptedEndpoint([toolCallReply("list_run_files", "{}"), textReply("done")]);
  try {
    const agent = makeAgent(runDir, ep.baseURL);
    const before = agent.eventsDigest();
    await agent.runTurn(STAGE, 1, "p");
    assert.notEqual(agent.eventsDigest(), before, "写了事件,摘要必须变");
    const lines = fs.readFileSync(path.join(runDir, "events.jsonl"), "utf8").trim().split("\n").map((l) => JSON.parse(l));
    const types = lines.map((l) => l.type);
    for (const t of ["direct.turn_start", "direct.model_reply", "direct.tool_ok", "direct.turn_end"]) {
      assert.ok(types.includes(t), `事件流里缺 ${t}:${types.join(", ")}`);
    }
    assert.ok(lines.every((l) => typeof l.seq === "number" && l.run_id === "t1"), "每条事件都要带 seq 与 run_id");
  } finally { await ep.close(); fs.rmSync(runDir, { recursive: true, force: true }); }
});

test("🔴 fileChanges 只收 agent 产物,绝不含工具的内部簿记", () => {
  assert.deepEqual(writtenPathsOf("calculate", { output_file: "01_x.json" }, {}), ["calcs/01_x.json"]);
  assert.deepEqual(writtenPathsOf("write_stage", {}, { written: "stages/profile.json" }), ["stages/profile.json"]);
  assert.deepEqual(writtenPathsOf("write_report", {}, { written: ["report.md", "stages/report.json"] }), ["report.md", "stages/report.json"]);
  assert.deepEqual(writtenPathsOf("list_run_files", {}, {}), [], "读类工具不产生变更");
  // calculate 内部还会写 .vibe/calc-owners.json —— 那是簿记不是 agent 产物。
  // 一旦混进来,validator 会判"agent 改写了受保护的编排产物",于是每次计算都变成违规。
  const all = [
    ...writtenPathsOf("calculate", { output_file: "01_x.json" }, {}),
    ...writtenPathsOf("write_stage", {}, { written: "stages/profile.json" }),
  ];
  assert.ok(!all.some((p) => p.includes(".vibe")), "内部簿记混进了 fileChanges");
});
