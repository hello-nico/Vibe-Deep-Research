

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


## 修订 1（2026-10-09）旧写法

- 状态行：2026-10-08 Claude 写定，用户确认第一批范围；待派发，可以和[深挖行为与一类推荐 Task](深挖行为与一类推荐_Task_2026-10-08.md)并行。执行方只跑自动检查；不提交、不 push、不重建容器（由用户执行）。实施仓库：Stock-Research（`backend/`、`dsh/`）。
- 权威：Human Checklist「深度对话的输入分型与"每轮一类推荐"（2026-10-08）」；不变量 1。
- §1：单一目标"把第一批外部价格接入 Backend 行情体系……作为跟踪条件的数据来源"。
- §9：待派发；原文没有实施回填，本次只迁移为规格、当前交接和同名过程记录。

## 2026-10-09 窗口 1：Codex 实施与交接

结论：代码与自动回归交付，外部来源真实可用性及 E4 产品显示未闭合；provider 历史回填仅预演，没有正式写入。用户明确要求不提交、不 push、不重建容器、不重启服务，本轮均遵守。未执行迁移，也未读取或打印 .env、凭据、个人配置或连接串。

### 范围与事实

- 完整读取 Task（含修订1）、Vibe AGENTS/task-protocol、Stock AGENTS/README/backend README；结合当前 Checklist、不变量与成果契约实施。应用 task-driven-dev 技能，但 Checklist 和交接以两仓协议为准，不采用技能中旧的追加式 Checklist 规则。
- 工作区为 Stock 主目录；无分支、暂存、提交、push、容器重建或服务重启。用户既有 backend/app/services/citation_{numbers,semantic_check}.py、对应测试、backend/pyproject.toml、backend/uv.lock，以及已有 untracked 产物均未修改。
- 财务与估值的非空结果返回前写入只追加表；同引用幂等、冲突拒绝并整批回滚。快照内容去掉 stale，与 unique_provider_snapshot 规则一致；provider_ref 源码和算法未修改。
- /refs/resolve 与 tracking 校验共用仅查 Backend 表的回调；缺条目仍为 provider_snapshot_not_found_or_ambiguous。存储错误返回明确错误码，不依赖 gbrain 回读。当前运行服务未切换，迁移和回填需先完成再切换。
- 回填脚本默认 PostgreSQL 连接强制只读，读取 pages/page_versions frontmatter，不读 compiled_truth。会话统计流式解压，只提取 provider 引用；报告/草案/记忆也只提取引用，正文不输出到模型或日志。E10 的 Wiki 范围为当前活跃页，旧解析仍考虑对应页历史版本。
- 本轮只有快照规划访问真实 PostgreSQL；新增保存/回滚/成果测试使用显式临时 SQLite 和固定 HTTP 夹具，不能证明生产迁移、授权、并发或真实服务持久化。未跑全量 Backend 测试，没有安装运行环境或同步依赖。

### 登记表全文

全表频率为 daily；来源均公开无需密钥。国内采用新浪主力连续未复权收盘，煤类登记焦煤；不登记动力煤替代项，不静默切换序列。

| 标识 | 名称 | 单位 | 币种 | 交易所/来源 | 取数来源与代码 | 口径 |
|---|---|---|---|---|---|---|
| cmdty:SHFE.AL | 沪铝 | 元/吨 | CNY | SHFE | sina.domestic / AL0 | 主力连续，未复权，收盘价 |
| cmdty:SHFE.AO | 氧化铝 | 元/吨 | CNY | SHFE | sina.domestic / AO0 | 主力连续，未复权，收盘价 |
| cmdty:SHFE.CU | 沪铜 | 元/吨 | CNY | SHFE | sina.domestic / CU0 | 主力连续，未复权，收盘价 |
| cmdty:SHFE.AU | 沪金 | 元/克 | CNY | SHFE | sina.domestic / AU0 | 主力连续，未复权，收盘价 |
| cmdty:SHFE.AG | 沪银 | 元/千克 | CNY | SHFE | sina.domestic / AG0 | 主力连续，未复权，收盘价 |
| cmdty:INE.SC | 原油 | 元/桶 | CNY | INE | sina.domestic / SC0 | 主力连续，未复权，收盘价 |
| cmdty:SHFE.RB | 螺纹钢 | 元/吨 | CNY | SHFE | sina.domestic / RB0 | 主力连续，未复权，收盘价 |
| cmdty:DCE.JM | 焦煤 | 元/吨 | CNY | DCE | sina.domestic / JM0 | 主力连续，未复权，收盘价 |
| cmdty:LME.AL | LME 铝 | 美元/吨 | USD | LME | sina.foreign / AHD | 3个月期货，新浪日线收盘价 |
| cmdty:LME.CU | LME 铜 | 美元/吨 | USD | LME | sina.foreign / CAD | 3个月期货，新浪日线收盘价 |
| cmdty:COMEX.GC | COMEX 黄金 | 美元/金衡盎司 | USD | COMEX | sina.foreign / GC | 新浪连续期货日线收盘价，非指定合约 |
| macro:DXY | 美元指数 | 指数点 | USD | ICE | eastmoney.index / 100.UDI | 美元指数日线收盘点位，非期货合约 |
| macro:UST10Y | 10年期美债收益率 | % | USD | 美国财政部 | treasury / BC_10YEAR | 每日国债平价收益率，百分数，非债券价格 |

来源契约参考：本地现有 akshare futures_foreign.py、futures_zh_sina.py、index_global_em.py，以及 [AKShare 国内日线实现](https://github.com/akfamily/akshare/blob/master/akshare/futures/futures_zh_sina.py)、[海外映射实现](https://github.com/akfamily/akshare/blob/master/akshare/futures/futures_hq_sina.py)。HTTP 访问设置超时，不加载网页数字，也不执行上游内容。正常收盘序列沿原 PricePoint/ScaleSeries 成果计算；真实异常 OHLC 只移除该条开高低并标缺口，保留有效原收盘值，不修造高低点。

### 一次联网冒烟与局部停止

工作目录 `/Users/apple/ts/src/Stock-Research/backend`：

```sh
uv run --no-sync python scripts/smoke_external_prices.py > /private/tmp/t3-external-smoke.jsonl
```

退出2；13项全部失败、最新日期全部为 null。8项国内 KeyError、LME 铝/铜与COMEX黄金及美元指数 ValidationError、美债 HTTPStatusError。逐项原输出附后。这里不能把失败数误写为“13个公开源不存在”：已确认的部分失败由本地解析造成，来源稳定性未证明。脚本的 stop_condition=true 是本轮实时验收停止信号，外部子项保守暂停，没有选择付费源、引入替代源或再次运行冒烟脚本。

代表性源码/接口诊断（不属于第二次整轮冒烟）：国内 AL0 的实际字典键为 d/o/h/l/c/v/p/s；海外 AHD 键为 date/open/high/low/close/volume/position/s，历史2020-04-03存在 OHLC 一致性校验失败。诊断只输出键名、错误字段与日期，不输出价格序列。由此做一次确定性修正，并新增短字段及异常 OHLC 回归夹具。修正后的真实可得性没有重跑，DXY 校验原因、美债 HTTP 状态仍待后续核实。

未启用替代方案：国内与海外先核对修正后的同一公开源；DXY 可由 Claude 评估公开指数源，美债可核对财政部端点或评估公开 FRED DGS10。均未接线、未验证，不能据此宣称可用；也不能仅凭本轮解析失败建议付费。

### E9 / E10 真实只读预演

默认脚本强制只读；实际使用旧 Backend 容器现有环境，不传或打印连接串。为避免重建服务，将新脚本/两个新服务模块和仅含引用的清单打包到容器 `/tmp/t3-preflight`。未替换正在运行的 app 文件。

工作目录 `/Users/apple/ts/src/Stock-Research/backend`：

```sh
uv run --no-sync python scripts/provider_snapshot_inventory.py --sessions /Users/apple/ts/src/Vibe-Deep-Research/.local/dsh/sessions --workspace /Users/apple/ts/src/Stock-Research/workspace > /private/tmp/t3-provider-inventory.json
```

退出0。扫描271个压缩会话文件、88个报告文件、9个草案文件、4个记忆文件；仅保留去重引用，不输出正文。首次沙箱运行被 uv 缓存访问拒绝，随后通过授权提升运行同一命令。使用 --no-sync 是为了保留用户现有 pyproject.toml/uv.lock，不安装或更新依赖。

工作目录 `/Users/apple/ts/src/Stock-Research`，生成临时运行包（生成产物，无手工脚本改写源码）：

```sh
python3 -c 'import zipfile; from pathlib import Path; root=Path("/Users/apple/ts/src/Stock-Research/backend"); files=["app/services/provider_snapshots.py","app/services/provider_snapshot_backfill.py","scripts/backfill_provider_snapshots.py"]; z=zipfile.ZipFile("/private/tmp/t3-preflight.zip","w"); [z.write(root/p,p) for p in files]; z.write("/private/tmp/t3-provider-inventory.json","inventory.json"); z.close()'
docker compose exec -T backend python -c 'import io,sys,zipfile,runpy; root="/tmp/t3-preflight"; zipfile.ZipFile(io.BytesIO(sys.stdin.buffer.read())).extractall(root); sys.path.insert(0,root); import app.services; app.services.__path__.insert(0,root+"/app/services"); sys.argv=["backfill_provider_snapshots.py","--inventory",root+"/inventory.json"]; runpy.run_path(root+"/scripts/backfill_provider_snapshots.py",run_name="__main__")' < /private/tmp/t3-preflight.zip > /private/tmp/t3-backfill-dry-run.json
```

退出0；732份 frontmatter、唯一551、可写551、歧义0、已存在0；目标表未建立。首次预演把历史版本也计入 Wiki 引用范围（555唯一/551可解析），自查后修正成仅当前页，再运行只读预演，最终表如下。没有运行 --execute 或 --rollback；正式统计记“未执行”，不是0。

| 分类 | 本轮唯一引用数 | 回填前可解析 | 预计回填后可解析 | 实际正式后 |
|---|---:|---:|---:|---|
| 会话 | 453 | 259 | 259 | 未执行 |
| Wiki 当前页 | 341 | 339 | 339 | 未执行 |
| 报告 | 292 | 292 | 292 | 未执行 |
| 草案 | 83 | 83 | 83 | 未执行 |
| 记忆 | 58 | 58 | 58 | 未执行 |

会话剩余194、Wiki当前页剩余2个引用在这次 gbrain 规则下不可解析；回填没有伪造这些快照，也不会让它们自动可解析。派发时§2的678条/149会话是此前盘点口径，本轮去重453来自现有271文件范围，不冒充同一次观测。正式后必须重新采集引用清单并核对。

### 自动测试、门禁与快照审阅

Backend 工作目录 `/Users/apple/ts/src/Stock-Research/backend`，最终命令：

```sh
uv run --no-sync pytest -q tests/test_market_external.py tests/test_provider_snapshots.py tests/test_market_definition.py tests/test_market_composite.py tests/test_wiki_market_observe.py tests/test_research_results.py tests/test_company_financials.py tests/test_company_market_failover.py tests/test_tracking_suggestion_refs.py tests/test_ref_resolver.py tests/wiki/test_provider_snapshot.py tests/test_analysis_market_window.py > /private/tmp/t3-backend-final.log 2>&1
```

退出0；97 passed、1条既有 StarletteDeprecationWarning。首轮相同12文件95 passed，真实字段形状修正后97 passed；最后 API 回调/错误码收敛后又跑97 passed。固定夹具证明登记/参数拒绝、观察/非交易日、缺口、不可变成果保存回读与区间计算；临时SQLite证明顺序幂等、冲突整批回滚、腐败检测、财务/估值返回前保存、gbrain不可用时解析、歧义跳过与比例停止、只删回填行。没有生产PostgreSQL新表写入证据或真实模型/视觉验收。

DSH 工作目录 `/Users/apple/ts/src/Stock-Research/dsh`：

```sh
UPDATE_MODEL_SURFACE=1 pnpm test > /private/tmp/t3-dsh-update-test.log 2>&1
pnpm test > /private/tmp/t3-dsh-test.log 2>&1
pnpm test > /private/tmp/t3-dsh-final.log 2>&1
```

三次均退出0、240 passed；第一轮生成快照，后二轮标准模式核对快照（末轮因合并枚举重跑）。快照结构审阅：所有 sections、工具名及顺序保持一致；diff只涉及下面工具的描述/参数。没有刷新其他角色或绕过检查。

| 快照文件 | 改动工具 |
|---|---|
| company_research.json | calculate_market_result、generate_market_result |
| company_wiki.agent.json | observe_market |
| deep_research.json | calculate_market_result、generate_market_result、observe_market |
| my_research.json | calculate_market_result、generate_market_result、observe_market |

Vibe根目录分别运行 `node scripts/verify-docs.mjs`、`node scripts/verify-invariants.mjs`、`node scripts/verify-protocol.mjs`，均退出0并输出ok；Stock根目录 `node scripts/verify-protocol.mjs` 退出0。两仓 `git diff --check` 无输出退出0。过程末尾附最终回填后门禁结果。

审阅状态：执行方已核对实际diff、源字段诊断、快照结构和修改范围；Claude独立审阅尚未进行。本轮没有触碰被钉住抽取组件，不需要重新冻结；没有给旧六阶段、其他provider类型、网页数字 fallback 或新运行器开旁路。

### 本轮 Stock 改动文件（34个）

```text
backend/README.md
backend/alembic/versions/0012_provider_snapshots.py
backend/app/api/v1/research_results.py
backend/app/api/v1/wiki.py
backend/app/market/assemble.py
backend/app/market/bootstrap.py
backend/app/market/definition.py
backend/app/market/external_catalog.py
backend/app/market/providers/composite.py
backend/app/market/providers/external.py
backend/app/services/company_financials.py
backend/app/services/company_market.py
backend/app/services/market_result.py
backend/app/services/provider_snapshot_backfill.py
backend/app/services/provider_snapshots.py
backend/scripts/backfill_provider_snapshots.py
backend/scripts/provider_snapshot_inventory.py
backend/scripts/smoke_external_prices.py
backend/tests/conftest.py
backend/tests/test_company_financials.py
backend/tests/test_company_market_failover.py
backend/tests/test_market_external.py
backend/tests/test_provider_snapshots.py
backend/tests/test_tracking_suggestion_refs.py
dsh/src/observation-tools.mjs
dsh/src/research-material-tools.mjs
dsh/src/research-values.mjs
dsh/src/result-tools.mjs
dsh/test/observation-data.test.mjs
dsh/test/results.test.mjs
dsh/test/snapshots/model-surface/company_research.json
dsh/test/snapshots/model-surface/company_wiki.agent.json
dsh/test/snapshots/model-surface/deep_research.json
dsh/test/snapshots/model-surface/my_research.json
```

Vibe另改当前Task的§9并追加本.log.md，未动规格或其他窗口改动。未新增公开发布产物。临时产物为 `/private/tmp/t3-provider-inventory.json`、`t3-preflight.zip`、`t3-backfill-dry-run.json`、`t3-external-smoke.jsonl`、`t3-source-shape.jsonl` 和测试日志；仅包含引用、统计、公开源字段诊断或测试输出，下面嵌入最终输出以免依赖临时文件保留。

### 缺口、停止范围与下一步

- 外部源实时验收暂停，修正后0次整轮联网验证；不能称“13序列可用”。只有两个代表性新浪端点有真实字段诊断，未证明稳定获取最新30天数据。美元指数与美债需Claude先核实，不自动付费或替换标识。
- E4仍有产品缺口：Vibe `desktop/src/verticals/finance/components/ResearchResult.tsx` 价格轴写死“元”（约112行），计算输入表头也写死“收盘价（元）”（约152行）。本轮只写Stock backend/dsh，不扩大到Vibe显示层；payload columns/basis/unit已正确，不能以此替代真实UI验收。
- E7/E8为代码完成，0012迁移及其生产权限/持久化未验证；E9正式回填和E10实际后统计未执行。不要在空表状态先切换解析路径。用户确认后运维先应用迁移、回填并核对实际数量，再切换服务。
- 自存包含新引用与缓存返回的旧值；只读回填只恢复gbrain已有无歧义项，不为未保存历史数字编快照。取消/服务重启恢复、生产并发、模型推荐判断、旧/新会话点击和正确单位图表均未验收。
- Claude审阅实际diff并亲自重跑门禁；之后用户确认正式回填操作及进行服务/产品验收。执行方此轮停下，不自动提交或重启。
- 收尾三问：数据归属/引用算法决定已由Task与Checklist拥有，不另造新decision；本次可重复自动验收进入相关测试；真实源与显示缺口仍需后续证据，未为过关改不变量或绕过停止条件。

### 最终原始输出

<details>
<summary>Backend 最终指定测试（exit 0）</summary>

```text
........................................................................ [ 74%]
.........................                                                [100%]
=============================== warnings summary ===============================
.venv/lib/python3.12/site-packages/fastapi/testclient.py:1
  /Users/apple/ts/src/Stock-Research/backend/.venv/lib/python3.12/site-packages/fastapi/testclient.py:1: StarletteDeprecationWarning: Using `httpx` with `starlette.testclient` is deprecated; install `httpx2` instead.
    from starlette.testclient import TestClient as TestClient  # noqa

-- Docs: https://docs.pytest.org/en/stable/how-to/capture-warnings.html
97 passed, 1 warning in 0.35s
```

</details>

<details>
<summary>DSH 最终标准测试（exit 0）</summary>

```text
$ pnpm run build && node --test test/*.test.mjs
$ tsc -p tsconfig.json && node scripts/build-research.mjs
TAP version 13
# Subtest: 后台子代理入库与缺页维护继承公司范围，普通研究保持无绑定能力
ok 1 - 后台子代理入库与缺页维护继承公司范围，普通研究保持无绑定能力
  ---
  duration_ms: 13.888875
  type: 'test'
  ...
# Subtest: completed extraction survives failed correction; cancellation never finalizes
ok 2 - completed extraction survives failed correction; cancellation never finalizes
  ---
  duration_ms: 25.935375
  type: 'test'
  ...
# Subtest: handoff retains turn context after cancellation and a queued follow-up
ok 3 - handoff retains turn context after cancellation and a queued follow-up
  ---
  duration_ms: 9.57175
  type: 'test'
  ...
# Subtest: Wiki-only and market-only reads do not launch a review
ok 4 - Wiki-only and market-only reads do not launch a review
  ---
  duration_ms: 8.23125
  type: 'test'
  ...
# Subtest: review is detached, deduplicated and preserves old question evidence through new input
ok 5 - review is detached, deduplicated and preserves old question evidence through new input
  ---
  duration_ms: 5.04625
  type: 'test'
  ...
# Subtest: failed and incomplete research cannot launch children
ok 6 - failed and incomplete research cannot launch children
  ---
  duration_ms: 10.803166
  type: 'test'
  ...
# Subtest: corrected tool errors remain visible in the snapshot and do not block review
ok 7 - corrected tool errors remain visible in the snapshot and do not block review
  ---
  duration_ms: 3.566542
  type: 'test'
  ...
# Subtest: research task waits for ingest before review and retains the handoff until completion
ok 8 - research task waits for ingest before review and retains the handoff until completion
  ---
  duration_ms: 10.788292
  type: 'test'
  ...
# Subtest: ingest deadline reviews read material with a warning; empty and oversized snapshots record skip reasons
ok 9 - ingest deadline reviews read material with a warning; empty and oversized snapshots record skip reasons
  ---
  duration_ms: 5.210208
  type: 'test'
  ...
# Subtest: eligible snapshot is handed off before parent finalize returns
ok 10 - eligible snapshot is handed off before parent finalize returns
  ---
  duration_ms: 0.687042
  type: 'test'
  ...
# Subtest: a queued follow-up still hands off an eligible snapshot before reset
ok 11 - a queued follow-up still hands off an eligible snapshot before reset
  ---
  duration_ms: 6.995917
  type: 'test'
  ...
# Subtest: child failure is contained and closing host cancels outstanding child
ok 12 - child failure is contained and closing host cancels outstanding child
  ---
  duration_ms: 8.433125
  type: 'test'
  ...
# Subtest: oversize evidence is not silently truncated
ok 13 - oversize evidence is not silently truncated
  ---
  duration_ms: 4.129834
  type: 'test'
  ...
# Subtest: legacy review messages cannot enter a later model step
ok 14 - legacy review messages cannot enter a later model step
  ---
  duration_ms: 0.264292
  type: 'test'
  ...
# Subtest: four wiki prefixes and preference hints can start a snapshot
ok 15 - four wiki prefixes and preference hints can start a snapshot
  ---
  duration_ms: 0.434125
  type: 'test'
  ...
# Subtest: bound target is the only maintainable page; comparison pages stay read-only
ok 16 - bound target is the only maintainable page; comparison pages stay read-only
  ---
  duration_ms: 0.51125
  type: 'test'
  ...
# Subtest: candidate payload drops camelCase extras and wiki update keeps other research blocks
ok 17 - candidate payload drops camelCase extras and wiki update keeps other research blocks
  ---
  duration_ms: 0.192
  type: 'test'
  ...
# Subtest: proposal must match captured page and exact allowed references
ok 18 - proposal must match captured page and exact allowed references
  ---
  duration_ms: 0.969125
  type: 'test'
  ...
# Subtest: source ref with a mistyped sha is repaired only when document, revision and block match uniquely
ok 19 - source ref with a mistyped sha is repaired only when document, revision and block match uniquely
  ---
  duration_ms: 0.544709
  type: 'test'
  ...
# Subtest: native spawn adapter uses isolated structured result and disposes no-increment run
ok 20 - native spawn adapter uses isolated structured result and disposes no-increment run
  ---
  duration_ms: 0.669333
  type: 'test'
  ...
# Subtest: malformed settlement retries once with the same snapshot and task row
ok 21 - malformed settlement retries once with the same snapshot and task row
  ---
  duration_ms: 11.461291
  type: 'test'
  ...
# Subtest: two malformed results have Chinese summary and error code; other errors do not retry
ok 22 - two malformed results have Chinese summary and error code; other errors do not retry
  ---
  duration_ms: 9.708417
  type: 'test'
  ...
# Subtest: malformed correction retries once and keeps the original task identity
ok 23 - malformed correction retries once and keeps the original task identity
  ---
  duration_ms: 0.614084
  type: 'test'
  ...
# Subtest: one correction turns a conflicting review into an unpublished draft
ok 24 - one correction turns a conflicting review into an unpublished draft
  ---
  duration_ms: 11.837833
  type: 'test'
  ...
# Subtest: two invalid reviews fail once and record the correction error
ok 25 - two invalid reviews fail once and record the correction error
  ---
  duration_ms: 3.282792
  type: 'test'
  ...
# Subtest: draft rejection never publishes and always disposes child
ok 26 - draft rejection never publishes and always disposes child
  ---
  duration_ms: 1.513958
  type: 'test'
  ...
# Subtest: source blocks plus listed documents can settle without an accepted Wiki page
ok 27 - source blocks plus listed documents can settle without an accepted Wiki page
  ---
  duration_ms: 0.29725
  type: 'test'
  ...
# Subtest: stale running tasks are not displayed as success
ok 28 - stale running tasks are not displayed as success
  ---
  duration_ms: 0.052208
  type: 'test'
  ...
# Subtest: background task index records no-increment without copying DSH logs
ok 29 - background task index records no-increment without copying DSH logs
  ---
  duration_ms: 10.3175
  type: 'test'
  ...
# Subtest: company observation gaps can start settlement without already-read blocks
ok 30 - company observation gaps can start settlement without already-read blocks
  ---
  duration_ms: 1.349125
  type: 'test'
  ...
# Subtest: child-read blocks are valid Wiki draft evidence
ok 31 - child-read blocks are valid Wiki draft evidence
  ---
  duration_ms: 0.418375
  type: 'test'
  ...
# Subtest: later failure keeps already enqueued ingest jobs
ok 32 - later failure keeps already enqueued ingest jobs
  ---
  duration_ms: 6.666458
  type: 'test'
  ...
# Subtest: ingest poll failure still keeps the queued job id
ok 33 - ingest poll failure still keeps the queued job id
  ---
  duration_ms: 505.132833
  type: 'test'
  ...
# Subtest: each company missing a Wiki is opened separately
ok 34 - each company missing a Wiki is opened separately
  ---
  duration_ms: 5.23275
  type: 'test'
  ...
# Subtest: 越界入库请求跳过并继续整理，不令整次失败
ok 35 - 越界入库请求跳过并继续整理，不令整次失败
  ---
  duration_ms: 2.635167
  type: 'test'
  ...
# Subtest: refs already on the accepted page are allowed, lookup placeholders are not, and unknown refs are named
ok 36 - refs already on the accepted page are allowed, lookup placeholders are not, and unknown refs are named
  ---
  duration_ms: 0.202542
  type: 'test'
  ...
# Subtest: window guards compare calendar days, including alternate spellings
ok 37 - window guards compare calendar days, including alternate spellings
  ---
  duration_ms: 1.532417
  type: 'test'
  ...
# Subtest: the single protocol table adapts every generic operation to the existing Backend request
ok 38 - the single protocol table adapts every generic operation to the existing Backend request
  ---
  duration_ms: 4.074541
  type: 'test'
  ...
# Subtest: market result calculation restores the existing market_windows Backend request
ok 39 - market result calculation restores the existing market_windows Backend request
  ---
  duration_ms: 0.101708
  type: 'test'
  ...
# Subtest: protocol rejects missing, extra, duplicate, and empty inputs
ok 40 - protocol rejects missing, extra, duplicate, and empty inputs
  ---
  duration_ms: 0.402
  type: 'test'
  ...
# Subtest: actual quantities require a source while source-free forecasts and assumptions remain valid
ok 41 - actual quantities require a source while source-free forecasts and assumptions remain valid
  ---
  duration_ms: 0.1925
  type: 'test'
  ...
# Subtest: actual DSH schema is compact and documents typed operation inputs
ok 42 - actual DSH schema is compact and documents typed operation inputs
  ---
  duration_ms: 33.789667
  type: 'test'
  ...
# Subtest: invalid operation-specific arguments stop before fetch
ok 43 - invalid operation-specific arguments stop before fetch
  ---
  duration_ms: 22.031875
  type: 'test'
  ...
# Subtest: both calculation tools send the adapted Backend request
ok 44 - both calculation tools send the adapted Backend request
  ---
  duration_ms: 33.514875
  type: 'test'
  ...
# Subtest: today is a parameterless Shanghai calendar day
ok 45 - today is a parameterless Shanghai calendar day
  ---
  duration_ms: 18.338708
  type: 'test'
  ...
# Subtest: citationUri: 产品地址配置存在时输出依据深链，ref 原样编码
ok 46 - citationUri: 产品地址配置存在时输出依据深链，ref 原样编码
  ---
  duration_ms: 2.538
  type: 'test'
  ...
# Subtest: citationUri: 无配置/非法 origin/缺文件时回退 stock-ref，不虚构地址
ok 47 - citationUri: 无配置/非法 origin/缺文件时回退 stock-ref，不虚构地址
  ---
  duration_ms: 1.692792
  type: 'test'
  ...
# Subtest: citationUri: 非法引用明确失败
ok 48 - citationUri: 非法引用明确失败
  ---
  duration_ms: 0.355708
  type: 'test'
  ...
# Subtest: citationUri: source 原文块只在有产品地址时生成依据入口，不编码成 stock-ref
ok 49 - citationUri: source 原文块只在有产品地址时生成依据入口，不编码成 stock-ref
  ---
  duration_ms: 1.874833
  type: 'test'
  ...
# Subtest: document list and heading index use bounded Backend-only paths
ok 50 - document list and heading index use bounded Backend-only paths
  ---
  duration_ms: 3.214667
  type: 'test'
  ...
# Subtest: scan removes numeric content and returns only navigation previews
ok 51 - scan removes numeric content and returns only navigation previews
  ---
  duration_ms: 0.7005
  type: 'test'
  ...
# Subtest: missing pinned Block fails closed and does not return other requested Blocks
ok 52 - missing pinned Block fails closed and does not return other requested Blocks
  ---
  duration_ms: 0.474625
  type: 'test'
  ...
# Subtest: 404 without structured block_not_found is not rewritten as a missing pinned Block
ok 53 - 404 without structured block_not_found is not rewritten as a missing pinned Block
  ---
  duration_ms: 0.261708
  type: 'test'
  ...
# Subtest: range materialization requires the same turn scan and preserves pinned identity
ok 54 - range materialization requires the same turn scan and preserves pinned identity
  ---
  duration_ms: 0.508416
  type: 'test'
  ...
# Subtest: pinned identity drift fails closed before a Block is returned
ok 55 - pinned identity drift fails closed before a Block is returned
  ---
  duration_ms: 0.238083
  type: 'test'
  ...
# Subtest: HTTP failures preserve status, retry delay, partial receipts and unknown write outcomes
ok 56 - HTTP failures preserve status, retry delay, partial receipts and unknown write outcomes
  ---
  duration_ms: 21.601416
  type: 'test'
  ...
# Subtest: radar and market failure details survive actual DSH output rendering
ok 57 - radar and market failure details survive actual DSH output rendering
  ---
  duration_ms: 26.3525
  type: 'test'
  ...
# Subtest: all four report Wiki types return the pinned readable snapshot through DSH
ok 58 - all four report Wiki types return the pinned readable snapshot through DSH
  ---
  duration_ms: 16.866292
  type: 'test'
  ...
# Subtest: Topic conflict requires a read and never upgrades a supplied stale revision
ok 59 - Topic conflict requires a read and never upgrades a supplied stale revision
  ---
  duration_ms: 33.00875
  type: 'test'
  ...
# Subtest: a lost result receipt can be recovered with the same operation across new call IDs
ok 60 - a lost result receipt can be recovered with the same operation across new call IDs
  ---
  duration_ms: 23.016
  type: 'test'
  ...
# Subtest: bounds fail before HTTP and malformed Notes do not claim missing data
ok 61 - bounds fail before HTTP and malformed Notes do not claim missing data
  ---
  duration_ms: 26.71525
  type: 'test'
  ...
# Subtest: oversized report markup is rejected before HTTP
ok 62 - oversized report markup is rejected before HTTP
  ---
  duration_ms: 33.090958
  type: 'test'
  ...
# Subtest: cancellation remains cancellation, and a cancelled request is not started
ok 63 - cancellation remains cancellation, and a cancelled request is not started
  ---
  duration_ms: 0.831208
  type: 'test'
  ...
# Subtest: exports the canonical structured candidate schema and action guidance
ok 64 - exports the canonical structured candidate schema and action guidance
  ---
  duration_ms: 0.8885
  type: 'test'
  ...
# Subtest: registers only for page Agent mode and requires live exec identity
ok 65 - registers only for page Agent mode and requires live exec identity
  ---
  duration_ms: 5.607667
  type: 'test'
  ...
# Subtest: proposal derives role, Session and turn from live execution and keeps hook token out of the body
ok 66 - proposal derives role, Session and turn from live execution and keeps hook token out of the body
  ---
  duration_ms: 24.474167
  type: 'test'
  ...
# Subtest: rejects open-ended actions, extra args and mismatched typed targets before Backend
ok 67 - rejects open-ended actions, extra args and mismatched typed targets before Backend
  ---
  duration_ms: 2.947166
  type: 'test'
  ...
# Subtest: review re-reads frozen proposal, uniquifies labels and submits only native selections
ok 68 - review re-reads frozen proposal, uniquifies labels and submits only native selections
  ---
  duration_ms: 1.7285
  type: 'test'
  ...
# Subtest: custom text never authorizes an item and empty selection records explicit rejection
ok 69 - custom text never authorizes an item and empty selection records explicit rejection
  ---
  duration_ms: 1.867417
  type: 'test'
  ...
# Subtest: abort and next-turn answers cannot submit confirmation
ok 70 - abort and next-turn answers cannot submit confirmation
  ---
  duration_ms: 4.407167
  type: 'test'
  ...
# Subtest: terminal proposals do not ask again and binding/backend failures remain visible
ok 71 - terminal proposals do not ask again and binding/backend failures remain visible
  ---
  duration_ms: 1.207958
  type: 'test'
  ...
# Subtest: turn dispatch returns before pending provider, sends only typed text and previous answer
ok 72 - turn dispatch returns before pending provider, sends only typed text and previous answer
  ---
  duration_ms: 1.136541
  type: 'test'
  ...
# Subtest: background, child, non-user, and attachments never dispatch
ok 73 - background, child, non-user, and attachments never dispatch
  ---
  duration_ms: 0.113667
  type: 'test'
  ...
# Subtest: sync and async failures do not affect answering
ok 74 - sync and async failures do not affect answering
  ---
  duration_ms: 7.685125
  type: 'test'
  ...
# Subtest: previous answer text comes from assistant/message events without tool or reasoning parts
ok 75 - previous answer text comes from assistant/message events without tool or reasoning parts
  ---
  duration_ms: 0.50575
  type: 'test'
  ...
# Subtest: shared industry group: 毛利率/净利率
ok 76 - shared industry group: 毛利率/净利率
  ---
  duration_ms: 1.255875
  type: 'test'
  ...
# Subtest: shared industry group:  营收/ 归母净利润 /EPS 预测
ok 77 - shared industry group:  营收/ 归母净利润 /EPS 预测
  ---
  duration_ms: 0.189125
  type: 'test'
  ...
# Subtest: shared industry group: 装机容量 / 权益装机（水电/火电/新能源分类）
ok 78 - shared industry group: 装机容量 / 权益装机（水电/火电/新能源分类）
  ---
  duration_ms: 0.070166
  type: 'test'
  ...
# Subtest: shared industry group: 利用小时（风 / 光 / 火 / 水）
ok 79 - shared industry group: 利用小时（风 / 光 / 火 / 水）
  ---
  duration_ms: 0.050166
  type: 'test'
  ...
# Subtest: shared industry group: 装机容量/权益装机 (水电/火电)
ok 80 - shared industry group: 装机容量/权益装机 (水电/火电)
  ---
  duration_ms: 1.274083
  type: 'test'
  ...
# Subtest: shared industry group: 高速光模块出货量（百万只）与ASP（元）
ok 81 - shared industry group: 高速光模块出货量（百万只）与ASP（元）
  ---
  duration_ms: 0.082833
  type: 'test'
  ...
# Subtest: industry metrics validate the bound wiki_read group and label before staging
ok 82 - industry metrics validate the bound wiki_read group and label before staging
  ---
  duration_ms: 93.561083
  type: 'test'
  ...
# Subtest: metric tool enum is generated from the Backend admission policy; unsupported metrics fail before staging
ok 83 - metric tool enum is generated from the Backend admission policy; unsupported metrics fail before staging
  ---
  duration_ms: 25.662667
  type: 'test'
  ...
# Subtest: 模型可见面快照覆盖每个角色与模式，且没有多余的快照文件
ok 84 - 模型可见面快照覆盖每个角色与模式，且没有多余的快照文件
  ---
  duration_ms: 2.645583
  type: 'test'
  ...
# Subtest: 模型可见面：deep_research.json
ok 85 - 模型可见面：deep_research.json
  ---
  duration_ms: 40.882458
  type: 'test'
  ...
# Subtest: 模型可见面：company_research.json
ok 86 - 模型可见面：company_research.json
  ---
  duration_ms: 20.67225
  type: 'test'
  ...
# Subtest: 模型可见面：my_research.json
ok 87 - 模型可见面：my_research.json
  ---
  duration_ms: 36.265792
  type: 'test'
  ...
# Subtest: 模型可见面：wiki_report.json
ok 88 - 模型可见面：wiki_report.json
  ---
  duration_ms: 12.514375
  type: 'test'
  ...
# Subtest: 模型可见面：knowledge_settlement.json
ok 89 - 模型可见面：knowledge_settlement.json
  ---
  duration_ms: 7.070291
  type: 'test'
  ...
# Subtest: 模型可见面：market.ask.json
ok 90 - 模型可见面：market.ask.json
  ---
  duration_ms: 7.663625
  type: 'test'
  ...
# Subtest: 模型可见面：market.agent.json
ok 91 - 模型可见面：market.agent.json
  ---
  duration_ms: 5.288167
  type: 'test'
  ...
# Subtest: 模型可见面：intel.ask.json
ok 92 - 模型可见面：intel.ask.json
  ---
  duration_ms: 4.878292
  type: 'test'
  ...
# Subtest: 模型可见面：intel.agent.json
ok 93 - 模型可见面：intel.agent.json
  ---
  duration_ms: 9.263666
  type: 'test'
  ...
# Subtest: 模型可见面：industry_profile.ask.json
ok 94 - 模型可见面：industry_profile.ask.json
  ---
  duration_ms: 6.721208
  type: 'test'
  ...
# Subtest: 模型可见面：industry_profile.agent.json
ok 95 - 模型可见面：industry_profile.agent.json
  ---
  duration_ms: 7.101334
  type: 'test'
  ...
# Subtest: 模型可见面：company_wiki.ask.json
ok 96 - 模型可见面：company_wiki.ask.json
  ---
  duration_ms: 5.09375
  type: 'test'
  ...
# Subtest: 模型可见面：company_wiki.agent.json
ok 97 - 模型可见面：company_wiki.agent.json
  ---
  duration_ms: 9.2315
  type: 'test'
  ...
# Subtest: 模型可见面：industry_wiki.ask.json
ok 98 - 模型可见面：industry_wiki.ask.json
  ---
  duration_ms: 5.909291
  type: 'test'
  ...
# Subtest: 模型可见面：industry_wiki.agent.json
ok 99 - 模型可见面：industry_wiki.agent.json
  ---
  duration_ms: 20.46325
  type: 'test'
  ...
# Subtest: navigation failure reports once; native tools disappear after agent disposal
ok 100 - navigation failure reports once; native tools disappear after agent disposal
  ---
  duration_ms: 23.286834
  type: 'test'
  ...
# Subtest: role tools are visible only in their agent scope and plugin unload removes them
ok 101 - role tools are visible only in their agent scope and plugin unload removes them
  ---
  duration_ms: 55.049542
  type: 'test'
  ...
# Subtest: turn end does not wait for idle or enter runMaintenance
ok 102 - turn end does not wait for idle or enter runMaintenance
  ---
  duration_ms: 72.139417
  type: 'test'
  ...
# Subtest: renamed Backend and navigation calls inherit agent lifetime cancellation
ok 103 - renamed Backend and navigation calls inherit agent lifetime cancellation
  ---
  duration_ms: 42.558625
  type: 'test'
  ...
# Subtest: Wiki facts carry evidence links without changing the publication snapshot
ok 104 - Wiki facts carry evidence links without changing the publication snapshot
  ---
  duration_ms: 44.794708
  type: 'test'
  ...
# Subtest: saved market calculation forwards references and windows without copying rows
ok 105 - saved market calculation forwards references and windows without copying rows
  ---
  duration_ms: 16.840125
  type: 'test'
  ...
# Subtest: market observation retains intermediate points and drawdown method for analysis
ok 106 - market observation retains intermediate points and drawdown method for analysis
  ---
  duration_ms: 22.651792
  type: 'test'
  ...
# Subtest: external observation forwards registered identity and retains units and actual date
ok 107 - external observation forwards registered identity and retains units and actual date
  ---
  duration_ms: 16.255625
  type: 'test'
  ...
# Subtest: resolved references supply exact clickable targets but tuple-only references do not
ok 108 - resolved references supply exact clickable targets but tuple-only references do not
  ---
  duration_ms: 10.977667
  type: 'test'
  ...
# Subtest: installed DSH structured-output converter accepts the complete assessment schema
ok 109 - installed DSH structured-output converter accepts the complete assessment schema
  ---
  duration_ms: 20.771541
  type: 'test'
  ...
# Subtest: installed ToolRuntime empty global allow-list preserves later child-scoped structured output
ok 110 - installed ToolRuntime empty global allow-list preserves later child-scoped structured output
  ---
  duration_ms: 12.711542
  type: 'test'
  ...
# Subtest: all Stock research projection events opt into replay-safe ignorable envelopes
ok 111 - all Stock research projection events opt into replay-safe ignorable envelopes
  ---
  duration_ms: 0.236209
  type: 'test'
  ...
# Subtest: page maintenance child receives only the short frozen-snapshot discipline
ok 112 - page maintenance child receives only the short frozen-snapshot discipline
  ---
  duration_ms: 0.578042
  type: 'test'
  ...
# Subtest: turn-stopping awaits a native assessment and routes an implicit candidate through frozen proposal and review tools
ok 113 - turn-stopping awaits a native assessment and routes an implicit candidate through frozen proposal and review tools
  ---
  duration_ms: 4.358375
  type: 'test'
  ...
# Subtest: stale steering aborts the live review and records cancellation without a stale completion
ok 114 - stale steering aborts the live review and records cancellation without a stale completion
  ---
  duration_ms: 0.835792
  type: 'test'
  ...
# Subtest: child agents never assess or ask for page maintenance
ok 115 - child agents never assess or ask for page maintenance
  ---
  duration_ms: 0.192667
  type: 'test'
  ...
# Subtest: missing meaningful turn input records deterministic no_material without starting a child
ok 116 - missing meaningful turn input records deterministic no_material without starting a child
  ---
  duration_ms: 0.359125
  type: 'test'
  ...
# Subtest: assessment failures remain failures and are never audited as no_material
ok 117 - assessment failures remain failures and are never audited as no_material
  ---
  duration_ms: 0.442917
  type: 'test'
  ...
# Subtest: candidate bound is enforced after structured output without unsupported schema keywords
ok 118 - candidate bound is enforced after structured output without unsupported schema keywords
  ---
  duration_ms: 0.667958
  type: 'test'
  ...
# Subtest: an explicit proposal suppresses automatic duplication and the same turn snapshot is deduplicated
ok 119 - an explicit proposal suppresses automatic duplication and the same turn snapshot is deduplicated
  ---
  duration_ms: 0.164959
  type: 'test'
  ...
# Subtest: snapshot freezes the actual question, answer, read objects and source blocks
ok 120 - snapshot freezes the actual question, answer, read objects and source blocks
  ---
  duration_ms: 0.089375
  type: 'test'
  ...
# Subtest: actual installResearchTools registers each maintenance tool once and uses the injected root userQuestions service
ok 121 - actual installResearchTools registers each maintenance tool once and uses the injected root userQuestions service
  ---
  duration_ms: 77.203083
  type: 'test'
  ...
# Subtest: page read tools preserve graph filters and distinguish an empty existing graph
ok 122 - page read tools preserve graph filters and distinguish an empty existing graph
  ---
  duration_ms: 21.148959
  type: 'test'
  ...
# Subtest: research links require one filter and remain outside the fact graph
ok 123 - research links require one filter and remain outside the fact graph
  ---
  duration_ms: 5.715834
  type: 'test'
  ...
# Subtest: profile discovery filters existing identities without inferring NBS mappings
ok 124 - profile discovery filters existing identities without inferring NBS mappings
  ---
  duration_ms: 0.854708
  type: 'test'
  ...
# Subtest: source document discovery accepts exactly one Industry Wiki or Profile identity
ok 125 - source document discovery accepts exactly one Industry Wiki or Profile identity
  ---
  duration_ms: 0.652666
  type: 'test'
  ...
# Subtest: discipline file owns the full text, including tool routing
ok 126 - discipline file owns the full text, including tool routing
  ---
  duration_ms: 1.74375
  type: 'test'
  ...
# Subtest: DSH loads its packaged research discipline and preserves write boundaries
ok 127 - DSH loads its packaged research discipline and preserves write boundaries
  ---
  duration_ms: 0.392083
  type: 'test'
  ...
# Subtest: research routing preserves question-driven knowledge and time boundaries
ok 128 - research routing preserves question-driven knowledge and time boundaries
  ---
  duration_ms: 0.67575
  type: 'test'
  ...
# Subtest: public document schemas expose the runtime bounds and pinned identities
ok 129 - public document schemas expose the runtime bounds and pinned identities
  ---
  duration_ms: 29.3035
  type: 'test'
  ...
# Subtest: invalid public document requests fail locally without fetching
ok 130 - invalid public document requests fail locally without fetching
  ---
  duration_ms: 19.562291
  type: 'test'
  ...
# Subtest: public execute keeps bounded paging and exact non-contiguous Block results
ok 131 - public execute keeps bounded paging and exact non-contiguous Block results
  ---
  duration_ms: 49.126667
  type: 'test'
  ...
# Subtest: observation preflight rejects invalid dates, identities, and empty scale without fetching
ok 132 - observation preflight rejects invalid dates, identities, and empty scale without fetching
  ---
  duration_ms: 36.455833
  type: 'test'
  ...
# Subtest: market and Radar execute preserve legal requests and real Backend receipts
ok 133 - market and Radar execute preserve legal requests and real Backend receipts
  ---
  duration_ms: 13.949083
  type: 'test'
  ...
# Subtest: external search charges Backend failures but not local preflight failures
ok 134 - external search charges Backend failures but not local preflight failures
  ---
  duration_ms: 17.904834
  type: 'test'
  ...
# Subtest: cited library reference document:<id>/<revision>/<sha256> is accepted as documentId and split
ok 135 - cited library reference document:<id>/<revision>/<sha256> is accepted as documentId and split
  ---
  duration_ms: 15.75625
  type: 'test'
  ...
# Subtest: a bound report task registers only its four tools and publishes the pinned snapshot
ok 136 - a bound report task registers only its four tools and publishes the pinned snapshot
  ---
  duration_ms: 74.403167
  type: 'test'
  ...
# Subtest: a page revision newer than the bound snapshot fails the report read instead of rebinding
ok 137 - a page revision newer than the bound snapshot fails the report read instead of rebinding
  ---
  duration_ms: 17.22225
  type: 'test'
  ...
# Subtest: Topic report pins one Topic, reads only current basis pages and publishes its hash
ok 138 - Topic report pins one Topic, reads only current basis pages and publishes its hash
  ---
  duration_ms: 80.031041
  type: 'test'
  ...
# Subtest: a bound report task cannot retarget wiki_read via a different input_hash
ok 139 - a bound report task cannot retarget wiki_read via a different input_hash
  ---
  duration_ms: 29.464084
  type: 'test'
  ...
# Subtest: report sessions skip review and settlement entirely
ok 140 - report sessions skip review and settlement entirely
  ---
  duration_ms: 5.501042
  type: 'test'
  ...
# Subtest: a session bound mid-flight rebuilds with only report tools; re-binding refreshes the task identity
ok 141 - a session bound mid-flight rebuilds with only report tools; re-binding refreshes the task identity
  ---
  duration_ms: 20.634084
  type: 'test'
  ...
# Subtest: pending host bind is consumed on child create before any prompt
ok 142 - pending host bind is consumed on child create before any prompt
  ---
  duration_ms: 40.038417
  type: 'test'
  ...
# Subtest: citation_numbers_failed returns details to Agent and uses one shared retry credential
ok 143 - citation_numbers_failed returns details to Agent and uses one shared retry credential
  ---
  duration_ms: 37.043708
  type: 'test'
  ...
# Subtest: report_quality_failed returns details to Agent and uses one shared retry credential
ok 144 - report_quality_failed returns details to Agent and uses one shared retry credential
  ---
  duration_ms: 44.018917
  type: 'test'
  ...
# Subtest: content-empty rejection ends report task without retry
ok 145 - content-empty rejection ends report task without retry
  ---
  duration_ms: 11.967125
  type: 'test'
  ...
# Subtest: assistant text reads the installed DSH message envelope
ok 146 - assistant text reads the installed DSH message envelope
  ---
  duration_ms: 0.916833
  type: 'test'
  ...
# Subtest: delayed settlements retain each turn and share concurrent execution without stale notifications
ok 147 - delayed settlements retain each turn and share concurrent execution without stale notifications
  ---
  duration_ms: 120.192458
  type: 'test'
  ...
# Subtest: filter does not wait for settle, and a new question does not keep leftover candidates
ok 148 - filter does not wait for settle, and a new question does not keep leftover candidates
  ---
  duration_ms: 48.650292
  type: 'test'
  ...
# Subtest: DSH maintenance cancellation aborts finalization without consuming pending candidates
ok 149 - DSH maintenance cancellation aborts finalization without consuming pending candidates
  ---
  duration_ms: 41.260459
  type: 'test'
  ...
# Subtest: invalid support roles are rejected before staging and can be corrected in the same turn
ok 150 - invalid support roles are rejected before staging and can be corrected in the same turn
  ---
  duration_ms: 7.943084
  type: 'test'
  ...
# Subtest: metric extraction stages after its materialized source block is touched
ok 151 - metric extraction stages after its materialized source block is touched
  ---
  duration_ms: 9.394959
  type: 'test'
  ...
# Subtest: invalid extraction candidate kind returns the supported enum in its error
ok 152 - invalid extraction candidate kind returns the supported enum in its error
  ---
  duration_ms: 9.140084
  type: 'test'
  ...
# Subtest: replay failure remains retryable until the next settle (attachment failure: false)
ok 153 - replay failure remains retryable until the next settle (attachment failure: false)
  ---
  duration_ms: 12.085875
  type: 'test'
  ...
# Subtest: replay failure remains retryable until the next settle (attachment failure: true)
ok 154 - replay failure remains retryable until the next settle (attachment failure: true)
  ---
  duration_ms: 13.132834
  type: 'test'
  ...
# Subtest: mixed receipts clear only terminal candidates and report rejection
ok 155 - mixed receipts clear only terminal candidates and report rejection
  ---
  duration_ms: 10.229083
  type: 'test'
  ...
# Subtest: all rejected receipts complete with an explicit warning and no pending retry
ok 156 - all rejected receipts complete with an explicit warning and no pending retry
  ---
  duration_ms: 8.482292
  type: 'test'
  ...
# Subtest: transport failure keeps the receipt for a second settle
ok 157 - transport failure keeps the receipt for a second settle
  ---
  duration_ms: 11.066166
  type: 'test'
  ...
# Subtest: dispose aborts an in-flight Backend request and prevents queued work
ok 158 - dispose aborts an in-flight Backend request and prevents queued work
  ---
  duration_ms: 23.171916
  type: 'test'
  ...
# Subtest: periodic report completion wakes the current DSH turn and preserves fixed document identity
ok 159 - periodic report completion wakes the current DSH turn and preserves fixed document identity
  ---
  duration_ms: 7.63025
  type: 'test'
  ...
# Subtest: periodic report waiters abort on a new question before sending stale wakeups
ok 160 - periodic report waiters abort on a new question before sending stale wakeups
  ---
  duration_ms: 6.3845
  type: 'test'
  ...
# Subtest: research roles allow composition only in My Research and reject arbitrary contributions
ok 161 - research roles allow composition only in My Research and reject arbitrary contributions
  ---
  duration_ms: 17.542
  type: 'test'
  ...
# Subtest: Radar requests only core API channels, including when the Backend fails
ok 162 - Radar requests only core API channels, including when the Backend fails
  ---
  duration_ms: 7.216542
  type: 'test'
  ...
# Subtest: without navigation, deep research still exposes all Backend tools
ok 163 - without navigation, deep research still exposes all Backend tools
  ---
  duration_ms: 5.402333
  type: 'test'
  ...
# Subtest: shared schema rejects invalid arguments before a Backend call
ok 164 - shared schema rejects invalid arguments before a Backend call
  ---
  duration_ms: 7.033292
  type: 'test'
  ...
# Subtest: generated primitive schema keeps operation and nested required fields
ok 165 - generated primitive schema keeps operation and nested required fields
  ---
  duration_ms: 5.018208
  type: 'test'
  ...
# Subtest: market_window primitive forwards its complete input to Backend
ok 166 - market_window primitive forwards its complete input to Backend
  ---
  duration_ms: 6.144042
  type: 'test'
  ...
# Subtest: shared examples resolve against package resources after bundling
ok 167 - shared examples resolve against package resources after bundling
  ---
  duration_ms: 6.566458
  type: 'test'
  ...
# Subtest: research host passes hookToken only when accumulation is authorized
ok 168 - research host passes hookToken only when accumulation is authorized
  ---
  duration_ms: 9.452417
  type: 'test'
  ...
# Subtest: the five page assistants never promote read/lookup/extraction records to a knowledge write, even fully authorized
ok 169 - the five page assistants never promote read/lookup/extraction records to a knowledge write, even fully authorized
  ---
  duration_ms: 84.408792
  type: 'test'
  ...
# Subtest: company_wiki reads an annual-report block without staging an extraction, and settle writes nothing
ok 170 - company_wiki reads an annual-report block without staging an extraction, and settle writes nothing
  ---
  duration_ms: 17.080292
  type: 'test'
  ...
# Subtest: aborted research does not settle as a success and disposed sessions reject tools
ok 171 - aborted research does not settle as a success and disposed sessions reject tools
  ---
  duration_ms: 11.2965
  type: 'test'
  ...
# Subtest: external result generation uses one registered series instead of a company symbol
ok 172 - external result generation uses one registered series instead of a company symbol
  ---
  duration_ms: 131.326916
  type: 'test'
  ...
# Subtest: calculation receipts can be reread without rows or a chart
ok 173 - calculation receipts can be reread without rows or a chart
  ---
  duration_ms: 43.028583
  type: 'test'
  ...
# Subtest: native result tools use stable call identity and expose rows without raw source snapshots
ok 174 - native result tools use stable call identity and expose rows without raw source snapshots
  ---
  duration_ms: 23.040625
  type: 'test'
  ...
# Subtest: reading a market result includes every intermediate row without fetching or presenting a new chart
ok 175 - reading a market result includes every intermediate row without fetching or presenting a new chart
  ---
  duration_ms: 24.91375
  type: 'test'
  ...
# Subtest: reading a linked result uses GET and returns all bounded annual rows without source snapshots
ok 176 - reading a linked result uses GET and returns all bounded annual rows without source snapshots
  ---
  duration_ms: 8.712167
  type: 'test'
  ...
# Subtest: one type only, exact fields, overall and configured limits
ok 177 - one type only, exact fields, overall and configured limits
  ---
  duration_ms: 1.510291
  type: 'test'
  ...
# Subtest: repeated company suggestions are removed; watched status is left to the product card
ok 178 - repeated company suggestions are removed; watched status is left to the product card
  ---
  duration_ms: 0.307375
  type: 'test'
  ...
# Subtest: baseline identities must be successful receipts from this turn
ok 179 - baseline identities must be successful receipts from this turn
  ---
  duration_ms: 0.621042
  type: 'test'
  ...
# Subtest: preflight rejections are filtered and transport errors stay errors
ok 180 - preflight rejections are filtered and transport errors stay errors
  ---
  duration_ms: 0.378958
  type: 'test'
  ...
# Subtest: already tracked indicators are removed by observable identity
ok 181 - already tracked indicators are removed by observable identity
  ---
  duration_ms: 0.207375
  type: 'test'
  ...
# Subtest: one indicator list cannot contain two different drafts with the same tracking key
ok 182 - one indicator list cannot contain two different drafts with the same tracking key
  ---
  duration_ms: 0.23275
  type: 'test'
  ...
# Subtest: investment action words are rejected for every type
ok 183 - investment action words are rejected for every type
  ---
  duration_ms: 0.172375
  type: 'test'
  ...
# Subtest: one attempt per turn, including a rejected first attempt
ok 184 - one attempt per turn, including a rejected first attempt
  ---
  duration_ms: 1.877917
  type: 'test'
  ...
# Subtest: native tool appends one nonblocking event and resets allowance on the next turn
ok 185 - native tool appends one nonblocking event and resets allowance on the next turn
  ---
  duration_ms: 29.896958
  type: 'test'
  ...
# Subtest: receipt capture follows successful native output validation, never failed output
ok 186 - receipt capture follows successful native output validation, never failed output
  ---
  duration_ms: 98.595292
  type: 'test'
  ...
# Subtest: \#15 deep_research 无 shell/fs/读写文件工具
ok 187 - \#15 deep_research 无 shell/fs/读写文件工具
  ---
  duration_ms: 1.104708
  type: 'test'
  ...
# Subtest: \#15 company_research 无 shell/fs/读写文件工具
ok 188 - \#15 company_research 无 shell/fs/读写文件工具
  ---
  duration_ms: 0.147583
  type: 'test'
  ...
# Subtest: \#15 my_research 无 shell/fs/读写文件工具
ok 189 - \#15 my_research 无 shell/fs/读写文件工具
  ---
  duration_ms: 0.054917
  type: 'test'
  ...
# Subtest: \#15 wiki_report 无 shell/fs/读写文件工具
ok 190 - \#15 wiki_report 无 shell/fs/读写文件工具
  ---
  duration_ms: 0.046334
  type: 'test'
  ...
# Subtest: \#15 knowledge_settlement 无 shell/fs/读写文件工具
ok 191 - \#15 knowledge_settlement 无 shell/fs/读写文件工具
  ---
  duration_ms: 0.056875
  type: 'test'
  ...
# Subtest: \#15 market.ask 无 shell/fs/读写文件工具
ok 192 - \#15 market.ask 无 shell/fs/读写文件工具
  ---
  duration_ms: 0.043583
  type: 'test'
  ...
# Subtest: \#15 market.agent 无 shell/fs/读写文件工具
ok 193 - \#15 market.agent 无 shell/fs/读写文件工具
  ---
  duration_ms: 0.044167
  type: 'test'
  ...
# Subtest: \#15 intel.ask 无 shell/fs/读写文件工具
ok 194 - \#15 intel.ask 无 shell/fs/读写文件工具
  ---
  duration_ms: 0.039709
  type: 'test'
  ...
# Subtest: \#15 intel.agent 无 shell/fs/读写文件工具
ok 195 - \#15 intel.agent 无 shell/fs/读写文件工具
  ---
  duration_ms: 0.29425
  type: 'test'
  ...
# Subtest: \#15 industry_profile.ask 无 shell/fs/读写文件工具
ok 196 - \#15 industry_profile.ask 无 shell/fs/读写文件工具
  ---
  duration_ms: 0.35875
  type: 'test'
  ...
# Subtest: \#15 industry_profile.agent 无 shell/fs/读写文件工具
ok 197 - \#15 industry_profile.agent 无 shell/fs/读写文件工具
  ---
  duration_ms: 0.101042
  type: 'test'
  ...
# Subtest: \#15 company_wiki.ask 无 shell/fs/读写文件工具
ok 198 - \#15 company_wiki.ask 无 shell/fs/读写文件工具
  ---
  duration_ms: 0.036875
  type: 'test'
  ...
# Subtest: \#15 company_wiki.agent 无 shell/fs/读写文件工具
ok 199 - \#15 company_wiki.agent 无 shell/fs/读写文件工具
  ---
  duration_ms: 0.034375
  type: 'test'
  ...
# Subtest: \#15 industry_wiki.ask 无 shell/fs/读写文件工具
ok 200 - \#15 industry_wiki.ask 无 shell/fs/读写文件工具
  ---
  duration_ms: 0.027041
  type: 'test'
  ...
# Subtest: \#15 industry_wiki.agent 无 shell/fs/读写文件工具
ok 201 - \#15 industry_wiki.agent 无 shell/fs/读写文件工具
  ---
  duration_ms: 0.027625
  type: 'test'
  ...
# Subtest: \#15 精确工具名反例与领域工具正例
ok 202 - \#15 精确工具名反例与领域工具正例
  ---
  duration_ms: 0.094917
  type: 'test'
  ...
# Subtest: 页内 Agent 先读页面上下文再选择补读资料
ok 203 - 页内 Agent 先读页面上下文再选择补读资料
  ---
  duration_ms: 0.641375
  type: 'test'
  ...
# Subtest: 公司研究任务单独注入中文过程与回答约束
ok 204 - 公司研究任务单独注入中文过程与回答约束
  ---
  duration_ms: 0.258334
  type: 'test'
  ...
# Subtest: 整理子会话的结束事件把格式错误码记录到同一会话状态
ok 205 - 整理子会话的结束事件把格式错误码记录到同一会话状态
  ---
  duration_ms: 0.280042
  type: 'test'
  ...
# Subtest: 研究入库等待按作业 ID 轮询，截止后返回超时而非阻塞整理
ok 206 - 研究入库等待按作业 ID 轮询，截止后返回超时而非阻塞整理
  ---
  duration_ms: 13.699959
  type: 'test'
  ...
# Subtest: 研究 pending 在首轮工具注册前绑定 company_research 和公司范围，旧报告仍按报告角色
ok 207 - 研究 pending 在首轮工具注册前绑定 company_research 和公司范围，旧报告仍按报告角色
  ---
  duration_ms: 2.988667
  type: 'test'
  ...
# Subtest: 公司研究五步使用独立工具集，网页和雷达不进入任务
ok 208 - 公司研究五步使用独立工具集，网页和雷达不进入任务
  ---
  duration_ms: 15.122875
  type: 'test'
  ...
# Subtest: every page role rejects persistent URL reads before issuing HTTP
ok 209 - every page role rejects persistent URL reads before issuing HTTP
  ---
  duration_ms: 56.787291
  type: 'test'
  ...
# Subtest: settlement ingest waits for its own job, reuses it and never wakes the main conversation
ok 210 - settlement ingest waits for its own job, reuses it and never wakes the main conversation
  ---
  duration_ms: 510.076584
  type: 'test'
  ...
# Subtest: consolidated catalogs register exactly 30/38 tools, with vocabulary only in My Research
ok 211 - consolidated catalogs register exactly 30/38 tools, with vocabulary only in My Research
  ---
  duration_ms: 20.28075
  type: 'test'
  ...
# Subtest: bound Topic basis changes and allowlisted Wiki diff are read-only and bounded
ok 212 - bound Topic basis changes and allowlisted Wiki diff are read-only and bounded
  ---
  duration_ms: 15.585167
  type: 'test'
  ...
# Subtest: page assistants are Ask/Agent modes; deep_research rejects mode
ok 213 - page assistants are Ask/Agent modes; deep_research rejects mode
  ---
  duration_ms: 7.873917
  type: 'test'
  ...
# Subtest: knowledge settlement registers scoped source tools without inherited generate or Topic writes
ok 214 - knowledge settlement registers scoped source tools without inherited generate or Topic writes
  ---
  duration_ms: 5.078
  type: 'test'
  ...
# Subtest: deep and My Research note search forwards keyword and Backend category; other roles cannot read notes
ok 215 - deep and My Research note search forwards keyword and Backend category; other roles cannot read notes
  ---
  duration_ms: 25.917709
  type: 'test'
  ...
# Subtest: unified Wiki reader preserves core Backend identity, maintenance state, and navigation isolation
ok 216 - unified Wiki reader preserves core Backend identity, maintenance state, and navigation isolation
  ---
  duration_ms: 15.826917
  type: 'test'
  ...
# Subtest: ordinary research cannot create or indirectly write a Topic
ok 217 - ordinary research cannot create or indirectly write a Topic
  ---
  duration_ms: 5.990792
  type: 'test'
  ...
# Subtest: a forced My Research role cannot write without a matching user binding
ok 218 - a forced My Research role cannot write without a matching user binding
  ---
  duration_ms: 8.010792
  type: 'test'
  ...
# Subtest: association proposals cannot write another Topic or run without a binding
ok 219 - association proposals cannot write another Topic or run without a binding
  ---
  duration_ms: 7.300042
  type: 'test'
  ...
# Subtest: Wiki navigation cannot bypass accepted core reads or forward management flags
ok 220 - Wiki navigation cannot bypass accepted core reads or forward management flags
  ---
  duration_ms: 0.2215
  type: 'test'
  ...
# Subtest: graph traversal has a deterministic bounded default
ok 221 - graph traversal has a deterministic bounded default
  ---
  duration_ms: 0.228875
  type: 'test'
  ...
# Subtest: company/industry plugins keep Ask allow-list and no longer register direct-write maintenance tools
ok 222 - company/industry plugins keep Ask allow-list and no longer register direct-write maintenance tools
  ---
  duration_ms: 14.557125
  type: 'test'
  ...
# Subtest: boundTargetError comparison-cite and unbound-target guards still work by direct call, ready for D-package rewiring
ok 223 - boundTargetError comparison-cite and unbound-target guards still work by direct call, ready for D-package rewiring
  ---
  duration_ms: 0.137292
  type: 'test'
  ...
# Subtest: all five page assistants skip the background Wiki review; non-assistant roles keep it; bound prompt names the object
ok 224 - all five page assistants skip the background Wiki review; non-assistant roles keep it; bound prompt names the object
  ---
  duration_ms: 0.247875
  type: 'test'
  ...
# Subtest: persist is a parameter-level action, not granted by fetch_source_url name
ok 225 - persist is a parameter-level action, not granted by fetch_source_url name
  ---
  duration_ms: 0.066125
  type: 'test'
  ...
# Subtest: fetch_source_url persist 要求合格公司代码，缺省保持无归属
ok 226 - fetch_source_url persist 要求合格公司代码，缺省保持无归属
  ---
  duration_ms: 11.868042
  type: 'test'
  ...
# Subtest: Wiki page assistants with an empty bound target reject maintenance writes
ok 227 - Wiki page assistants with an empty bound target reject maintenance writes
  ---
  duration_ms: 5.311
  type: 'test'
  ...
# Subtest: theme and comparison wiki_read pin hash fail-closed
ok 228 - theme and comparison wiki_read pin hash fail-closed
  ---
  duration_ms: 11.745083
  type: 'test'
  ...
# Subtest: industry profile read fails closed when the payload has no digest
ok 229 - industry profile read fails closed when the payload has no digest
  ---
  duration_ms: 4.593917
  type: 'test'
  ...
# Subtest: market, intel and industry_profile register distinct Ask/Agent tool lists
ok 230 - market, intel and industry_profile register distinct Ask/Agent tool lists
  ---
  duration_ms: 19.271542
  type: 'test'
  ...
# Subtest: 议题与报告会话的工作步骤由角色提示承载，产品首问不必携带
ok 231 - 议题与报告会话的工作步骤由角色提示承载，产品首问不必携带
  ---
  duration_ms: 0.166084
  type: 'test'
  ...
# Subtest: real DSH schema fixture exposes nested Topic and PageSpec contracts
ok 232 - real DSH schema fixture exposes nested Topic and PageSpec contracts
  ---
  duration_ms: 14.868333
  type: 'test'
  ...
# Subtest: Topic preflight returns several structural errors without calling Backend
ok 233 - Topic preflight returns several structural errors without calling Backend
  ---
  duration_ms: 6.110292
  type: 'test'
  ...
# Subtest: judgment page refs pin the page read in this turn and reject unread or mismatched versions
ok 234 - judgment page refs pin the page read in this turn and reject unread or mismatched versions
  ---
  duration_ms: 19.676
  type: 'test'
  ...
# Subtest: valid Topic structures are translated once and sent to Backend
ok 235 - valid Topic structures are translated once and sent to Backend
  ---
  duration_ms: 4.869958
  type: 'test'
  ...
# Subtest: PageSpec and research-link preflight reject locally, then pass valid payloads
ok 236 - PageSpec and research-link preflight reject locally, then pass valid payloads
  ---
  duration_ms: 19.637167
  type: 'test'
  ...
# Subtest: 假设升格提案透传归属、两端与已核对依据；缺依据在工具侧拒绝
ok 237 - 假设升格提案透传归属、两端与已核对依据；缺依据在工具侧拒绝
  ---
  duration_ms: 8.401958
  type: 'test'
  ...
# Subtest: source 依据的块编号可含冒号（r-<revision>:p1:b12），与 Backend 一致；缺块仍拒绝
ok 238 - source 依据的块编号可含冒号（r-<revision>:p1:b12），与 Backend 一致；缺块仍拒绝
  ---
  duration_ms: 0.535583
  type: 'test'
  ...
# Subtest: core slug 语法与 Backend SLUG_RE 一致：接受中文行业与多段路径
ok 239 - core slug 语法与 Backend SLUG_RE 一致：接受中文行业与多段路径
  ---
  duration_ms: 0.663333
  type: 'test'
  ...
# Subtest: core slug 语法：非法路径仍拒绝，且错误不冒充「未发现」
ok 240 - core slug 语法：非法路径仍拒绝，且错误不冒充「未发现」
  ---
  duration_ms: 0.099667
  type: 'test'
  ...
1..240
# tests 240
# suites 0
# pass 240
# fail 0
# cancelled 0
# skipped 0
# todo 0
# duration_ms 1793.044542
```

</details>

<details>
<summary>一次联网冒烟（exit 2，修正前，未重跑）</summary>

```text
{"id": "cmdty:SHFE.AL", "name": "沪铝", "unit": "元/吨", "source": "sina.domestic", "basis": "主力连续，未复权，收盘价", "available": false, "latest_date": null, "code": "external_source_unavailable", "reason": "cmdty:SHFE.AL（sina.domestic）日线不可用：KeyError"}
{"id": "cmdty:SHFE.AO", "name": "氧化铝", "unit": "元/吨", "source": "sina.domestic", "basis": "主力连续，未复权，收盘价", "available": false, "latest_date": null, "code": "external_source_unavailable", "reason": "cmdty:SHFE.AO（sina.domestic）日线不可用：KeyError"}
{"id": "cmdty:SHFE.CU", "name": "沪铜", "unit": "元/吨", "source": "sina.domestic", "basis": "主力连续，未复权，收盘价", "available": false, "latest_date": null, "code": "external_source_unavailable", "reason": "cmdty:SHFE.CU（sina.domestic）日线不可用：KeyError"}
{"id": "cmdty:SHFE.AU", "name": "沪金", "unit": "元/克", "source": "sina.domestic", "basis": "主力连续，未复权，收盘价", "available": false, "latest_date": null, "code": "external_source_unavailable", "reason": "cmdty:SHFE.AU（sina.domestic）日线不可用：KeyError"}
{"id": "cmdty:SHFE.AG", "name": "沪银", "unit": "元/千克", "source": "sina.domestic", "basis": "主力连续，未复权，收盘价", "available": false, "latest_date": null, "code": "external_source_unavailable", "reason": "cmdty:SHFE.AG（sina.domestic）日线不可用：KeyError"}
{"id": "cmdty:INE.SC", "name": "原油", "unit": "元/桶", "source": "sina.domestic", "basis": "主力连续，未复权，收盘价", "available": false, "latest_date": null, "code": "external_source_unavailable", "reason": "cmdty:INE.SC（sina.domestic）日线不可用：KeyError"}
{"id": "cmdty:SHFE.RB", "name": "螺纹钢", "unit": "元/吨", "source": "sina.domestic", "basis": "主力连续，未复权，收盘价", "available": false, "latest_date": null, "code": "external_source_unavailable", "reason": "cmdty:SHFE.RB（sina.domestic）日线不可用：KeyError"}
{"id": "cmdty:DCE.JM", "name": "焦煤", "unit": "元/吨", "source": "sina.domestic", "basis": "主力连续，未复权，收盘价", "available": false, "latest_date": null, "code": "external_source_unavailable", "reason": "cmdty:DCE.JM（sina.domestic）日线不可用：KeyError"}
{"id": "cmdty:LME.AL", "name": "LME 铝", "unit": "美元/吨", "source": "sina.foreign", "basis": "3个月期货，新浪日线收盘价", "available": false, "latest_date": null, "code": "external_source_unavailable", "reason": "cmdty:LME.AL（sina.foreign）日线不可用：ValidationError"}
{"id": "cmdty:LME.CU", "name": "LME 铜", "unit": "美元/吨", "source": "sina.foreign", "basis": "3个月期货，新浪日线收盘价", "available": false, "latest_date": null, "code": "external_source_unavailable", "reason": "cmdty:LME.CU（sina.foreign）日线不可用：ValidationError"}
{"id": "cmdty:COMEX.GC", "name": "COMEX 黄金", "unit": "美元/金衡盎司", "source": "sina.foreign", "basis": "新浪连续期货日线收盘价，非指定合约", "available": false, "latest_date": null, "code": "external_source_unavailable", "reason": "cmdty:COMEX.GC（sina.foreign）日线不可用：ValidationError"}
{"id": "macro:DXY", "name": "美元指数", "unit": "指数点", "source": "eastmoney.index", "basis": "美元指数日线收盘点位，非期货合约", "available": false, "latest_date": null, "code": "external_source_unavailable", "reason": "macro:DXY（eastmoney.index）日线不可用：ValidationError"}
{"id": "macro:UST10Y", "name": "10年期美债收益率", "unit": "%", "source": "treasury", "basis": "每日国债平价收益率，百分数，非债券价格", "available": false, "latest_date": null, "code": "external_source_unavailable", "reason": "macro:UST10Y（treasury）日线不可用：HTTPStatusError"}
{"total": 13, "failed": 13, "stop_condition": true}
```

</details>

<details>
<summary>两个代表性端点字段诊断（exit 0）</summary>

```text
{"source": "domestic", "row_type": "dict", "keys": ["d", "o", "h", "l", "c", "v", "p", "s"]}
{"source": "foreign", "row_type": "dict", "keys": ["date", "open", "high", "low", "close", "volume", "position", "s"]}
{"source": "foreign", "first_invalid_fields": [{"loc": [], "type": "value_error"}], "date": "2020-04-03"}
```

</details>

<details>
<summary>E9/E10 最终只读预演（exit 0）</summary>

```text
{
  "total": 551,
  "writable": 551,
  "ambiguous": 0,
  "existing": 0,
  "ambiguous_ratio": 0.0,
  "mode": "dry_run",
  "table_exists": false,
  "frontmatters": 732,
  "stop_condition": false,
  "e10_projected": {
    "sessions": {
      "unique_refs": 453,
      "before": 259,
      "after": 259
    },
    "reports": {
      "unique_refs": 292,
      "before": 292,
      "after": 292
    },
    "drafts": {
      "unique_refs": 83,
      "before": 83,
      "after": 83
    },
    "memory": {
      "unique_refs": 58,
      "before": 58,
      "after": 58
    },
    "wiki_pages": {
      "unique_refs": 341,
      "before": 339,
      "after": 339
    }
  },
  "inventory_coverage": {
    "sessions": {
      "files": 271,
      "available": true
    },
    "reports": {
      "files": 88,
      "available": true
    },
    "drafts": {
      "files": 9,
      "available": true
    },
    "memory": {
      "files": 4,
      "available": true
    }
  }
}
```

</details>

### 字段诊断完整命令与最终门禁

字段诊断工作目录 `/Users/apple/ts/src/Stock-Research/backend`，只读取两个代表性端点（没有重跑 smoke_external_prices.py）：

```sh
uv run --no-sync python -c 'import httpx,json; from app.market.providers.external import _jsonp; from app.market.definition import PricePoint; targets=[("domestic","https://stock2.finance.sina.com.cn/futures/api/jsonp.php/var%20_daily=/InnerFuturesNewService.getDailyKLine",{"symbol":"AL0","source":"web"}),("foreign","https://stock2.finance.sina.com.cn/futures/api/jsonp.php/var%20_daily=/GlobalFuturesService.getGlobalFuturesDailyKLine",{"symbol":"AHD","source":"web"})]; c=httpx.Client(timeout=20,trust_env=False,headers={"User-Agent":"Mozilla/5.0","Referer":"https://finance.sina.com.cn/"});
for name,url,params in targets:
 try:
  rows=_jsonp(c.get(url,params=params)); first=rows[0]; print(json.dumps({"source":name,"row_type":type(first).__name__,"keys":list(first) if isinstance(first,dict) else len(first)},ensure_ascii=False));
  for row in rows:
   if isinstance(row,dict) and "date" in row:
    try: PricePoint.model_validate({"trading_day":row["date"],**{k:row.get(k) for k in ("open","high","low","close","volume")}})
    except Exception as e:
     print(json.dumps({"source":name,"first_invalid_fields":[{"loc":x["loc"],"type":x["type"]} for x in e.errors()],"date":row["date"]},ensure_ascii=False)); break
 except Exception as e: print(json.dumps({"source":name,"error_type":type(e).__name__}))' > /private/tmp/t3-source-shape.jsonl
```

退出0；完整输出已在上方对应 details 内。另用 web 工具读取 AKShare 官方源实现；一个 Sina 原始端点的 web.open 因 URL 解析失败，没有取得数据。没有额外整轮行情查询。

模型可见面差异结构审阅完整命令，工作目录 Stock 根：

```sh
python3 -c 'import json,subprocess; from pathlib import Path; base="dsh/test/snapshots/model-surface"; changes=[]; allowed={"observe_market","generate_market_result","calculate_market_result"};
for f in subprocess.check_output(["git","diff","--name-only","--",base],text=True).splitlines():
 old=json.loads(subprocess.check_output(["git","show","HEAD:"+f],text=True)); new=json.loads(Path(f).read_text()); assert old["sections"]==new["sections"]; assert [(x["name"]) for x in old["tools"]]==[(x["name"]) for x in new["tools"]]; edited=[a["name"] for a,b in zip(old["tools"],new["tools"]) if a!=b]; assert set(edited)<=allowed; changes.append({"file":f,"tools":edited});
print(json.dumps(changes,ensure_ascii=False,indent=2))'
```

退出0，四份文件/工具变化与上方表一致。之后枚举合并未改变快照，最终标准pnpm test再次240通过。

回填后 Vibe 工作目录 `/Users/apple/ts/src/Vibe-Deep-Research`，分别运行：

```sh
node scripts/verify-docs.mjs
node scripts/verify-invariants.mjs
node scripts/verify-protocol.mjs
git diff --check
```

前三项各退出0，输出 verify-docs: ok、verify-invariants: ok、verify-protocol: ok；初次diff --check因完整DSH输出中的两个测试名尾空格退出2，已只清理生成日志这两处尾空格（不改代码/测试名称），随后复核退出0、无输出。

Stock 工作目录 `/Users/apple/ts/src/Stock-Research`，分别运行：

```sh
node scripts/verify-protocol.mjs
git diff --check
```

各退出0；前者输出 verify-protocol: ok，后者无输出。Stock根当前没有verify-docs/verify-invariants脚本，未伪称运行。最后核对两仓工作树，本轮仅上述限定文件及Task/过程记录；现有其他窗口Vibe改动和Stock既有citation/依赖改动保留，不暂存。


## 2026-10-09 Claude 审阅第一轮、上线前三步与修订 2

- 审阅：DSH 改动限于行情工具描述、外部序列枚举与区间计算描述；四份角色快照差异仅在这些工具；无关 citation 改动未触碰。provider 快照表只追加（应用账号仅 SELECT、INSERT），带来源标记，两处解析改为查表，`provider_ref` 算法未变。
- 冒烟重跑：`uv run --no-sync python scripts/smoke_external_prices.py`，exit 0；12/13 可用，`macro:UST10Y`（treasury）HTTPStatusError。财政部 XML 与 CSV 路径带 UA 均 404，不带 UA 超时；FRED CSV 当前网络无响应。
- 步骤 1：重新生成清单 `provider_snapshot_inventory.py`；`docker compose build migrate`；`alembic current` 为 0011；`alembic upgrade head` 执行 0012；current 为 `0012_provider_snapshots (head)`。
- 步骤 2：经 backend 容器以第一轮同样方式解包新模块到 `/tmp/backfill-run`；预演 total 551 / writable 551 / ambiguous 0 / existing 0；`--execute` inserted 551。
- 步骤 3：e10_after 与 before 一致（会话 259、报告 292、草案 83、记忆 58、Wiki 339）；再次预演 existing 551、writable 0；已删除容器内 `/tmp/backfill-run`、`/tmp/t3-preflight`。

### 修订 2 旧写法

- E10. **核对不倒退**：
- Stock `backend/app/market/`（新尺度、新 provider、登记表）
- - 另写一个联网冒烟脚本（不进 CI），逐个拉取第一批序列的最近 30 天数据，结果写进回填：每个序列是否可得、最新日期、单位。
