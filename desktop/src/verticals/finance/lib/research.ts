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
export interface WikiPage { markdown: string; published: boolean; spec: { title: string; type?: string; subject_id?: string; as_of: string; status?: string; blocks: { kind: string; content?: Record<string, unknown>; refs: string[] }[]; research_blocks?: { refs: string[] }[] } }
export async function wikiPages(kind: string, signal?: AbortSignal): Promise<WikiItem[]> {
  const items: WikiItem[] = [];
  for (let offset = 0; ; offset += 100) {
    const page = await researchRead<{ items: WikiItem[]; total: number }>(`/wiki/pages?kind=${kind}&offset=${offset}&limit=100`, { signal });
    items.push(...page.items);
    if (offset + 100 >= page.total) return items;
  }
}
export const companySlug = (symbol: string) => /^\d{6}$/.test(symbol) ? `companies/${symbol}-${/^[569]/.test(symbol) ? 'sh' : /^[48]/.test(symbol) ? 'bj' : 'sz'}` : null;
export const symbolFromCompanySlug = (slug: string) => /^companies\/(\d{6})-(?:sh|sz|bj)$/.exec(slug)?.[1] ?? null;
export const aShareQualified = (symbol: string) => {
  const match = companySlug(symbol)?.match(/^companies\/(\d{6})-(sh|sz|bj)$/);
  return match?.[1] && match[2] ? `${match[1]}.${match[2].toUpperCase()}` : null;
};

export const topicPath = (topicId: string) => `/wiki/research-topics/${encodeURIComponent(topicId)}`;
export const topicHex = (topicId: string) => topicId.replace(/^topic:/, "");
export const topicIdFromHex = (hex: string) => hex.startsWith("topic:") ? hex : `topic:${hex}`;

export interface ResearchTopicRouteCandidate {
  topic_id: string;
  title: string;
  reasons?: string[];
  pool_state?: "active" | "archived";
}

export interface ResearchTopicRouteResult {
  action: "create" | "touch" | "restore" | "choose" | "skip";
  topic?: { topic_id: string; title?: string } | null;
  candidates?: ResearchTopicRouteCandidate[];
  related?: ResearchTopicRouteCandidate[];
  reason?: string;
}

export interface ResearchTopicRouteRequest {
  question: string;
  subjects: string[];
  research_intent: true;
  matched_topic_id?: string;
  confirm_new: boolean;
}

export function topicRouteRequest(
  question: string,
  options: { subjects?: string[]; matchedTopicId?: string; confirmNew?: boolean } = {},
): ResearchTopicRouteRequest {
  const trimmed = question.trim();
  if (!trimmed) throw new Error("请先写下要持续研究的问题");
  if (trimmed.length > 2000) throw new Error("研究问题不能超过 2000 个字符");
  return {
    question: trimmed,
    subjects: options.subjects ?? [],
    research_intent: true,
    ...(options.matchedTopicId ? { matched_topic_id: options.matchedTopicId } : {}),
    confirm_new: options.confirmNew === true,
  };
}

export async function routeResearchTopic(request: ResearchTopicRouteRequest, signal?: AbortSignal): Promise<ResearchTopicRouteResult> {
  return researchRead("/wiki/research-topics/route", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(request),
    signal,
  });
}

export const ARCHIVED_TOPIC_TEXT_SEARCH = "archived_text_search";

export async function startResearchTopic(
  request: ResearchTopicRouteRequest,
  signal?: AbortSignal,
): Promise<ResearchTopicRouteResult> {
  if (!request.matched_topic_id && !request.confirm_new) {
    const archived = await researchRead<{ items: ResearchTopicSummary[] }>(
      `/wiki/research-topics?pool=archived&query=${encodeURIComponent(request.question)}&limit=8&offset=0`,
      { signal },
    );
    if (archived.items.length) {
      return {
        action: "choose",
        topic: null,
        candidates: archived.items.map(item => ({
          topic_id: item.topic_id,
          title: item.title,
          pool_state: "archived",
        })),
        reason: ARCHIVED_TOPIC_TEXT_SEARCH,
      };
    }
  }
  return routeResearchTopic(request, signal);
}

export function topicRouteSuccess(result: ResearchTopicRouteResult): { topicId: string; message: string } | null {
  const topicId = result.topic?.topic_id;
  if (!topicId) return null;
  if (result.action === "create") return { topicId, message: "议题已创建，正在打开…" };
  if (result.action === "touch") return { topicId, message: "已复用现有议题，正在打开…" };
  if (result.action === "restore") return { topicId, message: "已恢复归档议题，正在打开…" };
  return null;
}

export const canConfirmNewTopic = (result: ResearchTopicRouteResult | null) =>
  result?.action === "choose" && result.reason === "same_subject_requires_choice";

export interface ResearchTopicSummary {
  topic_id: string;
  title: string;
  last_touched_at?: string;
  subjects?: string[];
  user_claim?: string;
  pool_state?: "active" | "archived";
  judgment?: { state?: string; text?: string };
}

export async function setTopicPool(topicId: string, action: "archive" | "restore"): Promise<ResearchTopic> {
  return researchRead(`${topicPath(topicId)}/${action}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" });
}
export interface ResearchTopic extends Omit<ResearchTopicSummary, 'user_claim'> {
  user_claim?: { text?: string };
  next_questions?: string[];
  markdown?: string;
  revision?: number;
  observation?: { source_refs?: string[]; fact_refs?: string[]; relation_refs?: string[]; gaps?: string[] };
}
export interface ResearchLink {
  link_id: string;
  note_id?: string;
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
  note_id?: string;
  source_id?: string;
  target_id: string;
  reason: string;
  status: string;
}
export interface NbsIndustry {
  ordinal: number;
  official_name: string;
  short_name: string;
  coverage_note: string;
  summary?: string;
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
