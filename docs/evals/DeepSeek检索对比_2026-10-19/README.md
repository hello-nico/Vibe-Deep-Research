# DeepSeek Search / Fetch 对比现有外部检索

## 1. 问题

DeepSeek 原生 Search / Fetch API 能否替代或补充 Backend `search_external`（Exa 默认、Tavily、东方财富新闻）与现有网页读取。来源 Task：[DeepSeek检索与DSH-rc2核实](../../tasks/active/DeepSeek检索与DSH-rc2核实_Task_2026-10-19.md) A 段。

## 2. 方法与数据集

20 题真实用户说法，五类各 4 题；同题四路同时发起，每路取 8 条，看前 5 条。另 15 个网址做 Fetch 并排。

| # | 类别 | 问题 |
|---|---|---|
| 1 | 公司近况 | 神火股份最近有什么消息 |
| 2 | 公司近况 | 云铝股份三季度业绩怎么样 |
| 3 | 公司近况 | 宁德时代最新公告 |
| 4 | 公司近况 | 长江电力来水情况 |
| 5 | 商品与行业数据 | 这周沪铝价格走势 |
| 6 | 商品与行业数据 | 电解铝社会库存最新数据 |
| 7 | 商品与行业数据 | LME aluminium inventory this week |
| 8 | 商品与行业数据 | 氧化铝现货价格最近变化 |
| 9 | 宏观与政策 | 美联储十月议息会议预期 |
| 10 | 宏观与政策 | 国内最新降准降息消息 |
| 11 | 宏观与政策 | 证监会最近出了什么新规 |
| 12 | 宏观与政策 | 国庆后人民币汇率走势 |
| 13 | 研报与深度 | 电解铝行业研报 2026 |
| 14 | 研报与深度 | 新能源车电池产业链周期判断 |
| 15 | 研报与深度 | AI 算力是否存在泡沫 |
| 16 | 研报与深度 | 黄金和美债收益率的关系 |
| 17 | 精确查找 | `宁德时代 三季度报告 site:cninfo.com.cn` |
| 18 | 精确查找 | `神火股份 after:2026-10-01` |
| 19 | 精确查找 | `"电解铝" 产能 天花板 lang:zh` |
| 20 | 精确查找 | `aluminium tariff -site:wikipedia.org after:2026-09-01` |

Fetch 网址：巨潮公告 PDF 3、东方财富 2、财联社 2、上交所/深交所 2、工信部 2、LME 2、已入库资料原文 PDF 2（清单见 `.local/deepseek-search-eval/raw/fetch-manifest.json`）。

## 3. 环境

2026-10-19（周一）上午；DeepSeek `POST /v1/tools/search`（`count=8`、`need_content=true`）与 `/v1/tools/fetch`；Exa、Tavily、东方财富经 Backend 现有函数与预算（Exa/Tavily 每小时 8 次）；现有 Fetch 为 Backend `read_public_url`（Jina Reader → 直抓）。单次运行，Claude 单人判定。

## 4. 结果

脚本客观指标（来自 `summary.md`）：

| 指标 | DeepSeek | Exa | Tavily |
|---|---|---|---|
| 成功题数 | 20/20 | 8/20（后 12 题被小时预算拦截） | 8/20（同左） |
| 中位耗时 | 1.3–1.8 秒 | 2.1–2.6 秒 | 3.1–3.3 秒 |
| 结果带日期 | 几乎全部（缺 11/160） | 约六成 | 0（全部缺日期） |
| 近 7 天结果占比（前两类） | 66% / 97% | 25% / 50% | 0 / 0 |
| 费用 | ¥0.005/次，空结果不收费 | 未核 | 未核 |

东方财富要求题中带股票代码，20 题全部未发出请求，本轮无证据。

Claude 判定（前 5 条相关性与可用性）：

| # | 判定 | 依据 |
|---|---|---|
| 1 | Exa > DeepSeek > Tavily | Exa 命中「前三季度预盈 74 亿」这条关键消息；DeepSeek 给研报评级与诉讼信息，漏了业绩预告；Tavily 多为行情页 |
| 2 | 三家持平 | 都返回 2025 年三季报；2026 年三季报尚未发布，问题本身无新答案 |
| 3 | DeepSeek > Exa ≈ Tavily | DeepSeek 给 10-12 投资基金、10-16 回购等具体公告；另两家是公告列表页 |
| 4 | DeepSeek ≈ Exa > Tavily | 前两家都命中三季度发电量公告与「来水转枯」研报 |
| 5 | DeepSeek ≈ Exa > Tavily | 前两家给 10-17/18 期货周报；Tavily 是报价页 |
| 6 | Exa > DeepSeek > Tavily | Exa 直接给 10-19「社会库存 56.6 万吨」；DeepSeek 是含库存的周报 |
| 7 | Exa ≈ Tavily > DeepSeek | DeepSeek 跑偏到镍、铜库存和无关页；另两家给 LME 官方页 |
| 8 | Exa ≥ DeepSeek > Tavily | Exa 的 SMM 氧化铝周评更对题 |
| 9 | DeepSeek 好 | 10-15/16 沃什讲话与 10 月利率预期，权威源 |
| 10 | DeepSeek 中 | 只到 2026-05 货政报告，没证明是「最新」 |
| 11 | DeepSeek 差 | 「证监会」被理解成美国 SEC |
| 12 | DeepSeek 好 | 10-08 至 10-13 汇率分析 |
| 13 | DeepSeek 中 | 年初中金、华泰研报，相关但不新 |
| 14 | DeepSeek 好 | 高盛 10-15 电池供需比、中金下半年展望 |
| 15 | DeepSeek 好 | 中证报 10-17、Gartner 等多视角 |
| 16 | DeepSeek 好 | 10-15 美债与黄金分析 |
| 17 | DeepSeek 中 | `site:` 生效（全是巨潮），但命中旧调研纪要和片段，`rerank_score` 0.7–0.8 正确标出低匹配 |
| 18 | DeepSeek 好 | `after:` 生效，全部 10-15 之后 |
| 19 | DeepSeek 好 | 短语与 `lang:` 生效，产能天花板主题命中 |
| 20 | DeepSeek 好 | 排除与日期生效，命中美墨钢铝关税谈判 |

Fetch：DeepSeek 6/15 成功（6 个巨潮 PDF 全部 404，LME 失败，3 次 504）；Backend Reader 14/15 成功（PDF 可读，长文在 80,000 字截断）。

## 5. 结论与适用边界

1. **DeepSeek Search 可作为外部检索的主力候选。** 可比的 8 题里，它和 Exa 各有胜负（Exa 胜 3 题、DeepSeek 胜 1 题、持平 4 题），明显强于 Tavily；独有的 12 题中 9 题好或中，1 题差。日期覆盖、新鲜度、速度、价格与运算符支持都优于现有供应商，并提供 `authority` 与 `rerank_score` 用于过滤。
2. **短板**：中文简称歧义（「证监会」→ SEC）；英文小众数据（LME 库存）不如 Exa；精确数据点（社会库存数字）有时不如 Exa 直接。
3. **DeepSeek Fetch 不能替代现有读取**：读不了巨潮 PDF，超时多。保留 Backend Reader。
4. **接入位置**：放进 Backend `search_external` 的 provider 层，而不是打开 DSH 原生 `web_search`。DSH 的 `dsh-web-deepseek-api` 适配器丢掉 `authority`、`rerank_score`、`summary`（见 rc.2 记录），而这些正是过滤与给模型读的关键字段；也符合「能力命名、来源可换」。
5. **不能推出**：Exa/Tavily 只有 8 题对比，且全是公司与商品类；宏观、研报、精确查找三类没有对照。单次运行、单人判定。

## 6. 重跑

- 原始数据：`.local/deepseek-search-eval/`（`raw/` 124 个文件，`summary.md`，脚本 `run.py`、`report.py`），产出于 2026-10-19。
- 运行：`cd /Users/apple/ts/src/Stock-Research/backend && uv run --no-sync python ../../Vibe-Deep-Research/.local/deepseek-search-eval/run.py`，再运行 `report.py`；DeepSeek 密钥用执行环境已有的 `DEEPSEEK_API_KEY`。
- 补测缺口：Exa、Tavily 后 12 题需跨小时或临时放宽预算后单独补跑，与本次 DeepSeek 结果对照。
