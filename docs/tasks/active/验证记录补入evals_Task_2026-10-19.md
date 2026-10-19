# 验证记录补入 evals

状态：2026-10-19 Claude 写定，用户选定方案 A（验证与 Benchmark 提炼进 `docs/evals/`，先不建独立仓库）。执行方只整理已有材料，不重跑、不下新结论、不提交，不读 `.env` 与密钥。

## 1. 目标

把 6 份只存在于被忽略的 `.local/` 的验证总结，按 [`docs/evals/README.md`](../../evals/README.md) 的六节格式提炼成可追溯的版本化记录；同时清点 `.local/` 里其余验证产出，供 Claude 决定是否补录。

## 2. 现状（Claude 核实）

- `.local/` 共约 25G，被 git 忽略；2026-10-15 去重程序误删事故说明这里的数据没有保护。
- 约 20 份 `summary.md` / `report.md`，格式不一。结论已由 Claude 写进对应 Task 的「Claude 审阅」或「当前交接」，在 `docs/tasks/archived/` 里冻结保存。

## 3. 冻结决定

R1 本轮补 6 份，目录名与来源固定：

| evals 目录 | `.local` 来源 | 结论来源（只引用，不新判） |
|---|---|---|
| `T5第一层基线_2026-10-10/` | `t5-baseline/` | `tasks/archived/T5第一层基线_Task_2026-10-10.md` 与 `.log.md` |
| `研究关键点稳定性_2026-10-14/` | `keypoints-stability/` | `tasks/archived/研究关键点代码化_Task_2026-10-14.md` |
| `产业链数据摸底_2026-10-14/` | `chain-data-survey/` | `tasks/archived/产业链数据摸底_Task_2026-10-14.md` 与 `.log.md` |
| `桌面安装包可行性_2026-10-14/` | `desktop-spike/report.md`（只读报告，不遍历 6.8G 目录） | `tasks/archived/桌面安装包可行性_Task_2026-10-14.md` 与 `.log.md` |
| `DSH升级0.2.1_2026-10-14/` | `dsh-upgrade/report.md` | `tasks/archived/DSH升级到0.2.1_Task_2026-10-14.md` 与 `.log.md` |
| `本机取数清点_2026-10-14/` | `local-fetch-migration/summary.md` | `tasks/archived/本机取数迁往Backend清点_Task_2026-10-14.md` |

R2 「方法与数据集」必须列全题目、公司、网址或被测对象清单，这是可复用的 Benchmark 本体；「结果」区分脚本客观指标与 Claude 判定；「结论与适用边界」只摘录结论来源里 Claude 已写的话并标出处，原文没有的写「未记录」。
R3 公开仓库规则：不放搜索正文、第三方全文、截图、个人凭据、令牌、本机用户名以外的私人信息；`.local` 路径写相对仓库根的形式。
R4 `results.csv` 只在来源已有逐题或逐项表格时生成（每份 < 200 KB），不另行计算。
R5 清点：在本 Task 的 `.log.md` 写一张表，列 `.local/` 下全部含 `summary.md` 或 `report.md` 的目录（目录、大小、文件数、最后修改日期、对应 Task 或「无」），不做取舍。

## 4. 范围

pi1，Vibe 主目录：只新增 `docs/evals/` 下 6 个目录与本 Task 的 `.log.md`；不改其他文件。

## 5. 验收

1. `node scripts/verify-docs.mjs`、`node scripts/verify-protocol.mjs` 通过；`git diff --check` 通过。
2. 每份 `README.md` 六节齐全且 ≤ 150 行；结论句都带出处链接。
3. `rg -n "sk-|Bearer |api[_-]?key|token=" docs/evals` 无命中。
4. Claude 逐份审阅后合并结论措辞；用户无需验收界面。

## 6. Out of Scope

重跑任何验证；修改归档 Task；删除或移动 `.local/` 内容；其他 14 份的补录（等 R5 清点后 Claude 决定）。

## 7. Stop Conditions

- 某份来源缺失或结论来源里找不到 Claude 的结论 → 该份写到能写的部分，在交接里列出，继续其余。
- 需要读 `.env`、密钥或把第三方正文放进仓库才能完成 → 停下报告。

## 8. 回滚

删除新增的 6 个 `docs/evals/` 目录与本 Task 的 `.log.md`。

## 9. 当前交接

1. 状态与结论：2026-10-19 pi1 已按方案 A 把 R1 六份提炼进 `docs/evals/`。不重跑、不新判、未提交。T5 有 Claude 审阅原文；其余四份结论摘 Task §9，研究关键点三次对照的 Claude 判定未记录。R5 清点 26 个含 summary/report 的 `.local/` 目录，见同名 `.log.md`。
2. 改动文件：新增 `docs/evals/{T5第一层基线_2026-10-10,研究关键点稳定性_2026-10-14,产业链数据摸底_2026-10-14,桌面安装包可行性_2026-10-14,DSH升级0.2.1_2026-10-14,本机取数清点_2026-10-14}/` 各 README.md 与 results.csv；新增本 Task `.log.md`。未改其他文件（本节回填除外）。
3. 证据：`node scripts/verify-docs.mjs`、`node scripts/verify-protocol.mjs` 通过；`git diff --check` 无输出；`rg -n "sk-|Bearer |api[_-]?key|token=" docs/evals` 无命中。六份 README 54/44/39/37/39/45 行。真实材料来自 `.local/` 与归档 Task，非重跑。
4. 与规格的偏差及理由：工作树已有 `docs/evals/DeepSeek检索对比_2026-10-19/` 与 `DSH-rc2升级可行性_2026-10-19/`，非本 Task 产出，未改。桌面 spike 目录未遍历，只读 `report.md`。关键点长 JSON 未抄入 csv，只标同/不同，原文留 `.local/`。
5. 未覆盖的缺口：研究关键点代码化 Task 写「未做真实运行」，无三次稳定性 Claude 审阅。桌面/DSH/取数/产业链无「Claude 审阅」专节。R5 其余目录未补录。
6. 下一步谁做什么：Claude 审阅 6 份记录并按 R5 表决定其余补录。pi1 停下，不提交。
