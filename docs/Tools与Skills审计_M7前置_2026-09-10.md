# M7 前置 · Tools 与 Skills 设计审计

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
