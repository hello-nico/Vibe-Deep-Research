import { wikiPages } from './research';
import { priceText, type TrackingVariables } from './trackingVariables';
import { loadWatchedValuations, nearText, valuationKey, type ValuationToday } from './valuationToday';

export interface FlipCard {
  key: string; symbol: string; company: string; kind: 'changed' | 'near'; text: string;
  involved: string; date: string; pinned: boolean;
}
export interface FlipInput { valuations: readonly ValuationToday[]; names: Record<string, string> }

export function flipCards({ valuations, names }: FlipInput): FlipCard[] {
  return valuations.flatMap<FlipCard>(item => {
    if (item.status !== 'sourced' || !item.grade || !item.as_of) return [];
    const company = names[item.symbol] || item.symbol;
    const primary = item.prices[0];
    const involved = `${company} · 股价 ${priceText(item.close)}${primary ? `，${primary.name} ${priceText(primary.value)} ${primary.unit}` : ''}`;
    if (item.grade !== item.research.grade) return [{
      key: valuationKey(item), symbol: item.symbol, company, kind: 'changed',
      text: `${company}现在估值${item.grade}（研究时${item.research.grade}）`, involved,
      date: item.changed_on ?? item.as_of, pinned: item.changed_on != null,
    }];
    return item.near ? [{ key: `valuation-near:${item.symbol}:${item.near.var_id}:${item.research.grade}>${item.near.to_grade}`, symbol: item.symbol,
      company, kind: 'near', text: nearText(item, company), involved, date: item.as_of, pinned: false }] : [];
  });
}

export interface FlipLine { varId: string; value: number; text: string }
export function flipLines({ valuations, names }: FlipInput): FlipLine[] {
  const lines = new Map<string, FlipLine>();
  for (const item of valuations) {
    if (item.status !== 'sourced' || !item.near || lines.has(item.near.var_id)) continue;
    lines.set(item.near.var_id, { varId: item.near.var_id, value: Number(item.near.value), text: nearText(item, names[item.symbol] || item.symbol) });
  }
  return [...lines.values()];
}

async function loadFlipInput(data: TrackingVariables | null | undefined, signal?: AbortSignal): Promise<FlipInput> {
  const [valuations, pages] = await Promise.all([loadWatchedValuations(signal), wikiPages('companies', signal).catch(() => [])]);
  const names: Record<string, string> = {};
  for (const variable of data?.variables ?? []) for (const company of variable.companies) names[company.symbol] = company.name;
  for (const page of pages) {
    const match = /^companies\/(\d{6})-(sh|sz|bj)$/i.exec(page.slug);
    if (match && page.title) names[`${match[1]}.${match[2]!.toUpperCase()}`] = page.title;
  }
  return { valuations, names };
}
export async function loadFlipCards(data: TrackingVariables | null | undefined, signal?: AbortSignal): Promise<FlipCard[]> { return flipCards(await loadFlipInput(data, signal)); }
export async function loadFlipLines(data: TrackingVariables | null | undefined, signal?: AbortSignal): Promise<FlipLine[]> { return flipLines(await loadFlipInput(data, signal)); }
