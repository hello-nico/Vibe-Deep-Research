# 数据源端点目录(registry v1.0.0,共 54 个)

由 `scripts/gen_catalog.py` 从 `registry.json` 生成,勿手改。调用方式:`.venv/bin/python .agents/skills/data-access/scripts/fetch_endpoint.py --endpoint <id> --symbol <代码> [--args '<JSON>'] --out-dir <运行目录>`;legacy 端点为 Phase 0 的独立脚本。合规级:cn-public = 国内公开网页接口;S = 官方政府数据;B = 非官方 / 个人研究;C = 仅个人研究(CBOE 条款);rss-public = 公开 RSS。
symbol_kind:cn6 = A 股 6 位码;us = 美股 ticker;hk = 港股 5 位;global = 美股 / 港股自动判别;raw = 原样透传(指数 / 关键词 / 期权标的);none = 不需要标的。

## 1 行情(3)

| id | 标题 | 市场 | 源 | 合规 | symbol_kind | 阶段 | 鉴权 / 备注 |
|---|---|---|---|---|---|---|---|
| `fetch_trade_calendar` | 交易日历(参考报价日 / 盘前盘后) | CN | baostock | cn-public | none | profile:required |  |
| `tx_quote` | 腾讯实时行情(个股 / 指数 / ETF / 北交所,含僵尸报价判定) | CN | tencent | cn-public | raw | - | 指数 / ETF 请带前缀(sh000001 / sh510050);fetch_quote 仍是阶段必需的主行情脚本 |
| `tx_quotes_batch` | 腾讯批量行情(默认 A股四大指数 + 美股道指纳指 + 港股恒生与恒生科技) | CN/US/HK | tencent | cn-public | none | - |  |

## 2 研报(2)

| id | 标题 | 市场 | 源 | 合规 | symbol_kind | 阶段 | 鉴权 / 备注 |
|---|---|---|---|---|---|---|---|
| `em_reports` | 个股研报列表(标题 / 机构 / 评级 / 三年 EPS 预测) | CN | eastmoney | cn-public | cn6 | estimates:optional, risk:optional | PDF 可由 infoCode 拼 pdf.dfcfw.com 下载;reportapi 只认 6 位码 |
| `em_industry_reports` | 行业研报列表 | CN | eastmoney | cn-public | none | - |  |

## 3 信号(9)

| id | 标题 | 市场 | 源 | 合规 | symbol_kind | 阶段 | 鉴权 / 备注 |
|---|---|---|---|---|---|---|---|
| `em_concept_blocks` | 个股所属板块 / 概念归属 | CN | eastmoney | cn-public | cn6 | profile:optional |  |
| `em_fund_flow_minute` | 个股资金流(分钟级,当日) | CN | eastmoney | cn-public | cn6 | - | 盘中才有;ETF 不覆盖 |
| `em_dragon_tiger` | 个股龙虎榜(上榜记录 / 席位 / 机构) | CN | eastmoney | cn-public | cn6 | risk:optional |  |
| `em_lockup_expiry` | 限售解禁(历史 + 未来 90 天) | CN | eastmoney | cn-public | cn6 | risk:optional |  |
| `em_industry_comparison` | 行业板块涨跌排名 | CN | eastmoney | cn-public | none | - |  |
| `em_board_fund_flow` | 板块资金流向(行业 / 概念 / 地域 × 今日 / 5 日 / 10 日) | CN | eastmoney | cn-public | none | - |  |
| `em_daily_dragon_tiger` | 全市场龙虎榜 | CN | eastmoney | cn-public | none | - |  |
| `ths_hot_reason` | 同花顺当日强势股 + 题材归因 | CN | ths | cn-public | none | - | --args {"date":"YYYY-MM-DD"} |
| `ths_hsgt_realtime` | 沪深股通分钟累计净买入(亿元) | CN | ths | cn-public | none | - |  |

## 4 资金筹码(5)

| id | 标题 | 市场 | 源 | 合规 | symbol_kind | 阶段 | 鉴权 / 备注 |
|---|---|---|---|---|---|---|---|
| `em_fund_flow_120d` | 个股资金流(日级 120 日) | CN | eastmoney | cn-public | cn6 | - | push2his 在部分网络(含本机)不通,失败属预期;备源见 fund_flow_backup |
| `em_margin_trading` | 融资融券明细(日级) | CN | eastmoney | cn-public | cn6 | risk:optional |  |
| `em_block_trade` | 大宗交易 | CN | eastmoney | cn-public | cn6 | risk:optional |  |
| `em_holder_num` | 股东户数变化(季度) | CN | eastmoney | cn-public | cn6 | risk:optional |  |
| `em_dividend_history` | 分红送转历史 | CN | eastmoney | cn-public | cn6 | valuation:optional |  |

## 5 新闻(3)

| id | 标题 | 市场 | 源 | 合规 | symbol_kind | 阶段 | 鉴权 / 备注 |
|---|---|---|---|---|---|---|---|
| `em_stock_news` | 东财个股新闻 | CN | eastmoney | cn-public | cn6 | risk:optional |  |
| `em_global_news` | 东财全球财经资讯 7x24 | CN | eastmoney | cn-public | none | - |  |
| `rss_news` | RSS 新闻雷达(106 个 tier-1 策展源 × 12 行业,红线关键词标记) | CN/US/HK | rss(investment-news) | rss-public | none | - | --args {"industry":"semiconductor"} 或 {"sources":["OpenAI"]};行业 key 见 rss_sources.json |

## 6 基础数据(1)

| id | 标题 | 市场 | 源 | 合规 | symbol_kind | 阶段 | 鉴权 / 备注 |
|---|---|---|---|---|---|---|---|
| `em_stock_info` | 东财个股基本面(股本 / 市值 / 行业 / 上市日) | CN | eastmoney | cn-public | cn6 | profile:optional | 与 fetch_profile(腾讯 + baostock)交叉核对用 |

## 8 打板(9)

| id | 标题 | 市场 | 源 | 合规 | symbol_kind | 阶段 | 鉴权 / 备注 |
|---|---|---|---|---|---|---|---|
| `em_zt_pool` | 东财涨停池 | CN | eastmoney | cn-public | none | - | --args {"date":"YYYYMMDD"} 指定交易日,默认北京时间当天 |
| `em_zb_pool` | 东财炸板池 | CN | eastmoney | cn-public | none | - | --args {"date":"YYYYMMDD"} 指定交易日,默认北京时间当天 |
| `em_dt_pool` | 东财跌停池 | CN | eastmoney | cn-public | none | - | --args {"date":"YYYYMMDD"} 指定交易日,默认北京时间当天 |
| `em_yzt_pool` | 东财昨日涨停池(今日表现) | CN | eastmoney | cn-public | none | - | --args {"date":"YYYYMMDD"} 指定交易日,默认北京时间当天 |
| `em_limit_up_sentiment` | 打板三池计数(涨停 / 炸板 / 跌停;炸板率等由 calc 算) | CN | eastmoney | cn-public | none | - |  |
| `em_stock_monitor` | 东财重点监控池 | CN | eastmoney | cn-public | none | - |  |
| `em_price_anomaly` | 日内严重异常波动明细 | CN | eastmoney | cn-public | none | - |  |
| `em_price_anomaly_count` | 异常波动统计(按标的聚合) | CN | eastmoney | cn-public | none | - |  |
| `ths_limit_up_pool` | 同花顺涨停揭秘(原因题材 / 封板率 / 板型) | CN | ths | cn-public | none | - |  |

## 10 情绪(5)

| id | 标题 | 市场 | 源 | 合规 | symbol_kind | 阶段 | 鉴权 / 备注 |
|---|---|---|---|---|---|---|---|
| `em_hot_rank` | 东财人气榜 | CN | eastmoney | cn-public | none | - |  |
| `em_hot_concept` | 个股热门概念命中 | CN | eastmoney | cn-public | cn6 | - |  |
| `ths_hot_list` | 同花顺热榜(人气 / 概念标签) | CN | ths | cn-public | none | - |  |
| `cninfo_irm` | 互动易问答(投资者提问 + 公司回复) | CN | cninfo | cn-public | cn6 | risk:optional |  |
| `em_turnover_rank` | 全市场成交额榜(沪深京 A 股) | SH/SZ/BJ | eastmoney | cn-public | none | - | 客观公开榜单(东财行情中心同款),只做客观展示 —— 非推荐、非预测、不评分。 |

## 7 公告(1)

| id | 标题 | 市场 | 源 | 合规 | symbol_kind | 阶段 | 鉴权 / 备注 |
|---|---|---|---|---|---|---|---|
| `cninfo_announcements` | 巨潮公告(全文检索,动态 orgId) | CN | cninfo | cn-public | cn6 | risk:optional |  |

## G1 行情(3)

| id | 标题 | 市场 | 源 | 合规 | symbol_kind | 阶段 | 鉴权 / 备注 |
|---|---|---|---|---|---|---|---|
| `tx_us_quote` | 腾讯美股实时行情(71 字段) | US | tencent | cn-public | us | - |  |
| `tx_hk_quote` | 腾讯港股实时行情(78 字段) | HK | tencent | cn-public | hk | - |  |
| `em_global_quote` | 东财 push2 实时行情(美股 / 港股统一) | US/HK | eastmoney | cn-public | global | - |  |

## G4 财务(4)

| id | 标题 | 市场 | 源 | 合规 | symbol_kind | 阶段 | 鉴权 / 备注 |
|---|---|---|---|---|---|---|---|
| `em_global_income` | 东财全球财报 — 利润表(美股 / 港股,按科目行) | US/HK | eastmoney | cn-public | global | - |  |
| `em_global_balance` | 东财全球财报 — 资产负债表(美股 / 港股,按科目行) | US/HK | eastmoney | cn-public | global | - |  |
| `em_global_cashflow` | 东财全球财报 — 现金流量表(美股 / 港股,按科目行) | US/HK | eastmoney | cn-public | global | - |  |
| `em_global_key_indicators` | 东财关键财务指标(美股 49 列 / 港股 75 列) | US/HK | eastmoney | cn-public | global | - |  |

## G5 资金(1)

| id | 标题 | 市场 | 源 | 合规 | symbol_kind | 阶段 | 鉴权 / 备注 |
|---|---|---|---|---|---|---|---|
| `em_global_fund_flow` | 东财日级资金流(美股 / 港股) | US/HK | eastmoney | cn-public | global | - |  |

## G8 工具(2)

| id | 标题 | 市场 | 源 | 合规 | symbol_kind | 阶段 | 鉴权 / 备注 |
|---|---|---|---|---|---|---|---|
| `em_stock_search` | 东财全球股票搜索(代码 / 市场 / 中文名) | US/HK | eastmoney | cn-public | raw | - |  |
| `em_market_list` | 东财全市场列表(NASDAQ / NYSE / 美股 ETF / 港股 排名) | US/HK | eastmoney | cn-public | none | - |  |

## 13 产业温度计(4)

| id | 标题 | 市场 | 源 | 合规 | symbol_kind | 阶段 | 鉴权 / 备注 |
|---|---|---|---|---|---|---|---|
| `tw_monthly_revenue` | 产业温度计 · 台系供应链月营收(FinMind 零鉴权):台光 / 台燿 / 金像电 / 联亚,环比 · 同比 · 累计同比 · 台光×金像电差分 | CN | finmind | public-api-free(api.finmindtrade.com,无 key;台股法定月营收) | none | risk:optional | 每月 10 日前披露、滞后 ~10 天;402 = 配额 / 限流必须出声;资料期 > 2 个月标 partial;证据 market=TW / symbol=台股代码,币种 TWD。读法护栏在 note 与 extra.guard |
| `gpu_rent_thermometer` | 产业温度计 · GPU 租金(近一年逐日中位 + 现货 + Kalshi 远期概率):算力缺不缺的一根线 | CN | 500farm+kalshi | public-api-free(500.farm Prometheus 代理 + api.elections.kalshi.com trade-api v2,无 key) | none | risk:optional | 曲线 = 500.farm 对 Vast 可租挂单的逐日中位(按机型档位分组统计后聚合,**不是**逐张挂单精确中位);🔴 现货 = 曲线的最新采样点,同源同算法 ⇒ 卡片数字与曲线末端严格一致(旧版现货走 Vast bundles,与曲线对不上且只有两张卡);型号名用统计站 label 原文(H100 SXM / A100 SXM4,写错只会安静返回空序列);Prometheus 空窗会给 NaN/Inf,必须丢弃(进 JSON 会让整条端点失败);挂单卡数是规模读数不是信号本体,拿不到给 None 不算失败;Kalshi 三分判定(格式变 / 未开盘 / 有报价);$3 是折旧参考线不是保本线;证据 market=US / symbol=GPU 型号;曲线走 extra(序列不是证据) |
| `cn_commodity_futures` | 产业温度计 · 上游大宗期货(新浪连续合约:沪铜 / 沪锡 / 沪铝 / 沪镍 / 工业硅) | CN | sina_futures | public-api-free(akshare futures_zh_daily_sina,无 key) | none | risk:optional | 全市场证据 → symbol=MARKET / record_key=品种代码;期货价不是本公司采购价(护栏原样进 note);工业硅需求由光伏主导对半导体是弱信号;资料超 10 天未更新标 stale 并降 partial;逐品种隔离失败,全失败才抛;DataFrame 非传输层原文 → record_raw(kind=extracted) |
| `dram_spot_thermo` | 产业温度计 · DRAM / NAND 现货均价(GitHub 社区仓转录的 DRAMeXchange) | CN | github-community | public-repo-free(raw.githubusercontent.com,无 key) | none | risk:optional | 🔴 社区转录的 DRAMeXchange 存档不是官方一手(可能有转录误差与停更),护栏必须原样带出;DRAM 现货是 HBM 的影子指标不是 HBM 价格(HBM 走年度长约无公开现货价);ddr5 序列无 product 字段 → 规格如实写"未在数据中标明";全市场证据 symbol=MARKET / record_key=品类;超 14 天标 stale 降 partial |

## 17 招聘信号(1)

| id | 标题 | 市场 | 源 | 合规 | symbol_kind | 阶段 | 鉴权 / 备注 |
|---|---|---|---|---|---|---|---|
| `hiring_anchor_signal` | 招聘信号 · 产业锚点公司公开在招岗位(Greenhouse / Ashby 零鉴权) | CN | ats-public | public-api-free(boards-api.greenhouse.io / api.ashbyhq.com,无 key;只读公开岗位不碰简历) | none | risk:optional | 锚点清单在 industry_tags.json 的 hiring_anchors(与温度计同一处配置);⛔ Workday 系(NVIDIA/Coherent/Lumentum/Marvell/Micron)需 host+tenant+site 非零配置,不收、如实写未接入;岗位数是招聘意图不是产能,只在同一公司内部比变化;全市场证据 symbol=MARKET / record_key=ats:slug;逐家隔离失败,全失败才抛;解析不出 jobs 数组=结构变了必须抛 |

## 18 宏观概率(1)

| id | 标题 | 市场 | 源 | 合规 | symbol_kind | 阶段 | 鉴权 / 备注 |
|---|---|---|---|---|---|---|---|
| `macro_probability` | 宏观概率 · 预测市场对宏观事件的定价概率(Kalshi + Polymarket,零鉴权) | CN/US/HK | prediction-markets(kalshi+polymarket) | public-api-free(api.elections.kalshi.com / gamma-api.polymarket.com,无 key;只读公开行情,不下单不涉资金) | none | risk:optional | 移植自 GlobalPercent 的模块分类器与取数形态。只收 6 个核心模块(货币政策 / 宏观经济 / 地缘政治 / 政治选举 / 股指大宗 / AI科技),参考类(加密 / 体育 / 娱乐 / 其他)丢弃;每模块取前 3(排序键 = max(24h 成交量, 未平仓量) —— 月度宏观合约典型是持仓大、当日安静,只看当日量会被冷门合约挤掉)。**近端允许安静、远期必须有 24h 成交量** —— 纯日期窗口会误杀有意义的远期宏观合约(实测「Recession in 2027?」有真实成交却结算在 500 多天后),纯流动性又留不住 2099 年的僵尸盘。⚠️ 这是**市场当前的定价预期,不是事实也不是预测**,概率随时在变、只在 as_of 那一刻成立;低成交量合约噪音极大。⚠️ Kalshi 的成交量字段是 volume_24h_fp / volume_fp(不是 volume_24h),且服务端**忽略 category 查询参数**,只能翻页后本地分类。 |
