import { researchRead } from './research';

/** 跟踪页「正在观察」的一行：指标、为什么重要、下一个来源。数据来自研究议题里已保存的跟踪项。 */
export interface ObservingItem { key: string; topicId: string; metric: string; why: string; source: string }
interface TopicRow { topic_id?: string; tracking_items?: unknown }
const text = (value: unknown) => typeof value === 'string' ? value.trim() : '';

/** 读进行中的议题，取出其中的跟踪项；格式不全的丢掉。读取失败时抛错，由调用方决定整组不出现。 */
export async function loadObserving(signal?: AbortSignal): Promise<ObservingItem[]> {
  const items: ObservingItem[] = [];
  for (let offset = 0; ; offset += 100) {
    const page = await researchRead<{ items?: TopicRow[]; next_offset?: number | null }>(`/wiki/research-topics?pool=active&limit=100&offset=${offset}`, { signal });
    for (const topic of page.items ?? []) {
      for (const raw of Array.isArray(topic.tracking_items) ? topic.tracking_items : []) {
        const item = raw as { tracking_key?: unknown; hypothesis?: unknown; observables?: unknown; next_source?: unknown };
        const key = text(item.tracking_key), why = text(item.hypothesis);
        const metric = (Array.isArray(item.observables) ? item.observables : []).map(text).filter(Boolean).join('、');
        if (topic.topic_id && key && why && metric) items.push({ key, topicId: topic.topic_id, metric, why, source: text(item.next_source) });
      }
    }
    if ((page.items ?? []).length < 100 || page.next_offset == null) return items;
  }
}
