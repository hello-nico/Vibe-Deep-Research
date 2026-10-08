import { addWatch } from '../lib/watchlist';
import {
  ResearchError,
  researchRead,
  type ResearchTopic,
  type ResearchTopicRouteCandidate,
  type ResearchTopicRouteResult,
} from '../lib/research';

export interface SuggestionInputState {
  draft: string;
  phase: 'plain' | 'adjudicating' | 'claimed' | 'submitting';
}

export interface SuggestionInputActions {
  setDraft(text: string): void;
  submit(): void;
}

export interface TrackingSuggestion {
  tracking_key: string;
  hypothesis: string;
  baseline: { as_of: string; known_at: string; basis_refs: string[] };
  observables: string[];
  conditions: { strengthen: string[]; weaken: string[]; overturn: string[] };
  next_source: string;
  last_assessment: null;
}

type ResearchRequest = <T>(route: string, init?: RequestInit) => Promise<T>;

export function sendSuggestedQuestion(
  question: string,
  input: SuggestionInputState,
  actions: SuggestionInputActions,
  sessionRunning: boolean,
): boolean {
  if (sessionRunning || input.phase !== 'plain' || input.draft.trim()) return false;
  actions.setDraft(question);
  actions.submit();
  return true;
}

export function followSuggestedCompany(symbol: string, follow = addWatch): Promise<void> {
  return follow(symbol);
}

export class SuggestionChoiceNeeded extends Error {
  constructor(public candidates: ResearchTopicRouteCandidate[]) {
    super('请选择要继续观察的研究');
  }
}

function routeBody(question: string, matchedTopicId?: string) {
  const characters = Array.from(question.trim());
  return {
    question: characters.slice(0, 2000).join(''),
    title: characters.slice(0, 200).join(''),
    subjects: [],
    research_intent: true as const,
    confirm_new: false,
    ...(matchedTopicId ? { matched_topic_id: matchedTopicId } : {}),
  };
}

function sameTrackingDraft(value: unknown, item: TrackingSuggestion): boolean {
  if (!value || typeof value !== 'object') return false;
  const existing = value as Partial<TrackingSuggestion>;
  return JSON.stringify([
    existing.tracking_key,
    existing.hypothesis,
    existing.baseline?.as_of,
    existing.baseline?.known_at,
    existing.baseline?.basis_refs,
    existing.observables,
    existing.conditions?.strengthen,
    existing.conditions?.weaken,
    existing.conditions?.overturn,
    existing.next_source,
  ]) === JSON.stringify([
    item.tracking_key,
    item.hypothesis,
    item.baseline.as_of,
    item.baseline.known_at,
    item.baseline.basis_refs,
    item.observables,
    item.conditions.strengthen,
    item.conditions.weaken,
    item.conditions.overturn,
    item.next_source,
  ]);
}

async function updateTrackingItem(
  topicId: string,
  item: TrackingSuggestion,
  request: ResearchRequest,
): Promise<void> {
  const path = `/wiki/research-topics/${encodeURIComponent(topicId)}`;
  for (let attempt = 0; attempt < 2; attempt++) {
    const topic = await request<ResearchTopic & { tracking_items?: unknown[] }>(path);
    if (!Number.isInteger(topic.revision)) throw new Error('无法读取最新研究版本');
    if (topic.tracking_items?.some(existing => sameTrackingDraft(existing, item))) return;
    try {
      await request<ResearchTopic>(path, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tracking_items: [item], expected_revision: topic.revision }),
      });
      return;
    } catch (error) {
      const status = error instanceof ResearchError ? error.status
        : error && typeof error === 'object' && 'status' in error ? Number(error.status) : 0;
      if (status !== 409 || attempt > 0) throw error;
    }
  }
}

export async function startSuggestedIndicator(
  question: string,
  item: TrackingSuggestion,
  matchedTopicId?: string,
  request: ResearchRequest = researchRead,
): Promise<void> {
  const routed = await request<ResearchTopicRouteResult>('/wiki/research-topics/route', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(routeBody(question, matchedTopicId)),
  });
  if (routed.action === 'choose') throw new SuggestionChoiceNeeded(routed.candidates || []);
  const topicId = routed.topic?.topic_id;
  if (!topicId) throw new Error(routed.reason || '没有找到可保存观察项的研究');
  await updateTrackingItem(topicId, item, request);
}
