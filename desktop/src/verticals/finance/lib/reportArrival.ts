import { researchRead } from './research';
import { gradeLabel } from './companyNarrative';
import { storageGet, storageSet } from './storage';
import { companyNameOf, researchActive, researchLine, type ResearchRecord } from './researchTasks';

/**
 * 财报到达自动重研（宿主定时触发，记录里 `trigger: "report_arrival"`）。
 * 结论写在动态的财报卡上（`reconResult.ts`），未看的判断变化由导航「动态」旁的小圆点提示（`feedAttention.ts`）。
 * 档位只用研究读口：当前档位 `grade` 与上一版 `previousGrade`；只有这条任务保存的那一版才拿来比。
 */
export const REPORT_ARRIVAL = 'report_arrival';
export interface GradeInfo { grade: string | null; previousGrade: string | null; researchedAt: string | null; /** 最近一次对话写回的确认时间；不是对话写回为空。 */ writeback?: string | null }

const NAMES: Record<string, string> = { Q1: '一季报', H1: '半年报', Q3: '三季报' };
/** 2026Q3 → 三季报，2026H1 → 半年报，FY2025 → 年报；认不出时写「定期报告」。 */
export function reportName(period: string | null | undefined): string {
  const text = String(period ?? '').replace(/^TTM:/, '');
  if (/^FY\d{4}$/.test(text) || /Q4$/.test(text)) return '年报';
  return NAMES[/(Q[13]|H1)$/.exec(text)?.[1] ?? ''] ?? '定期报告';
}

export const isArrival = (record: ResearchRecord) => record.trigger === REPORT_ARRIVAL;
const periodOf = (record: ResearchRecord) => record.trigger_period || record.report_period || null;

export async function readGradeInfo(symbol: string, signal?: AbortSignal): Promise<GradeInfo | null> {
  try {
    const page = await researchRead<{ research?: { valuation?: { grade?: string }; researchedAt?: string } | null; previousGrade?: string | null }>(`/wiki/companies/${symbol}/page-research`, { signal });
    return { grade: page.research?.valuation?.grade ?? null, previousGrade: page.previousGrade ?? null, researchedAt: page.research?.researchedAt ?? null };
  } catch { return null; }
}

/** 这条任务保存的研究才有可比的上一档：保存时间不早于任务开始，且有上一版。 */
export const changed = (value: ReturnType<typeof gradeChange>) => value !== null && value !== 'same';
export function gradeChange(record: ResearchRecord, info: GradeInfo | null | undefined): { from: string; to: string } | 'same' | null {
  if (!info?.grade || !info.previousGrade || !info.researchedAt) return null;
  if (Date.parse(info.researchedAt) < Date.parse(record.created_at)) return null;
  return info.grade === info.previousGrade ? 'same' : { from: info.previousGrade, to: info.grade };
}

/** 一行的文字。自动重研：进行中写原因，完成写结果；其余状态与手动研究一样。 */
export function researchRowLine(record: ResearchRecord, info?: GradeInfo | null): string {
  if (!isArrival(record)) return researchLine(record, info?.grade);
  const report = reportName(periodOf(record));
  if (researchActive(record)) return `${companyNameOf(record)}${report}已披露，正在按新报告重新研究`;
  if (record.status !== 'completed') return researchLine(record, info?.grade);
  const change = gradeChange(record, info);
  if (change === 'same') return `已按${report}更新：估值判断没变`;
  if (change) return `已按${report}更新：${gradeLabel(change.from)}→${gradeLabel(change.to)}`;
  return info?.grade ? `已按${report}更新：${gradeLabel(info.grade)}` : `已按${report}更新`;
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
