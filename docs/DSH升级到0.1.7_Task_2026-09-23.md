# DSH 升级到 0.1.7

状态：2026-09-23 用户确认升级 DSH 以获取对研究工作台有利的新特性；本 Task 由 Claude Code 规划，Codex / Cursor 按本文实施并回填 §9。**先做 S1 只读盘点并停下待审**，审过再做 S2 起的改动。不提交、不 push。

权威：[Human Checklist](../human-checklist.md)「DSH 升级（2026-09-23）」；[todo §7](../todo.md)；产品运行时与补丁归属见 [runtime README](../desktop/dsh/runtime/README.md)；前序发现见[深度对话提示词与文案收敛 Task §9.2](深度对话提示词与文案收敛_Task_2026-09-23.md)。

## 1. 背景与收益

- 产品固定 `@deepseek-ai/dsh-*` **0.1.2-rc.1**，带 13 个 patch-package 补丁（`desktop/dsh/runtime/patches/`，归属与移除条件见 runtime README 表）。Stock 研究插件 `Stock-Research/dsh` 依赖 `@deepseek-ai/dsh-tools 0.1.2-rc.1`、`@deepseek-ai/cordis 4.0.2`。
- npm dist-tags（2026-09-23）：latest `0.1.5-rc.2`、next `0.1.5-rc.3`、alpha `0.1.7-alpha.2`。本地上游源码 `/Users/apple/ts/src/deepseek-harness` 为 0.1.7-alpha.2（HEAD `00102833df`，2026-09-22）。
- 想要的新特性（均在上游源码核实过）：
  1. **整轮过程折叠**：完成后只露最终回答，过程收进“用时 X”（`packages/client/ui-chat/src/client/chat/TurnProcessNodeView.tsx`；“用时 X”文案自 0.1.7-alpha.1）。
  2. **过程分组与类别摘要**：“已读取文件、运行了命令”这类组标题，Compact / Detailed / Expanded 三种显示模式（`ui-chat/src/client/conversation-nodes/README.md`，自 0.1.7-alpha.1）。分类按工具名写死，金融工具会归“已调用工具”——接受，不打补丁改。
  3. **会话保留接口** `sessions.retain(address, { source, signal })`：可替代 `dsh-api-session-controller` 补丁中的 `retainSubagent` 部分（runtime README 已标注候选）。
  4. 工具行按工具名注册自有视图 `tool.call.toolview`（rc.1 已有，新版 owner props 增加 `loadImage`）——见 §3 E。

## 2. 冻结决定

- 目标版本 **0.1.7-alpha.2**，Vibe runtime 与 Stock 研究插件同步升级、精确锁版本（不用 `^`）。只有 0.1.7 提供特性 1、2；若 S1 发现阻断，按 §8 停止，由用户裁决是否退到 0.1.5-rc.3（放弃特性 1、2）。
- 13 个补丁逐项按 runtime README 的“移除条件”判断：上游已等价 → 删除；仍需要 → 重做到新版；不能为了安装成功删除失败的补丁（README 既有规则）。
- 保留产品现有能力与边界：金融布局与导航、五页问助手 Ask / Agent、模型设置入口、研究插件工具与权限、`cordis.patch.yml` 对 bash / PowerShell / 文件工具的关闭、`surfaceContext: false`。不引入桌面壳、终端或多面板。
- 历史会话（`.local/dsh/sessions`，约 20MB，3 个工作区目录）升级后必须仍可打开、续聊；不迁移、不删除会话数据。
- 默认显示模式用 Compact（上游默认）；运行中文案沿用产品“研究中…”（`dsh-client-ui-chat` 文案补丁需覆盖新增的 `message.turnProcess.deepDivingFor` 等键）。

## 3. 步骤

### S1 只读盘点（完成后停下，回填 §9.1 待审）

1. **补丁处置表**：对 13 个补丁逐一列出：补丁内容要点、0.1.7-alpha.2 上游对应代码位置、结论（删除 / 重做 / 改用上游配置点）、依据。重点：`dsh-api-session-controller`（retain 替代）、`dsh-session`（ignorable marker）、`dsh-client-ui-chat`（错误语义 + 文案，含新键）、`dsh-client-ui-conversation`（占位与 hero 文案）、`cordis-plugin-loader` / `dsh-client-modules`（`link:` 插件裸名解析）。
2. **产品插件接口面**：列出 `desktop/dsh/finance-ui/*`、`desktop/src/verticals/finance/dsh/*`、`desktop/src/verticals/finance/assistant/*` 使用的 DSH 客户端接口（`inject` 列表、slot 名与 key、`inputTriggers`、`chatFileMentions`、`uiConversation.events`、`reflect.provide`、`client.sessions.*`、`workspaces.*` 等），逐项标注 0.1.7 中是否存在、签名是否变化。
3. **研究插件接口面**：`Stock-Research/dsh/src/*` 使用的 `ctx.tools` / `systemPrompt.section` / `system-prompt/assemble` / `agents` / `subagents` / `userQuestions` / `session.append`（含 `ignorable`）等，逐项标注变化。
4. **会话持久格式**：`dsh-session` / `dsh-session-persistence-jsonl` 0.1.2 → 0.1.7 的格式与读取兼容性；旧 jsonl 能否直接读。
5. **依赖闭包**：两仓需要改的包清单与版本；cordis 版本要求。
6. **只读对话视图**：0.1.7 是否能用原生对话渲染一个子 Agent / 后台会话且不带输入框（会话引用、子 Agent 侧栏、`sessions.retain`、共享 `conversation.content` 等），可否替代产品自绘的任务过程面板（`components/TaskProcessPanel.tsx`、`TaskTranscript.tsx`、`lib/taskTrajectory.ts`）与 `retainSubagent` 补丁。结论供[产品对象模型 v1](产品对象模型与交互_v1_2026-09-23.md) T3 使用。
7. 结论：可升 / 需裁决项 / 阻断项。**停止，等待审阅。**

### S2 隔离升级

- 另开 `DSH_HOME` 副本（复制 `.local/dsh`，不动原目录）与独立端口启动，不影响现用工作台。
- 按处置表升级两仓依赖与 lockfile，重做保留补丁（`patch-package` 生成，`--error-on-fail` 通过），构建 Stock 插件 `dist` 与产品 UI。

### S3 适配

- 按 S1 第 2、3 项修改产品与研究插件代码；只改受 API 变化影响的地方，不顺带重构。
- 过程折叠 / 分组：确认产品布局下正常显示（`#dsh-conversation` 内），研究结果节点（`finance-result`、`finance-maintenance`、`finance-research-status`、`finance-topic-candidate`）与引用折叠（`ConversationCitations`）在折叠内外都正确渲染；最终回答中的引用与图表保持可点击。

### S4 切换

- 隔离验证通过后，在现用环境升级（先备份 `.local/dsh`），重启工作台。

### E 工具行中文名（S4 之后）

- 按 `tool.call.toolview` keyed slot 为高频研究工具注册产品自有行视图（样板：上游 `packages/client/ui-skill/src/client/SkillRow.tsx`，交互与样式对齐通用 ToolRow：图标、标题、摘要、展开看输出、Inspect）。标题与摘要复用 `desktop/src/verticals/finance/lib/taskTrajectory.ts` 的 `TOOL_LABELS` / `toolStepTitle`，全产品一份映射。
- 摘要不显示内部 ID（`result:…`、`document:…`、hash）；展开区仍保留原始参数与输出供排查。

## 4. 写范围

Vibe：`desktop/dsh/runtime/{package.json,package-lock.json,patches/,README.md}`、`desktop/dsh/finance-ui/*`、`desktop/src/verticals/finance/dsh/*`、`desktop/src/verticals/finance/assistant/*`、受影响测试、E 批新增的工具行组件。Stock：`dsh/package.json` 与 lockfile、`dsh/src/*` 受 API 影响处、`dsh/dist`、测试。

## 5. 验收

- 自动：Vibe `cd desktop && npm run typecheck && node --test test/*.test.ts`；Stock `cd dsh && pnpm run test`（含构建）；`cd desktop/dsh/runtime && npm ci` 补丁全部应用成功；两仓 `git diff --check`。
- 真实运行（隔离环境与切换后各一轮，截图存放位置写入 §9）：
  1. 深度对话：新问题 → 工具调用 → 最终回答；完成后过程折叠为“用时 X”，展开见分组与单个工具；引用与图表可点；停止与失败时过程保持展开。
  2. 历史会话：三个工作区目录中各打开一条旧会话并续聊一轮。
  3. 报告子任务：生成、过程查看、历史重开、中止、成果读回（todo §7 要求的真实子 Agent 路径）。
  4. 议题研究会话、公司研究首问、@ 三类引用、我的资料读取。
  5. 五页问助手 Ask / Agent 各一次；Agent 维护提案的原生选项确认可用。
  6. 模型设置：切换模型、连通性测试（补丁功能仍在）。
  7. 错误语义：额度 / 认证 / 服务商拒绝仍区分显示。
  8. E 批：主对话工具行显示中文标题与业务摘要，无内部 ID。
- 回滚可用：保留升级前 `package-lock.json`、补丁目录与 `.local/dsh` 备份，`git checkout` + `npm ci` 可恢复 0.1.2-rc.1。

## 6. 安全与回滚

- 升级前备份 `.local/dsh`（会话、设置、profiles）；不读取、不打印凭据与模型密钥。
- 回滚：还原两仓依赖与补丁改动、`npm ci`、恢复 `.local/dsh` 备份、重建 Stock 插件 `dist`、重启工作台。

## 7. Out of Scope

- 桌面壳、Electron、通用终端、复杂多面板；0.1.7 以外的新功能大面积接入。
- 修改上游过程分组的类别规则（金融工具归“已调用工具”暂时接受；如需细分另向上游提需求）。
- gbrain / Backend 改动（见 [Wiki 写入提速 Task](Wiki写入提速与读写不互斥_Task_2026-09-23.md)）；研究纪律与提示词内容调整。
- 会话数据迁移或清理。

## 8. Stop Conditions

- S1 结束：无论结论，停下待审。
- 旧会话无法读取，或需要改写会话文件才能读：停止，回填差异，不做数据迁移。
- 某补丁在新版既无等价实现又无法重做：停止该项，列出影响范围交裁决，不删除了事。
- 产品依赖的 slot / 注入接口在 0.1.7 被移除且无替代：停止，记录替代候选。
- 同一问题连续两次修补仍失败：保存现场（版本、日志、截图），停止并回填。

## 9. 执行回填

### 9.1 S1 盘点（2026-09-23，只读完成，待审）

范围：仅比较现装 rc.1 补丁、产品与研究插件源码、本地上游 `deepseek-harness@00102833df`（0.1.7-alpha.2）及既有会话的结构字段；未安装新版、启动隔离运行时、迁移会话或读取凭据。下文 `U/` 指 `/Users/apple/ts/src/deepseek-harness/`，`S/` 指 `/Users/apple/ts/src/Stock-Research/`。处置是 S2 方案，不等于实测可删除。

**补丁处置表（13/13；补丁原件均在 `desktop/dsh/runtime/patches/`）：**

| 补丁包 | rc.1 补丁内容 | 0.1.7-alpha.2 对应位置与依据 | 处置 |
| --- | --- | --- | --- |
| `cordis-plugin-loader` | 裸名 import 失败后按安装目录 `createRequire` 重解析 | `U/vendor/loader/src/config/tree.ts:112-128` 仍直接 `internal.import` / `import(name)`；`U/packages/boot/app-boot/src/profile-resolution/resolver.ts` 新增 profile 解析，但不是同一失败回落 | **重做候选**；`link:` 裸名插件须先在 S2 实测，不能因 profile resolver 存在就删除 |
| `dsh-client-modules` | `expectedPackageName/package.json` 解析回落 | `U/packages/client/modules/src/index.ts:874-905` 仅在没有 Node internals 时回落；internals 的 `resolveSync` 抛错仍直接返回 | **重做候选**；需实测产品 link 包元数据，不可判为等价 |
| `dsh-api-session-controller` | `retainSubagent`、`retain` 契约、子会话无 cwd 豁免、创建事件去掉非 JSON 投影 | `U/packages/api/session-controller/src/client/contract/sessions.ts:24-72` 已有 `retain(target,{source,signal})`；`src/history.ts:254` 仍对所有会话要求 cwd；`src/index.ts:168-175` 仍发送含 projection 的 summary | **拆分**：引用计数改用上游 `retain/release`；cwd 豁免与创建事件 JSON 安全按原失败条件重做并验证；`create→scope` 调用也须适配 |
| `dsh-session` | `append(...,{ignorable:true})` 写入并持久保留 marker | `U/packages/core/session/src/index.ts:720-747` 第三参数只接 surface metadata，构造事件无 `ignorable`；`src/types.ts:493-511` 仅事件类型声明允许 marker | **重做**；现有研究插件第三参数在 JS 中会被忽略，未来事件会变成未知 required |
| `dsh-client-ui-settings-models` | Provider/模型管理、搜索、图片输入、推理级别与连通测试 UI | `U/packages/client/ui-settings-models/src/client/{ModelsSection,CustomProviderCard,ModelListEditor,ModelInputTypes}.tsx` 已有自定义 Provider、模型增删/发现/搜索、输入类型；未见同等推理级别编辑与原补丁整套布局 | **部分删除、部分重做**；逐项保留缺口，S2 核对连接测试与设置入口实效 |
| `dsh-client-ui-model-selection` | 模型列表搜索、焦点/键盘选择 | `U/packages/client/ui-model-selection/src/client/ModelSelect.tsx` 有分层模型/effort 选择，无搜索框/查询状态 | **重做搜索与键盘差异**，沿上游现有选择器 |
| `dsh-client-ui-conversation` | 输入占位、hero 标题与 preview 文案 | `U/packages/client/ui-conversation/src/client/locales.ts:15-20,73-75` 仍是通用文案；`client/apply.ts:149-158` 注册固定 namespace，`client/locale/src/client/index.ts:399-425` 禁止重复注册，Config 无文案字段 | **重做文案**；目前没有可直接替换的上游配置点 |
| `dsh-client-ui-chat` | AUTH/QUOTA/FORBIDDEN 显示；运行中“研究中…” | `U/packages/client/ui-chat/src/client/chat/MessageItem.tsx:50-55` 仍只识别 AUTH；`client/locale.ts:48,68,132` 新增 `message.turnProcess.deepDivingFor`，仍用“深度求索中” | **重做**错误语义和中英文文案；覆盖新键及运行/完成两态 |
| `dsh-client-ui-trajectory` | 轨迹错误的 QUOTA/FORBIDDEN 文案 | `U/packages/client/ui-trajectory/src/client/TrajectoryTable.tsx:743-749` 仍只特殊处理 AUTH | **重做** |
| `dsh-client-ui-deliverables` | 本地路径引用与空产物 mention | 产品 `desktop/dsh/finance-ui/cordis.patch.yml` 禁用该插件，并在 `desktop/src/verticals/finance/dsh/client.tsx:149` 自供 `chatFileMentions`；上游 `U/packages/client/ui-deliverables/src/client/index.ts:104-112` 仍未等价 | **从本产品闭包删除补丁**；依据是插件未装配、产品有单独引用 owner，S2 须验最终回答引用 |
| `dsh-llm-pi-ai` | 403 服务商拒绝与 401 认证分流 | `U/packages/llm/llm-pi-ai/src/stream.ts:43-46` 仍把 401/403 都判 AUTH | **重做** |
| `dsh-llm-deepseek` | 默认 Flash/Pro 目录及 403/额度错误分流 | `U/packages/llm/llm-deepseek/src/models.ts:8-24` 已有 `deepseek-flash`/`deepseek-v4-pro`；`src/transport.ts:29-39` 仍将 403 判 AUTH | **删除目录改动、重做错误分类** |
| `dsh-web-frontend` | 打包后的 Markdown 链接允许 `stock-ref:` | `U/packages/client/ui-primitives/src/markdown/render.tsx:50-69` 只允许 http/https/mailto；产品 `desktop/src/verticals/finance/lib/citationMarks.ts:90` 仍生成 `stock-ref://` | **重做引用协议处理**，在源码 owner 而非旧压缩包；此第 13 项漏列于 runtime README 的补丁表 |

**产品接口核对。** `desktop/dsh/finance-ui/server.mjs:7` 注入 `webServer,llm,agentDefaultModel,sessions,sessionPersistence,agents,subagents`；路由注册、模型选择/流、持久化 inspect、Agent 创建与子 Agent 启动在上游仍有同名服务（`U/packages/host/`、`packages/llm/`、`packages/api/session-controller/`），具体返回结构须 S2 编译/隔离运行核对。`cordis.patch.yml` 对 `system-prompt`、`web-runtime.surfaceContext` 及 bash/PowerShell/文件工具的禁用必须按实际 profile 检查，不以配置文本代替权限验证。

- `desktop/src/verticals/finance/dsh/client.tsx:112-173` 注入 `slots,connection,theme,sessions,workspaces,inputTriggers,uiConversation,conversation,modelDirectories`。上游保留 `inputTriggers.registerSource`（`U/packages/client/ui-input-trigger/src/client/service.ts:55`）、`chatFileMentions.forClosing`（`ui-chat/src/client/contract/slots.ts`）、`uiConversation.events.register`/`binding`（`ui-conversation/src/client/conversation/{event-registry,assembly}.ts`）、`reflect.provide('layout')`（`ui-layout/src/client/index.ts:160`）；产品自供 layout/mention 时需防止与上游插件重复注册。
- `client.tsx:185,583-748` 与 `result-node.tsx:22-29` 使用 `conversation.hero.brand.mark`、`conversation.view`、`conversation.session.header.utilities`、`conversation.input.left/dock`、`shell.overlay`、`conversation.chat.assistant-actions`、`sidebar.settings`，以及 keyed `conversation.chat.node` 的 `finance-research-status/maintenance/topic-candidate/result`；这些 seat 在 `U/packages/client/{ui-conversation,ui-chat,ui-layout,ui-sidebar}/src/client/contract/slots.ts` 仍存在。`root`、`sidebar` 是产品自注册 seat（`NativeDsh.tsx:31-32`），不是上游标准 UI 的替代承诺；owner props/key 匹配须 S2 typecheck 和浏览器验证。
- `client.tsx:225-568` 与 `assistant/apply.ts:84-155,249` 的 `sessions.refresh/list/create/scope/sessionOf`、`workspaces.create/list/archiveSession` 均仍存在（`U/packages/api/{session-controller,workspace-controller}/src/client`），但 **`sessions.open` 已移除，`list.current`/`subagentsByParent` 已移除**；使用 `retain(id,{source})`/`release()` 与 `subagentAddress(id)`/`refreshProjections(parentId)`。新版 `create()` 只给目录身份，未 retain 前 `scope`、`sessionOf` 为 `undefined`；至少 `client.tsx:410-412,513-514`、`assistant/apply.ts:135-137` 不能照旧立即发送。`SessionSummary.updatedAt` 变为 number；`prompt`/`rename` 返回 `RemoteResult`，要按新版结果处理（`U/packages/api/session-controller/src/client/contract/{sessions,session}.ts`）。

**研究插件接口核对。** `S/dsh/src/index.ts:7` 注入 `tools,systemPrompt,agents,llm,skills,subagents,userQuestions`。上游 `tools.register/guard/execute`（`U/packages/core/tools/src/index.ts:1062,1135,1368`）、`systemPrompt.section` 与 `system-prompt/assemble`（`core/system-prompt/src/index.ts:454`）、`agents.list/get`、`skills.register`、`subagents.start('spawn',request)`（`packages/subagent/subagent/src/index.ts:559`）、`userQuestions.ask({agent:exec.agent,signal,questions})`（`packages/interaction/user-questions/src/index.ts:86`）仍有对应入口；参数与子 Agent 生命周期需 S2 构建和实跑。**已确认不兼容**：`S/dsh/src/research-tools.mjs:207,224,226`、`page-maintenance.mjs:71-73` 的 `session.append` 第三参数在新版不写 marker；`native-research-tools.mjs:153` 与 `research-tools.mjs:234` 的 assemble hook 需核对 context/next 语义，不能仅凭事件名相同判兼容。

**持久格式与阻断。** 装机 rc.1 `dsh-session` 格式为 v0，新版 `U/packages/core/session/src/types.ts:89` 写 v4；`session-persistence-jsonl/README.md:82` 有 v0→v4 只读准备，读打开本身不改文件，写打开会发布新代文件。对 `.local/dsh/sessions` 仅作结构扫描：3 个工作区共 **259** 个 `session.jsonl.zstd`，均为 v0，解码失败 0；其中 **16 个会话**含 `stock-research/status`、`maintenance`、`topic-candidate` 或 `page-maintenance-assessment` 事件。`U/packages/session/session-format-v0-to-v1/src/validation.ts:113-123` 和 README:45 明确拒绝 v0 的未知插件事件，**即使有 `ignorable:true` 也拒绝**。因此至少这 16 个不能直接经新版历史读取；其他 243 个未逐条用新版迁移器验证，不声称可续聊。这触发 §8 停止条件，不能在原数据上试写或跳过它们。

**依赖闭包。** Vibe `desktop/dsh/runtime/package.json` 四个直接 DSH 包（`dsh,dsh-base,dsh-web-app,dsh-llm-pi-ai`）及 228 项 overrides、`package-lock.json`、13 个补丁必须一起按目标精确版本重算；现有 overrides 含上游已撤的 `dsh-agent-presets,dsh-code-runtime,dsh-code-runtime-worker-thread,dsh-settings-file,dsh-workflow-worker-thread`，新版还有 `dsh-agent-preset(-registry)`、格式迁移/会话投影包等新增闭包，不能机械替换字符串。Stock `S/dsh/package.json` 的 peer/dev `dsh-tools` 与 `cordis` 同步；本地上游 `U/vendor/{cordis,loader}/package.json` 分别是 **4.0.4 / 1.0.5**，现装为 4.0.2 / 1.0.3。Stock 插件的安装闭包与 lockfile 所属位置需 S2 定位并精确锁定，避免第二份运行时。

**只读对话视图（供产品对象模型 T3）。** 上游 `ui-subagent/src/client/sidebar-chat/index.tsx:109-151` 已示范 `sessions.retain(address,{source,signal})` → `SessionProvider` → `conversation.content` 的 embedded 对话，可复用正式会话、历史及结束后内容并替代 `retainSubagent` 引用管理。`ui-conversation/src/client/skeleton/ConversationContent.tsx:140-187` 的 embedded **仍渲染 composer seat**；`ui-subagent/src/client/SubagentReadOnlyComposer.tsx` 只是说明型只读替换，并非“完全无输入区”配置。T3 可复用上游对话 body，但需产品注册无输入 composer 替换，核对只读权限、释放、中止、历史重开与过程展示后，才能替换 `TaskProcessPanel/TaskTranscript/taskTrajectory` 的展示部分；现阶段不能删除这些组件。

**S1 结论：当前不可直接升级。** 明确阻断为 v0 研究事件冷读失败及新版 append 丢 marker；接口改造和 `link:` 解析是待验证风险。按 §8 停在此处待审。用户需裁决的是历史事件兼容方案及若 0.1.7 无法在不改写旧会话前提下满足验收时，是否改目标版本/范围；本盘点不替用户选择，也不启动 S2。

### 9.2 S2–S4 升级与切换（待执行）

### 9.3 E 工具行中文名（待执行）
