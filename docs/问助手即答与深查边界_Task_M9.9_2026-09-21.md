# M9.9：问助手 Ask 即答与 Agent 深查边界

状态：2026-09-21 用户验收通过。§7c 与 §7d 主行为已闭合；跨包问题保留归属，随各自 Task 提交。权威：[Human Checklist](../human-checklist.md)「问助手 Ask 即答与 Agent 深查」。替代 [M9.8](问助手双模式与Agent面板_Task_M9.8_2026-09-20.md) §2 不注入快照、§3 Ask 只读工具集与大盘"行情观察/确定性计算"、§6 模型自行读正文；对象登记、五角色绑定、会话生命周期、Wiki 闭环仍按 M9.8。本轮只提交 M9.9 归属文件，不 push、不重启现用服务。

## 1. 问题与依据

大盘 Ask `@ 上证指数` 问当前行情时，页面已有点位/涨跌/家数/情绪，模型未收到这些数，转而二十余次取数与计算（约 67 秒）。根因是 M9.8 口径：快照不进发送文本、Ask 挂 19–22 个只读工具、`ASK_PROMPT` 要求 retrieve/calculate、研究纪律推动多窗口。用户能感知的差别是快慢与深浅，不是读/写。

## 2. 目标边界

- Ask = 即答：只用发送时固定上下文；不注册工具、不写入；不足则说明缺口并提示切 Agent。
- Agent = 深查：先用同一份上下文，只补本问缺口；不默认扩窗口、跨对象、外搜。允许写入 ≠ 每次写入。全面研究归「我的研究」与「深度对话」。
- 问助手独立于深度对话。Ask/Agent 只是问助手的模式。深度对话无 `mode`、不承担问助手角色。五角色工具与 prompt 独立定义：不 spread `DEEP_*`/`ASK_TOOLS`，不从 `research-discipline.md` 删段，不在研究纪律上叠模式段。未定义助手角色的页面不开问助手会话。

## 3. 固定上下文契约

发送时由宿主写入用户消息（`assistant/prompt.ts` `bindAssistantPrompt`），三段分开标注：

1. 页面快照：本页已加载并展示的数据，来源与取数时点从各块 `Envelope.primary_source`/`fetched_at` 透传（缺则"未标注"）；含业务日、刷新状态；不新增请求。未加载写"未加载"。是本轮输入，不进证据层、不生成成果、不被后轮新数据覆盖。
2. 引用读取：`@` 且有正式身份的对象，沿 `fetchCitedUrl` → Backend `/documents/fetch-url` 先例确定性读取，绑定 asOf / hash / 时点（M9.8 §6）。七类：`market:` / `company:`（用快照显示值）、Wiki `slug@input_hash`、`topic:`、`document:`、`url:`、`profile:`。失败/仅摘要/未解析分别表达。
3. 身份与问题：现有"本轮引用身份""当前页面""模式""用户问题"。

各页经共用 snapshot builder 提供；有上限，优先保留与 `@` 相关部分，截断处写明。

## 4. 角色、独立性与实现形态

Ask：五角色 `tools` 均为 `[]`。`ASK_WRITE_TOOLS` / Ask 跳过 review 可保留或删冗余。`ASK_PROMPT` 只依据上下文、区分事实/推断/待核验。`AGENT_PROMPT`：先上下文、只补缺口。大盘 Agent 工具以 §7 十八项为准，不含 `observe_market`/`calculate_*`/`generate_market_result`；`MARKET_PROMPT` 解释页面所示表现与口径。其余四角色 Agent 按 M9.8 §3 职责字面列出，曾因 spread 混入且与职责冲突的工具（如资讯的 `observe_market`）不得保留。占位改即答/深查各一句。`my_research` / `wiki_report` / `knowledge_settlement` 工具与 prompt 本包不改内容，只改登记方式。

回退页（本包只做不绑定，不新增角色）：我的资料、资料阅读不要问助手；我的研究、议题需要但单独设计，不在本 Task；Home、Signals 不绑定。

列表页仍绑定 Wiki 角色，便于 Ask 即答目录问题。选择：`boundTargetError` 在 `company_wiki`/`industry_wiki` 且 `target` 为空时拒绝全部维护写工具（含 `fetch_source_url persist=true`）；不把列表页改成非 Wiki 角色。`deep_research` 空目标不走此门。绑定目标向沉淀子代理延伸（`comparable_pages` 只读比较）。

实现形态（2026-09-21 用户认可，落实 §7b.7）：

- 不新建服务端插件。`stock-research-dsh` 仍是唯一工具提供方，`install*Tools` 不动，运行时按登记表 `allow`。
- Stock 消费者登记表，九条各一条 `{ tools, prompt, modes? }`：`deep_research`、`my_research`、`wiki_report`、`knowledge_settlement`、`market`、`intel`、`industry_profile`、`company_wiki`、`industry_wiki`。建议新文件 `dsh/src/consumers.mjs`（或等价），`toolsFor`/`pluginPrompt`/`createResearchHost` 只查表。
  - 无 `modes` 的四条：`tools` 字面全量（可拷贝现数组，禁止在助手条里 `...DEEP_*`）；无 `modes`；收到 `mode` **抛错**，不回退。`research-discipline.md` **只挂** `deep_research` / `my_research`。
  - 五助手：`modes: ['ask','agent']`；Ask `tools: []`；Agent `tools` 字面全量（market = §7；其余按上段）；`prompt` = 角色段 + 模式段，角色段禁止点名工具（删 PROFILE "Use read_industry_profile"、INTEL "fetch a cited URL"）；助手纪律用独立短文，删除 `loadPageAssistantDiscipline`。`loadResearchDiscipline` 恢复 `shared-research-principles` 标记校验。
  - `assistantFor`：plugin 不在五助手则 `undefined`，禁止填 `deep_research`。删 `createResearchHost` 的 `role === 'ask'|'agent' → deep_research`。`ASSISTANT_PLUGIN` 去掉 `deep_research`。
- Vibe 问助手拆到 `desktop/src/verticals/finance/assistant/`（不新包、不改 `build-ui.mjs` 入口）：自有 `apply.ts`（ensure/startAssistant、切模式、快照+引用绑定、seat）；`binding.ts`（`assistantBindingForPage`，未映射返回 `null`，Dock 不渲染入口）；迁入 prompt / sessions / snapshot。`dsh/client.tsx` 的 `apply` 末尾只调用 `applyAssistant(ctx)`，正文不再引用 `mode`、`startAssistant`、`assistantBindingForPage`。
- 再考虑拆服务端插件的条件（当前五角色均不满足）：消费者需要非 Backend 来源工具；独立于研究会话的持久化/生命周期；独立发版节奏。

## 5. 轨迹面板与计算器

`taskTrajectory.ts`：补计算器中文名；步骤标题拼入 `argsRaw` 关键参数。`calculation-protocol.mjs`：窗口至少两日；起止同日 DSH 层直接缺口。Backend `insufficient_window` 不改。

## 6. 写范围与顺序

Vibe：`assistant/` 新模块；`FinanceAiDock` 只消费模块；`host-state.mjs` 的 `ASSISTANT_PLUGIN`；五页 snapshot builder 与 `assistantPrompt` 读取绑定；`taskTrajectory.ts`；相关测试（原 grep `client.tsx` 的问助手断言改指向 `assistant/`）。
Stock：`consumers.mjs`（或 `native-research-tools.mjs` 内登记表）、`research-host.mjs`、`research-tools.mjs` `assistantFor`/`roleFor`、`prompt.ts`、`resources/` 助手短文、`document-tools.mjs`/`calculation-protocol.mjs`、`dsh/test/tool-scope.test.mjs`。
Backend 仅在缺只读接口时补最小接口，不新增持久化。

顺序：① 登记表 + 拒 mode + 纪律挂载 + 删回退与删段纪律 → ② 固定上下文 §7b.1–6 → ③ 拆 `assistant/` 模块 → ④ 测试与按文件归属的提交清单。

## 7. 实际注册结果（2026-09-21 探针，`consumers.mjs` `toolsFor`）

Ask 五角色均为 `[]`。无 `modes` 消费者带 `mode` 抛错。大盘 Agent 不含 `observe_market`/`calculate_*`/`generate_market_result`。`ASK_TOOLS` 已删除。

| 消费者 | prompt 常量 | Ask | Agent / 全量 |
|---|---|---|---|
| `market` | `MARKET_PROMPT` + `ASK_PROMPT`/`AGENT_PROMPT` | 0 | 18：`today` `resolve_refs` `source_list_documents` `source_get_index` `source_scan_sections` `source_read_blocks` `topic_list` `topic_get` `search_external` `query_observation` `read_research_method` `wiki_read` `wiki_list_pages` `wiki_search` `wiki_relations` `read_research_result` `fetch_source_url` `read_industry_profile` |
| `intel` | `INTEL_PROMPT` + 模式段 | 0 | 20（大盘 18 去 `read_industry_profile`，加 `observe_radar` `calculate_metrics` `source_ingest_periodic_report`） |
| `industry_profile` | `PROFILE_PROMPT` + 模式段 | 0 | 19 |
| `company_wiki` | `COMPANY_PROMPT` + 模式段 | 0 | 26 |
| `industry_wiki` | `INDUSTRY_PROMPT` + 模式段 | 0 | 23 |
| `deep_research` | `DEEP_PROMPT` | — | 27，无 mode |
| `my_research` | 纪律挂载，本包不改内容 | — | 36，无 mode |
| `wiki_report` | 本包不改内容 | — | 4，无 mode |
| `knowledge_settlement` | 本包不改内容 | — | 12，无 mode |

快照已接大盘/资讯/个股/行业/产业；引用读取含 `company:` 快照分支。

## 7b. 必修项（验收前置，全部在本 Task 闭合）

固定上下文：1. Topic 改绑 `markdown` 或 `user_claim`/`observation`/`judgment`，时点 `last_touched_at`。2. Wiki 快照纳入已渲染正文（限长）；Dock 不强制 chip。3. Wiki hash 用 `item.version || parsed.inputHash`；Profile 无 hash 即失败。4. 大盘快照按块标注真实来源，时点缺则"未标注"，删除"orchestrator"。5. `document:` 走 `researchRead`，409/缺 revision 显式失败。6. 引用读取超时与总量 cap；截断策略与文案一致。6b. 大盘页登记的 `company:` 对象（`dailyReviewQuoteObjects`：连板股、成交额榜每只股）在 `bindCitedObject` 无分支、落兜底文案，是死入口。沿 `market:` 做法从快照绑定：快照补 `lianban_stocks` 显示值（连板数、封板等；成交额榜已有），`bindCitedObject` 加 `company` 分支取快照行，无该股即写缺口；不新增读取契约。顺带合并 `pageAssistantObjects.ts` `MARKET_INDEX_IDS` 与 `DailyReview.tsx` `marketIndexRows` 两份指数映射。
独立性：7. 按 §4 实现形态落地（登记表、拒 mode、纪律挂载、删回退、拆 `assistant/`）。
测试与记录：8. `access_lifecycle.test.ts` #3 若因 `sessionPersistence` 注入失败：有意则改测试并记所属 Task，否则回退。9. 断言：助手 prompt 无研究纪律段；回退页无绑定；Topic 绑定有正文；Wiki 快照有正文；无 `modes` 消费者带 `mode` 报错。10. 提交前按文件列归属，M9.9 单独 commit；`.pnpm-store/` / pnpm 锁文件归治理对齐。

已接受、不在本包：完整绑定 prompt 进 DSH 历史、面板用 `visibleUserPrompt`；原生视图技术身份归[治理对齐](治理对齐修复_Task_2026-09-21.md)。

## 7c. 第二轮 review 处理结果（2026-09-21）

1. **闭合。** `IndexQuote`/`GlobalIndex`/`MarketOverview`/`ShortTermEmotion`/`TurnoverTop` 透传 `primary_source`/`fetched_at`；页头用 `pageMeta.oldest_fetched_at`，各块自带时点。`snapshot.ts`/`prompt.ts` 删除全部写死来源，缺则「来源未标注」。宽基/全球指数按信封为 `tencent`。`rg -n "同花顺|东方财富|tencent" desktop/src/verticals/finance/assistant/` 为空。
2. **闭合。** 市场情绪块加两句口径：宽度/投机是前端阈值派生标签；上涨/下跌家数是行业板块成分加总、非交易所口径。
3. **闭合。** 绑定了 `parse_revision_id` 但修订列表无匹配时写「绑定版本已不在修订列表」，不再落到「正文尚未解析」。
4. **闭合（改测试，不回退注入）。** `access_lifecycle` #3 改为承认 `sessionPersistence` 在 `inject` 中；该注入服务 `reportTasksWithLineage`，属 [M9.5](公司Wiki生成与交互报告_Task_M9.5_2026-09-17.md) 报告任务血缘，不属本包。
5. **闭合（只列归属，不改那些文件）。** 见下 §7b.10。`DOCUMENT_DISCIPLINE` 按 review 合并结果保留，本包未整段替换。
6. **闭合。** 删除 `ASK_TOOLS`；`DailyReview`/`CompanyWiki`/`IndustryCenter`/`feed_page_context.test` 直引 `assistant/`；删除 `lib/assistantPrompt.ts`、`assistantSessions.ts`、`assistantPageSnapshot.ts`。
7. **闭合。** §7 已按探针重记。

## 7d. 第二轮重审追加项（2026-09-21 14:00，review 方换"前提是否成立/是否重复"视角；§7c 闭合后仍须处理，逐条核对现状）

8. **闭合。** 五页快照改走 `assistant/snapshot.ts` builder：输入结构化数据、输出正文、不含 `【页面快照】`；段标题只由 `bindAssistantPrompt` 写一次，并剥掉正文开头残留的同名段。
9. **闭合（选守卫，不改列表角色）。** `company_wiki`/`industry_wiki` 且 `target` 为空时拒绝 `ASK_WRITE_TOOLS` 与 `fetch_source_url persist=true`；读工具与 `persist:false` 仍可用。选择已写回 §4。
10. **闭合。** `buildIndustryProfileSnapshot` 写入全部核心问题与 `rationale`/`status`/`card_count`；超限走 `clipPageSnapshot` 截断说明。
11. **闭合。** 报告任务始终钉 `reportTask.inputHash`，调用方 hash 必须相等否则拒绝；Theme/Comparison 核对导航回包 hash，缺摘要或与 pinned 不一致即失败；`read_industry_profile` 缺 digest 拒绝。Ask Wiki 绑定：`citedWikiVersionFailure` 在指定版本但回包无 hash 时拒绝正文。
12. **已实施。** `persistAccessError` 归 `native-research-tools.mjs` 注册守卫，删除 `document-tools.mjs` 的角色判断与 execute 重复检查；删除 Ask 空工具集下不可达的 Ask 写守卫，保留实际注册零工具验证。
13. **已实施。** 三处公司正则统一引用 `research-values.mjs COMPANY_SLUG`；四种 Wiki 的 `REPORT_BIND_SLUG` 保持独立。沉淀子代理绑定只在 `research-tools.mjs agent/created` 从创建上下文写入，删除启动后重复赋值。删除 `RESEARCH_ROLE_TOOLS`、`AGENT_TOOLS`/`DEEP_AGENT_TOOLS` 与工具表转发导出；生产与测试直接查 `consumers.mjs toolsFor`。`persistAccessError` 为本模块定义后的直接导出，不再跨层转发。
14. **已修正归属。** §7b.10 按 hunk 区分：绑定目标向沉淀子代理延伸、刷新门禁、入库权限、版本引用读取归本包；资料读取与入库实现仍归 M9.6。
15. **本包日期修复已实施。** 起止日期与 points 的交易日均按有效日历日期归一化比较，同日不同写法及无效日期拒绝，覆盖 primitive 与 market result 两入口。以下仍移交 M9.6、不在本包修：`isMissingPinnedBlock` 按异常文本识别；`requestedIngest` 越界令整次整理失败；`fetch_source_url` 的 symbol 格式与缺省归属。
16. **不认领。** Wiki 读锁已有独立 Task：[Wiki读取并发与发布锁优化](Wiki读取并发与发布锁优化_Task_2026-09-18.md) §归属。
17. **闭合。** Wiki builder 透传 `spec.as_of`/`status`/`valid_until`，缺则"观察时点未标注"；加载中与缺页分开；截断提示已写入 `clipWikiBody` 返回正文。
18. **已实施。** 删除 `assistantPlaceholder`、`sessions.ts` 对 binding 的转发、无调用的 `marketIndexId` 和响应幻影字段 `session_id`；Dock 直用 `assistantModeHint`，调用方直引 binding；`research-session.tsx` 复用 `CompanySnapshotQuote` 类型。
19. **已实施。** README 指向实际 assistant 模块和消费者登记表；Host 三类身份使用相同 ASCII/CJK 字符范围（页面键额外允许角色分隔冒号），测试覆盖中文行业绑定与目标中查询字符拒绝。
20. §7c 复核结果（review 方 14:10 核对）接受。14:53 再核：空目标写入、版本覆盖、缺 hash 放行、产业快照不完整与双标题已按上列闭合；fixture 探针 ≠ 真实 Backend / 浏览器。
21. 转 M9.5 报告子 Agent 流 Owner（不在本包修，随 §7b.10 归属一并交接）：`desktop/dsh/runtime/README.md` patch 台账未登记 `retainSubagent` 引用计数与 history cwd 门禁两项，违反治理对齐 D2 的台账要求；`client.tsx` `sessionState` 把派生 `trajectory.failed` 写进本应是原生原始错误的 `lastAgentError`；`my_research.test.ts` 两条用正则切 `client.tsx` 源码再 `new Function` 执行，且"不抢回用户选中"断言在新实现下平凡成立；`subagent_history.test.ts` import 的是 `lib/types/history.js` 影子文件而运行时加载 `lib/index.js`；`reportTasksWithLineage` 每次 GET 全量 `sessionPersistence.list()`，被 4 秒轮询放大；`agentOptions: { ...selection }` 未白名单字段。

## 7b.10 提交归属（M9.9 单独 commit；不提交本轮）

**本包（M9.9）**  
Vibe：`desktop/src/verticals/finance/assistant/`（新）；`lib/{api,pageAssistantObjects,feedPageContext,taskTrajectory,research}.ts`；`dsh/{client,research-session}.tsx`；`core/ai/pageContext.tsx`；`components/ui/FinanceAiDock.tsx`；`pages/{DailyReview,CompanyWiki,IndustryCenter,IndustryProfiles}.tsx`；`test/{assistant_context,feed_page_context,workspace_visual,access_lifecycle,global_indices}.test.ts`；本文档。  
Stock：`dsh/src/{consumers,native-research-tools,research-host,research-tools,research-state,research-material-tools,research-values,calculation-protocol}.mjs` 中本包 hunk；`background-review.mjs` 的目标绑定/比较页只读/公司守卫、`observation-tools.mjs` 的公司刷新门禁、`document-tools.mjs` 权限迁出归本包，文件其余 hunk 不混收。相关 tool-scope/research-host/report-task/calculation-protocol 测试归本包。Vibe `host-state.mjs` 身份校验、`my_research.test.ts` 中文绑定用例与 README 模块映射归本包，其余血缘 hunk 不混收。

**[M9.5](公司Wiki生成与交互报告_Task_M9.5_2026-09-17.md) 报告任务血缘（不改）**  
`desktop/dsh/finance-ui/server.mjs` 的 `sessionPersistence` inject；`host-state.mjs` 的 `reportTasksWithLineage`；`lib/reportTasks.ts`；`components/{TaskProcessPanel,WikiReportPane}.tsx`；`dsh/runtime/patches/@deepseek-ai+dsh-api-session-controller+0.1.2-rc.1.patch`；`test/{subagent_history,subagent_retention,wiki_report_lifecycle,my_research}.test.ts`；`host-state.mjs` 报告任务默认模型（`agentDefaultModel.currentSelection`）。

**[M9.6](资料管理与对话引用_Task_M9.6_2026-09-17.md) 文档读取+Backend（不改）**  
Stock `document-runtime.ts`、`read-by-heading.md`、`fetch_source_url` 本体、文档索引/正文读取及其测试、资料 Backend/API/迁移归 M9.6；共享文件中本包 hunk 以上段为准。`DOCUMENT_DISCIPLINE` 以已合并稿为准，不在本轮改。`wiki_publish_lock.py`、`gbrain_adapter.py` 与 `test_wiki_read_lock.py` 归 [Wiki 读锁 Task](Wiki读取并发与发布锁优化_Task_2026-09-18.md)，不挂 M9.6。

**[治理对齐](治理对齐修复_Task_2026-09-21.md)（不改）**  
`.pnpm-store/`、`desktop/pnpm-lock.yaml`、`desktop/pnpm-workspace.yaml`；该 Task 文档本身。

**其他混入、本包不收**  
`.agents/skills/data-access/scripts/sources/cninfo.py`；`README.md`/`human-checklist.md`/`todo.md`/`docs/README.md` 及 M9.5/M9.8/我的研究 Topic 文档 hunk；Stock `artifacts/`、`industry_wiki_41_drafts.zip`、`scripts/`、`workspace/`、`m3-refactor-home.png`。`TaskTranscript.tsx` 若仅报告任务/子代理过程则归 M9.5，问助手轨迹文案归本包，提交时按 hunk 拆。

## 7a. 后续包

「存入沉淀」接问助手回答条目（治理对齐 §1.E）。chip `title` 不用 `item.id`。会话绑定契约（四 JSON、header/metadata）见 todo，不在本包。

## 8. 验收

2026-09-21 用户指定：以下真实模型、浏览器与产品验收全部由用户执行；本轮只处理代码、回归与类型检查，不重启、不提交、不 push，工程检查不代表产品验收。

工程检查：Vibe `npm test --prefix desktop` 174/174；`npm run typecheck --prefix desktop` 通过。Stock DSH `npm run build` 后 `node --test test/*.test.mjs` 116/116；覆盖日期别名/非法日期、工具实际注册与角色入库门禁、中文绑定。使用 fixture/mock，未调用真实模型或 Backend。本轮修改范围 diff check 通过；全仓检查另命中既有 M9.5 runtime patch 的补丁上下文缩进，本轮未改。§15 的 M9.6 项、§21 的 M9.5 项及 §7a 后续包未实施，不计作已修复。

1. 大盘 Ask `@ 上证指数` 解释当前行情：零工具；回答引用快照点位/涨跌/家数/情绪与时点。
2. 同页 Ask「最近半年怎么走的」：不取数，说明页面没有并提示 Agent。
3. 同页 Agent 解释当前行情：零或极少调用；注册清单无 `observe_market`/`calculate_*`/`generate_market_result`。
4. 资讯 Ask `@` 一条新闻：读取绑定按 M9.8 首个验收；Ask 零工具。
5. 公司/行业/产业 Ask：`@` 后依据本轮读取与 hash；Ask 零工具。Agent 只增加该角色维护工具。
6. 五模块分别建会话，核对实际 prompt 与工具：Ask 空集；大盘 Agent 与登记表一致。
7. 轨迹多次计算可按参数区分；起止同日 DSH 层缺口。
8. 历史回答保持发送时数值，刷新页面不改旧数字。
9. 深度对话会话无 Ask/Agent、无问助手 prompt 段；其工具/纪律不因本包改内容。
10. 公司 Wiki Ask 不 `@` 问经营模式：零工具，引用页面 Wiki 正文。
11. 仍能 `@ topic:` 的角色页：绑定含议题正文，不是 `{}`。
12. Home、我的研究、议题、我的资料、资料阅读、Signals 不创建问助手会话；五角色实际 prompt 均无研究纪律段。

## 9. Out of Scope

- 不拆服务端插件；不设计我的研究/议题问助手；不为回退页新增角色。
- 不做情绪/资金流/涨停榜 Backend 读取；不做大盘历史区间与跨指数比较的工具归属（todo）。
- 不改深度对话、议题、报告、知识整理的工具内容；只切断被问助手误用的回退。
- 不做 Topic 插件、Jev、Git 统一版本、Fetcher 新造、会话 header 契约、`core/ai/AiDock` 死代码。
- 不提交 / push / 重启；不改 node_modules；不 stash 他人改动。

## 10. Stop Conditions

- 某类读取身份无正式只读接口，且补接口要新增持久化或改对象契约：停该类，不用模型工具代替。
- 上下文超 DSH 用户消息上限：报实际上限与裁剪方案，不静默截断数值。
- 大盘 Agent 无法覆盖"解释当前行情"以外的常见问题：记 todo，不擅自恢复 `observe_market`。
- 五角色 Ask 无法同时空集：停，不接受部分角色带工具。
- 登记表助手条仍 `...DEEP_*`/`...ASK_TOOLS`，或无 `modes` 消费者静默吞 `mode`：停，不叠 if。
- `client.tsx` 拆完仍实现 `startAssistant` 或深度对话会话带 `mode`：停。
- Ask 真实轨迹仍有工具调用，或 Agent 对当前行情仍大量取数：回到 prompt 与上下文，不加"不要调用"补丁。
- 同一行为两次修补仍不闭合：重核 Owner。
