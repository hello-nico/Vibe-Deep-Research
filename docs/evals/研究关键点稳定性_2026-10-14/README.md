# 研究关键点稳定性（2026-10-14）

## 问题

同一家公司同一天连跑三次研究，代码给出的关键点是否逐字相同，五档结论是否仅模型判断不同。对应 [研究关键点代码化](../../tasks/archived/研究关键点代码化_Task_2026-10-14.md) §5 第 2 项；原始对照在 `.local/keypoints-stability/`。

## 方法与数据集

被测对象：神火股份 `000933.SZ`，三次独立研究（来源 summary 标题「神火股份三次研究对照」）。Task 还要求长江电力跑一次；该次不在本目录来源中。

对照字段（来源表，相同写「同」，不同照抄）：`split`、`segments`、`disclosed`、`tax_rate`、`scenario_overrides`、`multiples`、`defaults`、`multiple_candidates`、`reference_position`、`expectation`、三档价格、`implied`、`latest_periodic_report`、`valuation.grade` / `basis` / `conditions`、`thesis`。另记会话 ID、工具次数、步数、用时。不评分。

三次会话：`06362f24-e9bd-402b-b8c5-257367b7603b`、`347dfde9-6bc6-4260-bde4-803b3c413d0e`、`6f1391f9-f2b6-46f5-90d3-6a05bcba8d66`。

## 环境

日期 2026-10-14（poll 记录自 04:38:44Z）。模型与 DSH 版本：来源 summary 未记录。产出路径 `.local/keypoints-stability/{summary.md,diff.json,run-1,run-2,run-3}`。

## 结果

脚本/接口客观对照（来源 summary，不另算；长 JSON 不抄入仓库，见 `.local/keypoints-stability/summary.md`）：

| 字段 | 三次是否相同 |
|---|---|
| split / disclosed / scenario_overrides / multiple_candidates / expectation / latest_periodic_report | 同 |
| segments / tax_rate / multiples / defaults / reference_position / 三档价格 / implied / valuation.grade / basis / conditions / thesis | 不同 |

会话：三次均 `completed`；工具 20 / 18 / 15 次；步数 16 / 14 / 11；任务用时 248224 / 334154 / 238211 ms。`valuation.grade` 为 偏高 / 合理 / 合理。逐项见 [results.csv](results.csv)。

Claude 判定（2026-10-19 补记，依据 [第二步 Task](../../tasks/active/研究关键点代码化第二步_Task_2026-10-14.md) 的状态行「依据：第一步真实运行……与 Claude 判断」）：不稳定。报告选取与披露数已稳定，但倍数、默认值、三档价格、参考位置与五档结论三次不同，说明这些仍由模型临场取值；据此用户确认第二步把三档默认值改为历史上同一天的真实价格组合、倍数候选改为同业分位，由代码给出。

## 结论与适用边界

「R4 核实后只返回缺口。」（[Task §9](../../tasks/archived/研究关键点代码化_Task_2026-10-14.md)）

「未做真实运行。」（[同上](../../tasks/archived/研究关键点代码化_Task_2026-10-14.md)）

「R4 的三分位计算等有历史市盈率后再做。」（[同上](../../tasks/archived/研究关键点代码化_Task_2026-10-14.md)）

第一步只证明报告选取可稳定；数值层的稳定性要看第二步真实运行（待复跑）。长江电力一次：来源未记录。

## 重跑

来源未给出重跑命令。原始数据 `.local/keypoints-stability/`（`summary.md` 2026-10-14 12:56）。
