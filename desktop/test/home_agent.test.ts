import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const financeAgent = readFileSync(
  new URL("../src/verticals/finance/components/ui/FinanceAiDock.tsx", import.meta.url),
  "utf8",
);
const coreMessages = readFileSync(
  new URL("../src/core/ai/AiMessages.tsx", import.meta.url),
  "utf8",
);

test("Core 只在有说明时渲染提醒框，长任务使用统一卡片样式", () => {
  assert.match(coreMessages, /msgs\.length === 0 && notice &&/);
  assert.match(coreMessages, /suggestionStyle === "tasks" \? "grid gap-2 sm:grid-cols-2"/);
  assert.match(coreMessages, /highlighted \? "border-warning\/30 bg-warning\/\[0\.035\]"/);
  assert.match(coreMessages, /const v = value \?\? ref\.current\?\.value \?\? ""/);
  assert.match(coreMessages, /onValueChange\?\.\(""\)/);
});

test("等待中不把空助手占位画成气泡", () => {
  assert.match(coreMessages, /m\.role === "assistant" && !m\.content\.trim\(\)/);
  assert.match(coreMessages, /loading && <div className="flex justify-start"><AiWaiting \/>/);
});
