import { researchRead } from './research';
import { localService } from './localService';
import { priceText, qualifiedWatch } from './trackingVariables';
import { plainNumber } from './companyNarrative';

export interface ValuationToday {
  symbol: string; status: 'sourced' | 'gap' | 'not_researched'; reason: string | null;
  as_of: string | null; close: string | null;
  prices: { var_id: string; name: string; unit: string; value: string; date: string }[];
  research: { grade: string | null; base_grade: string | null; researched_at: string | null };
  grade_base: string | null; grade: string | null; changed_on: string | null;
  history: { day: string; grade: string }[];
  targets: Record<'悲观' | '中性' | '乐观', string> | null;
  near: { var_id: string; name: string; unit: string; value: string; gap_pct: string; to_grade: string } | null;
}

/** One read owner for feed, tracking and company headers; researchRead shares in-flight requests. */
export async function loadValuationToday(symbols: readonly string[], signal?: AbortSignal): Promise<ValuationToday[]> {
  const selected = qualifiedWatch(symbols).sort();
  if (!selected.length) return [];
  const result = await researchRead<{ items: ValuationToday[] }>(`/tracking/valuation-today?symbols=${selected.join(',')}`, { signal });
  if (!Array.isArray(result.items)) throw new Error('收盘估值暂不可读');
  return result.items;
}

export async function loadWatchedValuations(signal?: AbortSignal): Promise<ValuationToday[]> {
  const { symbols } = await localService.clientWatch();
  return loadValuationToday(symbols, signal);
}

export const valuationKey = (item: ValuationToday) => `valuation:${item.symbol}:${item.changed_on}:${item.research.grade}>${item.grade}`;
export const nearText = (item: ValuationToday, company: string) => item.near
  ? `${item.near.name}距 ${priceText(item.near.value)} ${item.near.unit} 只差 ${plainNumber(Number(item.near.gap_pct), 1)}%，越过后${company}估值变为${item.near.to_grade}` : '';

export function valuationLabel(item: ValuationToday | null | undefined, researchGrade: string | null | undefined): string {
  if (item?.status === 'sourced' && item.grade && item.as_of) {
    return item.grade === item.research.grade ? `估值${item.grade}`
      : `估值${item.grade}（研究时${item.research.grade}，${item.as_of.slice(5)}收盘）`;
  }
  return researchGrade ? `估值${researchGrade}（研究时）` : '';
}
