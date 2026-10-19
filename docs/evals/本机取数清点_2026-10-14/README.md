# 本机取数清点（2026-10-14）

## 问题

本机 Python 取数迁到云端 Backend 之前，列清每一类能力：产品哪里用、哪个端点、Backend 是否已有、迁过去要做什么。对应 [本机取数迁往Backend清点](../../tasks/archived/本机取数迁往Backend清点_Task_2026-10-14.md)。

## 方法与数据集

登记表 `datasources/registry.json` 54 个端点。对照 `orchestrator/src/finance/page_queries.ts`、`desktop/src/verticals/finance/lib/api.ts`、`pages/Feed.tsx`、`DailyReview.tsx`、`Intel.tsx`，以及 Stock `backend/app/market/`、`providers/`、`api/v1/research_results.py`、`radar/`。未发请求，未读密钥。

产品现用入口：动态页 `/feed`（`DailyReview` + `Intel`）。`/daily-review`、`/intel`、`/signals` 已重定向。问助手只消费页面快照。

在用端点：`tx_quotes_batch`、`fetch_trade_calendar`、`em_limit_up_sentiment`、`em_zt_pool`、`em_zb_pool`、`em_yzt_pool`、`ths_hot_reason`、`em_board_fund_flow`、`em_industry_comparison`、`em_turnover_rank`、`em_daily_dragon_tiger`、`cninfo_announcements`、`em_stock_news`、`rss_news`、`macro_probability`。其余 39 个登记端点前端与问助手都不调用，来源建议不迁（名单见 results.csv）。

计分：Backend 有 / 部分 / 无（只看客户端现可调接口）。不跑模型。

## 环境

日期 2026-10-14。只读清点。第三方库来自 `.agents/skills/data-access/scripts/requirements.txt`：requests、pandas、lxml、akshare、baostock、mootdx。现用能力碰到的只有 requests、baostock 与标准库。

## 结果

来源能力表（不另算）：54 个端点里产品在用 15 个，39 个建议不迁。逐项见 [results.csv](results.csv)。

Backend 无同等页面接口的包括：A 股/全球指数盘中报价、交易日历、涨停梯队、板块资金流、成交额榜、宏观事件概率等。部分有：日线预览不是盘中报价；行业涨跌家数在 provider 未挂页面接口；公告/新闻形态与现页不同。

Python：产品改调 Backend 后本机不再需要这份环境；pandas/lxml/akshare/mootdx 只服务未使用端点。云服务器能否访问国内源/境外概率源：未实测。

Claude 判定：未记录。

## 结论与适用边界

「只读清点完成。54 个端点里产品在用 15 个，39 个建议不迁。」（[Task §9](../../tasks/archived/本机取数迁往Backend清点_Task_2026-10-14.md)）

「实时报价、指数、复盘榜单和宏观概率 Backend 没有同等接口。」（[同上](../../tasks/archived/本机取数迁往Backend清点_Task_2026-10-14.md)）

「复盘页取回但未展示的龙虎榜和强势股归因仍算在用，并在风险里标出。」（[同上](../../tasks/archived/本机取数迁往Backend清点_Task_2026-10-14.md)）

「云服务器能否访问这些源未实测。」（[同上](../../tasks/archived/本机取数迁往Backend清点_Task_2026-10-14.md)）

Claude 审阅专节：未记录。不能把本表当成已实施的迁移。

## 重跑

无脚本。只读对照登记表与调用方源码。原始数据 `.local/local-fetch-migration/summary.md`（2026-10-14 14:50）。
