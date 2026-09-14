import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { newAnalysisSession } from "../src/verticals/finance/lib/analysisSession.ts";
import { chatStream } from "../src/verticals/finance/lib/llm.ts";
import { reflectStream } from "../src/verticals/finance/lib/agents.ts";

test("#34 无 randomUUID 环境仍可创建页面分析、记录反思与资料任务标识", () => {
  const previous = Object.getOwnPropertyDescriptor(globalThis, "crypto");
  Object.defineProperty(globalThis, "crypto", { value: {}, configurable: true });
  try {
    const sessions = Array.from({ length: 20 }, () => newAnalysisSession("page-analysis"));
    assert.equal(new Set(sessions).size, 20);
    assert.ok(sessions.every((id) => /^[a-z0-9-]{1,64}$/.test(id)));
    assert.match(newAnalysisSession("note-reflection"), /^note-reflection-/);
    const source = readFileSync(new URL("../src/verticals/finance/pages/MyReports.tsx", import.meta.url), "utf8");
    assert.match(newAnalysisSession("report"), /^report-/);
    assert.match(source, /id: newAnalysisSession\("report"\)/);
    assert.doesNotMatch(source, /crypto\.randomUUID/);
  } finally {
    if (previous) Object.defineProperty(globalThis, "crypto", previous);
    else Reflect.deleteProperty(globalThis, "crypto");
  }
});

test("页面分析与记录反思使用无历史的独立模型请求，并转发取消", async () => {
  const original = globalThis.fetch;
  const calls: { message: string; history: unknown[]; signal: AbortSignal | null | undefined }[] = [];
  globalThis.fetch = async (url, options) => {
    assert.equal(url, '/finance-model');
    assert.equal(options?.method, 'POST');
    calls.push({ ...JSON.parse(String(options?.body)), signal: options?.signal });
    return Response.json({ reply: "结果" });
  };
  try {
    const ctrl = new AbortController();
    for (const context of ["今日大盘数据", "算力赛道资讯", "今日大盘数据"]) {
      await chatStream([{ role: "user", content: "分析" }], context, {}, ctrl.signal);
    }
    await reflectStream("原文", "记录", {}, ctrl.signal);
    assert.equal(calls.length, 4);
    assert.ok(calls.every((c) => c.signal === ctrl.signal));
    assert.ok(calls.every((c) => Array.isArray(c.history) && c.history.length === 0));
    assert.match(calls[0]!.message, /今日大盘数据/);
    assert.match(calls[1]!.message, /算力赛道资讯/);
    assert.doesNotMatch(calls[1]!.message, /今日大盘数据/);
    assert.match(calls[3]!.message, /标题:记录/);
    assert.match(calls[3]!.message, /原文/);
    assert.doesNotMatch(calls[3]!.message, /今日大盘数据|算力赛道资讯/);
    ctrl.abort();
    await reflectStream("取消", "记录", {}, ctrl.signal);
    await assert.rejects(chatStream([{ role: "user", content: "取消" }], "", {}, ctrl.signal), { name: "AbortError" });
    assert.equal(calls.length, 4);
  } finally { globalThis.fetch = original; }
});
