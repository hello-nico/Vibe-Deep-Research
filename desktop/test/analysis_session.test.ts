import assert from "node:assert/strict";
import test from "node:test";
import { chatStream } from "../src/verticals/finance/lib/llm.ts";
import { reflectStream } from "../src/verticals/finance/lib/agents.ts";
import { backend } from "../src/verticals/finance/lib/backend.ts";

test("每日复盘、赛道分析、记录反思与重复分析都使用独立会话，并转发取消", async () => {
  const original = backend.chat;
  const calls: { message: string; session: string | undefined; signal: AbortSignal | undefined }[] = [];
  backend.chat = async (message, session, signal) => {
    calls.push({ message, session, signal });
    return { reply: "结果", redacted: 0 } as Awaited<ReturnType<typeof backend.chat>>;
  };
  try {
    const ctrl = new AbortController();
    for (const context of ["今日大盘数据", "算力赛道资讯", "今日大盘数据"]) {
      await chatStream([{ role: "user", content: "分析" }], context, {}, ctrl.signal);
    }
    await reflectStream("原文", "记录", {}, ctrl.signal);
    assert.equal(calls.length, 4);
    assert.equal(new Set(calls.map((c) => c.session)).size, 4);
    assert.ok(calls.every((c) => c.signal === ctrl.signal && c.session && c.session !== "default" && c.session.length <= 64));
    assert.match(calls[0]!.message, /今日大盘数据/);
    assert.match(calls[1]!.message, /算力赛道资讯/);
    assert.doesNotMatch(calls[1]!.message, /今日大盘数据/);
    assert.match(calls[3]!.session!, /^note-reflection-/);
    ctrl.abort();
    await reflectStream("取消", "记录", {}, ctrl.signal);
    await assert.rejects(chatStream([{ role: "user", content: "取消" }], "", {}, ctrl.signal), { name: "AbortError" });
    assert.equal(calls.length, 4);
  } finally { backend.chat = original; }
});
