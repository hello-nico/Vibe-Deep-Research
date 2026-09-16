import { researchRead, type ResearchTopicRouteCandidate, type ResearchTopicRouteResult } from "./research";

export interface MemoryEntry {
  id: string;
  stance: "stated" | "inferred" | "corrected";
  text: string;
  source_session?: string;
  source_turn?: number;
  updated_at?: string;
}

export interface MemoryDoc {
  kind: "soul" | "recent";
  version: number;
  title: string;
  entries: MemoryEntry[];
  markdown?: string;
}

export interface TopicCandidate {
  id: string;
  question: string;
  reason: string;
  objects?: string[];
  gap?: string;
  match_topic_id?: string;
  source_session?: string;
  source_question?: string;
  status?: "open" | "ignored" | "adopted" | "failed";
  topic_id?: string;
}

export const CANDIDATE_CHANGED = "finance-research-candidate-changed";

export function emitCandidateChanged(id?: string) {
  window.dispatchEvent(new CustomEvent(CANDIDATE_CHANGED, { detail: { id } }));
}

export class CandidateChoiceNeeded extends Error {
  candidates: ResearchTopicRouteCandidate[];
  constructor(result: ResearchTopicRouteResult) {
    super("请选择已有议题后再采用");
    this.candidates = result.candidates || [];
  }
}

export const loadMemory = (kind: "soul" | "recent") =>
  researchRead<MemoryDoc>(`/wiki/research-memory?kind=${kind}`);

export const saveMemory = (kind: "soul" | "recent", version: number, operations: object[]) =>
  researchRead<MemoryDoc>("/wiki/research-memory", {
    method: "PUT", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ kind, version, operations }),
  });

export const loadCandidates = (sessionId?: string) =>
  researchRead<{ items: TopicCandidate[] }>(`/wiki/research-candidates${sessionId ? `?session_id=${encodeURIComponent(sessionId)}` : ""}`);

export const loadCandidate = (id: string) =>
  researchRead<TopicCandidate>(`/wiki/research-candidates/${encodeURIComponent(id)}`);

export const disposeCandidate = (id: string, status: "adopted" | "ignored", topicId?: string) =>
  researchRead<TopicCandidate>(`/wiki/research-candidates/${encodeURIComponent(id)}/dispose`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ status, topic_id: topicId }),
  }).then(result => { emitCandidateChanged(id); return result; });

export const bindAdoptedCandidate = (id: string, topicId: string) =>
  researchRead<TopicCandidate>(`/wiki/research-candidates/${encodeURIComponent(id)}/adopt`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ topic_id: topicId }),
  }).then(result => { emitCandidateChanged(id); return result; });

export async function adoptCandidate(candidate: TopicCandidate, topicId?: string) {
  const result = await researchRead<TopicCandidate | ResearchTopicRouteResult>(`/wiki/research-candidates/${encodeURIComponent(candidate.id)}/adopt`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ topic_id: topicId, question: candidate.question }),
  }).catch(error => { emitCandidateChanged(candidate.id); throw error; });
  if ("action" in result) {
    if (result.action === "choose") throw new CandidateChoiceNeeded(result);
    throw new Error(result.reason || "议题未能创建");
  }
  emitCandidateChanged(candidate.id);
  return result;
}
