# 验证记录补入 evals 过程记录

## 2026-10-19 · pi1

只整理已有材料。不重跑、不新判、不提交、不读 `.env` 与密钥。不把搜索正文、第三方全文或截图写入仓库。`.local/desktop-spike/` 只读 `report.md`。

按 R1 六份来源与结论来源提炼进 `docs/evals/`：

| evals 目录 | 来源 | 结论出处 |
|---|---|---|
| T5第一层基线_2026-10-10 | `.local/t5-baseline/` scorecard / version / question-summary | Task §9 与 log「Claude 审阅、代评与收尾」 |
| 研究关键点稳定性_2026-10-14 | `.local/keypoints-stability/summary.md` | 研究关键点代码化 Task §9（无三次对照审阅，稳定性判定写未记录） |
| 产业链数据摸底_2026-10-14 | `.local/chain-data-survey/summary.md` | Task §9；研报原话未抄入 |
| 桌面安装包可行性_2026-10-14 | `.local/desktop-spike/report.md` | Task §9；无 Claude 审阅专节 |
| DSH升级0.2.1_2026-10-14 | `.local/dsh-upgrade/report.md` | Task §9；无 Claude 审阅专节 |
| 本机取数清点_2026-10-14 | `.local/local-fetch-migration/summary.md` | Task §9；无 Claude 审阅专节 |

`results.csv` 均从已有逐项表转录，不另算。长 JSON 与第三方研报正文留在 `.local/`。

工作树里已有 `docs/evals/DeepSeek检索对比_2026-10-19/` 与 `docs/evals/DSH-rc2升级可行性_2026-10-19/`，非本 Task 范围，未改。

## R5 清点

`.local/` 下全部含 `summary.md` 或 `report.md` 的目录。大小与文件数为该目录树（子目录体积已计入父目录）。对应 Task 按目录名/标题能对上的写入归档文件名，否则「无」。不做取舍。

| 目录 | 大小 | 文件数 | 最后修改 | 对应 Task |
|---|---:|---:|---|---|
| .local/backend-user-layer | 20.1K | 1 | 2026-10-14 | Backend用户层清点_Task_2026-10-14.md |
| .local/chain-data-survey | 17.0M | 75 | 2026-10-14 | 产业链数据摸底_Task_2026-10-14.md |
| .local/chain-reports | 77.6M | 67 | 2026-10-14 | 无 |
| .local/deepseek-search-eval | 4.4M | 265 | 2026-10-19 | 无 |
| .local/desktop-bundle | 10.0G | 249706 | 2026-10-15 | 无 |
| .local/desktop-spike | 6.7G | 197506 | 2026-10-14 | 桌面安装包可行性_Task_2026-10-14.md |
| .local/dsh-rc2-eval | 157.8K | 11 | 2026-10-19 | 无 |
| .local/dsh-upgrade | 502.4M | 8391 | 2026-10-15 | DSH升级到0.2.1_Task_2026-10-14.md |
| .local/keypoints-stability | 3.4M | 69 | 2026-10-14 | 研究关键点代码化_Task_2026-10-14.md |
| .local/keypoints-step2 | 3.4M | 58 | 2026-10-14 | 无 |
| .local/keypoints-step2-rerun | 253.0K | 31 | 2026-10-14 | 无 |
| .local/local-fetch-migration | 6.9K | 1 | 2026-10-14 | 本机取数迁往Backend清点_Task_2026-10-14.md |
| .local/t12a-prep | 57.7K | 9 | 2026-10-13 | T12a关键变量跟踪_Task_2026-10-13.md |
| .local/t12a-probe | 64.9K | 4 | 2026-10-13 | T12a关键变量跟踪_Task_2026-10-13.md |
| .local/t12a-run | 41.3K | 12 | 2026-10-13 | T12a关键变量跟踪_Task_2026-10-13.md |
| .local/t5-baseline | 10.1M | 94 | 2026-10-10 | T5第一层基线_Task_2026-10-10.md |
| .local/t72-runs | 21.1M | 643 | 2026-10-12 | T7.2个股页研究与情景估值_Task_2026-10-12.md |
| .local/t72b-runs | 8.3M | 114 | 2026-10-12 | T7.2b真实运行修订_Task_2026-10-12.md |
| .local/t73-runs | 27.7M | 644 | 2026-10-13 | T7.3个股页叙事与关键变量_Task_2026-10-12.md |
| .local/t73-runs/archive/2026-10-12T13-46-20-049Z-codex1-invalid-round1 | 2.6M | 39 | 2026-10-12 | T7.3个股页叙事与关键变量_Task_2026-10-12.md |
| .local/t73-runs/followup-2026-10-13 | 2.3M | 74 | 2026-10-13 | T7.3个股页叙事与关键变量_Task_2026-10-12.md |
| .local/t73-runs/pi-rerun-2026-10-13 | 211.8K | 23 | 2026-10-13 | T7.3个股页叙事与关键变量_Task_2026-10-12.md |
| .local/t73-runs/revision1-2026-10-13 | 3.6M | 208 | 2026-10-13 | T7.3个股页叙事与关键变量_Task_2026-10-12.md |
| .local/t73-runs/revision1-patch-2026-10-13 | 208.9K | 14 | 2026-10-13 | T7.3个股页叙事与关键变量_Task_2026-10-12.md |
| .local/t74-run | 49.2K | 9 | 2026-10-14 | T7.4定期报告关键页_Task_2026-10-13.md |
| .local/task-record-run | 97.5K | 78 | 2026-10-14 | 任务记录与自动续跑_Task_2026-10-14.md |

合计 26 个目录。本轮按 R1 补 6 份；其余等 Claude 按本表决定。

## §5 检查（2026-10-19）

```
node scripts/verify-docs.mjs          # verify-docs: ok
node scripts/verify-protocol.mjs      # verify-protocol: ok
git diff --check                      # 无输出，exit 0
rg -n "sk-|Bearer |api[_-]?key|token=" docs/evals  # 无命中，exit 1
```

六份 README 行数：54 / 44 / 39 / 37 / 39 / 45，均 ≤ 150。未提交。

## Claude 审阅（2026-10-19）

- 6 份记录六节齐全，结论均带出处，缺口如实写「未记录」，未越权下判断；门禁与敏感词扫描 Claude 复跑通过。
- Claude 补记「研究关键点稳定性」的判定（出处为第二步 Task 依据）。其余 5 份不改。
- R5 清点的其余目录：暂不补录；以后每个验证 Task 收尾时按收尾第四问直接写 evals，不再回补。
- 执行方对比：pi1（grok）这次范围清楚、只摘录不发挥，适合整理类工作。
