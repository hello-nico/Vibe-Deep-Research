import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (p: string) => readFileSync(new URL(`../src/${p}`, import.meta.url), "utf8");
test("V2 保留原侧栏顺序、子栏目及真实 AI 入口", () => {
  const layout = read("verticals/finance/components/layout/Layout.tsx");
  const nav = layout.slice(layout.indexOf("const NAV ="), layout.indexOf("const INTEL_LINKS")).replace(/^\s*\/\/.*$/gm, "");
  assert.deepEqual([...nav.matchAll(/label: "([^"]+)"/g)].map(m => m[1]), ["深度对话", "大盘行情", "资讯雷达", "行业研究", "产业研究", "个股研究", "自选股", "我的资料", "我的研究"]);
  assert.match(layout, /id="dsh-settings"/);
  for (const route of ["/intel/investment-news", "/intel/news", "/intel/filings", "/intel/events"]) assert.ok(layout.includes(route));
  assert.doesNotMatch(layout, /gpu-rent|GPU租金|SIGNAL_LINKS|vr-signals-open/);
  assert.doesNotMatch(layout, /SECTOR_LINKS|vr-sectors-open/);
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
test("会话运行态用产品主色和「研究中」，不沿用 DeepSeek 蓝与求索文案", () => {
  const dsh = read("verticals/finance/dsh/native-dsh.css");
  assert.match(dsh, /#dsh-conversation \{[\s\S]*--dsw-alias-button-info-fill: hsl\(var\(--primary\)\)/);
  assert.match(dsh, /aria-label="停止生成"/);
  assert.match(dsh, /#dsh-conversation \{[\s\S]*--dsw-static-deepseek-500: hsl\(var\(--primary\)\)/);
  const chatPatch = readFileSync(new URL("../dsh/runtime/patches/@deepseek-ai+dsh-client-ui-chat+0.1.2-rc.1.patch", import.meta.url), "utf8");
  assert.match(chatPatch, /\+.*"chat\.deepDiving": "研究中…"/);
  assert.match(chatPatch, /-.*"chat\.deepDiving": "深度求索中\.\.\."/);
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
  assert.match(layout, /to="\/" aria-label="Vibe Finance 深度对话"/);
  assert.match(logo, /viewBox="0 0 64 64"/);
  assert.match(logo, /aria-hidden="true" focusable="false"/);
  assert.doesNotMatch(logo, /<image|<script|<foreignObject|href=|fetch\(/);
});
test("非首页顶栏只放问助手入口，不再并排投研助手身份字", () => {
  const layout = read("verticals/finance/components/layout/Layout.tsx");
  assert.match(layout, /pathname !== "\/" && !pathname.startsWith\("\/my-research\/topics\/"\) && <FinanceAiDock/);
  assert.doesNotMatch(layout, /mr-24/);
  assert.doesNotMatch(layout, /lg:inline">投研助手/);
  assert.doesNotMatch(read("core/ai/AiDock.tsx"), /fixed right-5 top-4/);
  assert.match(read("core/ai/AiDock.tsx"), /renderPanel\(/);
  assert.doesNotMatch(read("core/ai/AiDock.tsx"), /createPortal/);
  assert.match(read("verticals/finance/components/layout/FinanceAssistantSurface.tsx"), /createPortal/);
  assert.match(read("verticals/finance/components/ui/FinanceAiDock.tsx"), /trigger: "问助手"/);
  assert.match(read("verticals/finance/components/ui/FinanceAiDock.tsx"), /panel: "问助手"/);
});

test("行业、个股、我的资料共用行业卡片；资料列表单独用总览表", () => {
  const card = read("verticals/finance/components/IndustryDashboardCard.tsx");
  const panel = read("verticals/finance/components/ui/DashboardPanel.tsx");
  const panelCss = read("verticals/finance/components/ui/dashboard-panel.css");
  assert.match(card, /export function DashboardCard/);
  assert.match(panel, /export function DashboardPanel/);
  assert.match(panel, /border-b border-border\/50/);
  assert.match(panelCss, /th:last-child/);
  assert.match(panelCss, /width: 1%/);
  for (const path of [
    "verticals/finance/pages/IndustryCenter.tsx",
    "verticals/finance/pages/IndustryProfiles.tsx",
    "verticals/finance/pages/CompanyWiki.tsx",
    "verticals/finance/pages/UploadedReports.tsx",
  ]) {
    assert.match(read(path), /DashboardCard/, path);
  }
  assert.match(read("verticals/finance/pages/UploadedReports.tsx"), /DashboardPanel/);
  assert.doesNotMatch(read("verticals/finance/pages/Watchlist.tsx"), /DashboardPanel/);
  assert.doesNotMatch(read("verticals/finance/pages/CompanyWiki.tsx"), /DashboardPanel/);
});
