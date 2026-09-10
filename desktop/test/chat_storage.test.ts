import assert from "node:assert/strict";
import test from "node:test";
import { saveChat, modelHistory } from "../src/core/ai/useAiChat.ts";

test("后续追问保留当轮引用，兼容旧对话并排除中止轮次", () => {
  const history = modelHistory([
    { role: 'user', content: '旧问题' },
    { role: 'assistant', content: '旧回答' },
    { role: 'user', content: '这段是什么？', modelContent: '引用：文档 A 第 3 页原文\n问题：这段是什么？' },
    { role: 'assistant', content: '这是引用内容' },
    { role: 'user', content: '未完成问题', modelContent: '不应回放' },
    { role: 'assistant', content: '部分回答', partial: true },
  ]);
  assert.equal(history.length, 4);
  assert.equal(history[0].content, '旧问题');
  assert.equal(history[2].content, '引用：文档 A 第 3 页原文\n问题：这段是什么？');
});

test("浏览器拒绝写入/删除时显式返回失败，不偷偷删除其他聊天腾空间", () => {
  const original = Object.getOwnPropertyDescriptor(globalThis, "localStorage");
  let removals = 0;
  Object.defineProperty(globalThis, "localStorage", { configurable: true, value: {
    setItem() { throw new Error("quota"); },
    removeItem() { removals++; throw new Error("blocked"); },
  } });
  try {
    assert.equal(saveChat("test", [{ role: "user", content: "test" }, { role: "assistant", content: "answer" }]), false);
    assert.equal(removals, 0);
    assert.equal(saveChat("test", []), false);
    assert.equal(removals, 1);
  } finally {
    if (original) Object.defineProperty(globalThis, "localStorage", original);
    else Reflect.deleteProperty(globalThis, "localStorage");
  }
});
