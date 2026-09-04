import assert from "node:assert/strict";
import test from "node:test";

import {
  LLM_KEY, clearUserLlm, readAiRuntime, saveExecutionMode, saveUserLlm,
} from "../src/verticals/finance/lib/llmStore.ts";

function storageFixture(initial?: string) {
  const values = new Map<string, string>();
  if (initial) values.set(LLM_KEY, initial);
  Object.defineProperty(globalThis, "localStorage", { configurable: true, value: {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => values.set(key, value),
    removeItem: (key: string) => values.delete(key),
  } });
  return values;
}

const api = { provider: "deepseek", baseURL: "https://api.deepseek.com", apiKey: "test-key", model: "deepseek-v4" };

test("旧版平铺配置读入后默认开启 Agent，不在读取时改写存储", () => {
  const values = storageFixture(JSON.stringify(api));
  const before = values.get(LLM_KEY);
  const read = readAiRuntime();
  assert.equal(read.status, "ok");
  assert.equal(read.config?.executionMode, "agent");
  assert.equal(read.config?.directSupported, false);
  assert.equal(values.get(LLM_KEY), before);
});

test("API 通过直连能力探针后可切换，密钥只保存一份", () => {
  const values = storageFixture();
  saveUserLlm(api, { directSupported: true, directReason: "verified" });
  saveExecutionMode("direct");
  const read = readAiRuntime();
  assert.equal(read.config?.executionMode, "direct");
  assert.equal(read.config?.source.apiKey, "test-key");
  assert.equal((values.get(LLM_KEY)?.match(/test-key/g) ?? []).length, 1);
});

test("重新连接 AI 后回到 Agent 默认值，不继承旧来源的直连开关", () => {
  storageFixture();
  saveUserLlm(api, { directSupported: true, directReason: "verified" });
  saveExecutionMode("direct");
  saveUserLlm({ ...api, model: "deepseek-new" }, { directSupported: true, directReason: "verified" });
  assert.equal(readAiRuntime().config?.executionMode, "agent");
});

test("订阅接入与未验证 API 都不能关闭 Agent", () => {
  storageFixture();
  saveUserLlm({ provider: "cli-codex", baseURL: "", apiKey: "", model: "codex" },
    { directSupported: false, directReason: "订阅登录只能使用 Agent" });
  assert.throws(() => saveExecutionMode("direct"), /订阅登录只能使用 Agent/);
  saveUserLlm(api, { directSupported: false, directReason: "该端点未通过直连能力契约" });
  assert.throws(() => saveExecutionMode("direct"), /未通过直连能力契约/);
  clearUserLlm();
  assert.equal(readAiRuntime().status, "none");
});
