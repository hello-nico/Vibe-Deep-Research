import { loadFlipCards, type FlipCard } from './flipCards';
import { loadReconCards } from './quarterRecon';
import { loadReconResults } from './reconResult';
import { markArrivalsSeen, seenArrivals } from './reportArrival';
import { loadResearchEvents } from './researchEvents';
import { writebackGradeChanged } from './feedStream';
import { loadTrackingVariables } from './trackingVariables';
import { storageGet, storageSet } from './storage';

/** 动态页判断变化的稳定编号：同一件事只亮一次，档位或价格句变了才算新的。 */
export const flipAttentionId = (flip: FlipCard) => `flip:${flip.symbol}:${flip.kind}:${flip.text}`;
export const writebackAttentionId = (eventId: string) => `writeback:${eventId}`;

/**
 * 未重研的新报告及判断变化。读不到的部分不推断提醒。
 * 编号与已看状态沿用原圆点的本机存储。
 */
export async function loadAttentionIds(signal?: AbortSignal): Promise<string[]> {
  const reconJob = loadReconCards(signal).catch(() => []);
  const data = await loadTrackingVariables(signal).catch(() => null);
  const [flips, recon] = await Promise.all([
    data ? loadFlipCards(data, signal).catch(() => [] as FlipCard[]) : Promise.resolve([] as FlipCard[]),
    reconJob,
  ]);
  const results = await loadReconResults(recon, signal);
  const ids = [...flips.map(flipAttentionId), ...Object.values(results).flatMap(result => (result?.changed || result?.pending) && result.id ? [result.id] : [])];
  const events = await loadResearchEvents(signal).catch(() => []);
  for (const event of events) if (writebackGradeChanged(event)) ids.push(writebackAttentionId(event.id));
  return [...new Set(ids)];
}

const ATTENTION_CACHE = 'finance.feed-dot-attention';
export const ATTENTION_TTL_MS = 300_000;
/** 小圆点要读全部关注公司：结果在本机留 5 分钟（与轮询同周期），刷新页面不重算。 */
/** 本机已有、未过期的小圆点结果；没有就是 null。 */
export function peekAttentionIds(): string[] | null {
  try {
    const hit = JSON.parse(storageGet(ATTENTION_CACHE) ?? 'null') as { at?: number; ids?: unknown } | null;
    if (hit && typeof hit.at === 'number' && Date.now() - hit.at < ATTENTION_TTL_MS && Array.isArray(hit.ids)) return hit.ids.filter((id): id is string => typeof id === 'string');
  } catch { /* 坏缓存当没有 */ }
  return null;
}
export async function cachedAttentionIds(signal?: AbortSignal): Promise<string[]> {
  const hit = peekAttentionIds();
  if (hit) return hit;
  const ids = await loadAttentionIds(signal);
  storageSet(ATTENTION_CACHE, JSON.stringify({ at: Date.now(), ids }));
  return ids;
}

export { markArrivalsSeen, seenArrivals };
