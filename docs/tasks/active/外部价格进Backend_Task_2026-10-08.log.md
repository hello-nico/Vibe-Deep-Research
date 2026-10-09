

## 2026-10-09 阶段 D 迁移前完整文本

旧规格与历轮交接原文完整保存；SHA-256：`e4d0233fb2fd73bac259189f4a72ce8933cd084de97be5bc7fc50e09eea07ab1`。

~~~~~markdown
# 外部价格进 Backend（大宗商品与宏观价格）

状态：2026-10-08 Claude 写定，用户确认第一批范围；待派发，可以和[深挖行为与一类推荐 Task](深挖行为与一类推荐_Task_2026-10-08.md)并行。执行方只跑自动检查；不提交、不 push、不重建容器（由用户执行）。实施仓库：Stock-Research（`backend/`、`dsh/`）。

权威：[Human Checklist](../../../human-checklist.md)「深度对话的输入分型与"每轮一类推荐"（2026-10-08）」（观察指标必须包含外部价格，并列出第一批范围；外部价格接入 Backend，与 A 股行情同一套行情成果）；不变量 1（数字回到真实证据）。

## 1. 目标

把第一批外部价格接入 Backend 行情体系，让 Agent 能够观察、出图、计算这些价格，并把它们作为跟踪条件的数据来源。

## 2. 现状（Claude 核实）

- Backend 行情体系：`backend/app/market/` 下有 provider 注册表（`registry.py` 的 `observe_market`，`bootstrap.py` 按名称注册，已有 `market.hithink` / `market.composite` / `market.eastmoney` / `market.fixture`；`composite` 把个股、行业、大盘分给不同的 provider）。请求模型 `definition.py:107` 的 `MarketObserveRequest` 只支持 `symbol`（个股）、`industry_code`（申万行业）、`market_benchmark_id`（大盘基准）三种尺度。行情成果在 `services/market_result.py`（`generate_market_result`），区间计算在 `services/market_result_analysis.py`（`calculate_market_result`）。
- Agent 工具：`observe_market` 的描述是 "an exchange-qualified A-share, a canonical Shenwan industry index, or a broad-market benchmark"，看不到任何外部价格。
- 产品本地取数目录 `Vibe datasources/CATALOG.md` 中已有：`cn_commodity_futures`（新浪连续合约：沪铜、沪锡、沪铝、沪镍、工业硅；akshare `futures_zh_daily_sina`，无需密钥）、`treasury_yield_curve`（美国财政部，1M–30Y）。这些都在产品本地，Backend 用不到；可以作为数据源的参考，不要求复用其代码。
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

## 4. 范围

Stock `backend/app/market/`（新尺度、新 provider、登记表）、`backend/app/services/market_result*.py`、相关接口与测试；`dsh/src/` 中行情相关工具的描述与参数；模型可见面快照中涉及这些工具的角色（差异只能是这几个工具的描述与参数）。

## 5. 验收

**执行方自动检查**
- Backend：`uv run pytest` 跑相关测试并通过。新增测试使用固定夹具（不联网），覆盖：登记表校验、未登记标识被拒、新尺度的观察、出图、区间计算、来源不可用时的缺口返回、非交易日的处理。
- 另写一个联网冒烟脚本（不进 CI），逐个拉取第一批序列的最近 30 天数据，结果写进回填：每个序列是否可得、最新日期、单位。
- Stock `dsh/` 下 `pnpm test` 通过；快照差异只涉及行情工具的描述与参数，并在回填中贴出。
- Vibe 根目录 `node scripts/verify-docs.mjs` 通过。

**执行方回填**：登记表全文（标识、名称、单位、来源、口径）；联网冒烟结果；不可得的序列及替代方案；改动文件清单。

**用户验收（由用户重建 Backend 并重启工作台）**：在深度对话中问"国庆期间伦铝和沪铝走势如何"，回答里有伦铝、沪铝的行情图（单位、口径、日期正确），数字能点回成果。

## 6. Out of Scope

港股、美股；分钟级行情；期货指定合约与换月细节（只做主力连续）；跟踪的定期检查与推送；产品本地取数层的改造。

## 7. Stop Conditions

- 第一批中超过一半的序列找不到公开、无需密钥的稳定来源：停下，回填可得情况，由用户决定是否引入付费源。
- 新尺度需要改变现有 A 股、行业、大盘行情的语义或成果格式：停下。
- 需要把密钥交给插件或产品前端：停下。

## 8. 回滚

从注册表移除新 provider 与新尺度，恢复工具描述与快照；已保存的外部价格成果保留，只读。

## 9. 执行回填

（执行方填写；Claude 审阅补记写在「9.x Claude 审阅与补修」。）

~~~~~

### 迁移记录

只在现有句号/分号后机械折行，规格去空白逐字相等；旧规格行数 60，迁移后 61。§9 覆盖为六字段。未运行产品验收，证据等级：真实文本检查。
