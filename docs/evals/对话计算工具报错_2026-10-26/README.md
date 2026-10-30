# 对话计算工具报错（2026-10-26）

## 1. 问题

对话里 `calculate_metrics` 被拒，是提示词与工具说明不清，还是工具本身难用。对应 [对话计算工具报错诊断](../../tasks/archived/对话计算工具报错诊断_Task_2026-10-26.md)。只给事实，不提方案。

## 2. 方法与数据集

焦点会话 `session-6b2f21c3-feca-4f00-9439-08a7488c79e8`（复制后 zstd 解压）。对照 Stock `dsh/src/calculation-protocol.mjs` 的 `ANALYSIS_DESCRIPTION`、`QUANTITY_SCHEMA` oneOf、`OPERATION_PROTOCOL.align/multiple`。近 7 天（2026-10-19 起）同目录 `session-*` 16 场，扫全部 `calculate_metrics` 失败。明细 [results.csv](results.csv)。

## 3. 环境

2026-10-26。只读 `.local/dsh/sessions/--Users-apple-ts-src-Stock-Research-workspace--/`。副本在 `.local/calc-errors/copied/`。不碰 5930。

## 4. 结果

焦点会话第 2 轮用户问：碳酸锂 9 万元/吨、镍 1.5–1.6 万美元、钴不反弹时，华友 2027/2028 大概赚多少、靠什么增长、和券商预测比怎样。此前第 1 轮 yoy/align 成功。第 2 轮三次失败后改口头判断。

| 次 | 想算 | 传了 | 工具要求 | 不符 | 归类 |
| --- | --- | --- | --- | --- | --- |
| 1 step 6 | 把 TTM/预测 EPS、TTM 净利、股本、股价一次对齐 | `align` 混入 `eps_*`（CNY/share）与 `ttm_profit`（CNY） | 说明：金额 unit=CNY、价格/每股 CNY/share；align 可选 `to_unit` | `mismatched_unit` | **说明有但模型没照做** |
| 2 step 7 | 改成只对齐每股 EPS 与股价 | `align`：`eps_ttm`（TTM:2026Q3）+ `eps_forecast`（FY2026E） | 说明只写 period=row.period，未写 align 必须同一期间；Backend 拒跨期 | `mismatched_period` | **说明缺失** |
| 3 step 8 | 用已存结果把沪镍收盘与汇率对照 | `multiple` 的 `result_cell` 只有 name+source | 完整 Quantity 须带原文 value；只有 packet_field 可免填值 | schema oneOf matched 0 | **说明有但模型没照做** |

三次都不是「工具不支持估 2027 利润」本身：没有对应的多年预测 primitive；模型是用 align/multiple 去拼一张对照表。

近 7 天：扫描 16 场会话，`calculate_metrics` 11 次，失败 5 次。

| 错误码 | 次数 | 会话 |
| --- | ---: | --- |
| mismatched_unit | 1 | 焦点 |
| mismatched_period | 1 | 焦点 |
| schema_oneOf | 1 | 焦点 |
| evidence_required | 1 | `7986743c…` multiple 只有 refs 无 source |
| not_yoy_pair | 1 | `c4146304…` yoy 把 2025-12-31 当 2026-09-30 的上年同期 |

后两场也是 **说明有但模型没照做**（actual 必须绑 source；yoy 要求上年同期）。

## 5. 结论与适用边界

焦点三次：2 次「说明有但模型没照做」，1 次「说明缺失」（align 期间一致）。未改提示词或工具。不能外推到公司研究角色（schema 含 sensitivity）。副本未写回 DSH_HOME。

## 6. 重跑

```sh
python3 .local/calc-errors/scan.py
```

门禁：`node scripts/verify-docs.mjs`、`node scripts/verify-protocol.mjs`。
