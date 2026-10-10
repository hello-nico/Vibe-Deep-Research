# 契约：产品界面与 DSH UI 插件

状态：反映 2026-10 的当前实现；产品即将重构，重构时整体改写，不作为重构的约束。（2026-10-04 从 M6 §3–§6 提取并按当前代码与产品对象模型 v1 更新）。
上位：[系统职责与数据归属](system-ownership.md)。视觉规格见[视觉设计协议](../design.md)。界面设计方向的权威是 decisions「产品对象模型与交互 v1」，本契约只写边界。

## 1. 代码边界

| 位置 | 职责 |
|---|---|
| `desktop/src/verticals/finance/` | 产品页面、对象呈现、问助手（`assistant/`）、成果组件 |
| `desktop/dsh/finance-ui/` | DSH UI 插件：组合配置（`cordis.patch.yml`）、产品 HTTP 适配（`server.mjs`、`research.mjs`、`model.mjs`、`maintenance.mjs`）、宿主状态（`host-state.mjs`） |
| `desktop/dsh/runtime/` | DSH 运行时安装与补丁，见其 README |

## 2. 用 DSH 扩展点，不改 DSH

- 只通过 DSH 公开扩展位扩展：`conversation.view` / `input.dock` / `input.left` / `chat.node` / `chat.turnTail` / `chat.assistant-actions` / `shell.overlay` 等。注意各扩展位的占用规则（例如 `turnTail` 首个接受者获胜，`chat.node` 同 key 会替换原生渲染器）。
- 不改 `node_modules`，不直接改 DSH bundle。确需上游行为，走 `desktop/dsh/runtime/` 的补丁流程并登记移除条件。
- 对话统一用 DSH 原生渲染：右侧面板（`finance-side-panel`）嵌入原生对话，交互与只读两种模式；嵌入不调用 `uiWorkspace.openSession`，不切换主区前台会话。
- 用户确认用 DSH 原生选项组件（`ask_user_question`），不自建聊天确认组件。

## 外壳与路由的现行实现

- 外壳（`components/layout/Layout.tsx`）：外框上的图标栏（`workspace-rail`）与近白大圆角内容面（`#workspace-main`，`workspace-surface`）；没有顶栏、面包屑与页面小标题。窄屏图标栏落到底部。
- 六个入口：对话 `/`、动态 `/feed`、洞悉 `/insights`、关注 `/watch`（个股页 `/watch/:symbol`）、资料 `/my-reports`、设置 `/settings`。动态与洞悉是过渡页，分别承载原资讯雷达与大盘行情、原我的研究，由 T8b 替换。
- 旧地址由 `lib/routes.ts` 的 `legacyRedirect` 对照跳转：`/watchlist`、`/research` → `/watch`；`/research?company=<slug>` → `/watch/<symbol>`；`/daily-review` → `/feed?tab=market`；`/intel`、`/intel/:tab` → `/feed?tab=intel`（带小栏目时 `&sub=`）；`/my-research` → `/insights`；`/my-research/topics/:hex` → `/insights/topics/:hex`。`/evidence` 深链不变。`/sectors`、`/sectors/profiles`、`/signals` 已从导航撤下，路由保留。
- 关注把自选与研究名单合成一张表（可切卡片）：添加同时写入两处，移出关注两处同时移除且只动 Client 选择；打开个股页才触发研究。
- 「问助手」按钮由 `AssistantSlot` 落在页首（或对象页工具栏）右侧；没有占位的页面回落到内容面右上角。
- 公共组件在 `components/ui/`：`Button`、`Card`（`GroupCard`、`Panel`、`Metric`、`StatusPill`、`Tag`、`Sparkline`、`TableWrap`）、`ObjectCard`、`StatusDot`；令牌与按钮、输入类样式在 `src/index.css`，公共组件样式在 `components/ui/ui.css`。

## 3. 三条模型执行路径

| 入口 | 调用链 | 规则 |
|---|---|---|
| 深度对话、我的研究、问助手 Agent 模式 | 产品 → DSH Agent → Stock 插件 → Backend | 产品只发意图与对象；工具和维护逻辑留在 Stock 插件 |
| 问助手 Ask 模式 | 产品 → DSH 会话 → 只读 `read_page_context` | 只读发送时由宿主暂存的页面快照与 @ 读取结果，不写入，见 [问助手](page-assistant.md) |
| 页面模型（翻译、提炼等） | `/finance-model` → `ctx.llm.stream` | 无 Agent、无工具；不能借此路径获得研究写权限 |

现行 Ask / Agent 都由 DSH 执行，用户消息只保留原话与 @ 引用，页面快照不塞进气泡；页面角色、模式及绑定目标限制由 Stock 插件执行。未定义角色或模式不回退为另一条模型路径。

## 会话面板的现行接线

- `dsh/panel-conversation.tsx` 通过会话引用挂载原生 `conversation.content`：问助手与议题可输入，任务过程只读，不自绘消息或切换前台会话。
- `SessionReference` 在挂载时保留、关闭或切换时释放；关闭面板不取消后台任务。过程丢失与读取失败分别提示；只读过程不显示输入和聊天操作。
- 同时只显示一个面板，宽度由 `SidePanelResize.tsx` 管理。当前 `research-surfaces.css` 在宽度 ≥1100px 时给主区留出面板空间，窄屏覆盖；这是源码现状，不把旧 Checklist 的 900px 目标当成已实现。
- 面板重新设计归 T8，重构时改写本段；这里承接现有实现，不保留旧 DSH 右栏多标签、停靠或全屏方案。

## 4. 样式责任

| 层 | 唯一责任 |
|---|---|
| 主题状态 | DSH theme 服务；产品派生 class 与 token |
| 产品视觉 token | 颜色语义、字级、间距、圆角、图表色 |
| 外壳布局 | 宽度、高度、滚动与展开；页面不能用全局样式改变原生会话几何 |
| DSH 适配样式 | 只保留 token 映射与必要的结构适配，每项注明依赖的原生结构 |
| 页面局部样式 | 只影响本页，禁止扩散到 body、所有 dialog 或所有 button |

## 5. 生命周期

- 每个 `webServer.register` 等注册都要交给 `track()`，卸载时释放（M9.2 曾修复 11 处丢弃 disposer）。
- 收尾覆盖成功、失败、停止、新输入与晚到结果，按 generation 或 agent 身份隔离。

## 6. 验收层级

- 扩展位挂载与卸载：`integration-probe`。
- 面板、对象页、明暗主题与宽窄屏：`ui-journey-smoke` 加用户视觉 `manual-acceptance`。

## 7. 来源

M6 §3–§6（已删去退役的六阶段编排器、`/finance-stage-model`、旧 `vr-theme` 兼容）、T3-b、T3-c、Human Checklist「产品核心协议」中的选项组件条款、M9.2 生命周期修复记录。
