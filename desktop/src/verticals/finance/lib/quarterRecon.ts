import { researchRead } from './research';
import { api } from './api';
import { localService } from './localService';
import { plainNumber, yiText } from './companyNarrative';
import { qualifiedWatch, toNumber } from './trackingVariables';
import { disclosedDay, shanghaiToday } from './utils';
import { loadReportArrivals, matchesArrival, type ReportArrival } from './reportArrival';

/** Backend `GET /wiki/companies/{symbol}/quarter-reconciliation`：最新一季相对上季的归母净利变化，以及价格变量能解释多少。 */
export interface ReconVariable {
  var_id: string; name?: string | null; unit?: string | null; previous_mean: string; mean: string; move: string; contribution: string;
}
/** 利润表单季科目：本季与上季（元，费用类为正数、减值亏损为负数），`impact` 是这一项变化对净利润的影响（费用多了记负，亏损加重记负）。 */
export interface ReconItem { metric: string; name: string; previous: string; current: string; change: string; impact: string }
export interface PreDisclosure {
  start?: string | null; end?: string | null; days?: number; stock_change?: string | null;
  industry_code?: string | null; industry_name?: string | null; industry_change?: string | null; gap?: string | null;
}
export interface ReconForecast { pre_report?: boolean | null; basis_note?: string | null; period?: string | null; value?: string | null }
export interface Reconciliation {
  symbol: string; status: 'ok' | 'gap'; reason?: string;
  period?: string; previous_period?: string; actual?: string; previous?: string; change?: string; reported_on?: string | null;
  variables?: ReconVariable[]; unexplained?: string[]; price_total?: string | null; rest?: string | null;
  items?: ReconItem[]; item_gaps?: string[]; items_total?: string | null;
  pre_disclosure?: PreDisclosure | null; forecast?: ReconForecast | null;
}
/** 利润桥：上季单季净利润 → 各项增减 → 本季单季净利润（元）。`steps` 已按影响绝对值从大到小排好，小项并进「其他」。 */
export interface ReconBridge { start: number; end: number; steps: { name: string; impact: number }[] }
export interface ReconCard {
  symbol: string; company: string; period: string;
  arrival?: ReportArrival;
  /** 尚无对账数字；date 仅作观察时点，不冒充披露日展示。 */
  reminder?: boolean;
  /** 披露日 YYYY-MM-DD；动态流按它排序。 */
  date: string;
  /** 第一层：公司、哪份报告、单季净利润、比上季多少。 */
  headline: string;
  /** 有价格模型时的半句：价格带来多少、其余多少。 */
  explain?: string;
  /** 展开后的逐项说明。 */
  details: string[];
  /** 有利润表逐项时的利润桥；只有价格模型或各项对不上时没有。 */
  bridge?: ReconBridge;
}

export const RECON_DAYS = 14;
/** 同一公司同一期只出一张卡；对账没到时也能提醒，数字到达后直接合并。 */
export function withReportReminders(cards: ReconCard[], arrivals: readonly ReportArrival[]): ReconCard[] {
  return [...cards.map(card => {
    const arrival = arrivals.find(item => matchesArrival(card, item));
    return arrival ? { ...card, arrival } : card;
  }), ...arrivals.filter(arrival => !cards.some(card => matchesArrival(card, arrival)))
    .map(arrival => ({ symbol: arrival.symbol, company: arrival.company, period: arrival.period, date: arrival.date ?? shanghaiToday(),
      headline: `${arrival.company}${arrival.text}`, details: [], reminder: true, arrival }))];
}
const LABEL = ['', '一季报', '半年报', '三季报', '年报'];
export const reconLabel = (period: string) => LABEL[Number(period.slice(-1))] ?? '季报';
export const signedYi = (value: number) => `${value > 0 ? '+' : value < 0 ? '-' : ''}${yiText(Math.abs(value))}`;
export const bridgeSummary = (bridge: ReconBridge) => `上季 ${yiText(bridge.start)} → 本季 ${yiText(bridge.end)}（${bridge.end >= bridge.start ? '多' : '少'} ${yiText(Math.abs(bridge.end - bridge.start))}）`;
const dayDiff = (iso: string, now: Date) => Math.floor((now.getTime() - Date.parse(`${iso}T00:00:00+08:00`)) / 86400000);

/** 所得税与少数股东损益是税前利润变化的机械结果，只在展开里列出，不做首句结论。 */
const MECHANICAL = new Set(['income_tax', 'minority_interest']);
/** 利润表科目里影响最大的一项做结论，后半句交代其他。 */
function itemsExplain(lines: { metric: string; name: string; impact: number }[], rest: number) {
  const top = lines.filter(line => !MECHANICAL.has(line.metric)).sort((a, b) => Math.abs(b.impact) - Math.abs(a.impact))[0];
  const lead = top ? `最大的一项是${top.name}，影响 ${signedYi(top.impact)}；` : '';
  return `${lead}其他（税金及附加、其他收益、营业外等）${signedYi(rest)}`;
}

/** 小于总变化这个比例的项并进「其他」。 */
export const BRIDGE_MIN_SHARE = 0.03;
/** 利润桥的唯一产出处：各项加「其他」必须等于本季减上季（误差 1 元内），对不上就不出桥。 */
export function reconBridge(previous: number | null, actual: number, lines: { name: string; impact: number }[], rest: number | null): ReconBridge | undefined {
  if (previous == null || rest == null || !lines.length) return undefined;
  const threshold = Math.abs(actual - previous) * BRIDGE_MIN_SHARE;
  const big = lines.filter(line => Math.abs(line.impact) >= threshold && line.impact !== 0);
  const other = rest + lines.filter(line => !big.includes(line)).reduce((sum, line) => sum + line.impact, 0);
  const steps = [...big.map(({ name, impact }) => ({ name, impact })), ...(other !== 0 ? [{ name: '其他', impact: other }] : [])]
    .sort((a, b) => Math.abs(b.impact) - Math.abs(a.impact));
  if (Math.abs(previous + steps.reduce((sum, step) => sum + step.impact, 0) - actual) > 1) return undefined;
  return { start: previous, end: actual, steps };
}

function moveText(change: string | null | undefined) {
  const value = toNumber(change);
  if (value == null) return null;
  return `${value >= 0 ? '涨' : '跌'} ${plainNumber(Math.abs(value) * 100, 1)}%`;
}
function preLines(item: Reconciliation, company: string) {
  const pre = item.pre_disclosure, stock = moveText(pre?.stock_change ?? null);
  if (!stock) return [];
  const board = pre?.industry_change != null && pre.industry_name ? `，同期${pre.industry_name}${moveText(pre.industry_change)}` : '';
  const lines = [`披露前约 60 个交易日，${company}股价${stock}${board}；业绩变化可能已部分反映在股价里。`];
  const forecast = item.forecast;
  const eps = toNumber(forecast?.value);
  if (forecast?.pre_report === false && eps != null) {
    const year = /^FY(\d{4})/i.exec(String(forecast.period ?? ''))?.[1];
    lines.push(`${forecast.basis_note || '机构'}：${year ? `${year} 年` : ''}预测每股 ${plainNumber(eps, 2)} 元`);
  }
  return lines;
}

/** 只看披露日：最近 RECON_DAYS 天内披露的季报就出卡，研究是否已经用上这份季报不影响；缺口、日期不明、超过天数的不出。 */
export function reconCards(items: readonly Reconciliation[], names: Record<string, string>, now = new Date()): ReconCard[] {
  return items.flatMap(item => {
    const change = toNumber(item.change), actual = toNumber(item.actual);
    if (item.status !== 'ok' || !item.period || change == null || actual == null || !item.reported_on) return [];
    const age = dayDiff(item.reported_on, now);
    if (!(age >= -1 && age <= RECON_DAYS)) return [];
    const company = names[item.symbol] ?? item.symbol.split('.')[0]!;
    const headline = `${company}${reconLabel(item.period)}：单季净利润 ${yiText(actual)}，比上季${change >= 0 ? '多' : '少'} ${yiText(Math.abs(change))}`;
    const price = toNumber(item.price_total), rest = toNumber(item.rest);
    const variables = item.variables ?? [];
    const lines = (item.items ?? []).flatMap(line => { const impact = toNumber(line.impact); return impact == null ? [] : [{ ...line, impact }]; });
    const priceName = `${variables.map(variable => variable.name).filter(Boolean).join('、')}变化`;
    const explain = lines.length && rest != null ? itemsExplain(lines, rest)
      : price != null && rest != null && variables.length
        ? `${priceName}约带来 ${signedYi(price)}，其余 ${signedYi(rest)}来自量和成本等，报告未单独披露` : undefined;
    const priceDetails = [
      ...variables.map(variable => {
        const now = toNumber(variable.mean), before = toNumber(variable.previous_mean), part = toNumber(variable.contribution);
        const digits = (value: number) => plainNumber(value, Number.isInteger(value) ? 0 : 2);
        return `${variable.name ?? '价格'}：本季均价 ${now == null ? '暂缺' : digits(now)}，上季 ${before == null ? '暂缺' : digits(before)}${variable.unit ? ` ${variable.unit}` : ''}，约带来 ${part == null ? '暂缺' : signedYi(part)}`;
      }),
      ...(item.unexplained?.length ? [`没有算进价格部分：${item.unexplained.join('、')}（没有可读的价格或行情不足）`] : []),
      ...(variables.length ? ['价格部分 = 年化系数 × (本季均价 − 上季均价) ÷ 4，只解释环比变化，不代表准确度'] : []),
    ];
    const details = lines.length ? [
      ...lines.map(line => {
        const now = toNumber(line.current), before = toNumber(line.previous);
        return `${line.name}：本季 ${now == null ? '暂缺' : signedYi(now)}，上季 ${before == null ? '暂缺' : signedYi(before)}，对净利润的影响 ${signedYi(line.impact)}`;
      }),
      ...(item.item_gaps?.length ? [`${item.item_gaps.join('、')}的单季数据暂缺，没有单列，归在其他里`] : []),
      `其他（税金及附加、其他收益、营业外等）：${rest == null ? '暂缺' : signedYi(rest)}；以上各项加起来等于比上季的变化`,
      ...(price != null && variables.length ? [`研究模型估计：价格变化影响约 ${signedYi(price)}（税后年化系数折季），仅供参考，不与上面各项相加`, ...priceDetails] : []),
      '价格影响与减值可能部分重叠，没有去重；科目取自利润表，单季 = 累计值相减',
    ] : priceDetails;
    return [{ symbol: item.symbol, company, period: item.period, date: disclosedDay(item.reported_on, shanghaiToday(now)), headline, explain, details: [...details, ...preLines(item, company)],
      bridge: reconBridge(toNumber(item.previous), actual, lines, rest) }];
  });
}

/** 并发读各关注公司的对账；任何一家读不到当没有。没有研究、数据不全时 Backend 返回 gap。
 *  Backend 每家要现拉价格序列，慢的要十几秒：每到一家就用 `onProgress` 交出当前已有的卡（按关注顺序），不等全部读完。 */
export async function loadReconCards(signal?: AbortSignal, now = new Date(), onProgress?: (cards: ReconCard[]) => void, onError?: (error: unknown) => void): Promise<ReconCard[]> {
  const { symbols } = await localService.clientWatch();
  const watched = qualifiedWatch(symbols);
  const targets = watched;
  const names = new Map<string, string>();
  // 当前简称与对账并行读取；卡片先显示，简称到达后补上。
  const nameless = watched.filter(symbol => !names.has(symbol)).map(symbol => symbol.split('.')[0]!).join(',');
  const quoted = nameless ? api.quote(nameless, signal).catch(() => ({} as Record<string, { name?: string }>)) : Promise.resolve({} as Record<string, { name?: string }>);
  const order = new Map(targets.map((symbol, index) => [symbol, index]));
  const arrived: Reconciliation[] = [];
  let reminders: ReportArrival[] = [];
  const current = () => withReportReminders(reconCards([...arrived].sort((a, b) => (order.get(a.symbol) ?? 0) - (order.get(b.symbol) ?? 0)), Object.fromEntries(names), now), reminders.map(item => ({ ...item, company: names.get(item.symbol) || item.company })));
  const quoteJob = quoted.then(quotes => {
    for (const symbol of watched) { const quote = quotes[symbol.split('.')[0]!]; if (quote?.name) names.set(symbol, quote.name); }
    if (!signal?.aborted && names.size && (arrived.length || reminders.length)) onProgress?.(current());
  });
  const reminderJob = loadReportArrivals(watched, signal, onError).then(items => {
    reminders = items;
    if (items.length && onProgress && !signal?.aborted) onProgress(current());
  });
  let next = 0;
  await Promise.all(Array.from({ length: Math.min(4, targets.length) }, async () => {
    while (next < targets.length) {
      const symbol = targets[next++]!;
      try {
        const item = await researchRead<Reconciliation>(`/wiki/companies/${symbol}/quarter-reconciliation`, { signal });
        if (item.status !== 'ok' || signal?.aborted) continue;
        arrived.push(item);
        if (onProgress) onProgress(current());
      } catch (error) { if (!signal?.aborted) onError?.(error); }
    }
  }));
  void quoteJob;
  await reminderJob;
  return current();
}
