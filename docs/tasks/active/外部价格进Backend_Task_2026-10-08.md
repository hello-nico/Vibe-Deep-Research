# 外部价格进 Backend（大宗商品与宏观价格）

状态：2026-10-08 Claude 写定，用户确认第一批范围；2026-10-09 修订后待派发。执行方只跑自动检查；不提交、不 push、不重建容器（由用户执行）。实施仓库：Stock-Research（`backend/`、`dsh/`）。
修订 1（2026-10-09）：用户确认数据归属与 gbrain 退役方向，provider 快照改由 Backend 自存并从 gbrain 回填，并入本 Task（目标 3、E7–E10）。旧写法见过程记录。
修订 2（2026-10-09）：第一轮审阅后，美债来源不可用、Vibe 成果卡片单位写死；范围加入 Vibe `ResearchResult` 单位显示（E12）与美债替代来源（E11），冒烟不限次数。旧写法见过程记录。

权威：[Human Checklist](../../../human-checklist.md)「资料、来源与数据能力」（外部价格接入同一行情成果链）与「系统职责与数据归属」（provider 快照由 Backend 自存）；[数据归属与 gbrain 退役](../../decisions/proposed/数据归属与gbrain退役_讨论记录_2026-10-09.md) §2③、§6；不变量 1（数字回到真实证据）。

## 1. 目标

1. 把第一批外部价格接入 Backend 行情体系，让 Agent 能够观察、出图、计算这些价格，并把它们作为跟踪条件的数据来源。
2. 外部价格与 A 股行情同样产生不可修改、可回读的成果。
3. `provider:` 引用的回读不再依赖 gbrain：Backend 在返回取数结果时自存快照，历史快照从 gbrain 一次性回填。

## 2. 现状（Claude 核实）

- Backend 行情体系：`backend/app/market/` 下有 provider 注册表（`registry.py` 的 `observe_market`，`bootstrap.py` 按名称注册，已有 `market.hithink` / `market.composite` / `market.eastmoney` / `market.fixture`；`composite` 把个股、行业、大盘分给不同的 provider）。
  请求模型 `definition.py:107` 的 `MarketObserveRequest` 只支持 `symbol`（个股）、`industry_code`（申万行业）、`market_benchmark_id`（大盘基准）三种尺度。行情成果在 `services/market_result.py`（`generate_market_result`），区间计算在 `services/market_result_analysis.py`（`calculate_market_result`）。
- Agent 工具：`observe_market` 的描述是 "an exchange-qualified A-share, a canonical Shenwan industry index, or a broad-market benchmark"，看不到任何外部价格。
- 产品本地取数目录 `Vibe datasources/CATALOG.md` 中已有：`cn_commodity_futures`（新浪连续合约：沪铜、沪锡、沪铝、沪镍、工业硅；akshare `futures_zh_daily_sina`，无需密钥）、`treasury_yield_curve`（美国财政部，1M–30Y）。这些都在产品本地，Backend 用不到；可以作为数据源的参考，不要求复用其代码。
- `provider:` 引用（2026-10-09 核实）：由 `services/provider_refs.py` 按来源、代码、指标、取数时点、数值、单位、口径计算内容哈希；取数结果只在会被覆盖的缓存 `tmp/company-financials/*.json`。
  只有被写进 Wiki 页并发布的条目才留在 gbrain `page_versions`；`/refs/resolve`（`api/v1/wiki.py:597`）与跟踪项写入校验（`:1059`）都只经 `GBrainAdapter.provider_snapshot` 解析。
  现存引用：会话 678 条（149 个会话）、Wiki 页 339、Wiki 报告 292、草案 83、记忆 58。成果表 `research_results` 与 alembic 迁移可沿用。
- 2026-10-08 国庆外盘那次会话中，伦铝、氧化铝、黄金、美元、美债的数字都只能来自外部网页，无法出图，也无法作为跟踪条件。

## 3. 冻结决定

E1. **第一批范围**：
- 国内期货（主力连续）：铝、氧化铝、铜、黄金、白银、原油、螺纹钢、动力煤或焦煤（以数据源实际可得的为准，在回填中说明）；
- 海外：LME 铝、LME 铜、COMEX 黄金；
- 宏观：美元指数、10 年期美债收益率。

港股、美股不在本 Task 范围内。
E2. **新增一种行情尺度**（例如"外部价格序列"），使用规范标识（如 `cmdty:SHFE.AL`、`macro:DXY`，具体命名由执行方定）。每个序列登记名称、单位、币种、交易所或来源、频率、口径（结算价 / 收盘价、主力连续 / 指定合约）。未登记的标识直接拒绝，不做猜测。
E3. 新增 provider，挂进现有注册表和 `composite` 的分派；数据源优先选择公开、无需密钥的来源（如 akshare 对应接口、美国财政部），每个序列在登记里写明来源。不得把 Backend 凭据或密钥暴露给插件。
E4. **复用现有成果链**：`observe_market`、`generate_market_result`、`calculate_market_result` 支持新尺度。成果保存来源、时点（`fetched_at`、交易日）、单位、口径，与 A 股行情同样不可修改、可以回读。成果卡片在"图表｜数据"中显示单位与口径。
E5. 工具描述同步更新，说明可以观察哪些外部序列，以及标识的写法。允许插件提供一个列出已登记序列的只读能力（或写在描述里），以便推荐工具判断"指标是否有数据来源"。
E6. 失败语义：来源不可用时返回明确的缺口（哪个序列、什么原因），不回退到网页数字，也不编造数据。非交易日按最近交易日返回，并标明实际日期。

E7. **provider 快照自存**：Backend 新增只追加的快照表（alembic 迁移），以 `provider:` 引用为键，保存来源、代码、指标、取数时点、数值、单位、口径与入库时间。
公司财务与估值取数（`company_financials` 等产生 `provider:` 引用的路径）在把结果返回给调用方之前写入；同一引用重复写入幂等，内容不同则拒绝并报错。不改变 `provider_ref` 的计算方式，已有引用必须保持可解析。
E8. **解析改道**：`/refs/resolve` 与跟踪项写入校验改为只查快照表；移除对 `GBrainAdapter.provider_snapshot` 的调用。找不到时返回现有的 `provider_snapshot_not_found_or_ambiguous`。
E9. **一次性回填**：新增幂等脚本，从 gbrain `pages` 与 `page_versions` 的 frontmatter 中按现有 `unique_provider_snapshot` 规则取出全部 provider 条目写入快照表；同一引用出现不同内容时记为歧义、不写入。
脚本先以只读预演输出统计（总数、可写入、歧义、已存在），再正式写入；写入行标记来源为回填，便于回滚。
E11. **美债替代来源**：美国财政部旧接口返回 404、FRED 在当前网络不可达；改用国内可访问、无需密钥的公开来源（如东方财富、新浪的美国 10 年期国债收益率），在登记表写明来源与口径。
E12. **成果卡片单位**：Vibe `desktop/src/verticals/finance/components/ResearchResult.tsx` 的价格轴与表头按成果保存的单位与口径显示，不写死"元"；A 股行情显示不变。
E10. **核对不倒退**：回填前后各统计一次会话、Wiki 页、报告、草案、记忆中出现的唯一 `provider:` 引用可解析数；回填后不得少于回填前。只统计引用与计数，不读对话正文。

## 4. 范围

Vibe `ResearchResult.tsx` 及其测试（E12）；Stock `backend/app/market/`（新尺度、新 provider、登记表）、`backend/app/services/market_result*.py`、相关接口与测试；provider 快照表的 alembic 迁移、写入点（`services/company_financials.py` 等）、`services/ref_resolver.py` 与 `api/v1/wiki.py` 的两处解析、回填脚本及其测试；
`dsh/src/` 中行情相关工具的描述与参数；模型可见面快照中涉及这些工具的角色（差异只能是这几个工具的描述与参数）。

## 5. 验收

**执行方自动检查**
- Backend：`uv run pytest` 跑相关测试并通过。新增测试使用固定夹具（不联网），覆盖：登记表校验、未登记标识被拒、新尺度的观察、出图、区间计算、来源不可用时的缺口返回、非交易日的处理。
- provider 快照新增测试（固定夹具）：取数后快照入表；同一引用幂等、内容冲突被拒；解析在 gbrain 不可用时仍成功；回填脚本对含歧义的夹具输出正确统计并跳过歧义项；回滚只删除回填行。
- 另写一个联网冒烟脚本（不进 CI），逐个拉取第一批序列的最近 30 天数据，结果写进回填：每个序列是否可得、最新日期、单位。修正后可重跑，以最后一次为准。
- Vibe：`npm run typecheck --prefix desktop` 与 E12 相关测试通过；新增用例覆盖外部价格成果显示保存的单位、A 股成果仍显示"元"。
- Stock `dsh/` 下 `pnpm test` 通过；快照差异只涉及行情工具的描述与参数，并在回填中贴出。
- Vibe 根目录 `node scripts/verify-docs.mjs` 通过。

**执行方回填**：登记表全文（标识、名称、单位、来源、口径）；联网冒烟结果；不可得的序列及替代方案；回填脚本的预演与正式统计；E10 前后可解析数；改动文件清单。

**用户验收（由用户重建 Backend 并重启工作台）**
1. 在深度对话中问"国庆期间伦铝和沪铝走势如何"，回答里有伦铝、沪铝的行情图（单位、口径、日期正确），数字能点回成果。
2. 打开一个旧会话里带公司财务数字的回答，点数字能回到当时的取数快照；新问一次公司财务问题，数字同样能点回。

## 6. Out of Scope

港股、美股；分钟级行情；期货指定合约与换月细节（只做主力连续）；跟踪的定期检查与推送；产品本地取数层的改造；
gbrain 其余职责（搜索、页面链接、发布管线）与 Wiki 迁移（归数据归属迁移 Task）；`provider:` 以外的引用类型。

## 7. Stop Conditions

- 第一批中超过一半的序列找不到公开、无需密钥的稳定来源：停下，回填可得情况，由用户决定是否引入付费源。
- 新尺度需要改变现有 A 股、行业、大盘行情的语义或成果格式：停下。
- 需要把密钥交给插件或产品前端：停下。

- 回填预演中歧义项超过总数的 5%，或 E10 回填后可解析数少于回填前：停下回填，不切换解析路径。
- 自存需要改变 `provider_ref` 的计算方式或已有引用格式：停下。

## 8. 回滚

从注册表移除新 provider 与新尺度，恢复工具描述与快照；已保存的外部价格成果保留，只读。
provider 快照：解析改回 `GBrainAdapter.provider_snapshot`；删除标记为回填的行；快照表本身保留只读（迁移不回退，避免丢失新写入的快照）。

## 9. 当前交接

1. 状态与结论：第一轮实施通过 Claude 审阅；E7–E10 正式上线前三步已由 Claude 完成。修订 2 后待派发第二轮（E11 美债、E12 单位显示）。
2. 改动文件：Stock 第一轮 34 个文件（清单见过程记录），未提交；数据库迁移到 `0012_provider_snapshots`；`provider_snapshots` 表写入 551 行（来源标记 `gbrain_backfill`）。
3. 证据：（真实）Claude 复跑 Backend 指定 12 文件 97 passed、DSH 240 passed；冒烟重跑 12/13 可用（国内 8 项最新 10-08，LME 铝铜、COMEX 金、美元指数最新 10-09），美债失败。
   迁移 `0011 → 0012` 成功；回填预演 551 可写、0 歧义；正式写入 551；E10 回填后：会话 259/259、Wiki 339/339、报告 292/292、草案 83/83、记忆 58/58，均不减少；重跑预演显示 551 已存在。
4. 与规格的偏差及理由：第一轮冒烟"只跑一次"为 Claude 提示词限制，已由 Claude 重跑补足。会话中 453 条唯一引用有 194 条回填前后都不可解析（从未写入 Wiki 版本），属旧机制历史缺口，非本次造成。
5. 未覆盖的缺口：美债来源（E11）；成果卡片单位（E12）；运行中的 Backend 仍是旧代码，解析改道与实时自存待重建后生效；真实模型与产品验收未做。
6. 下一步谁做什么：执行方做第二轮 E11、E12 → Claude 审阅 → 用户重建 Backend 容器并重启工作台，按 §5 用户验收两项核对。
