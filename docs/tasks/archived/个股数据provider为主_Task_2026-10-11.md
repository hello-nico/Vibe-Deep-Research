# 个股数据 provider 为主（T7.1c）

状态：2026-10-11 Claude 写定，用户同意「通用财务字段以 provider 为主、报告原文核对」。不提交、不 push、不重建容器、不重启工作台。
实施仓库：Stock-Research。

权威：Human Checklist 本仓「个股页数字由代码计算并绑定」、共享章「估值表达」；不变量 1；[T7.1 个股数据底座实施](../archived/个股数据底座实施_Task_2026-10-10.md) 修订 1 的冻结决定与过程记录；
[T7.1b provider 核对](../archived/个股数据provider核对_Task_2026-10-10.md) 的 §9 与 Stock `artifacts/t7-provider/`（`summary.md`、`columns.md`、`comparison.csv`）。

## 1. 目标

1. 数据包的通用财务字段改以同花顺三表为主、新浪为备，报告原文只做核对；TTM、单季、毛利率、ROE、PE/PB 复算全部由代码从 provider 累计值算出。
2. 同行对比可用：同行同样取 provider 快照，给出 PE、PB、ROE、营收、归母净利的中位数与排名。
3. 报告抽取只保留 provider 没有的字段（扣非、分红方案与实付、股本、行业驱动指标），并修掉宁德时代购建资产付现绑到母公司报表的错误。

## 2. 现状（Claude 核实，2026-10-11）

- `company_data_packet.py` 的 `_build` 全部通用字段来自 `extract_report` 读数；TTM 与单季靠 `original_reading` 取自身报告原值，上年同期常缺，TTM 多为缺口。
- `company_data_coverage.refresh_market` 是唯一允许调用 provider 的写路径（ensure）；GET 只读已存快照（`stored_market` 读 `provider_snapshots` 与 `research_results`）。
- `providers/company_statements.py` 现只映射营业收入、归母净利、总资产、总负债、经营现金流五列，`limit` 为 1；`get_hithink_statement_history` 只取年度。
- T7.1b：营业收入、归母净利、经营现金流 102/102 覆盖、报告 55 格一致 0 不一致；购建资产付现 11/12，唯一差异是 T7.1 取了宁德时代母公司报表（2,056,300 千元），合并数 42,344,558 千元，provider 对。
- 三表接口没有扣非、每股分红、实付普通股分红、股数、TTM 利润；值为年初至今累计；FY2024 可能是追溯调整后值，不给原值/调整值两列。
- `data-packet` 与 `coverage/ensure` 目前只有 `api/v1/company_data.py` 与测试调用，产品页尚未接入（T7.2）。

## 3. 冻结决定

D1. **取数与存储**。只在 `POST coverage/ensure` 内调用 provider：同花顺三表 `period=quarterly`（条数覆盖 §D3 所需全部期末，含上年同期），失败的表用新浪同表补；本公司与 `peer_rows` 选出的同行都取。
  每个「字段 × 期末」存为一条 `ProviderSnapshots` 快照（`source`、`period_end`、`cumulative: true`、`scope: consolidated`、`observed_at`、原始列名）；不新建表。GET 只读快照，不现场调 provider。
D2. **字段映射**（列名以 `columns.md` 为准）：营业收入 `operating_income`/营业收入；归母净利 `parent_holder_net_profit`/归属于母公司…净利润；经营现金流 `act_cash_flow_net`；
  购建长期资产付现 `pay_fixed_assets_etc_cash`/`ACQUASSETCASH`；营业成本 `operating_costs`/`BIZCOST`（银行可空，不用营业总成本）；归母净资产只取新浪 `PARESHARRIGH`，不用含少数股东的总权益。
  新浪股本是金额，不当股数；`DIVIPROFPAYCASH` 混有利息，不当分红。
D3. **字段状态**：provider 值与报告同字段、同期末、合并口径相差不超过原文披露精度半个单位 → `verified`；不一致 → `conflict`，两个值连同出处并列，页面不择一；
  只有 provider → `sourced`（标来源与期末）；都没有 → `gap`。购建资产付现按此规则作主来源（T7.1b 唯一差异是我们取错，不是 provider 错）。
D4. **代码计算**（输入全部是 D1 快照）：TTM = 最近年度 + 本年累计 − 上年同期累计，三个输入同一来源，否则缺口；单季 = 相邻累计相减（Q1 即累计值）；毛利率 = (营收 − 营业成本)/营收，银行/电信缺口；
  ROE = 年度归母净利 / 期初期末归母净资产平均；PE 复算 = 总市值 / TTM 归母净利，PB 复算 = 总市值 / 最新归母净资产，总市值取已存估值快照；与 provider pe_ttm、pb 偏差 ≤5% 为一致，否则两值并列。亏损或净资产非正走失效域。
  每个计算结果带 `input_field_ids`；provider 值为追溯调整后口径时标 `basis: provider_latest`，不与报告原值混算。
D5. **同行**：同行用同一套 D1–D4，`peers.items` 每行给 PE、PB、ROE、营收、归母净利与各自状态；`peer_comparison` 给中位数与本公司排名，只用 `verified`/`sourced` 值，少于 3 家标不足。仍是申万二级，不新增来源。
D6. **报告抽取的分工**：`company_packet_extract` 只为扣非、分红方案（每股与股本基数）、中期实付、股本行（股数）、行业驱动指标出值；其余通用字段的读数只进 D3 核对，不再作为字段值。
  `original_reading`、`ttm_profit`、`quarter_split` 中以报告原值为输入的旧路径删除，不保留双路径。
D7. **母公司报表**：现金流、利润表、资产负债表行的定位必须落在合并报表段；母公司报表段（「母公司现金流量表」等标题之后、下一合并标题之前）的行一律不取。宁德时代 FY2025 购建资产付现须改为合并数或缺口。
D8. **缓存**：数据包缓存键加入本公司与同行的 provider 快照 ref；ensure 后再读即刷新，冷读 ≤5 秒、热读 ≤1.5 秒（T7.1 实测 4.84/1.27 秒，不得变慢超过一倍）。

## 4. 范围

- 可改：`backend/app/services/company_data*.py`、`company_packet_extract.py`、`providers/company_statements.py`、`api/v1/company_data.py`、`config/company-data-drivers.json`、对应测试（`tests/test_company_data_*.py` 及新测试）。
- `company_statements.py` 现有函数被 `fetch-data` 使用，可扩展或合并，但其现有测试须全部通过、对外输出不变。
- 不改其他路由文件、`wiki.py`、`dsh/`、`bench/`；Stock 删减线（codex2）同时在改 Backend 其他文件，遇到同一文件即停。

## 5. 验收

**执行方自动检查**：
- 相关 pytest（`tests/test_company_data_*.py`、`company_statements` 与 `fetch-data` 相关测试）；新增测试覆盖 D3 四种状态、D4 每个公式与失效域、D7 母公司段排除（用宁德时代真实片段做夹具）。
- 真实运行（容器内现有服务，按 T7.1 的 17 家与日期）：对每家先 ensure 再 GET，回填：
  ① 字段 × 状态分布（17 家 × 通用字段，`verified`/`sourced`/`conflict`/`gap`）；② TTM、PE/PB 复算可算家数与偏差分布；③ 有 ≥3 家同行的公司数；
  ④ T7-G 金标 71 格与新值对比：一致/缺口/不一致，不一致须为 0 或逐格解释；⑤ 宁德时代、华友钴业、华能蒙电、农业银行四家逐字段对照；⑥ ensure 耗时（含同行）、GET 冷/热耗时、provider 请求数。
- `node scripts/verify-protocol.mjs`（两仓）、`git diff --check`。

**Claude**：抽查 HTTP 读数与原文、provider 快照；**用户**：重建容器后看数（T7.2 前无页面，用接口或 Claude 摘要）。

## 6. Out of Scope

- 个股页界面（T7.2）；历史估值分位序列；申万三级；新增 provider 或付费源；DSH 工具改动；修改 T7.1b 产出。

## 7. Stop Conditions

停止范围：只停对应子项，写进交接后继续其余工作。

- `ProviderSnapshots` 的身份校验或表结构容不下 D1 的字段：停下回填所需改动，不新建表、不放宽校验。
- 同花顺与新浪对同一格数值不一致：两值都存、状态 `conflict`，不挑一个；超过 3 格时停下回填清单。
- provider 限流或鉴权失败：降速重试一次，仍失败则该公司字段走 `gap` 并记录；需要读取或改动凭据、环境配置：停下。
- ensure 含同行超过 90 秒：停下回填耗时拆分，不擅自砍同行或改异步机制。
- 需要改本 Task 范围外文件（含 codex2 正在删的文件）：停该项。

## 8. 回滚

`git checkout -- <路径>` 恢复代码；ensure 写入的快照为新增行，按 `ref` 前缀与 `observed_at` 删除即可，不改旧快照。

## 9. 当前交接

1. 状态与结论：2026-10-12 Claude 审阅通过，用户重建后验收通过，已提交。codex1 代码实施完成，待 Claude 审阅。17 家真实 ensure 与 GET 成功；255 格为 verified 110、sourced 79、conflict 1、gap 65。金标 71 格：一致 42、缺口 29、不一致 0。
2. 改动文件：Stock `backend/app/providers/company_statements.py`、`api/v1/company_data.py`；`services/company_data_{coverage,lenses,packet,financials}.py`、`company_packet_extract.py`。
   测试：`tests/test_company_data_{packet,revision,provider}.py`；验证产出：`artifacts/t7-provider-primary/`。Vibe 仅本 Task 与同名过程记录；未碰范围外文件或 codex2 删减。
3. 证据：相关 pytest 143 passed；两仓 verify-protocol 与 git diff --check 通过。真实 provider + PostgreSQL：17 家 ensure 19.82–24.86 秒（含 4 家同行）、600 次 provider HTTP 尝试；最终 GET 冷 3.90–4.65 秒、热 1.05–1.32 秒，每次 provider 请求与 SQL 写入均为 0。
   TTM/PE 可算 17 家，PB 16 家；17 家均有 4 家候选同行，均至少一个指标有 ≥3 家可比值。宁德时代 FY2025 购建资产付现为合并值 42,344,558,000 元，已与原文核对。
4. 与规格的偏差及理由：按不重启约束，在现有 Backend 容器启动独立 ASGI 进程加载范围内代码，调用真实 provider 和现有数据库；原 8700 服务未部署新代码。ensure 用当日 2026-10-11；财务期间与 T7.1 的 2026-10-10 相同。最后一次 GET 采用第二轮 ensure 已存快照，只读复测。
5. 未覆盖的缺口：农业银行新浪返回 PARECOMPSHARRIGHT，非 D2 指定 PARESHARRIGH，不自行扩映射，PB/ROE 缺口；华能国际 PB 复算 0.83394063/provider 1.783839，偏差 113.90%，标 conflict、value=null，两值保留。
   报告专属字段仍有扣非、股本、实付分红与行业行列缺口；没有以 provider 股本金钱值或含利息现金流补数。冷热时延是本轮样本，长期快照增长未压测；部署与用户验收未做。
6. 下一步谁做什么：无执行项，本 Task 关闭。PB 永续债/优先股口径、ensure 无后缀返回 500 留 T7.2。
