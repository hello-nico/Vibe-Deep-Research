import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { HOME_TASKS } from "../src/verticals/finance/lib/homeTasks.ts";

const financeAgent = readFileSync(
  new URL("../src/verticals/finance/components/ui/FinanceAiDock.tsx", import.meta.url),
  "utf8",
);
const coreMessages = readFileSync(
  new URL("../src/core/ai/AiMessages.tsx", import.meta.url),
  "utf8",
);

test("首页任务进入真实工作流，不预填到无工具聊天", () => {
  assert.doesNotMatch(financeAgent, /notice="直接问市场、公司、行业或研究方法。"/);
  assert.match(financeAgent, /placeholder="交流已有资料或研究方法…（Shift\+Enter 换行）"/);
  assert.match(financeAgent, /suggestionStyle="tasks"/);
  assert.match(financeAgent, /onPick=\{setDraft\}/);
  assert.doesNotMatch(financeAgent, /onPick=\{\(x\) => void chat\.submit\(x\)\}/);
  assert.match(financeAgent, /<AiComposer[\s\S]*?highlighted[\s\S]*?\/>/);

  const router = readFileSync(new URL("../src/verticals/finance/router.tsx", import.meta.url), "utf8");
  assert.deepEqual(HOME_TASKS.map((t) => t.to), ["/daily-review", "/research", "/my-reports"]);
  for (const task of HOME_TASKS) {
    assert.ok(router.includes(`path: "${task.to}"`));
  }
  assert.match(financeAgent, /to=\{task\.to\}/);
  assert.match(financeAgent, /不会自动取数或收集全网研报/);
  assert.doesNotMatch(financeAgent, /200份研报|所有研报/);
});

test("Core 只在有说明时渲染提醒框，长任务使用统一卡片样式", () => {
  assert.match(coreMessages, /msgs\.length === 0 && notice &&/);
  assert.match(coreMessages, /suggestionStyle === "tasks" \? "grid gap-2 sm:grid-cols-2"/);
  assert.match(coreMessages, /highlighted \? "border-warning\/30 bg-warning\/\[0\.035\]"/);
  assert.match(coreMessages, /const v = value \?\? ref\.current\?\.value \?\? ""/);
  assert.match(coreMessages, /onValueChange\?\.\(""\)/);
});
