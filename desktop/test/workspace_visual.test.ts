import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (p: string) => readFileSync(new URL(`../src/${p}`, import.meta.url), "utf8");
test("V2 保留原侧栏顺序、子栏目及真实 AI 入口", () => {
  const layout = read("verticals/finance/components/layout/Layout.tsx");
  const nav = layout.slice(layout.indexOf("const NAV ="), layout.indexOf("const INTEL_LINKS"));
  assert.deepEqual([...nav.matchAll(/label: "([^"]+)"/g)].map(m => m[1]), ["首页", "大盘行情", "资讯雷达", "产业信号", "板块中心", "个股研究", "自选股", "我的持仓", "我的研报", "研究记录"]);
  assert.match(layout, /id="dsh-settings"/);
  for (const route of ["/intel/investment-news", "/intel/news", "/intel/filings", "/intel/events", "/signals/gpu-rent", "/sectors/humanoid", "/sectors/ai-computing"]) assert.ok(layout.includes(route));
  assert.doesNotMatch(layout, /FinanceAiConsole|consoleOpen|vr-ai-console|openAgent|打开普通对话/);
  assert.doesNotMatch(layout, /phoenixtree|linsizhen|simonlin|buymeacoffee|联系作者/i);
  assert.ok(layout.includes("收起侧栏"));
  assert.match(layout, /<FinanceAiDock/);
  assert.match(layout, /workspace-sidebar/);
  assert.match(layout, /aria-expanded=\{groupOpen\}/);
  assert.match(layout, /aria-label=\{label\}/);
  assert.match(layout, /const closeMobileNav = \(\) => \{\s*setMobileOpen\(false\);[\s\S]*?requestAnimationFrame\(\(\) => menuRef\.current\?\.focus\(\)\)/);
  assert.equal((layout.match(/onClick=\{closeMobileNav\}/g) ?? []).length, 2);
  assert.match(layout, /event\.key === "Escape"[^\n]*closeMobileNav\(\)/);
});
test("公开暖橙玻璃风保留可访问性与非绿色品牌", () => {
  const css = read("index.css");
  assert.match(css, /--radius: 1rem/);
  assert.match(css, /--primary: 15 89% 56%/);
  assert.match(css, /--primary: 15 82% 50%/);
  assert.match(css, /radial-gradient/);
  assert.match(css, /backdrop-filter: blur\(14px\)/);
  assert.doesNotMatch(css, /--workspace-grid|217 92% 72%|263 78% 78%|Songti|STSong|Georgia/);
  assert.match(css, /focus-visible/);
  assert.match(css, /prefers-reduced-motion/);
  assert.match(css, /@media \(forced-colors: active\)/);
});
test("左上角使用本地产品标记，不增加外部请求或原作者品牌跳转", () => {
  const layout = read("verticals/finance/components/layout/Layout.tsx");
  const logo = read("verticals/finance/components/ui/BrandMark.tsx");
  assert.match(layout, /<BrandMark/);
  assert.doesNotMatch(layout, /PhoenixTreeLogo|phoenixtree|LineChart/);
  assert.match(layout, /to="\/" aria-label="Vibe Finance 首页"/);
  assert.match(logo, /viewBox="0 0 64 64"/);
  assert.match(logo, /aria-hidden="true" focusable="false"/);
  assert.doesNotMatch(logo, /<image|<script|<foreignObject|href=|fetch\(/);
});
test("首页以 Agent 为首屏，保留数据组件但不自动取数或启动任务", () => {
  const home = read("verticals/finance/pages/Home.tsx");
  const overview = read("verticals/finance/components/HomeOverview.tsx");
  assert.doesNotMatch(home, /<HomeOverview|backend\.fetch|backend\.research/);
  assert.doesNotMatch(home, /<FinanceHomeAgent/);
  assert.match(read("verticals/finance/components/layout/Layout.tsx"), /<NativeDshHost/);
  assert.match(overview, /backend\.fetch\("tx_quotes_batch"/);
  assert.match(overview, /backend\.runs\(/);
  assert.match(overview, /fetched_at/);
  assert.match(overview, /\.id/);
  assert.match(overview, /test_scenario/);
  assert.doesNotMatch(overview, /云川|DEMO-|3,268|chatStream|backend\.research\(/);
});
