import { readableResearchTitle } from '../lib/researchMentions';

export interface TitleEventEntry {
  type: string;
  event?: { type: string; seq: number; data?: {
    title?: string;
    source?: { kind?: string };
    messageSeqs?: number[];
    content?: { type: string; text?: string }[];
  } };
}

export type TitleDecision = { status: 'wait' | 'skip' } | { status: 'rename'; title: string; eventSeq: number };

/** A user-authored title is terminal. Automatic titles qualify only when they expose serialized @ text. */
export function readableTitleDecision(entries: readonly TitleEventEntry[]): TitleDecision {
  const events = entries.filter(entry => entry.type === 'event').map(entry => entry.event).filter((event): event is NonNullable<TitleEventEntry['event']> => Boolean(event));
  const latest = events.filter(event => event.type === 'session/title').at(-1);
  if (!latest) return { status: 'wait' };
  const data = latest.data;
  if (data?.source?.kind === 'user') return { status: 'skip' };
  if (data?.source?.kind !== 'fallback' && data?.source?.kind !== 'provider') return { status: 'skip' };
  if (!/引用(?:材料|议题|资料|来源|公司行情|宽基指数|产业研究)/.test(data.title || '')) return { status: 'skip' };
  const firstSeq = data.messageSeqs?.[0];
  if (firstSeq === undefined) return { status: 'skip' };
  const first = events.find(event => event.seq === firstSeq && event.type === 'user/message');
  if (!first) return { status: 'wait' };
  const text = first.data?.content?.filter(block => block.type === 'text').map(block => block.text || '').join('\n') || '';
  const title = readableResearchTitle(text);
  return title ? { status: 'rename', title, eventSeq: latest.seq } : { status: 'skip' };
}
