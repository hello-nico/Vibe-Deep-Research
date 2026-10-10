/**
 * **界面查询声明**(金融垂类):每一屏要哪些数据、在回答什么问题。
 *
 * 🔴 这是"页面不再认识物理端点名"的那一层。前端只说 `page("review")`,
 *    端点 id、参数、分页上限全在这里 —— 端点改名或换源,前端一行不用改,
 *    界面上也就不会再印出 `em_limit_up_sentiment` 这种东西。
 *
 * 🔴 **每日复盘看的是过去**:已经收完盘的那一天 —— 盘中打开显示上一个交易日,
 *    盘后打开显示今天。半天的盘中数据不是复盘,而且"不完整"这件事从数字上看不出来。
 *    判定不在前端做(用户机器的时区与时钟都不可信),由 `session.ts` 解析后注入。
 *
 * 现用查询只有 `review`;`signals` 暂留,是否保留随 `/signals` 页面的导航收拢决定。
 */
import type { PageContextDef, PageQueryDef } from "../plugin.ts";
import { calendarFromEnvelope, resolveSession } from "./session.ts";

/** 板块资金流:**取全 496 个**。默认 50 只够看流入侧,"净流出最多"那一栏会全是净流入的板块 */
const BOARD_FLOW_ARGS = { board_type: "industry", period: "today", top_n: 500 } as const;

export const FINANCE_PAGE_CONTEXT: PageContextDef = {
  endpoint: "fetch_trade_calendar",
  // 日历端点要一个主体,但只用来定位市场;给一个稳定的大盘股即可
  symbol: "300308",
  unavailable: "拿不到交易日历,无法确定该看哪一天 —— 下面的数据可能不是你以为的那一天",
  resolve: (envelope) => {
    const facts = calendarFromEnvelope(envelope as never);
    if (!facts) return null;
    const s = resolveSession(facts);
    /**
     * 同一个"看哪一天",**产出两种写法**,由各块用 `injectAs` 显式挑:
     *   `date`         → `YYYY-MM-DD`(全市场龙虎榜要这个)
     *   `date_compact` → `YYYYMMDD` (涨停情绪 / 涨停梯队要这个)
     *
     * 🔴 写法挑错**不会报错**:上游返回空集,端点如实报「四池皆空」「池为空」
     *    「无龙虎榜数据(非交易日或盘后未更新)」—— 三句都读起来像真实行情,
     *    不像格式不对。实测涨停 77 家因此被显示成 **0 家**,而页面上看不出异常。
     * ⚠️ 哪个端点要哪种,只能真跑一次比证据条数;签名核不出取值写法。
     * ⚠️ 声明了 `injectAs` 就**只注入列出的键** —— 否则多出来的那个会被参数白名单拒掉。
     */
    const compact = s.review_date ? s.review_date.replace(/-/g, "") : s.review_date;
    return { values: { ...s }, inject: { date: s.review_date, date_compact: compact } };
  },
};

export const FINANCE_PAGE_QUERIES: Record<string, PageQueryDef> = {
  review: {
    title: "每日复盘",
    intent: "已经收完盘的那一天,场内资金在玩哪些板块",
    // 🔴 盘中打开 → 上一个交易日;盘后 → 今天。由后端解析,不让前端按本地时间猜。
    needsContext: true,
    blocks: [
      { id: "sentiment", title: "情绪", note: "涨停 / 炸板 / 跌停三个计数", endpoint: "em_limit_up_sentiment", injectContext: true, injectAs: { date_compact: "date" } },
      { id: "reason", title: "强势股原因", note: "同花顺的题材归因:是市场叙事,不是核验过的因果", endpoint: "ths_hot_reason", injectContext: true, injectAs: { date: "date" } },
      { id: "zt_pool", title: "涨停梯队", note: "按连板数排;说明栏是取数层原文(含首封时间)", endpoint: "em_zt_pool", injectContext: true, injectAs: { date_compact: "date" } },
      // 短线情绪的封板率 / 炸板率 / 晋级率要这两个池,与涨停池同一业务日;不带日期会读到任意一天的旧快照
      { id: "zb_pool", title: "炸板池", note: "当日触及涨停后打开的个股;用于封板率与炸板率", endpoint: "em_zb_pool", injectContext: true, injectAs: { date_compact: "date" } },
      { id: "yzt_pool", title: "昨日涨停池", note: "上一交易日涨停股在本业务日的表现;用于晋级率", endpoint: "em_yzt_pool", injectContext: true, injectAs: { date_compact: "date" } },
      // ⚠️ 这个源**只给当日**(period 只有 today / 5d / 10d,没有"指定某一天")——
      //    所以盘中打开时它是**今天的进行时**,与本页其余几块的业务日期不是同一天。
      //    如实写在 note 里,别让人以为整页都是同一天(这正是 mixed_ages 要提醒的那类问题)。
      { id: "board_flow", title: "板块资金流(行业)", note: "主力净额从大到小;全市场口径。⚠️ 此源只给当日:盘中看到的是今天的进行时,不是复盘那一天", endpoint: "em_board_fund_flow", args: BOARD_FLOW_ARGS },
      { id: "turnover", title: "全市场成交额榜", note: "沪深京 A 股按成交额排序的客观榜单", endpoint: "em_turnover_rank" },
      // ⚠️ 要的是**市场级日榜** `em_daily_dragon_tiger`(symbol_kind=none);
      //    `em_dragon_tiger` 是**单只主体**的上榜记录,需要 symbol,放在这一页会永远缺 symbol 报错。
      //    (我先前正是拿错了那个,把它当成"这一页不该有龙虎榜"给删了 —— 删错了。)
      // ⚠️ 这个端点的参数叫 `trade_date`,不是 `date` —— 整包注入过去会 TypeError,
      //    信封 failed、证据 0 条。(它就这么静默失败过一段时间。)
      { id: "dragon", title: "龙虎榜", note: "按净买额排;同一只标的可能因多条上榜理由重复出现", endpoint: "em_daily_dragon_tiger", injectContext: true, injectAs: { date: "trade_date" } },
    ],
  },

  signals: {
    title: "产业信号",
    intent: "上下游温度计:产业链本身冷还是热 —— 这些不是本公司的业绩,是它所在的链条",
    blocks: [
      { id: "gpu_rent", title: "GPU 租金", note: "现货撮合中位 + 远期合约;需求侧温度。⚠️ 参考线是折旧口径,不是保本线" , endpoint: "gpu_rent_thermometer" },
      { id: "tw_revenue", title: "台系月营收", note: "法定月披露,滞后约 10 天 —— 追排产最快的硬数据。⚠️ 必须做差分归因,单看一家会归错因", endpoint: "tw_monthly_revenue" },
      { id: "dram", title: "DRAM 现货", note: "社区转录的影子指标,**不是官方一手价**,也不是 HBM 价格", endpoint: "dram_spot_thermo" },
      { id: "commodity", title: "大宗原材料", note: "全市场定价,**不是本公司的采购价**", endpoint: "cn_commodity_futures", collapsed: true },
      { id: "hiring", title: "招聘信号", note: "锚点公司的公开在招岗位 = 招聘意图,**不是产能**;看变化不看绝对值。未接入 ≠ 零岗位", endpoint: "hiring_anchor_signal", collapsed: true },
    ],
  },
};
