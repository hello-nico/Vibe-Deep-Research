import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import test from "node:test";

const read = (p: string) => readFileSync(new URL(`../src/${p}`, import.meta.url), "utf8");
test("外壳：六个两字入口、图标栏放在外框上，页首无面包屑与小标题", () => {
  const layout = read("verticals/finance/components/layout/Layout.tsx");
  const nav = layout.slice(layout.indexOf("const NAV ="), layout.indexOf("export function Layout")).replace(/^\s*\/\/.*$/gm, "");
  assert.deepEqual([...nav.matchAll(/label: "([^"]+)"/g)].map(m => m[1]), ["对话", "动态", "洞悉", "关注", "资料", "设置"]);
  assert.deepEqual([...nav.matchAll(/to: "([^"]+)"/g)].map(m => m[1]), ["/", "/feed", "/insights", "/watch", "/my-reports", "/settings"]);
  assert.match(layout, /id="dsh-settings"/);
  assert.match(layout, /id="dsh-status"/);
  assert.match(layout, /workspace-shell/);
  assert.match(layout, /workspace-rail/);
  assert.match(layout, /workspace-surface/);
  assert.doesNotMatch(layout, /workspace-topbar|工作空间 \/|currentTitle|INTEL_LINKS|NAV_GROUPS|子栏目/);
  assert.doesNotMatch(layout, /gpu-rent|GPU租金|SIGNAL_LINKS|vr-signals-open|SECTOR_LINKS|vr-sectors-open/);
  assert.doesNotMatch(layout, /FinanceAiConsole|consoleOpen|vr-ai-console|openAgent|打开普通对话/);
  assert.doesNotMatch(layout, /phoenixtree|linsizhen|simonlin|buymeacoffee|联系作者/i);
  assert.doesNotMatch(layout, /ViewTransition|startViewTransition|framer-motion/);
  assert.match(layout, /<FinanceAiDock/);
  assert.match(layout, /key=\{pathname\}/);
  assert.match(layout, /className="workspace-page-enter"/);
  assert.match(layout, /aria-label=\{label\}/);
  for (const file of ["components/layout/Layout.tsx", "components/ui/PageHeader.tsx", "pages/Watch.tsx", "pages/Feed.tsx"]) {
    const source = read(`verticals/finance/${file}`);
    assert.doesNotMatch(source, /VIBE FINANCE \/ WORKSPACE|Vibe Finance \/ Workspace|workspace-kicker/i, file);
  }
  const header = read("verticals/finance/components/ui/PageHeader.tsx");
  assert.match(header, /<h1 className="workspace-title">/);
  assert.match(header, /<AssistantSlot \/>/);
  const intel = read("verticals/finance/pages/Intel.tsx");
  for (const key of ["investment-news", "news", "filings", "events"]) assert.ok(intel.includes(`key: "${key}"`));
  assert.doesNotMatch(intel, /label: "Investment News"/);
  const feed = read("verticals/finance/pages/Feed.tsx");
  assert.match(feed, /label: "资讯"/);
  assert.match(feed, /label: "市场"/);
});
test("会话运行态用产品主色和「研究中」，不沿用 DeepSeek 蓝与求索文案", () => {
  const dsh = read("verticals/finance/dsh/native-dsh.css");
  assert.match(dsh, /#dsh-conversation \{[\s\S]*--dsw-alias-button-info-fill: hsl\(var\(--primary\)\)/);
  assert.match(dsh, /aria-label="停止生成"/);
  assert.match(dsh, /#dsh-conversation \{[\s\S]*--dsw-static-deepseek-500: hsl\(var\(--primary\)\)/);
  const chatPatch = readFileSync(new URL("../dsh/runtime/patches/@deepseek-ai+dsh-client-ui-chat+0.1.7-alpha.2.patch", import.meta.url), "utf8");
  assert.match(chatPatch, /\+.*"chat\.deepDiving": "研究中…"/);
  assert.match(chatPatch, /-.*"chat\.deepDiving": "深度求索中"/);
});
test("令牌：墨色派生所有灰，近白底、无阴影渐变模糊，保留可访问性", () => {
  const css = read("index.css");
  for (const token of ["--base", "--chrome", "--surface", "--raised", "--brand", "--text-2", "--text-3", "--text-4", "--fill-1", "--fill-2", "--fill-3", "--line-1", "--line-2", "--line-3"]) assert.match(css, new RegExp(`${token}:`), token);
  assert.match(css, /--base: 220 21% 11%;/);
  assert.match(css, /--chrome: 210 12% 97%;/);
  assert.match(css, /--surface: 0 0% 99%;/);
  assert.match(css, /--raised: 0 0% 100%;/);
  assert.match(css, /--brand: 17 78% 51%;/);
  assert.match(css, /--fill-2: color-mix\(in srgb, hsl\(var\(--base\)\) 10%, transparent\)/);
  assert.match(css, /--line-2: color-mix\(in srgb, hsl\(var\(--base\)\) 12%, transparent\)/);
  assert.match(css, /--primary: var\(--brand\)/);
  const visual = css.replace(/\/\*[\s\S]*?\*\//g, "");
  assert.doesNotMatch(visual.replace(/research-loading/g, ""), /radial-gradient|linear-gradient|backdrop-filter: blur|box-shadow: [^n]/);
  assert.doesNotMatch(css, /\.glass\b|glass-glow|workspace-kicker|--workspace-grid|Songti|STSong|Georgia/);
  assert.match(css, /focus-visible/);
  assert.match(css, /prefers-reduced-motion/);
  assert.match(css, /@media \(forced-colors: active\)/);
  assert.match(css, /@keyframes workspace-page-enter/);
  assert.match(css, /animation: workspace-page-enter 300ms cubic-bezier\(\.22, 1, \.36, 1\) both/);
  assert.match(css, /from \{ opacity: 0; transform: translateY\(8px\); \}/);
  assert.match(css, /\.conversation-heading-slot:not\(\[hidden\]\)/);
  assert.doesNotMatch(css, /::view-transition/);
  // 控件高度 32 / 28，圆角：按钮全圆、输入 8、卡片 16。
  assert.match(css, /\.btn, \.workspace-action \{[^}]*height: 32px;[^}]*border-radius: 999px;/);
  assert.match(css, /\.btn-sm, \.workspace-action-compact \{ height: 28px;/);
  assert.match(css, /\.card \{[^}]*border-radius: 16px;/);
  assert.match(css, /\.status-pill|\.workspace-select \{[^}]*height: 28px;/);
  const ui = read("verticals/finance/components/ui/ui.css");
  assert.match(ui, /\.status-pill \{[^}]*height: 22px;/);
  assert.match(ui, /\.object-card \{[^}]*grid-template-rows: auto 1fr auto;/);
  assert.match(ui, /\.object-card \{[^}]*min-height: 176px;/);
});
test("左上角使用本地产品标记，不增加外部请求或原作者品牌跳转", () => {
  const layout = read("verticals/finance/components/layout/Layout.tsx");
  const logo = read("verticals/finance/components/ui/BrandMark.tsx");
  assert.match(layout, /<BrandMark/);
  assert.doesNotMatch(layout, /PhoenixTreeLogo|phoenixtree|LineChart/);
  assert.match(layout, /to="\/" aria-label="Vibe Finance 对话"/);
  assert.match(logo, /viewBox="0 0 64 64"/);
  assert.match(logo, /aria-hidden="true" focusable="false"/);
  assert.doesNotMatch(logo, /<image|<script|<foreignObject|href=|fetch\(/);
});
test("问助手是页首右侧的次要胶囊按钮，面板与侧面板共用定位", () => {
  const layout = read("verticals/finance/components/layout/Layout.tsx");
  assert.match(layout, /<FinanceAiDock triggerHost=\{assistantHost\} showTrigger=\{pathname !== "\/" && !pathname.startsWith\("\/insights\/topics\/"\)\}/);
  assert.match(read("verticals/finance/components/ui/FinanceAiDock.tsx"), /className="btn ai-chat-trigger"/);
  assert.doesNotMatch(layout, /mr-24/);
  assert.doesNotMatch(layout, /lg:inline">投研助手/);
  assert.doesNotMatch(read("core/ai/AiDock.tsx"), /fixed right-5 top-4/);
  assert.match(read("core/ai/AiDock.tsx"), /renderPanel\(/);
  assert.doesNotMatch(read("core/ai/AiDock.tsx"), /createPortal/);
  assert.match(read("verticals/finance/components/layout/FinanceAssistantSurface.tsx"), /createPortal/);
  assert.match(read("verticals/finance/components/layout/FinanceAssistantSurface.tsx"), /data-open="true"/);
  assert.match(read("verticals/finance/components/layout/research-surfaces.css"), /\.finance-assistant-panel\[data-open="true"\]/);
  assert.match(read("verticals/finance/components/layout/research-surfaces.css"), /--finance-assistant-width: 36rem/);
  // 问助手、查看依据、任务过程共用同一右侧面板定位、让位规则与拖拽宽度，不各写一套。
  assert.match(read("verticals/finance/components/EvidenceCard.tsx"), /finance-evidence-panel finance-side-panel/);
  assert.match(read("verticals/finance/components/TaskProcessPanel.tsx"), /finance-task-process finance-side-panel/);
  for (const file of ["components/EvidenceCard.tsx", "components/TaskProcessPanel.tsx", "components/layout/FinanceAssistantSurface.tsx"]) {
    assert.match(read(`verticals/finance/${file}`), /<SidePanelResizeHandle \/>/);
    assert.doesNotMatch(read(`verticals/finance/${file}`), /top-\[76px\]|29\.5rem/);
  }
  assert.match(read("verticals/finance/components/layout/research-surfaces.css"), /--finance-assistant-top: 0\.5rem/);
  assert.match(read("verticals/finance/components/layout/research-surfaces.css"), /margin-right: calc\(var\(--finance-assistant-width\) \+ var\(--finance-assistant-inline\)\)/);
  assert.match(read("verticals/finance/components/layout/research-surfaces.css"), /--conversation-expand-ease|cubic-bezier\(\.22, 1, \.36, 1\)/);
  assert.match(read("verticals/finance/components/ui/FinanceAiDock.tsx"), /page && renderPanel/);
  assert.doesNotMatch(read("verticals/finance/components/ui/FinanceAiDock.tsx"), /open && page && renderPanel/);
  assert.match(read("verticals/finance/components/ui/FinanceAiDock.tsx"), /问助手/);
  assert.match(read("verticals/finance/components/ui/FinanceAiDock.tsx"), /Ask/);
  assert.match(read("verticals/finance/components/ui/FinanceAiDock.tsx"), /ensureAssistant/);
  assert.doesNotMatch(read("verticals/finance/dsh/client.tsx"), /conversation\.input\.left[\s\S]*finance-assistant-mode/);
  assert.match(read("verticals/finance/components/ui/FinanceAiDock.tsx"), /AssistantModeSelect/);
  assert.match(read("verticals/finance/components/ui/FinanceAiDock.tsx"), /finance-assistant-mode-trigger/);
  assert.doesNotMatch(read("verticals/finance/components/ui/FinanceAiDock.tsx"), /<select/);
  assert.match(read("verticals/finance/components/ui/FinanceAiDock.tsx"), /attachGen/);
  assert.doesNotMatch(read("verticals/finance/components/ui/FinanceAiDock.tsx"), /\bsteal\(/);
  assert.doesNotMatch(read("verticals/finance/components/ui/FinanceAiDock.tsx"), /dsh-conversation/);
  assert.match(read("verticals/finance/components/ui/FinanceAiDock.tsx"), /useMemo\(\(\) => page \? assistantBindingForPage/);
  assert.match(read("verticals/finance/components/ui/FinanceAiDock.tsx"), /if \(attachGen\.current !== gen\) return/);
  assert.match(read("verticals/finance/components/ui/FinanceAiDock.tsx"), /queryPageObjects|usePageAssistantObjects/);
  assert.match(read("verticals/finance/components/ui/FinanceAiDock.tsx"), /draftsByBind/);
  assert.match(read("verticals/finance/components/ui/FinanceAiDock.tsx"), /question\?\.pageKey !== page\?\.key/);
  assert.match(read("verticals/finance/components/ui/FinanceAiDock.tsx"), /finance\.panel\.conversation/);
  assert.match(read("verticals/finance/components/ui/FinanceAiDock.tsx"), /cancelSession/);
  assert.match(read("verticals/finance/components/ui/FinanceAiDock.tsx"), /当前回答结束后可发送/);
  assert.match(read("verticals/finance/dsh/panel-conversation.tsx"), /conversation\.chat\.assistant-actions/);
  assert.match(read("verticals/finance/dsh/native-dsh.css"), /conversation\.session\.header\.actions/);
  assert.match(read("verticals/finance/dsh/native-dsh.css"), /conversation\.hero\.agentPreset/);
  assert.match(read("verticals/finance/dsh/native-dsh.css"), /conversation\.session\.header\.corner/);
  assert.doesNotMatch(read("verticals/finance/dsh/native-dsh.css"), /SVAs4q_label|cubgiG_seat|cubgiG_menuAnchor/);
  assert.match(read("verticals/finance/lib/userFacingError.ts"), /userFacingRuntimeError/);
  assert.match(read("verticals/finance/lib/taskTrajectory.ts"), /userFacingRuntimeError/);
  assert.match(read("verticals/finance/dsh/native-dsh.css"), /data-conversation-header-corner/);
  assert.match(read("verticals/finance/components/conversation-citations.css"), /inline-flex/);
  assert.match(read("verticals/finance/components/conversation-citations.css"), /#dsh-conversation a\[data-internal-citation\] svg/);
  assert.match(read("verticals/finance/lib/citationMarks.ts"), /new URL\(text, window\.location\.href\)/);
  assert.match(read("verticals/finance/components/EvidenceCard.tsx"), /document\.addEventListener\('click', intercept, true\)/);
  assert.match(read("verticals/finance/components/ConversationCitations.tsx"), /addEventListener\('click', onClick, true\)/);
  assert.match(read("verticals/finance/components/ConversationCitations.tsx"), /if \(!citationClickOpensPanel\(event\)\) return;/);
  assert.match(read("verticals/finance/components/conversation-citations.css"), /display: none/);
  assert.match(read("verticals/finance/dsh/panel-conversation.tsx"), /SaveNoteButton/);
  assert.doesNotMatch(read("verticals/finance/components/ui/FinanceAiDock.tsx"), /user \? "你"/);
  assert.match(read("verticals/finance/components/ui/FinanceAiDock.tsx"), /assistantModeHint\(seat\.mode\)/);
  assert.match(read("verticals/finance/components/ui/FinanceAiDock.tsx"), /createPortal/);
  assert.match(read("verticals/finance/components/ui/FinanceAiDock.tsx"), /truncate=\{false\}/);
  assert.match(read("verticals/finance/components/layout/research-surfaces.css"), /finance-assistant-composer/);
  assert.doesNotMatch(read("verticals/finance/components/ui/FinanceAiDock.tsx"), /引用当前页对象后提问/);
  assert.doesNotMatch(read("verticals/finance/lib/pageAssistantObjects.ts"), /已发布版本|当前页/);
  assert.match(read("verticals/finance/components/layout/research-surfaces.css"), /finance-assistant-transcript/);
  assert.match(read("core/ai/pageContext.tsx"), /\[pageKey, sig\]/);
  assert.doesNotMatch(read("core/ai/pageContext.tsx"), /}, \[ctx, pageKey, sig\]/);
  assert.match(read("verticals/finance/assistant/prompt.ts"), /已在发送时读取，直接使用[^']*补读是另一份结果，不覆盖、不混用本轮内容/);
  assert.match(read("verticals/finance/assistant/prompt.ts"), /页面显示值，不是工具读取的证据/);
  assert.doesNotMatch(read("verticals/finance/assistant/prompt.ts"), /persist=false|统一 Fetcher/);
  assert.match(read("verticals/finance/assistant/apply.ts"), /async ensureAssistant[\s\S]*assistantStarts\.has\(key\)/);
  assert.match(read("verticals/finance/assistant/apply.ts"), /bindAssistantPrompt/);
  assert.match(read("verticals/finance/assistant/apply.ts"), /isMissingAssistantSession/);
  assert.doesNotMatch(read("verticals/finance/assistant/apply.ts"), /list\.byId\[reusable\]\?\.blank/);
  assert.match(read("verticals/finance/components/ui/FinanceAiDock.tsx"), /assistantSessionErrorMessage/);
  assert.doesNotMatch(read("verticals/finance/dsh/client.tsx"), /startAssistant|bindAssistantPrompt|assistantBindingForPage/);
  assert.match(read("verticals/finance/dsh/client.tsx"), /applyAssistant\(/);
  assert.match(read("verticals/finance/dsh/client.tsx"), /if \(seated\) return null/);
  const assistantCss = read("verticals/finance/components/layout/research-surfaces.css");
  assert.match(assistantCss, /finance-assistant-composer/);
  assert.match(assistantCss, /finance-assistant-mentions/);
  assert.match(assistantCss, /finance-assistant-mode-trigger/);
  assert.match(assistantCss, /finance-assistant-menu/);
});

test("行业、产业、资料共用对象卡；关注用表格加个股卡；页面不再引用玻璃卡样式", () => {
  const card = read("verticals/finance/components/IndustryDashboardCard.tsx");
  const objectCard = read("verticals/finance/components/ui/ObjectCard.tsx");
  const cards = read("verticals/finance/components/ui/Card.tsx");
  assert.match(card, /export function DashboardCard/);
  assert.match(card, /<ObjectCard/);
  assert.match(objectCard, /export function ObjectCard/);
  assert.match(objectCard, /object-card-head/);
  assert.match(objectCard, /object-card-body/);
  assert.match(objectCard, /object-card-foot/);
  for (const name of ["GroupCard", "GroupRow", "Panel", "Metric", "StatusPill", "TableWrap", "Sparkline"]) assert.match(cards, new RegExp(`export function ${name}\\b`), name);
  assert.match(read("verticals/finance/components/ui/Button.tsx"), /variant\?: ButtonVariant|ButtonVariant = "primary" \| "secondary" \| "text" \| "icon"/);
  for (const path of [
    "verticals/finance/pages/IndustryCenter.tsx",
    "verticals/finance/pages/IndustryProfiles.tsx",
    "verticals/finance/pages/UploadedReports.tsx",
  ]) {
    assert.match(read(path), /DashboardCard/, path);
    assert.match(read(path), /object-grid/, path);
  }
  assert.match(read("verticals/finance/pages/UploadedReports.tsx"), /TableWrap/);
  const watch = read("verticals/finance/pages/Watch.tsx");
  assert.match(watch, /<ObjectCard/);
  assert.match(watch, /TableWrap/);
  assert.match(watch, /StatusDot/);
  assert.match(watch, /className="row-actions"/);
  assert.match(watch, /useConfirm/);
  assert.match(watch, /移出关注/);
  assert.match(watch, /Promise\.all\(\[removeWatch\(row\.symbol\), removeFromRoster\(row\.symbol\)\]\)/);
  assert.match(watch, /Promise\.all\(\[addWatch\(symbol\), addToRoster\(symbol\)\]\)|await addWatch\(code\)[\s\S]*await addToRoster\(code\)/);
  assert.doesNotMatch(watch, /useAiPage\(\{[^}]*key: "watchlist"/);
  assert.match(read("verticals/finance/assistant/snapshot.ts"), /已渲染 Wiki/);
  assert.match(read("verticals/finance/pages/IndustryCenter.tsx"), /buildWikiPageSnapshot/);
  const stock = read("verticals/finance/pages/CompanyWiki.tsx");
  assert.match(stock, /buildDirectorySnapshot/);
  assert.doesNotMatch(stock, /DashboardPanel|DashboardCard|view=report|WikiReader|资料待补充|图文报告/);
  assert.match(watch, /\/sectors\/profiles\//);
  assert.doesNotMatch(watch, /to=\{`\/sectors\/\$\{/);
  assert.match(read("verticals/finance/components/layout/Layout.tsx"), /TaskNotices/);
  // 页面和公共组件不再使用玻璃卡类、光晕、私有阴影。
  const dir = new URL("../src/verticals/finance/", import.meta.url);
  for (const folder of ["pages", "components"]) {
    for (const file of readdirSync(new URL(`${folder}/`, dir), { recursive: true }) as string[]) {
      if (!/\.tsx$/.test(file)) continue;
      const source = readFileSync(new URL(`${folder}/${file}`, dir), "utf8");
      assert.doesNotMatch(source, /className="[^"]*\bglass\b|glass-glow|shadow-glow|text-glow|workspace-kicker/, `${folder}/${file}`);
    }
  }
});

test("洞悉类型切换与动态页共用分段切换", () => {
  const tabs = read("verticals/finance/components/ui/WorkspaceTabs.tsx");
  const mine = read("verticals/finance/pages/MyResearch.tsx");
  const intel = read("verticals/finance/pages/Intel.tsx");
  assert.match(tabs, /className="segmented"/);
  assert.match(read("verticals/finance/components/ui/ui.css"), /\.segmented > button\[aria-selected="true"\][^}]*background: var\(--fill-2\)/);
  assert.match(mine, /WorkspaceTabs/);
  assert.match(mine, /aria-label="研究类型"/);
  assert.match(mine, /<PageHeader title="洞悉" \/>/);
  assert.match(mine, /label: "议题"/);
  assert.match(mine, /label: "记录"/);
  assert.match(mine, /label: "任务"/);
  assert.match(mine, /label: "记忆"/);
  assert.match(mine, /aria-label="议题状态"/);
  // 议题沿用任务列表的行样式（状态点 + 标签）；任务、议题、记录共用每页 10 条的分页条（2026-09-26）。
  assert.match(mine, /className="rl-task rl-topic-row"/);
  assert.match(mine, /const LIST_PAGE_SIZE = 10;/);
  assert.equal((mine.match(/<ListPager /g) || []).length, 3);
  assert.match(mine, /<StatusDot tone=\{taskTone\(status\)\}/);
  assert.doesNotMatch(mine, /border-b border-border\/30 py-3 last:border-0/);
  assert.doesNotMatch(mine, /DashboardPanel/);
  assert.doesNotMatch(mine, /justify-between gap-3">\s*<WorkspaceTabs/);
  assert.match(intel, /WorkspaceTabs/);
  assert.match(intel, /aria-label="资讯栏目"/);
  assert.doesNotMatch(intel, /NAV_GROUPS/);
  assert.doesNotMatch(intel, /investment-news<\/span>|集成/);
});
