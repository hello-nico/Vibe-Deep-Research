# 公司研究工具调用统计（2026-10-26）

## 1. 问题

1017 做公司研究时有没有跳过必做步骤、少调工具，「20 步收尾」是否触发，失败与拒收重试是否按规定。对应 [公司研究工具调用统计](../../tasks/active/公司研究工具调用统计_Task_2026-10-26.md)。

## 2. 方法与数据集

近两周 25 条 `research/tasks/task:*/task.json`（2026-10-12 起），31 个会话 id。从 DSH_HOME 只复制 `session.v4.jsonl.zstd` 到 `.local/research-tool-audit/copied/` 再解压，不改原文件。事件：`tool/call`、`tool/result`、`request/context`、`user/message`、`step/start`。接续 = 首条用户消息含「这是一次接续」。必做：ensure_company_data → read_company_data_packet → source_get_index → calculate_metrics（sensitivity 或 valuation_template）→ save_company_page_research。明细 [results.csv](results.csv)。

## 3. 环境

2026-10-26。只读 `.local/dsh`。zstd CLI 解压副本。无模型调用、不碰 5930。

## 4. 结果

25 任务、31 会话，文件齐全。模型全部 `deepseek-flash` / `deepseek-official`。

| 模型 | 会话 | 非接续缺必做 | 平均调用 | 平均步 | ≥20 步 | save 成功 | save 拒收次数 | 接续 |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| deepseek-flash | 31 | 9（29%） | 12.4 | 10.6 | **0** | 22 | 16 | 6 |

调用数 0–24；最大步 16。save 提交从未超过 2 次。sensitivity 失败合计 16 次（10 个会话）。

异常样例（会话 id，位置为 tool/call 的 step）：

| 类 | 会话 | 位置 |
| --- | --- | --- |
| 非接续缺 source_get_index 与 sensitivity，仍 save | `28312396-ae35-46ad-9421-961eac5f2d90` | step 3 直接 `scenario_price`，无取材 |
| 同上 | `c8afced7-71a2-4bce-b519-4255c6484abd`、`c1dd5c0f-d3a6-4e5d-9ab3-005a7077536c` | 各 5 次调用 |
| 非接续 19 次调用后无 calculate/save，任务 failed | `709c25c5-ed80-4d18-b6c7-a150839a3955` | 取材到 step 15 |
| 非接续 24 次调用无 save | `4e677467-7c90-489c-a935-f3e48970eda3` | max_step 16 |
| 接续却重做 packet | `396286da-a04a-43a4-a783-cca2277e2642` | step 1 `read_company_data_packet` |
| 接续且零工具 | `d2355aad-f791-49b7-9197-174a54f133ae` | 无 tool/call |
| 调用 ≥20 仍在取材 | 无（≥20 次调用的 3 场 max_step 仍 ≤16，且无 step≥20 的 source_*） | — |

未发现「超过规定两次仍提交 save」。没有一场走到提示词的 20 步收尾。

## 5. 结论与适用边界

只报数字与样例。全是 flash。非接续缺必做 9/31；20 步收尾 0。不能据此改提示词。解压副本在 `.local/research-tool-audit/copied/`，未写回 DSH_HOME。

## 6. 重跑

```sh
python3 .local/research-tool-audit/audit.py
```

门禁：`node scripts/verify-docs.mjs`、`node scripts/verify-protocol.mjs`。
