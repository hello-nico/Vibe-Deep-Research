# Jev 研究幻觉率判断（2026-10-20）

## 1. 问题

Jev 能否判断「研究里一句金融陈述有没有被所给原文支持」，从而估幻觉率。对应 [Jev研究幻觉率判断验证](../../tasks/archived/Jev研究幻觉率判断验证_Task_2026-10-20.md) 含 §8.1。

## 2. 方法与数据集

11 家已研究公司 page-research（8700 GET）抽「含数字或事实判断」且能配上数据包/计算字段的陈述 **222** 条。引用解析失败 12/234=5.1%，未触发停止。方法实验 URL 正文本地没有，未计入引用集，以免不可解析过半。无引用 0（本节字段总能挂上）。

标注规则（冻结于 `.local/jev-hallucination/freeze.json`，跑 Jev 前）：证伪/警戒线→原文无关；承认缺口→支持；缺口字段写成有数→不支持；纯填数字槽→支持；程度词或支柱判断→部分支持。金标：支持 77 / 部分 97 / 不支持 3 / 原文无关 45。

K1 字符串比对（规范空白与引号）：编造 0。其余一个 `choice`（supports / contradicts / says_nothing），state 仅 `claim`+`section`。H3 `bool` 对照。≥0.8 自动采纳。扰动 3 条（支持集无「预计」，缺第四类）。不调问法重跑。

## 3. 环境

2026-10-20。`jev eval`、`typesafe-ai/jev`。密钥仅进程 `AI_GATEWAY_API_KEY`。未改代码、未碰 5930。

## 4. 结果

| 阈值 | 自动采纳（不含部分支持） | 复核 | 准确率 | 不支持召回 |
| --- | ---: | ---: | ---: | ---: |
| 0.5 | 124 | 1 | 82.3% | 0/3 |
| 0.8 | 79 | 46 | 79.7% | 0/3 |
| 0.9 | 52 | 73 | 86.5% | 0/2 |

Jev choice：says_nothing 164、supports 37、contradicts 21。3 条「不支持」（缺口当有数、现金流「六成」）全判 says_nothing，p≥0.84。bool@0.5 把「支持」当正类准确率 56.8%。

耗时/成本：choice 批均 1551 ms；choice+bool 网关约 **$0.0083**。≥0.8 需复核 90 条，按 30 秒/条约 45 分钟。

扰动：单季→全年 → says_nothing 0.72；问句→结论 → supports 0.59；删上下文 → says_nothing 0.49。均未达 0.8。

幻觉率基线（不支持÷该公司条数）：多数 0；神火 2/22；云铝 1/21。低估真实判断风险，因部分支持占 44%。

逐条 [results.csv](results.csv)。

## 5. 结论与适用边界

规则先筛编造（本样本 0）。Jev 在「原文没说」上偏保守，**抓不住把缺口写成有数**（召回 0）。不能推出可接入保存流程。总成本：只用规则=222 条人工；规则+Jev≈$0.008 + 90 条复核，省人工但漏掉正类。未用检验集改指令。

## 6. 重跑

需 `AI_GATEWAY_API_KEY`。

```
python3 .local/jev-hallucination/extract.py
python3 .local/jev-hallucination/labels.py   # 已冻结则不要覆盖
python3 .local/jev-hallucination/run_jev.py
```

`run_jev.py` 校验 labels 哈希。原始 `.local/jev-hallucination/`。
