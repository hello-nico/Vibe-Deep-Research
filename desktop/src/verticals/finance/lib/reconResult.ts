import { readGradeInfo, type GradeInfo } from './reportArrival';
import { loadResearchTasks, researchActive, type ResearchRecord } from './researchTasks';
import { reconLabel, type ReconCard } from './quarterRecon';

/** 财报卡第三行「重研结论」：研究是否已按这份财报重新做过、档位变了没有。 */
export interface ReconResult { text: string; /** 估值档位变了：卡片置顶并标「判断变化」。 */ changed: boolean; /** 用于已看标记，档位变了才有。 */ id?: string }

/** 披露日（北京时间当天 0 点）。 */
const disclosedAt = (date: string) => Date.parse(`${date}T00:00:00+08:00`);

/**
 * - 该公司有进行中的研究任务 → 「正在按三季报重新研究（3/6）」；
 * - 研究完成时间不早于披露日 → 「已按三季报重新研究：估值从偏低变为合理」或「估值判断没变（合理）」；没有上一版档位可比时只写「估值合理」；
 * - 都没有不写。
 */
export function reconResult(card: Pick<ReconCard, 'symbol' | 'date' | 'period'>, active: ResearchRecord | undefined, info: GradeInfo | null | undefined): ReconResult | null {
  const label = reconLabel(card.period);
  if (active) return { text: `正在按${label}重新研究（${Math.min(active.current_step, active.steps.length)}/${active.steps.length}）`, changed: false };
  if (!info?.grade || !info.researchedAt || !(Date.parse(info.researchedAt) >= disclosedAt(card.date))) return null;
  const head = `已按${label}重新研究：`;
  if (!info.previousGrade) return { text: `${head}估值${info.grade}`, changed: false };
  if (info.previousGrade === info.grade) return { text: `${head}估值判断没变（${info.grade}）`, changed: false };
  return { text: `${head}估值从${info.previousGrade}变为${info.grade}`, changed: true, id: `recon:${card.symbol}:${card.period}:${info.previousGrade}>${info.grade}` };
}

/** 读各财报卡公司的研究任务与档位（只读 GET）；读不到的公司当没有。 */
export async function loadReconResults(cards: readonly ReconCard[], signal?: AbortSignal): Promise<Record<string, ReconResult | null>> {
  if (!cards.length) return {};
  let records: ResearchRecord[] = [];
  try { records = await loadResearchTasks({ limit: 50 }, signal); } catch { /* 读不到当没有进行中的任务 */ }
  const entries = await Promise.all(cards.map(async card => {
    const active = records.find(record => record.symbol === card.symbol && researchActive(record));
    const info = active ? null : await readGradeInfo(card.symbol, signal);
    return [card.symbol, reconResult(card, active, info)] as const;
  }));
  return Object.fromEntries(entries);
}
