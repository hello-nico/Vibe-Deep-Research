import { researchRead } from './research';
import { api } from './api';
import { localService } from './localService';
import { plainNumber, yiText } from './companyNarrative';
import { qualifiedWatch, shortName, toNumber, type TrackingVariables } from './trackingVariables';

/** Backend `GET /wiki/companies/{symbol}/quarter-reconciliation`：最新一季相对上季的归母净利变化，以及价格变量能解释多少。 */
export interface ReconVariable {
  var_id: string; name?: string | null; unit?: string | null; previous_mean: string; mean: string; move: string; contribution: string;
}
export interface Reconciliation {
  symbol: string; status: 'ok' | 'gap'; reason?: string;
  period?: string; previous_period?: string; actual?: string; previous?: string; change?: string; reported_on?: string | null;
  variables?: ReconVariable[]; unexplained?: string[]; price_total?: string | null; rest?: string | null;
}
export interface ReconCard {
  symbol: string; company: string; period: string;
  /** 第一层：公司、哪份报告、单季净利润、比上季多少。 */
  headline: string;
  /** 有价格模型时的半句：价格带来多少、其余多少。 */
  explain?: string;
  /** 展开后的逐项说明。 */
  details: string[];
}

export const RECON_DAYS = 14;
const LABEL = ['', '一季报', '半年报', '三季报', '年报'];
export const reconLabel = (period: string) => LABEL[Number(period.slice(-1))] ?? '季报';
const signedYi = (value: number) => `${value > 0 ? '+' : value < 0 ? '-' : ''}${yiText(Math.abs(value))}`;
const dayDiff = (iso: string, now: Date) => Math.floor((now.getTime() - Date.parse(`${iso}T00:00:00+08:00`)) / 86400000);

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
    const explain = price != null && rest != null && variables.length
      ? `${variables.map(variable => variable.name).filter(Boolean).join('、')}变化约带来 ${signedYi(price)}，其余 ${signedYi(rest)}来自量和成本等，报告未单独披露` : undefined;
    const details = [
      ...variables.map(variable => {
        const now = toNumber(variable.mean), before = toNumber(variable.previous_mean), part = toNumber(variable.contribution);
        const digits = (value: number) => plainNumber(value, Number.isInteger(value) ? 0 : 2);
        return `${variable.name ?? '价格'}：本季均价 ${now == null ? '暂缺' : digits(now)}，上季 ${before == null ? '暂缺' : digits(before)}${variable.unit ? ` ${variable.unit}` : ''}，约带来 ${part == null ? '暂缺' : signedYi(part)}`;
      }),
      ...(item.unexplained?.length ? [`没有算进价格部分：${item.unexplained.join('、')}（没有可读的价格或行情不足）`] : []),
      ...(variables.length ? ['价格部分 = 年化系数 × (本季均价 − 上季均价) ÷ 4，只解释环比变化，不代表准确度'] : []),
    ];
    return [{ symbol: item.symbol, company, period: item.period, headline, explain, details }];
  });
}

/** 并发读各关注公司的对账；任何一家读不到当没有。没有研究、数据不全时 Backend 返回 gap。
 *  Backend 每家要现拉价格序列，慢的要十几秒：每到一家就用 `onProgress` 交出当前已有的卡（按关注顺序），不等全部读完。 */
export async function loadReconCards(data: TrackingVariables | null, signal?: AbortSignal, now = new Date(), onProgress?: (cards: ReconCard[]) => void): Promise<ReconCard[]> {
  if (!data) return [];
  const { symbols } = await localService.clientWatch();
  const skip = new Set(data.coverage.unresearched);
  const targets = qualifiedWatch(symbols).filter(symbol => !skip.has(symbol));
  const names = new Map(data.variables.flatMap(variable => variable.companies.map(company => [company.symbol, shortName(company.name)] as const)));
  // 变量接口里没有名字的公司，一次行情请求补名字，与对账请求同时进行。
  const nameless = targets.filter(symbol => !names.has(symbol)).map(symbol => symbol.split('.')[0]!).join(',');
  const quoted = nameless ? api.quote(nameless).catch(() => ({} as Record<string, { name?: string }>)) : Promise.resolve({} as Record<string, { name?: string }>);
  const order = new Map(targets.map((symbol, index) => [symbol, index]));
  const arrived: Reconciliation[] = [];
  const current = async () => {
    const quotes = await quoted;
    for (const item of arrived) { const quote = quotes[item.symbol.split('.')[0]!]; if (!names.has(item.symbol) && quote?.name) names.set(item.symbol, shortName(quote.name)); }
    return reconCards([...arrived].sort((a, b) => (order.get(a.symbol) ?? 0) - (order.get(b.symbol) ?? 0)), Object.fromEntries(names), now);
  };
  let next = 0;
  await Promise.all(Array.from({ length: Math.min(4, targets.length) }, async () => {
    while (next < targets.length) {
      const symbol = targets[next++]!;
      try {
        const item = await researchRead<Reconciliation>(`/wiki/companies/${symbol}/quarter-reconciliation`, { signal });
        if (item.status !== 'ok' || signal?.aborted) continue;
        arrived.push(item);
        if (onProgress) onProgress(await current());
      } catch { /* 读不到的公司不出卡 */ }
    }
  }));
  return current();
}
