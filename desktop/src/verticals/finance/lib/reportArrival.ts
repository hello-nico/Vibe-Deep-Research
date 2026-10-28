import { aShareQualified, researchRead } from './research';
import { storageGet, storageSet } from './storage';
import type { NewMaterial } from './companyPage';
import { disclosedDay } from './utils';

/**
 * 新资料只提醒，不启动研究；判定只来自 Backend 的 new_material。
 * 历史任务的结果仍可显示；未看状态由导航「动态」旁的小圆点提示。
 * 档位只用研究读口：当前档位 `grade` 与上一版 `previousGrade`；只有这条任务保存的那一版才拿来比。
 */
export interface GradeInfo { grade: string | null; previousGrade: string | null; researchedAt: string | null; /** 最近一次对话写回的确认时间；不是对话写回为空。 */ writeback?: string | null }

export interface ReportArrival { symbol: string; period: string; material: NewMaterial; company: string; date: string | null; text: string; id: string }
export function reportArrival(symbol: string, material: NewMaterial | null, company = ''): ReportArrival | null {
  if (!material) return null;
  const period = `${material.kind}:${material.name}:${material.date}`;
  return { symbol, material, period, company: company || symbol.split('.')[0]!, date: material.date && disclosedDay(material.date),
    text: `${material.name}已出`, id: `material:${symbol}:${period}` };
}
export const matchesArrival = (card: { symbol: string; period: string }, arrival: ReportArrival) => card.symbol === arrival.symbol
  && (card.period === arrival.period || arrival.material.kind === 'report' && reportName(card.period) === arrival.material.name);

/** 只读公司研究的新资料字段；不再查询财务报告期或公司任务取名。 */
export async function loadReportArrivals(symbols: readonly string[], signal?: AbortSignal): Promise<ReportArrival[]> {
  const targets = [...new Set(symbols.map(symbol => /^\d{6}\.(SH|SZ|BJ)$/i.test(symbol)
    ? symbol.toUpperCase() : aShareQualified(symbol)).filter((value): value is string => !!value))];
  const entries = await Promise.all(targets.map(async symbol => {
    try {
      const page = await researchRead<{ new_material: NewMaterial | null }>(`/wiki/companies/${symbol}/page-research`, { signal });
      if (!page.new_material) return null;
      return reportArrival(symbol, page.new_material);
    } catch { return null; }
  }));
  return signal?.aborted ? [] : entries.filter((entry): entry is ReportArrival => entry !== null);
}

export async function readReportArrival(symbol: string, signal?: AbortSignal): Promise<ReportArrival | null> {
  return (await loadReportArrivals([symbol], signal))[0] ?? null;
}

const NAMES: Record<string, string> = { Q1: '一季报', H1: '半年报', Q2: '半年报', Q3: '三季报' };
/** 2026Q3 → 三季报，2026H1 → 半年报，FY2025 → 年报；认不出时写「定期报告」。 */
export function reportName(period: string | null | undefined): string {
  const text = String(period ?? '').replace(/^TTM:/, '');
  if (/^FY\d{4}$/.test(text) || /Q4$/.test(text)) return '年报';
  return NAMES[/(Q[123]|H1)$/.exec(text)?.[1] ?? ''] ?? '定期报告';
}

export async function readGradeInfo(symbol: string, signal?: AbortSignal): Promise<GradeInfo | null> {
  try {
    const page = await researchRead<{ research?: { valuation?: { grade?: string }; researchedAt?: string } | null; previousGrade?: string | null }>(`/wiki/companies/${symbol}/page-research`, { signal });
    return { grade: page.research?.valuation?.grade ?? null, previousGrade: page.previousGrade ?? null, researchedAt: page.research?.researchedAt ?? null };
  } catch { return null; }
}

/** 已看状态沿用原圆点的本机存储键。 */
const SEEN_KEY = 'finance.reportArrivalSeen';
const SEEN_LIMIT = 100;
export function seenArrivals(): Set<string> {
  try {
    const raw = JSON.parse(storageGet(SEEN_KEY) ?? '[]');
    return new Set(Array.isArray(raw) ? raw.filter((item): item is string => typeof item === 'string') : []);
  } catch { return new Set(); }
}
export function markArrivalsSeen(ids: readonly string[]) {
  if (!ids.length) return;
  storageSet(SEEN_KEY, JSON.stringify([...new Set([...seenArrivals(), ...ids])].slice(-SEEN_LIMIT)));
}
