# 个股数据 provider 核对（T7.1b 验证）

状态：2026-10-10 Claude 写定，用户同意「通用财务字段以 provider 为主、报告原文做核对」的取数思路，本 Task 先验证再改实现。只读验证，不改产品代码；不提交、不 push、不重建容器、不重启工作台。
实施位置：Stock-Research；验证脚本与产出放 `artifacts/t7-provider/`（不提交，与 `artifacts/t7-packet/` 同等对待）。

权威：Human Checklist 本仓「个股页数字由代码计算并绑定」、共享章「估值表达」；不变量 1；[T7.1 个股数据底座实施](../archived/个股数据底座实施_Task_2026-10-10.md) 修订 1 交接与过程记录（110/255 verified，金标 24 一致 / 47 缺口 / 0 不一致，Claude 判断规则抽取已到天花板）；归档 [T7-G 人工标准答案](../archived/数据底座标准答案_Task_2026-10-10.md)。

## 1. 目标

1. 量化同花顺 provider（及现有备源）对 T7.1 十五个通用字段、四类期间的覆盖率与正确率。
2. 给出逐字段结论：可作为主来源、只能作核对、不可用；为改实现（T7.1c）提供依据。

## 2. 现状（Claude 核实，2026-10-10）

- 现有三表适配 `backend/app/providers/company_statements.py`：同花顺 `/api/a-share/financials/{income-statements|balance-sheets|cash-flow-statements}`，备源新浪；目前只映射营业收入、归母净利、总资产、总负债、经营现金流五列，但接口返回的列远多于此（未登记）。
- 估值：`company_market.get_company_valuation`（同花顺、腾讯：pe_ttm、pb、market_cap）；行情：`market_result.build_market_result`（前复权）。
- DSH 对话已在用 `POST /wiki/companies/{symbol}/fetch-data`（`company_data_snapshot`）取 provider 快照。
- 金标：`artifacts/t7-gold/gold.json`（71 格 found）；T7.1 修订 1 真实读取：`artifacts/t7-packet/revision-1/live-read.json`（110 格 verified 的报告值）。

## 3. 冻结决定

P1. **只用现有 provider 与客户端**（同花顺三表、估值、备源新浪、腾讯），经 `rate_limit` 限速；直接调用客户端取原始响应，不经保存快照的路径，不写数据库。
P2. **列清单**：对 17 家各取一次三表（年度与报告期两种 `period`），记录接口实际返回的全部列名与样例，标出与 T7.1 字段的对应：营业收入、营业成本、归母净利、扣非归母净利、经营现金流、购建长期资产付现、分配股利（如有单列普通股股利则单列）、股本或总股数、归母净资产、每股分红、TTM 相关。
P3. **期间**：FY2025、FY2024、2026H1、2026Q1、2025H1、2025Q3；记录返回值是累计还是单季，是否给出 TTM，是否给出原值与调整后值。
P4. **核对口径**：单位统一后比较；相等的定义为差额不超过原文披露精度的半个单位。比较对象两组：T7-G 金标 71 格；T7.1 修订 1 的 110 格 verified 报告值（去重后合并统计）。每个不一致归类：追溯重述、合并 / 母公司口径、单位、期间错位、provider 错值、无法判断。
P5. **估值核对**：用 provider 股本（若有）与 TTM 利润复算 PE、PB，与 provider pe_ttm、pb 比较，记录偏差分布。
P6. **结论表**：每字段给覆盖率、一致率、不一致类别分布，并按规则给建议——一致率 ≥ 98% 且不一致均可解释：主来源；否则：只作核对；覆盖率 < 50%：不可用。规则只是建议，最终由 Claude 判断。

## 4. 范围

- 只写 `artifacts/t7-provider/`（脚本、原始响应、列清单 `columns.md`、比较明细 `comparison.csv`、结论 `summary.md`）及本 Task §9 与同名过程记录。
- 不改 `backend/app`、`dsh/`、配置与测试；不碰旧 T7 与 T7.1 未提交改动。

## 5. 验收

**执行方回填**：
- 列清单与 T7.1 字段对应表。
- 逐字段 × 期间的覆盖率、一致率与不一致分类；17 家 × 15 字段矩阵（P = provider 有值且与报告一致，p = provider 有值但无报告可比，X = 不一致，G = 都没有）。
- 华友钴业、华能蒙电、农业银行三家的逐字段对照示例。
- P5 偏差分布；provider 请求次数与耗时。

**Claude**：据结论写 T7.1c（改实现）。

## 6. Out of Scope

- 修改数据包、取数规则、provider 适配或映射；新增外部来源；申万三级、历史估值序列。

## 7. Stop Conditions

停止范围：只停对应子项，写进交接后继续其余工作。

- provider 限流或鉴权失败：降速重试一次，仍失败则记录已得部分，不更换来源。
- 需要读取或改动凭据、环境配置：停下。
- 某字段接口没有对应列：记为不可用，不从其他列推算。

## 8. 回滚

删除 `artifacts/t7-provider/`；本 Task 不改产品代码与数据。

## 9. 当前交接

1. 状态与结论：待派发。
2. 改动文件：无。
3. 证据：无。
4. 与规格的偏差及理由：无。
5. 未覆盖的缺口：全部。
6. 下一步谁做什么：codex1 按本 Task 执行。
