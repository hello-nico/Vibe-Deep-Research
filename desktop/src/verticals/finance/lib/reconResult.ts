import { matchesArrival, readGradeInfo, reportName, type GradeInfo, type ReportArrival } from './reportArrival';
import { loadResearchTasks, researchActive, type ResearchRecord } from './researchTasks';
import type { ReconCard } from './quarterRecon';

/** 财报卡第三行「重研结论」：研究是否已按这份财报重新做过、档位变了没有。 */
export interface ReconResult { text: string; /** 估值档位变了：卡片置顶并标「判断变化」。 */ changed: boolean; id?: string; pending?: boolean }
export const reconResultKey = (card: Pick<ReconCard, 'symbol' | 'period'>) => `${card.symbol}:${card.period}`;

/** 披露日（北京时间当天 0 点）。 */
const disclosedAt = (date: string) => Date.parse(`${date}T00:00:00+08:00`);

/**
 * - 该公司有进行中的研究任务 → 「重新研究中 3/6」；
 * - 研究完成时间不早于披露日 → 「估值从偏低变为合理」或「估值没变（合理）」；没有上一版档位可比时写「三季报后估值合理」；
 * - 都没有不写。
 */
export function reconResult(card: Pick<ReconCard, 'symbol' | 'date' | 'period'>, active: ResearchRecord | undefined, info: GradeInfo | null | undefined, arrival?: ReportArrival | null): ReconResult | null {
  const label = reportName(card.period);
  if (active) return { text: `重新研究中 ${Math.min(active.current_step, active.steps.length)}/${active.steps.length}`, changed: false };
  if (arrival && matchesArrival(card, arrival)) return { text: arrival.text, changed: false, pending: true, id: arrival.id };
  if (!info?.grade || !info.researchedAt || !(Date.parse(info.researchedAt) >= disclosedAt(card.date))) return null;
  if (!info.previousGrade) return { text: `${label}后估值${info.grade}`, changed: false };
  if (info.previousGrade === info.grade) return { text: `估值没变（${info.grade}）`, changed: false };
  return { text: `估值从${info.previousGrade}变为${info.grade}`, changed: true, id: `recon:${card.symbol}:${card.period}:${info.previousGrade}>${info.grade}` };
}

/** 读各财报卡公司的研究任务与档位（只读 GET）；读不到的公司当没有。 */
export async function loadReconResults(cards: readonly ReconCard[], signal?: AbortSignal, onError?: (error: unknown) => void): Promise<Record<string, ReconResult | null>> {
  if (!cards.length) return {};
  let records: ResearchRecord[] = [];
  try { records = await loadResearchTasks({ limit: 50 }, signal); } catch (error) { if (!signal?.aborted) onError?.(error); }
  const entries = await Promise.all(cards.map(async card => {
    const active = records.find(record => record.symbol === card.symbol && researchActive(record));
    const info = active || card.arrival ? null : await readGradeInfo(card.symbol, signal, onError);
    return [reconResultKey(card), reconResult(card, active, info, card.arrival)] as const;
  }));
  return Object.fromEntries(entries);
}
