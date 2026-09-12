import { createContext, useContext } from 'react';

export interface TopicSessionMatch {
  topicId: string;
  sessionId: string;
  matched: boolean;
}

export interface ResearchSessions {
  companySymbols(): Promise<string[]>;
  start(question: string, company?: { symbol: string; name: string }): Promise<void>;
  restoreTopic(topicId: string, title?: string, signal?: AbortSignal): Promise<TopicSessionMatch>;
  startTopic(input: { topicId: string; title: string; prompt: string; fresh?: boolean }): Promise<void>;
  topicSessionMatches(topicId: string): boolean;
  subscribeSession(listener: () => void): () => void;
}
export const ResearchSessionContext = createContext<ResearchSessions | null>(null);
export function useResearchSessions() {
  const sessions = useContext(ResearchSessionContext);
  if (!sessions) throw new Error('研究会话尚未连接');
  return sessions;
}
