# M7 前置 · Tools 与 Skills 设计审计

> 当前审计见下方「2026-09-15 系统复审」。2026-09-10 的装配清单、旧阶段入口和验证数量仅为历史，不代表当前运行时。

日期：2026-09-10。结论：保留证据读取、确定性计算、方法按需加载和 Backend 唯一发布的骨架；当前 Topic、积累权限与角色划分不能直接承接新业务。先收口这些契约，再执行 M7/M8。此次仅实施用户明确授权的 Radar 停用雪球，不实施其余审计建议。

## 范围与证据限度

- 基线：Vibe HEAD `d7d577a`、Stock-Research HEAD `5a6adcc` 及两仓当前工作树；用户已有修改保留。
- 主审计对象：共享 Pi 工具注册、DSH 实际装配与生命周期、研究提示词、1 个 workflow / 12 个分析 skill / 2 个 composition skill、Radar Provider 调用链、Topic 与分析接口。
- 产品侧核对：普通页面模型入口、旧阶段模型桥、六个本地金融 skill 的职责与旧六阶段 SOP 边界。它们不等于 DSH 当前加载的研究能力。
- 本文是带代码证据的设计审计，不是每个外部 Provider 的联网验收，也不是 DSH/GBrain 全部依赖的安全审计。没有读取用户浏览器、登录态或真实密钥，没有运行真实研究或修改研究数据。
- `Stock/...` 指 `/Users/apple/ts/src/Stock-Research/...`；`Vibe/...` 指本仓。研究契约仍归 Stock 原有 Owner，本文不创建第二份契约。

## 1. 当前实际运行形态

```text
深度对话 → DSH Agent → Stock research host（每个 Agent 独立）
                      ├─ 共享 Pi 研究工具 → Backend
                      ├─ 7 个 GBrain 只读导航工具
                      └─ 成功 settle 后的研究维护复核
页面问助手 → finance-model → 一次模型调用（无工具）
旧专题/六阶段 → orchestrator → stage-model 传输桥（执行仍归 orchestrator）
```

入口：`Stock/dsh/src/index.ts`、`research-tools.mjs`、`research-host.mjs`、`wiki-navigation.mjs`；`Vibe/desktop/dsh/finance-ui/model.mjs`、`stage-model.mjs`。

共享 Pi 源码登记 27 个工具；DSH 排除 5 个 composition/Dreaming 工具，保留 22 个，再加 7 个导航工具。此为源码装配清单，不代表某个活动 Session 已加载新构建。DSH patch 禁用 bash、pwsh、文件读写与文件搜索插件；这不能替代研究工具自身的副作用审查，原 Radar 就在内部启动了子进程。

## 2. 全部共享工具的职责与处置

下表除 `today` 外省略 `stock_` 前缀；导航工具另列。不建议按页面复制整套工具。

| 分组 | 工具 | 当前职责及处置 |
| --- | --- | --- |
| 时间与定位 | today、resolve_refs | 时间/身份解析；保留，行业身份需区分核心 41 行业与申万统计口径 |
| 文档证据 | list_documents、get_source_index、scan_source_sections、read_source_blocks | 列表→章节扫描→本轮 Block 读取；保留范围与版本校验，不开放任意文件读取 |
| 抽取候选 | stage_extraction | 暂存候选而非事实发布；当前 DSH 无可信 finalize 权限，不能宣称完成硬关系入库 |
| Topic 读取 | list_research_topics、get_research_topic | 保留；列表/恢复改为长期议题语义，而非 Top-N 工作记忆 |
| Topic 写入 | route_research_topic、update_research_topic | 路由可能创建，update 修改观察/判断/问题等；按行业议题语义审查，保留 revision 防并发覆盖 |
| 外部线索 | search_external | 外部检索与预算控制；保留线索/证据区分，命中不自动成为事实或 Wiki |
| 数据消费 | query_observation、observe_market | 财务/行情/缺口与尺度读取；保留，不能把 API 已支持字段统一引导为手读 PDF |
| 公司动态 | observe_radar、attach_radar_card | observe 与 Topic 挂卡分离；本次仅保留四个核心 API 通道，挂卡不等于事实入库 |
| 资料入库 | ingest_periodic_report | 启动文档入库及轮询；属于受控写入，不能称所有研究工具“只读” |
| 分析 | run_analysis_primitive、read_analysis_skill、read_example | 计算、方法、示例三层；保留，方法数量不等于计算能力数量 |
| 编译知识 | read_wiki_research、review_wiki_maintenance | accepted 核心 Wiki 读取与成功收尾维护；保留唯一维护 Owner，发布不能由浏览器直写 |
| 组合材料 | read_composition_skill、validate_page_draft | 当前仅受控 precompile 模式使用，DSH 排除；我的研究需自己的授权入口与保存闭环 |
| 旧 Dreaming | scan_dreaming、present_dream_candidates、decide_dream_candidate | 当前独立 Dev 路径，DSH 排除；不作为我的研究创建材料的前置，本次不删除历史成果 |
| Wiki 导航 | stock-wiki_get_page/list_pages/search/get_links/get_backlinks/traverse_graph/schema_graph | 7 个只读工具；核心正文仍走 accepted Backend 读取，图导航不能绕过此边界 |

清单来源：`Stock/pi/stock-research-wiki/stock-research-wiki/index.ts:854` 起全部 registerTool；DSH 排除表 `Stock/dsh/src/research-host.mjs:3`；导航白名单 `Stock/dsh/src/wiki-navigation.mjs:4`。

## 3. 必须在 M7 收口的发现

P1 表示阻断新研究闭环，P2 表示需随对应契约处理的可靠性/表达问题；不表示已经发生用户数据损坏。

| 级别 | 证据与问题 | 业务后果 / M7 要求 |
| --- | --- | --- |
| P1 | `Stock/pi/stock-research-wiki/references/research-discipline.md:37` 明确行业问题映射申万且不建 Topic | 与行业级议题定义直接冲突。同步共享提示词、路由工具及 Backend；保留临时问题不建 Topic 的判断空间 |
| P1 | `Stock/backend/app/settings.py:96` 默认容量 10、只允许 1–20；Topic 创建/恢复包含容量淘汰 | 取消隐式淘汰行为；历史归档按 M7 决策边界处理，不擅自全量恢复 |
| P1 | `Stock/dsh/src/research-host.mjs:18` 固定 hookToken:null；共享工具 `index.ts:1872` 无 token 时清空暂存抽取 | stage 可调用不代表硬关系准入。需可信宿主交接→Backend 校验→反馈；不能给模型 token 作为修复 |
| P1 | 共享工具 `index.ts:1874–1888` 挂 source_refs 的异常被吞掉，随后清空 pending | 关联失败不可感知。应明确“关联未保存”并保留重试依据，不暴露 hash、密钥或内部路径 |
| P1 | DSH 排除 composition 工具；现有 precompile 有 validate/host publish 独立路径 | 我的研究不能仅靠 prompt 持久化材料。先定义谁可创建什么，再打通同一发布 Owner；不复活 Dreaming 为必经流程 |
| P1 | Topic 与产品 Note 分属不同持久化 Owner；现有导航工具面向 Wiki 页面 | 缺少“记录独立保存、Agent 判断后关联议题/核心对象”的完整链。明确关联失败与重复保存语义，不从 Session 全文自动生成积累 |
| P2 | `Stock/dsh/src/research-tools.mjs:6` 先 await GBrain 连接，再注册任何工具 | 导航故障连带阻断日期/Backend 文档等能力。按真实依赖降级；不得用不可信原文替代 accepted Wiki |
| P2 | DSH 用排除表吸收共享 Pi 新工具 | 新增 Pi 写工具可能自动进入产品。M7 使用有限角色的显式工具集合与回归约束，不建设通用插件权限平台 |
| P2 | 研究纪律 `:23` 要求即使被问系统工作方式也不暴露 errors/traces | 技术细节隐藏，但业务失败、未保存、资料缺失应可感知。区分隐藏内部实现和隐瞒结果 |
| P2 | `Stock/backend/app/analysis/dispatch.py` 只有 12 个具体 operation；方法覆盖更广的估值与归因 | 按实际场景映射输入/算子/输出 refs；缺算子明确缺口，不允许模型补算后冒充可重放结果 |

route、ingest、Topic update、Radar attach、维护提案都有状态影响。角色设计应区分“查询、研究工作状态写入、可信知识发布”，不能用“深度对话只读/我的研究可写”一个布尔值概括。硬关系 predicate 与准入词表的既有错位继续按 M7 原任务核对，不能只开放 stage 权限。

## 4. Skills 是否合理

总体合理，改入口与适用边界，不整套重写。Stock skills 负责方法，tools 负责可执行能力，Backend 负责证据与发布校验。

| 当前 skill | 结论 / 调整重点 |
| --- | --- |
| workflow / earnings-analysis | 已允许按问题选择分支，不强制整套流程；保留，更新旧 Topic/Dreaming 语义 |
| business-model、operating-drivers | 业务模式和量价成本驱动；可服务公司、行业及 Theme，不创建重复事实库 |
| industry-structure-cycle、competitive-position | 结构/周期与竞争分析互补；申万 Profile 作 Theme 材料，不混作核心行业身份；分析关系不自动成为硬关系 |
| financial-statement-linkage、balance-sheet-resilience | 保留三表与韧性方法；完成标准按选中分支执行，避免局部问题扩大成全套审计 |
| capital-allocation、economic-attribution | 分清资本配置与经营归因；保留事实、推断、情景之别，不为完整而补造数据 |
| risk-transmission、change-falsification | 风险传导与判断变化互补；裁决点可服务长期 Topic，临时回答不强行建议题 |
| intrinsic-value、market-expectations | 方法覆盖大于算子；核对可重放计算链、报告期与假设，不能仅凭 skill 宣称完整估值能力已验收 |
| composition / theme、comparison | 复用结构和合法性要求；我的研究发起主动构建，validate 不等于发布，软 Link 不等于硬关系 |

方法经 `read_analysis_skill` 白名单读取，示例经 `read_example` 三个固定名称读取，没有开放任意 SKILL 路径。保留按需加载，不把全部方法塞入系统提示词。

本仓旧六个 skill：company-research、data-access、earnings-analysis、valuation、catalyst-risk、industry-chain，仍带六阶段 SOP、脚本取数和 calc/账本契约。它们属于旧 orchestrator，不整体混入 DSH 自由研究提示词。退出旧专题入口前核对独有能力及历史产物；同名 earnings-analysis 不代表同一 Owner。

不为每种页面新增万能 skill。先确定 Company/Industry/Theme/Comparison 创建维护矩阵；此前 Company/Comparison 的待确认措辞继续按 M7 Stop Conditions 处理。

## 5. 本次已处理：雪球与用户浏览器

原路径：stock_observe_radar → Python Community Runtime → 默认 OpenCLIXueqiuProvider → OpenCLI。工具参数没有浏览器字段，仍存在隐式访问，因此隐藏 UI 或描述无效。

- 删除共享工具的 Community Runtime 子进程路径及失败回退，只请求 disclosure / periodic_report / company_news / market_change。
- `connectors/community_runtime.py` 生产 Provider 选择始终不可用，包括已有 opencli.xueqiu 配置。
- 保留历史社区卡片、envelope 和适配器解析代码，不删除用户数据；旧源码保留不代表生产入口启用。
- Stock Human Checklist、Radar 契约、来源盘点、架构及 README 明确当前政策覆盖；历史默认社区观察和真实 OpenCLI 验收条款不再适用。
- 不调用用户浏览器来验证禁止调用。未来产品内置独立浏览器不在本轮范围，需另行确认。

## 6. 验证与后续顺序

DSH `npm run build` 通过；`node --test test/*.test.mjs` 11/11；Pi `node --test tests/runtime.test.mjs` 14/14；Backend `pytest -q -p no:cacheprovider backend/tests/test_community_runtime.py` 11/11（两条依赖弃用警告）；两仓 `git diff --check` 通过。

新增 DSH 行为回归用 mock fetch 验证成功和 503：每次仅请求一次四通道 API，不发送社区 envelope/connector header，不额外回退；静态检查共享工具无子进程路径。Python 验证默认与旧配置无法选中 Provider。历史 adapter 测试中的显式注入假 Provider 只验证历史协议，不证明生产可用。

限制：构建产物已更新，未重启服务，未验证活动 Session 热加载；未验收真实四通道数据质量。没有执行 M7、迁移或 Git 提交。审查为本轮 diff 自查，无独立 Agent 审计结论。

后续：M7 先确认创建/维护/发布及历史数据边界，同步 Topic、行业身份、提示词与 tools；再闭合可信硬关系写入、主动 Wiki 构建、独立 Note 与可选关联，并补角色工具集合、失败反馈和导航故障隔离。以自然问题验证临时问题不强行建 Topic、行业可建议题、证据可准入、材料可被新 Session 复用。M8 再承接我的研究和 41 行业展示；硬关系、技术版本/hash 留在内部。

## 2026-09-15 系统复审

### A. 范围、证据与结论

执行边界见 [审计 Task](工具与Topic系统审计_Task_2026-09-15.md)。本节是审计结果和待审方案，不是新业务契约，不改变旧授权、实际工具或已有数据。

- 实际轨迹：`.local/dsh/sessions/--Users-apple-ts-src-Stock-Research-workspace--/session-6c1a7196-1157-4060-ba35-2af49e679169/session.jsonl.zstd`。用户「川投能源最近走的还不错，分析下他的行情」。20:38:04—20:39:36，用户中止，无最终回答；20 次工具调用、13 种工具、8 次失败。
- [实际工具定义快照](../artifacts/tool-audit-2026-09-15.json)：从该会话 request/header 导出，只包含工具定义、计数和来源路径，不含模型思考、系统全文或凭据。
- 真实加载 32 项：25 项研究工具 + 7 项 GBrain 导航；未发现 shell、通用文件写入或其他 DSH 原生工具。不能用源码中所有注册函数的数量替代这一事实。
- 当前源码 `Stock/dsh/src/native-research-tools.mjs:10`：deep_research 为 25 项，my_research 再加 6 项；导航健康时推导为 38 项，后者是源码推导，未采集本轮 my_research 实际请求。后台复核 `background-review.mjs:60` 为独立子 Agent、空工具 allowlist，不是另一套通用研究工具。
- 定义 JSON 按 Python `json.dumps(..., ensure_ascii=False)` 序列化后合计 85,039 字符；计算工具 63,148 字符，占 74.3%，37 个顶层参数、14 个 operation。字符不是 token，也不是服务商线上字节计费口径。
- 32 项中本次使用 13 项不能证明剩余 19 项应删除；只能证明同一行情请求承担了全部定义的暴露成本。对注意力和延迟的因果影响仍需同条件模型实验。

结论：问题同时来自业务触发过宽、工具职责交叠、少数 schema 极大、关键写工具 schema 过薄，以及隐式状态前置。只减少工具数、追加提示词或迁移到子 Agent 均不足以闭环。

### B. 全部工具处置表

下列均为建议。保留表示保留能力，不承诺继续默认暴露；内部化或收窄需实施验证。Stock 指 `/Users/apple/ts/src/Stock-Research`。

| 工具 | 当前职责/副作用与契约缺口 | 建议 |
| --- | --- | --- |
| `today` | 上海日期；无业务写入，日期依赖调用需要顺序 | 保留；评估宿主确定性日期是否可替代额外调用，需处理长会话跨日 |
| `stock_query_observation` | 已有公司事实/关系/研究地图，不再隐式外取 | 保留为基线读取；已知 Wiki slug 时不重复定位 |
| `stock_fetch_company_data` | 外取财务/估值并保存成果；sections 已有枚举 | 保留补缺入口；与财务出图共享数据消费，明确期间及结果不自动成为 Evidence |
| `stock_generate_market_result` | 取个股日线、保存并展示；默认保存一年 | 保留展示能力；明确个股/指数差异，复用已有结果，不以重复调用纠正展示 |
| `stock_generate_financial_result` | 取年度合并财务、保存并展示 | 与公司数据补取核对重叠；数据足够时应复用，不先决定新增万能工具 |
| `stock_read_research_result` | 完整读取保存快照、不重复展示 | 保留；返回统一可接续身份和覆盖范围 |
| `stock_observe_market` | 三尺度观察，参数全是宽泛字符串；失败可只剩通用错误 | 与行情成果统一尺度身份/基准选择/缺口；按已持有序列只补缺失尺度 |
| `stock_observe_radar` | 四通道事件及市场变动，默认回看 90 天 | 保留按需；明确默认时间、基准身份、卡片用途，不作为每次行情必经步骤 |
| `stock_search_external` | 外部摘要缓存，非 Evidence；存在每轮次数上限 | 保留；公开预算、结果类型、Topic 参数作用及失败是否消耗预算 |
| `stock_attach_radar_card` | 写 Topic；cardId 实际映射 candidate_token | 仅议题推进暴露；统一候选身份命名，版本协调由已有 Owner 负责 |
| `stock_list_documents` | 列已有文档 | 保留；文档类型/报告期和分页界限需完整说明 |
| `stock_get_source_index` | 读取索引和 revision 身份 | 保留导航能力；与章节扫描减少机械往返但不删原文读取门槛 |
| `stock_scan_source_sections` | 章节预览，非可准入原文 | 保留；offsets 不应是无键语义的任意对象，公开分页与证据边界 |
| `stock_read_source_blocks` | 固定版本原文读取并登记本轮已读材料 | 保留；明确 blockIds/blockRanges 的选择约束和范围上限 |
| `stock_ingest_periodic_report` | 入库异步 job，可能后续递送消息；不是简单只读 | 按资料缺口开放；报告枚举、完成状态、失败与取消行为必须可见 |
| `stock_resolve_refs` | 通用引用回读；并非所有 ID 都受支持 | 保留；列明支持类型，result 应直接指向专用读取，禁止猜前缀 |
| `stock_stage_extraction` | 暂存抽取候选，成功收尾经 Backend 可信校验 | 限已读原文的积累路径；保留候选不等于事实的明确结果 |
| `stock_run_analysis_primitive` | 14 操作共享 37 参数；大量重复 Quantity schema | 优先按行情/财务/估值等任务拆分暴露或按需装载具体协议；保持确定性计算 Owner，不复制算法 |
| `stock_read_analysis_skill` | 可列目录/读取方法、workflow、设计模板 | 保留按需资源入口；明确无 name 列目录、合法名称与适用范围 |
| `stock_read_example` | 可列目录/读取固定示例，未知 ID 报错 | 与方法目录评估合并；短目录直接公开，错误返回候选；本次猜 ID 失败 |
| `stock_read_wiki_research` | Backend accepted 核心页读取 | 保留唯一核心正文入口；与导航职责清楚区分 |
| `stock_list_research_topics` | 只读列表，同时设置本轮可路由候选状态 | 保留发现能力；读取列表不等于有创建意图；机械路由前置可内部完成 |
| `stock_get_research_topic` | 读议题、登记 revision/追踪状态 | 保留；引用/读取不意味着切换当前写目标 |
| `stock_route_research_topic` | 查重/创建/恢复/绑定混合，硬编码 research_intent=true | 优先重审；读取匹配与创建副作用分清，普通分析不默认拥有持久创建动作 |
| `stock_update_research_topic` | 工作状态增量写；输入几乎无嵌套协议 | 最高优先补契约；仅明确议题推进；证据、搜索卡片、成果关联严格分型 |
| `stock-wiki_search` | GBrain 全量说明透传，含多源/远程/通用搜索细节 | 保留产品检索；裁剪非产品参数和开发说明，不旁路授权 |
| `stock-wiki_list_pages` | 列页，含已删除页/多源等通用参数 | 与搜索评估统一发现入口；分页保留，恢复管理参数退出普通研究 |
| `stock-wiki_get_page` | 通用页读取含 fuzzy/include_deleted 等 | 限 Theme/Comparison 已发现页；Company/Industry 仍走 accepted Backend，保留代码门 |
| `stock-wiki_get_links` | 出向页面链接 | 与 backlinks/traverse 合并为明确有界关系读取候选，不立即删除能力 |
| `stock-wiki_get_backlinks` | 入向页面链接 | 同上，明确方向与截断提示 |
| `stock-wiki_traverse_graph` | 多跳通用图导航，默认/上限由上游决定 | 从普通行情默认集合移出；只在关系研究需要时提供有界遍历 |
| `stock-wiki_schema_graph` | 查看图 schema 而非研究事实 | 优先移出普通研究；实际业务若需词表，应提供精简领域词表 |

my_research 额外六项：源码已核对，尚无本轮真实加载/调用验收。

| 工具 | 当前职责/缺口 | 建议 |
| --- | --- | --- |
| `stock_read_composition_skill` | Theme/Comparison 方法，pageType 未枚举 | 保留按需，补 enum；可与资源目录整合 |
| `stock_list_product_notes` | Backend 记录列表，描述仍称 host ledger | 保留并纠正来源，公开分页上限 |
| `stock_read_product_note` | 单记录正文，接受 note: 前缀剥除 | 保留，统一身份与实际对象来源说明 |
| `stock_list_research_links` | Topic 入出向已确认关联，direction 未枚举 | 保留并补 enum；读取成果关系与 Wiki 图不混用 |
| `stock_propose_research_link` | 提议记录/成果关联，需用户确认 | 保留，不改确认边界；互斥输入应结构化而非仅文字 |
| `stock_validate_page_draft` | 验证并缓存 Theme/Comparison 草案；specs 裸数组 | 高优先补 PageSpec 与绑定 Topic 契约；缓存不等于发布 |

覆盖范围：32 项真实工具与额外 6 项源码角色工具。Dreaming/Pi 工具不在实际产品请求中，不作为新增产品工具恢复；后台复核是独立结构化输出契约，不计入研究工具数量。

### C. 优先协议发现

| 优先级 | 实证或静态风险 | Owner 与修复方向 |
| --- | --- | --- |
| P1 | 本次 3 次 Topic 更新失败：缺 key、result 引用类型错、selectedResultIds 被当作研究成果；`topic-tools.mjs:155` 与 Backend `research_topics.py:563` 不一致 | DSH 公开完整 Backend 输入；区分 ext 搜索卡片、result 成果、依据 refs；成果走现有确认关联，不能放宽证据前缀 |
| P1 | `research_topics.py:1120` 还要求 baseline/observables/conditions/next_source，本次输入不满足；这是尚未执行到的下一失败风险 | schema 与校验共用结构；一次报告可检测的输入问题，不逐字段猜 |
| P1 | `topic-tools.mjs:70` 的候选/confirmNew 状态规则和时间约束未出现在公开参数中；本轮各报错一次 | 业务触发与状态前置分开；机械查询/版本流程内部化，模型不能自授研究意图 |
| P1 | `research-material-tools.mjs:160` 将全部 Quantity 重复展开；`:202` 另维护操作必填字段映射，公开根 required 只有 operation | 精简暴露与严格协议同时完成；先验证 DSH/Provider 对条件 schema 的真实支持，不假设 $ref/oneOf 一定可用 |
| P1 | `my-research-tools.mjs:128` specs 无 items，而执行至少要求 blocks/links/type，Backend 继续验证 | 完整草案契约或已定义的受控内容输入；不得以合法 JSON 冒充合法草案 |
| P2 | `research-material-tools.mjs:258` id 无枚举、不说明空参列目录；本次 unknown example id | 自动从资源 Owner 导出短目录/枚举，未知项给可选项 |
| P2 | `observation-tools.mjs:108` 未交代指数/行业身份；本次指数误走个股图，行业-only 失败底因被聚合错误隐藏 | 统一尺度契约，保留逐尺度错误；不可据通用错误声称 Provider 永久不可用 |
| P2 | `wiki-navigation.mjs:25` 透传上游 schema，真实 get_page/search 含 #issue、版本、跨源、已删除、编辑往返等说明 | 保留产品需要的只读子集；发布/管理术语不应占研究上下文 |
| P2 | `research-values.mjs:2` 多数输出为任意对象；`research-backend.mjs:2` 将业务 detail 编成 Error 字符串 | 输出明确身份、覆盖、缺口、保存/展示状态；错误明确类别、可否重试和具体恢复步骤，保留原始诊断 |
| P2 | `observation-tools.mjs:70` 搜索次数上限执行时才告知，计数先于请求；`:115` Radar 默认 90 天说明缺失 | 公开成本和默认范围，避免失败后预算无感消耗及扩大问题范围 |

保留已改善项：公司概况不外取；成果读取不出图；市场多区间可直接引用保存快照；抽取有结构 schema；源块固定版本；Topic revision 与证据校验不放宽。审计不是将全部工具一概判为不可用。

独立只读审计补充、主线程已核对：

- `document-tools.mjs:9` 的原文读取登记 pendingTouched；`research-finalize.mjs:72` 可在无显式抽取候选时发送 touched_blocks，Backend `api/v1/wiki.py:1674` 重放规则并尝试准入。只有成功收尾和已有宿主授权才发生，不是越权写入证据；但“读原文”有延后积累副作用，需在生命周期契约中明确。不能为工具精简而无意删除该能力。
- `api/v1/wiki.py:1468` 草案校验还会加入 Topic 待审列表；失败可处于“草案已缓存、待审关联失败”。应把缓存、关联和发布三个结果分别返回，不把 validate 理解为纯校验。
- `observation-tools.mjs:140` Radar 挂卡返回未暴露 Backend revision/already_attached，但宿主会记 revision。它不是必然并发错误；恢复或跨调用接续应交给唯一版本 Owner，并明确是否重复挂载。
- `research-tools.mjs:11` 通过本地 topic-sessions 绑定决定角色；`:48` 角色变化会替换研究状态。需测试绑定缺失/变化/损坏下的工具集合与未完成工作，不读取或导出个人配置来证明它。
- `research-tools.mjs:130` 任一研究工具错误加入 sourceErrors，成功调用没有在此清除；`research-host.mjs:70` 要求集合为空才启动后台复核。参数错误已纠正也可能抑制本轮维护。这是源码确认的策略风险，不能把维护未运行一概解释为没有知识增量；本次无原文且用户中止，本来就不应触发维护。

### D. Topic 与 Wiki 的系统性问题

1. 已确认旧方向允许深度对话自动创建行业 Topic，同时规定分析新公司不必创建；现有接口又接受 company subjects。产品边界与实际可写范围需要一并裁决，不能只改单个参数。
2. 常驻纪律 `research-discipline.md:31` 要求普通追问不建 Topic，但按需示例 `examples/intent-routing.md:16` 将多部分财报分析直接引向列 Topic/route。该示例本轮未成功读取，不能认定它导致本次失败；它仍是跨场景重复问题的静态诱因。
3. 主会话同时拥有资料读取、计算、Topic 建档和追踪项写入。数据够用后没有明确的任务完成边界；自动积累被解释为继续补取和维护。
4. 路由成功立即持久创建，后续更新分别提交；用户中止不会撤销已成功写入。此前读回新 Topic `topic:a8ee46cda025` 为 revision 1、空判断/追踪。失败更新未落库不等于整轮无副作用。
5. 后台 Wiki 复核隔离只能解决主会话续写和失败传播，不解决主会话自己调用 Topic 写工具的业务意图。

建议场景边界（待用户确认）：

| 场景 | 允许动作 | 不自动发生的动作 |
| --- | --- | --- |
| 行情/一次性解释 | 读已有知识、补缺数据、计算、图表和回答 | 建 Topic、造追踪项、扩大年度研究 |
| 公司深研 | 按缺口读原文，沿现有准入维护公司 Wiki | 因分析深入而升级持续议题；绕过草案/发布权限 |
| 发现持续问题 | 回答中给出简短议题建议 | 为显示建议先建空 Topic |
| 用户明确建立/持续跟踪 | 查重后创建有问题与依据的议题；已授权不重复确认 | 将创建等同启动定时任务 |
| 在已绑定 Topic 推进 | 读取状态，只更新有依据增量；有可观察条件才建追踪项 | 为填齐结构补取与本题无关材料 |

生命周期建议：发现问题 → 明确持续研究意图 → 查重/读取 → 有效内容创建或更新 → 按需追踪项 → 后续显式推进。回答交付独立于可选整理；失败准确报告已保存与未保存部分，不靠删除引用过校验，不自动删除已有有效数据。

需裁决：深度对话是否取消模型单方自动创建；Topic 是否继续限定行业持续议题或容纳公司持续问题；创建最低有效内容和部分成功语义。公司 Wiki 可创建的方向已确认，但具体新公司初始化路径和后台只维护已有 accepted 页的现状要分开验收。

### E. 实施分包与验收矩阵

建议先确认 D，再实施；以下包是顺序建议，本轮没有运行新模型或修改代码。

1. 协议闭环：Topic、草案、枚举/目录、ID 衔接、错误类别；保持 Backend 准入。公开 schema 与 Backend 正反例共用，检测 required/items/enum 漂移。
2. 工具收敛：行情/财务计算按任务暴露，精简 GBrain 面，读/取/展示职责明确；不引入通用工具发现框架，先验证既有 DSH 能力。工具数量目标由场景决定。
3. Topic 流程：确认后的触发和创建内容门槛、角色集合、部分写成功可见性；补齐 prompts、examples、契约和执行约束，不只改提示词。
4. 同条件真实验收：冻结问题、日期、输入快照、模型及已加载配置；同时检查答案、引用、持久化与图表，不以调用少作为唯一目标。

| 场景 | 必须验证 |
| --- | --- |
| 华能国际最新行情 | 日期依赖先完成；一份所需行情成果，无误日期后再造第二图 |
| 川投能源近期表现 | 复用快照；需要比较才补基准；不建 Topic；完整回答 |
| 已有成果多区间追问 | 只读/确定性计算，不重取、不重复展示 |
| 公司深研读新原文 | 有效证据绑定；公司 Wiki 增量沿现有准入；主回答不被复核续写 |
| 明确创建与继续 Topic | 首次合法输入通过；重用原议题；ID 类型不猜测；关联仍经确认 |
| my_research 草案 | 完整 schema 可生成合法草案；验证/缓存/发布结果分明 |
| 资料失败/版本冲突/中止 | 不删除依据重试；不得串旧问题；保留先前有效写入且报告部分状态 |

每次记录：实际工具集合及定义长度、首次合法率（排除真实数据源不可用）、总调用/无效调用/重复取数、首次答案与最终完成时间、输出正确性、图表数量、Topic/关联/草案增量。先做可比基线与至少多个独立新会话；不以一次跑通宣称稳定。

当前完成等级：真实失败轨迹复核 + 全工具输入清单 + 源码/校验审计 + 方案。尚未完成：修改后的运行验证、my_research 实际请求采样、Provider 底层失败归因及注意力影响对照实验。现有空 Topic 未清理，服务未重启，无提交/push。

审查方式：独立 explorer 只读核对全部研究模块与 Backend，主线程逐项复核高影响发现；未实施业务 diff，因此未做代码变更审查，也未以既有测试通过冒充本轮运行验收。

本轮机械验证：Python 对照真实 JSON 快照与本节表格，32 项真实工具及 6 项额外角色工具均覆盖；20 次调用/13 种工具、8 条 Error 返回复核一致；定义字符总和一致；Task 少于 200 行；本 Task/审计文档相对链接均存在。指定三份已跟踪文档运行 `git diff --check` 通过。以上不使用业务 fixture，不证明未来收敛方案已改善模型表现。

### F. 用户授权后的多会话收敛与实施

本节覆盖上文审计阶段的“待确认/尚未修改”状态。用户已授权基于多轮 sessions 作初步裁决并实施协议补齐；决策已记录到双方 human-checklist。

**实际样本。** 扫描 `.local/dsh/sessions/**/session.jsonl.zstd` 共 63 个文件，解析出 62 个用户轮次；其中 23 个会话、38 个轮次包含工具调用，合计 469 次调用、87 次错误。样本混合历史版本、验收问题和自然提问，不把 87/469 当作当前版本错误率。安全摘要见 `../artifacts/session-tool-audit-2026-09-15.json`，不含模型思考或系统全文。

| 重复失败族 | 历史调用/错误 | 本轮判断 |
| --- | --- | --- |
| 证据抽取 | 35 / 17 | 结构与准入不能靠去掉依据绕过；本轮保留原准入，未声称全部历史抽取失败已消除 |
| 原文块读取 | 47 / 13 | 身份、分页、scan 与 materialize 的前置和限额必须公开 |
| 分析计算 | 32 / 9 | 巨型多操作 schema 分散注意力；常见成果区间计算拆出，其余用具名数量输入 |
| Topic 更新 | 16 / 9 | 既有结构不透明，也有任务意图越界；同时收紧入口和补嵌套协议 |
| 研究关联读取 | 14 / 5 | 明确 ID 类型及读写语义，不以历史失败次数直接删除能力 |

**初步裁决与实现。**

- 普通深度研究保留 Topic 读取、公司 Wiki 读取及原文证据积累；移除 Topic route/update/挂卡写工具。深入分析本身不构成持续议题授权。
- “我的研究”新增用户显式发起入口，保留原问题调用已有 Backend route；展示匹配候选，只有 Backend 返回允许条件才提供另建选择。创建不启动定时任务，不改既有 Topic 类型或持久化。
- 已绑定 Topic 会话仅允许向同一对象更新、挂卡、写入搜索/Radar 状态与加入草案。新问题从有效绑定恢复活动身份；失败或中止不撤销此前已成功写入。
- 新增 `stock_calculate_market_result`，直接引用保存成果和多个日期窗口。通用计算由 14 个操作降为 13 个，使用具名 typed Quantity 数组适配现有 Backend 请求，拒绝缺失、重复和无关参数。
- Topic/Tracking/PageSpec 补齐 nested required、enum、引用类型及副作用说明；区分 `ext:` 搜索结果和 `result:` 持久成果。结构错误在 fetch 前汇总，存在性和证据有效性仍由 Backend 校验。
- 原文读取公开分页/数量/字符限额、固定文档版本和当轮 scan 前置；行情公开尺度身份、Radar 默认窗口、搜索次数成本和错误语义。skill/example ID 从实际目录生成枚举。
- 七项 Wiki 导航保留：历史已有关系查询用途，不因低使用量删除；精简管理/跨源/已删除/版本等输入，核心 Wiki 内容沿正式读取工具，图遍历限深。

**工具定义体积。** 旧真实请求 32 项、85,039 字符；修改后由实际 DSH ToolRuntime 注册生成普通研究 30 项、33,900 字符，约减少 60%；我的研究 38 项、44,117 字符。通用计算 schema 从 63,148 降至 12,694 字符，约减少 80%。这是定义长度，不是模型注意力或质量提升测量。新清单 `../artifacts/tool-audit-after-2026-09-15.json` 的 Wiki 部分沿已捕获上游 schema 映射，尚非新模型请求采样。

**运行证据。**

- Stock-Research `dsh`: `pnpm test`，构建及 69/69 测试通过；覆盖真实 DSH 工具注册、非法请求不 fetch、角色/绑定门禁、计算适配、Topic/PageSpec 正反例和后台复核隔离。业务返回多数使用 fixture。
- 真实 Backend：通过构建后的 DSH 工具读取川投能源既有行情成果 243 行，计算两个窗口，再读输入确认完全未变；没有再次取行情、出图、建 Topic。见 `../artifacts/tool-audit-backend-smoke-2026-09-15.json`。这证明真实已保存成果路径可用，不等于模型会自行选择该路径。
- 前端构建通过；议题相关 14/14 测试通过，包含纯函数状态映射、mock HTTP 失败不重发/归档候选不创建，以及组件取消逻辑的源码断言。浏览器实际打开 `/my-research`，确认发起表单、禁用空提交、既有议题列表正常显示；未提交生产 Topic。持久创建、离页取消运行效果和最终视觉接受仍不在本次证明内。

**独立代码审查。** 发现并修复：归档匹配漏检、关联 proposal 跨 Topic 门禁遗漏、actual Quantity 缺 source 时仍发送 Backend。归档首次发起先按原问题 GET 检索，返回候选后由用户选取 matched ID，读取失败不创建；这只是文本检索，不保证语义查重。Wiki 关联 proposal 保持现有独立确认流程；Topic proposal 只可指向当前绑定。实际数量缺 source 在 fetch 前拒绝，forecast/利率假设保持合法。

审查后另用真实 Backend 验证 actual Quantity：从上述成果选择 open/close 两个 cell，以返回的 object_id、交易日及原始单位调用 align，收到两个 `saved_cell_verified` 及 `evidence_status=bound`。沿现有接口保存了一份确定性计算回执，未写 Fact/Wiki/Topic。结果读取补回 object_id，计算协议公开市场/财务 cell 的单位和身份对应，避免模型靠 422 猜轴。回执保存在同一 Backend smoke artifact。

独立复核确认上述三项修复成立，当前有界改动无阻塞残余；复核者实际执行 DSH 定向 12/12 与 UI 入口 6/6 通过。最终主线程整合回归为 DSH 69/69、前端议题相关 14/14；不把这些数字当作新模型端到端通过率。

**残余范围。** 本轮不将两张 K 线归因于单一原因：此前华能轨迹是错误日期后重新生成；只读成果不出图已成立，但新工具收敛不等于日期依赖行为已获模型验收。来源失败、历史抽取合法性、回答质量、延迟、图表次数仍需固定同条件的新模型多会话验收。未重启正在使用的 DSH 服务，不能声称内存里的旧会话已加载新协议；没有提交、push、生产 Topic 清理或 Backend 准入改动。
