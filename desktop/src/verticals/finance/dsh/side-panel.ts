import type { TaskProcessRef } from './research-session';

export type FinanceSidePanel =
  | { kind: 'task'; task: TaskProcessRef }
  | { kind: 'topic'; sessionId: string; topicId: string; title: string; judgment: string; questions: string[]; fresh: boolean }
  | { kind: 'assistant'; sessionId: string; pageName: string };

export function selectSidePanel(current: FinanceSidePanel | null, next: FinanceSidePanel | null, mainSessionId: string): FinanceSidePanel | null {
  void current;
  if (next && 'sessionId' in next && next.sessionId && next.sessionId === mainSessionId) return null;
  return next;
}

export function topicOpeningQuestions(questions: readonly string[] | undefined): string[] {
  return [...new Set((questions || []).map(question => question.trim()).filter(Boolean))].slice(0, 3);
}
