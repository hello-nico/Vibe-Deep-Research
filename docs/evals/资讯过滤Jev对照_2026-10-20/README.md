# 资讯过滤 Jev 对照（2026-10-20）

## 1. 问题

同样四批已标注新闻上，Jev 与现行 DeepSeek 的误删、漏删、耗时、成本如何，资讯过滤该不该换成 Jev。对应 [资讯过滤Jev对照](../../tasks/archived/资讯过滤Jev对照_Task_2026-10-20.md)。Checklist 2026-10-09「Jev 不再作为产品能力推进」，本次只重测。

## 2. 方法与数据集

四集：拟合、留出、fresh、general，与 [低成本模型对照](../动态降噪低成本模型对照_2026-10-20/README.md) 相同。待定不计入误删/漏删。Jev `choice` 七类定义逐字复用 DeepSeek 原型，只给标题与来源，不按检验集改描述。组合=v2 规则先删（`feed_filter.blocked_by` + 汇总豁免）再 Jev。分类走 `jev eval` 每批 8 条；另抽 40 条单条计时。不调参。

## 3. 环境

2026-10-20T13:45:57+08:00。`typesafe-ai/jev`，Vercel AI Gateway。密钥仅进程环境变量 `AI_GATEWAY_API_KEY`，不读 `.env`、不落盘。未碰 5930。40 条唯一标题首次 EOF，重试一次后 665/665 解析成功（重试不是调参）。

## 4. 结果

脚本客观指标（待 Claude 判定）。DeepSeek 单条/组合摘自低成本对照；批量摘自 `.local/feed-filter-live-rerun/`（fresh/general，完成率不全）。

| 集 | Jev 误/漏 | Jev 组合 误/漏 | DS 单条 误/漏 | DS 组合 误/漏 |
| --- | --- | --- | --- | --- |
| fit 70/129 | 0/6 | 0/0 | 1/5 | 1/0 |
| holdout 63/78 | 0/5 | 0/0 | 3/3 | 3/0 |
| fresh 48/35 | 0/8 | 0/8 | 1/4 | 1/4 |
| general 122/61 | 0/6 | 0/6 | 2/2 | 2/2 |
| 合计 303/303 | **0/25** | **0/14** | **7/14** | **7/6** |

耗时与成本：

| | 平均 | ≤3s | 成本 |
| --- | --- | --- | --- |
| Jev 单条 n=40 | 2230 ms | 82.5% | 网关 $0.00098 |
| Jev 批量 8 条 n=74 次 | 2294 ms | 79.7% | 网关 $0.00932 |
| DS 单条 | 2733 ms | 未报 3s 率 | 116774 token，单价未取到 |
| DS 批量（live-rerun） | 15 批里 12 批≤3s | 80% | 未报价 |

Jev 组合漏删 14 条全是规则也没拦的「多家公司汇总 / 涨跌榜」类标题被判保留。误删 0。逐条 `.local/feed-filter-jev/results.csv`。

## 5. 结论与适用边界

执行方客观：**Jev 组合误删优于 DeepSeek（0 vs 7），漏删差于 DeepSeek 组合（14 vs 6）**；单条更快、网关账单约 1 美分。不能推出已该换成 Jev；Checklist 仍是「不再作为产品能力推进」。批量 DeepSeek 那轮完成率不全，不能当漏删对照。未用检验集改七类说明。

## 6. 重跑

需 `AI_GATEWAY_API_KEY`。`python3 .local/feed-filter-jev/run.py`（已有 cache 不重复计费）。原始 `.local/feed-filter-jev/`。门禁：`node scripts/verify-docs.mjs`、`node scripts/verify-protocol.mjs`。
