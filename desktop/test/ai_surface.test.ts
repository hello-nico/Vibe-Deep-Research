import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const read = (file: string) => fs.readFileSync(new URL(`../src/${file}`, import.meta.url), "utf8");

test("所有对话入口共用主题适配表面，普通数据卡不染色", () => {
  assert.match(read("core/ai/AiDock.tsx"), /ai-surface/);
  assert.match(read("core/ai/AiMessages.tsx"), /ai-composer/);
  assert.match(read("core/ai/AiMessages.tsx"), /ai-message-assistant/);
  assert.match(read("core/ai/AiDock.tsx"), /ai-chat-trigger/);
  assert.doesNotMatch(read("verticals/finance/components/ui/GlassCard.tsx"), /ai-surface/);
  const css = read("index.css");
  assert.match(css, /\.ai-surface\s*\{/);
  assert.match(css, /\.ai-surface \.prose/);
  assert.match(css, /\.ai-surface\s*\{[^}]*background-color: hsl\(var\(--raised\)\);/);
  assert.match(css, /\.ai-surface\s*\{[^}]*border: 1px solid var\(--line-2\);/);
  assert.doesNotMatch(css, /\.ai-surface\s*\{[^}]*(gradient|box-shadow: [^n])/);
  for (const hook of ["ai-message-assistant", "ai-message-user", "ai-input", "ai-send"]) assert.ok(css.includes(`.ai-surface .${hook}`), hook);
  assert.match(css, /\.ai-surface \.ai-input:focus-within/);
  assert.match(css, /\.ai-chat-trigger \{[^}]*background: var\(--fill-2\)/);
});

test("M3 侧栏展示 DSH 状态，不提供旧 Agent 开关", () => {
  const layout = read("verticals/finance/components/layout/Layout.tsx");
  assert.doesNotMatch(layout, /<AgentToggle/);
  assert.match(layout, /id="dsh-status"/);
});
