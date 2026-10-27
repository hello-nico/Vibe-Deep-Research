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
 * 当前有哪些判断变化：跳档卡、档位变了的财报卡、对话写回导致档位变化的记录。读不到的部分当没有。
 * 编号与已看状态沿用原圆点的本机存储。
 */
export async function loadAttentionIds(signal?: AbortSignal): Promise<string[]> {
  const data = await loadTrackingVariables(signal).catch(() => null);
  if (!data) return [];
  const [flips, recon] = await Promise.all([
    loadFlipCards(data, signal).catch(() => [] as FlipCard[]),
    loadReconCards(data, signal).catch(() => []),
  ]);
  const results = await loadReconResults(recon, signal);
  const ids = [...flips.map(flipAttentionId), ...Object.values(results).flatMap(result => result?.changed && result.id ? [result.id] : [])];
  const events = await loadResearchEvents(signal).catch(() => []);
  for (const event of events) if (writebackGradeChanged(event)) ids.push(writebackAttentionId(event.id));
  return [...new Set(ids)];
}

export { markArrivalsSeen, seenArrivals };
