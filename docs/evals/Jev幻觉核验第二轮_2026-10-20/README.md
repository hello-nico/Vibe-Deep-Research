# Jev 幻觉核验第二轮（2026-10-20）

## 1. 问题

在深度对话自写数字、以及渲染后的研究事实句上，Jev 能否抓住改错。对应 [Jev幻觉核验第二轮](../../tasks/archived/Jev幻觉核验第二轮_Task_2026-10-20.md)。

## 2. 方法与数据集

对话：method-experiment 答案中 `127.0.0.1:5939/evidence?ref=source:…`，经 8700 `POST /wiki/refs/resolve` + 块原文。外部网页不进。158 条尝试，解析失败 7，留下 **151**。

研究：page-research 的 business/cash/valuation 与 pillar，槽位按数据包渲染；section 只用敏感性报告原话（必须含该原句）。110 条尝试，无原话剔除 25，留下 **85**。

原样本 236 条，先标后跑：支持 107 / 部分 6 / 原文没说 123 / 冲突 0。扰动 150 条（五类各 30），金标按构造：改数字/期间/预计/问句→冲突，删上下文→原文没说。choice 问法与第一轮相同，不调参。

## 3. 环境

2026-10-20。`jev eval`。密钥仅进程 `AI_GATEWAY_API_KEY`。未改代码。

## 4. 结果

扰动检出（判 contradicts 或 says_nothing）：

| 类 | n | @0.5 | @0.8 |
| --- | ---: | ---: | ---: |
| 数字改动 10%+ | 30 | **50%** | 27% |
| 删关键上下文 | 30 | **43%** | 23% |
| 预计→已实现 | 30 | 20% | 7% |
| 问句→公司确认 | 30 | 20% | 10% |
| 单季→全年 | 30 | 17% | 10% |

原样本：支持 107 条里 **0** 条被判 contradicts（0.8 档仍 0）。≥0.8 原样本复核 107、扰动复核 49。批均 1522 ms，网关约 **$0.0105**。逐条 [results.csv](results.csv)。

## 5. 结论与适用边界

客观：改数字和删原文相对能抓一点（约一半），改措辞/期间大多仍判 supports。把「支持」错打成冲突的误报为 0。值得当**后台复核提示**用在深度对话引用句，不适合拦截保存。研究渲染句的 section 只有短原话时，Jev 仍偏「没说」。未改问法重跑。

## 6. 重跑

需 `AI_GATEWAY_API_KEY`。

```
python3 .local/jev-hallucination-v2/extract.py
python3 .local/jev-hallucination-v2/labels.py
python3 .local/jev-hallucination-v2/perturb.py
python3 .local/jev-hallucination-v2/run_jev.py
```

`run_jev.py` 校验 labels 哈希。原始 `.local/jev-hallucination-v2/`。
