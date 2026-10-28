import { loadFlipCards, type FlipCard } from './flipCards';
import { loadReconCards } from './quarterRecon';
import { loadReconResults } from './reconResult';
import { markArrivalsSeen, seenArrivals } from './reportArrival';
import { loadResearchEvents } from './researchEvents';
import { writebackGradeChanged } from './feedStream';
import { loadTrackingVariables } from './trackingVariables';

/** 动态页判断变化的稳定编号：同一件事只亮一次，档位或价格句变了才算新的。 */
export const flipAttentionId = (flip: FlipCard) => `flip:${flip.symbol}:${flip.kind}:${flip.text}`;
export const writebackAttentionId = (eventId: string) => `writeback:${eventId}`;

/**
 * 未重研的新报告及判断变化。读不到的部分不推断提醒。
 * 编号与已看状态沿用原圆点的本机存储。
 */
export async function loadAttentionIds(signal?: AbortSignal): Promise<string[]> {
  const data = await loadTrackingVariables(signal).catch(() => null);
  const [flips, recon] = await Promise.all([
    data ? loadFlipCards(data, signal).catch(() => [] as FlipCard[]) : Promise.resolve([] as FlipCard[]),
    loadReconCards(data, signal).catch(() => []),
  ]);
  const results = await loadReconResults(recon, signal);
  const ids = [...flips.map(flipAttentionId), ...Object.values(results).flatMap(result => (result?.changed || result?.pending) && result.id ? [result.id] : [])];
  const events = await loadResearchEvents(signal).catch(() => []);
  for (const event of events) if (writebackGradeChanged(event)) ids.push(writebackAttentionId(event.id));
  return [...new Set(ids)];
}

export { markArrivalsSeen, seenArrivals };
