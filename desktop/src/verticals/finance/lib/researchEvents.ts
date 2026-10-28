import { api } from './api';
import { researchRead } from './research';
import { qualifiedWatch } from './trackingVariables';
import { localService } from './localService';

/**
 * 对话里调整研究（变量取值、论点与支柱、对话里提到的因素）留下的记录：Backend `GET /feed/research-events`。
 * `grade_before` / `grade_after` 是写回前后的估值档位，旧记录和不涉及档位的为空。
 */
export interface ResearchEvent {
  id: string; at: string; symbol: string; kind: string; summary: string; session_id: string;
  research_version: string | null; previous_version: string | null; reversible: boolean;
  grade_before?: string | null; grade_after?: string | null;
}
export type RevertState = 'available' | 'newer';
export interface WritebackEvent extends ResearchEvent { name: string; revert?: RevertState }

const SHOWN = new Set(['drivers', 'thesis', 'candidate']);
/** 撤回只能退一版：该公司最新一次可撤回的调整可用，其余不显示撤回；撤回过之后更早的都不能再撤。 */
export function revertStates(events: readonly ResearchEvent[]): Map<string, RevertState> {
  const out = new Map<string, RevertState>();
  const done = new Set<string>();
  for (const event of [...events].sort((a, b) => b.at.localeCompare(a.at))) {
    if (event.kind === 'revert') { done.add(event.symbol); continue; }
    if (!event.reversible || !SHOWN.has(event.kind)) continue;
    out.set(event.id, done.has(event.symbol) ? 'newer' : 'available');
    done.add(event.symbol);
  }
  return out;
}
export function writebackEvents(events: readonly ResearchEvent[], names: Record<string, string>): WritebackEvent[] {
  const states = revertStates(events);
  return events.filter(event => SHOWN.has(event.kind)).map(event => ({
    ...event, name: names[event.symbol.split('.')[0]!] ?? event.symbol.split('.')[0]!, ...(states.has(event.id) ? { revert: states.get(event.id) } : {}),
  }));
}

/** 关注公司的写回记录（只读 GET）；公司名取行情。 */
export async function loadResearchEvents(signal?: AbortSignal): Promise<WritebackEvent[]> {
  const { symbols } = await localService.clientWatch();
  const qualified = qualifiedWatch(symbols);
  if (!qualified.length) return [];
  const body = await researchRead<{ items?: ResearchEvent[] }>(`/feed/research-events?symbols=${qualified.join(',')}&limit=50`, { signal });
  const events = (body.items ?? []).filter(item => item && typeof item.id === 'string' && typeof item.symbol === 'string' && typeof item.at === 'string');
  let names: Record<string, string> = {};
  try {
    const quotes = await api.quote([...new Set(events.map(event => event.symbol.split('.')[0]!))].join(','));
    names = Object.fromEntries(Object.entries(quotes).filter(([, quote]) => quote.name).map(([code, quote]) => [code, quote.name!]));
  } catch { /* 没有名字退回代码 */ }
  return writebackEvents(events, names);
}

/** 撤回这次调整（POST，只有用户点按钮时才发）：回到上一版研究。 */
export async function revertWriteback(event: Pick<ResearchEvent, 'symbol' | 'research_version'>): Promise<void> {
  await researchRead(`/wiki/companies/${event.symbol}/page-research/revert`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(event.research_version ? { expectedResearchVersion: event.research_version } : {}),
  });
}
