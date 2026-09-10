import { researchErrorMessage } from './researchSymbol';

export class ResearchError extends Error {
  constructor(public status: number, message: string) { super(message); }
}
export async function researchRead<T>(route: string, init?: RequestInit): Promise<T> {
  const response = await fetch('/finance-research' + route, init);
  const value = await response.json().catch(() => null);
  if (!response.ok) throw new ResearchError(response.status, researchErrorMessage(response.status, value));
  return value as T;
}
export interface WikiItem { slug: string; title: string }
export interface WikiPage { markdown: string; published: boolean; spec: { title: string; type?: string; as_of: string; status?: string; blocks: { kind: string; content?: Record<string, unknown>; refs: string[] }[]; research_blocks?: { refs: string[] }[] } }
export async function wikiPages(kind: string, signal?: AbortSignal): Promise<WikiItem[]> {
  const items: WikiItem[] = [];
  for (let offset = 0; ; offset += 100) {
    const page = await researchRead<{ items: WikiItem[]; total: number }>(`/wiki/pages?kind=${kind}&offset=${offset}&limit=100`, { signal });
    items.push(...page.items);
    if (offset + 100 >= page.total) return items;
  }
}
export const companySlug = (symbol: string) => /^\d{6}$/.test(symbol) ? `companies/${symbol}-${/^[569]/.test(symbol) ? 'sh' : /^[48]/.test(symbol) ? 'bj' : 'sz'}` : null;
