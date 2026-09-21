import { researchErrorMessage } from './researchSymbol';

export class ResearchError extends Error {
  constructor(public status: number, message: string) { super(message); }
}
export async function researchRead<T>(route: string, init?: RequestInit): Promise<T> {
  const response = await fetch('/finance-research' + route, init);
  const contentType = response.headers.get('content-type') || '';
  const raw = await response.text();
  const looksJson = contentType.includes('json') || raw.trim().startsWith('{') || raw.trim().startsWith('[');
  let value: unknown = raw;
  if (looksJson) {
    try { value = JSON.parse(raw); } catch { value = raw; }
  }
  if (!response.ok) throw new ResearchError(response.status, researchErrorMessage(response.status, value && typeof value === 'object' ? value : null));
  return value as T;
}
export interface WikiItem { slug: string; title: string; input_hash?: string }
export interface WikiBlock { kind: string; content?: Record<string, unknown> | string; refs: string[]; reviewed_as_of?: string }
export interface WikiPageLink { to: string; type: string; basis?: string; ref?: string }
export interface WikiComparisonScope { question: string; horizon: string; subjects: { entity_id: string; snapshot_as_of: string }[]; dimensions: { id: string; title: string; basis: string; direction: string; weight?: number; refs?: string[] }[] }
export interface WikiPage { markdown: string; published: boolean; input_hash?: string; spec: { slug?: string; title: string; type?: string; subject_id?: string; as_of: string; status?: string; valid_until?: string; superseded_by?: string; labels?: string[]; driver?: string[]; horizon?: string; comparison_scope?: WikiComparisonScope; comparability?: { level: string; reasons: string[] }; links?: WikiPageLink[]; blocks: WikiBlock[]; research_blocks?: WikiBlock[] } }
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

export interface BackgroundTask {
  id: string;
  title?: string;
  question?: string;
  status?: string;
  display_status?: string;
  started_at?: string;
  finished_at?: string;
  summary?: string;
  parent_session_id?: string;
  child_session_id?: string;
  targets?: string[];
  draft_token?: string;
}

// 后台沉淀任务记录：DSH 回合结束后由后台评审/落库子会话产生；页面据此区分
// "执行结束"与"成果已确认"。注意一条记录可能晚于会话结束若干秒才出现。
export async function loadBackgroundTasks(signal?: AbortSignal): Promise<BackgroundTask[]> {
  const response = await fetch("/finance-background-tasks", { signal });
  if (!response.ok) throw new Error("任务读取失败");
  const body = await response.json() as { items?: BackgroundTask[] };
  return Array.isArray(body.items) ? body.items : [];
}

// 找某会话最新一条后台任务（按开始时间倒序）。
export function backgroundTaskForSession(tasks: BackgroundTask[], sessionId: string | null | undefined): BackgroundTask | null {
  if (!sessionId) return null;
  const matches = tasks.filter(task => task.parent_session_id === sessionId);
  if (!matches.length) return null;
  matches.sort((a, b) => String(b.started_at || "").localeCompare(String(a.started_at || "")));
  return matches[0] ?? null;
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
