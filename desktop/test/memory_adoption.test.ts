import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { dirname } from "node:path";
import test from "node:test";

const require = createRequire(import.meta.url);
const { build } = require(require.resolve("esbuild", { paths: [dirname(require.resolve("vite/package.json"))] }));
const bundle = await build({ entryPoints: [new URL("../src/verticals/finance/lib/memory.ts", import.meta.url).pathname], bundle: true, format: "esm", platform: "browser", write: false });
const memory = await import(`data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].text).toString("base64")}`);

test("候选采用仅发送一个 Backend 请求；失败回读、选择已有目标仍走同一入口", async t => {
  const previous = Object.getOwnPropertyDescriptor(globalThis, "window");
  const events = new EventTarget();
  Object.defineProperty(globalThis, "window", { configurable: true, value: events });
  t.after(() => { if (previous) Object.defineProperty(globalThis, "window", previous); else Reflect.deleteProperty(globalThis, "window"); });
  let changes = 0;
  events.addEventListener(memory.CANDIDATE_CHANGED, () => changes++);
  const calls: { url: string; body: any }[] = [];
  let response: object = { id: "cand-1", status: "adopted", topic_id: "topic:aaaaaaaaaaaa" };
  let status = 200;
  t.mock.method(globalThis, "fetch", async (url: any, init: any) => {
    calls.push({ url: String(url), body: JSON.parse(init.body) });
    return new Response(JSON.stringify(response), { status });
  });
  const candidate = { id: "cand-1", question: "编辑后的研究问题", reason: "近期关注", status: "open" };
  await memory.adoptCandidate(candidate);
  assert.deepEqual(calls, [{ url: "/finance-research/wiki/research-candidates/cand-1/adopt", body: { question: candidate.question } }]);
  assert.equal(changes, 1);
  status = 500;
  await assert.rejects(memory.adoptCandidate(candidate));
  assert.equal(changes, 2);
  status = 200;
  response = { action: "choose", candidates: [{ topic_id: "topic:bbbbbbbbbbbb", title: "已有研究" }] };
  await assert.rejects(memory.adoptCandidate(candidate), memory.CandidateChoiceNeeded);
  assert.equal(changes, 2);
  response = { id: candidate.id, status: "adopted", topic_id: "topic:bbbbbbbbbbbb" };
  await memory.adoptCandidate(candidate, "topic:bbbbbbbbbbbb");
  assert.equal(calls.at(-1)?.body.topic_id, "topic:bbbbbbbbbbbb");
  assert.equal(calls.length, 4);
});
