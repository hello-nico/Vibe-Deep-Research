# 契约：产品界面与 DSH UI 插件

页面读取共用 `lib/readRequest.ts`：只有同对象版本、URL、参数和身份请求头的在途 GET 合并，订阅者取消互不影响；网络错误、408、429 与临时 5xx 自动重试一次，明确不可重试的 503、其他 4xx 与写入不重放。完成后的研究响应不缓存。公司研究、关注列表、写回记录各有版本，写入完成（含执行结果不确定）推进对应版本；迟到响应或错误若版本已变，丢弃并经同一入口重读，不交付旧值。

三条客户端入口（research、api、localService）只调用共用 HTTP 读取，响应延后解析也会检查版本并刷新 payload/status。公司研究和写回记录的组合读取用同一 `readObject` 守卫覆盖后续任务/名称补读；Store 的在途合并交给共用层 `shareObjectRead`，不跨版本复用 promise。版本只由共用读取层维护，页面不另建版本。动态对账和结果的部分失败上送统一重试提示，成功卡片保留；读取失败不显示“没有动态”。

动态的公告、对账、写回记录和价格分别加载，到达即显示；跟踪变量仅供价格与估值跳档卡使用。对账直接读取关注列表与 Backend，当前证券简称并行补读，不等待跟踪变量或取名；任一类别失败不隐藏其余卡片，全部类别完成后才显示空态。

页面读取再次失败统一显示「暂时读取不到 · 重试」，文字按钮重新读取。个股页仅立即读取本公司简称；公司切换器获得焦点后才补读其他关注公司名称。个股详情页导航圆点只读已有本机结果，不发起全关注行情与跟踪读取；动态页保持原有本机圆点行为。

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
- `finance-ui` 启动等 Loader 就绪后，通过 Host settings 服务在用户文档缺少 `ui-chat.transcriptView` 时写入 `compact`，带读取时的 revision 防止覆盖并发选择；已有用户值保持。思考收起与手动展开由 DSH 原生 Compact 渲染负责。

## 外壳与路由的现行实现

- 外壳（`components/layout/Layout.tsx`）：外框上的图标栏（`workspace-rail`）与近白大圆角内容面（`#workspace-main`，`workspace-surface`）；没有顶栏、面包屑与页面小标题。窄屏图标栏落到底部。
- 六个入口：对话 `/`、动态 `/feed`、洞悉 `/insights`、关注 `/watch`（个股页 `/watch/:symbol`）、资料 `/my-reports`、设置 `/settings`。动态现阶段承载关注公司公告与新闻；洞悉承载原我的研究。由 T8b 替换。
- 旧地址由 `lib/routes.ts` 的 `legacyRedirect` 对照跳转：`/watchlist`、`/research` → `/watch`；`/research?company=<slug>` → `/watch/<symbol>`；`/daily-review` → `/feed?tab=market`；`/intel`、`/intel/:tab` → `/feed?tab=intel`（带小栏目时 `&sub=`）；`/my-research` → `/insights`；`/my-research/topics/:hex` → `/insights/topics/:hex`。`/evidence` 深链不变。
- 行业、产业研究与信号页面已删除；`/sectors`、`/sectors/profiles`、`/signals` 及其全部子路径统一跳到 `/watch`，不携带旧页面查询参数。行业与产业对象链接也回关注；现有知识与资料读取保留。
- 关注把自选与研究名单合成一张表（可切卡片）：添加同时写入两处，移出关注两处同时移除且只动 Client 选择；研究只在用户点击「研究 / 重新研究」时开始，打开页面只读取。
- 新资料只读公司研究回读的 `new_material`，`lib/reportArrival.ts` 仅投影短名、日期与提醒身份，不自行比较报告期。关注研究列、页首与动态卡写同一资料名加「已出」与「重新研究」；缺研究写「未研究」加「研究」。objectStatus 与 pendingResearch 同读此字段，refresh candidate 不再产生新资料提示。无对账数字也能提醒；财报与对应对账卡合并，公告按 Backend 身份显示独立提醒。小点覆盖未看新资料和判断变化，已看只存 Client 偏好；中断任务继续沿 DSH 原路径。
- 个股页（T7.2）：数据层只读 Backend 当日数据包（`/wiki/companies/{代码}/data-packet`），先显示已有数据，缺当日快照时后台 ensure（每股每日一次），完成后静默刷新。
  字段按已核对、来源、冲突（两值并列）、缺口显示，按稳定 `field_id` 查找（主字段、`driver:`、`lens:`）。研究层读 `page-research`：六节、支柱与证伪条件（阈值 level / yoy_pct）、五档结论；三档目标价由 `scenarioRef` 读回 `calculate_metrics` 凭据（`payload.calculation.extra`，每股或总利润模式）。新资料显示 Backend 返回的短名；第三方研报标题去掉末尾评级字样。
- 「问助手」按钮由 `AssistantSlot` 落在页首（或对象页工具栏）右侧；没有占位的页面回落到内容面右上角。
- 公共组件在 `components/ui/`：`Card`（`GroupCard`、`Panel`、`Metric`、`StatusPill`、`Tag`、`Sparkline`、`TableWrap`）、`ObjectCard`、`StatusDot`；令牌与按钮、输入类样式在 `src/index.css`，公共组件样式在 `components/ui/ui.css`。无调用的 `Button.tsx` 已删除，按钮仍遵循视觉协议；资料页在用的 `IndustryDashboardCard` 保留。

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

跟踪观察只读 Backend 用户清单：用户点「开始观察」后，先保存 Topic 内容，再调用 `POST /tracking/items` 登记 `kind: observation, source: user, topic_id, tracking_key`；已有同一草稿仍登记用户选择，登记失败不显示成功，可重试。GET 不导入旧议题项，不迁移存量来源；同一研究标题下分组显示各条。公司名由 Backend 行情缓存提供当前证券简称，前端不裁剪、不回研究标题。价格明细按影响绝对值排序、前三家及「另外 N 家」，统一的敏感度整档只做显示换算。

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
- 周期报告通知由 `plugin:stock-research/periodic-report` 唯一显示公司与报告中文名；对应模型上下文消息由产品投影排除原生执行请求标题。晚到通知不触发模型续轮，失败原文在详情中展开。

## 6. 验收层级

- 扩展位挂载与卸载：`integration-probe`。
- 面板、对象页、明暗主题与宽窄屏：`ui-journey-smoke` 加用户视觉 `manual-acceptance`。

## 7. 来源

M6 §3–§6（已删去退役的六阶段编排器、`/finance-stage-model`、旧 `vr-theme` 兼容）、T3-b、T3-c、Human Checklist「产品核心协议」中的选项组件条款、M9.2 生命周期修复记录。
