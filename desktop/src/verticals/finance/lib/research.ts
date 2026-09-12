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

export const topicPath = (topicId: string) => `/wiki/research-topics/${encodeURIComponent(topicId)}`;
export const topicHex = (topicId: string) => topicId.replace(/^topic:/, "");
export const topicIdFromHex = (hex: string) => hex.startsWith("topic:") ? hex : `topic:${hex}`;

export interface ResearchTopicSummary {
  topic_id: string;
  title: string;
  last_touched_at?: string;
  subjects?: string[];
  judgment?: { state?: string; text?: string };
}
export interface ResearchTopic extends ResearchTopicSummary {
  user_claim?: string;
  next_questions?: string[];
  markdown?: string;
  revision?: number;
  observation?: { source_refs?: string[]; fact_refs?: string[]; relation_refs?: string[]; gaps?: string[] };
}
export interface ResearchLink {
  link_id: string;
  note_id: string;
  source_id?: string;
  target_id: string;
  kind?: string;
  title?: string;
  reason: string;
  proposal_id?: string;
  created_at?: string;
}

export interface WikiDraftSpec {
  title?: string;
  slug?: string;
  type?: string;
  as_of?: string;
  blocks?: { kind: string; content?: Record<string, unknown> }[];
}

export interface WikiDraft {
  previews?: { slug: string; markdown: string }[];
  draft_token: string;
  published?: boolean;
  specs?: WikiDraftSpec[];
}
export interface ResearchProposal {
  proposal_id: string;
  note_id: string;
  target_id: string;
  reason: string;
  status: string;
}
export interface NbsIndustry {
  ordinal: number;
  official_name: string;
  short_name: string;
  coverage_note: string;
  slug: string;
  subject_id: string;
  published: boolean;
}

export async function publishWikiDraft(draftToken: string, signal?: AbortSignal) {
  const response = await fetch("/finance-wiki-publish", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ draft_token: draftToken }),
    signal,
  });
  const value = await response.json().catch(() => null);
  if (!response.ok) throw new ResearchError(response.status, researchErrorMessage(response.status, value));
  return value as { published: boolean; draft_token: string; association_error?: string };
}
