import { createContext, useContext } from 'react';

export interface ResearchSessions {
  start(question: string, company?: { symbol: string; name: string }): Promise<void>;
}
export const ResearchSessionContext = createContext<ResearchSessions | null>(null);
export function useResearchSessions() {
  const sessions = useContext(ResearchSessionContext);
  if (!sessions) throw new Error('研究会话尚未连接');
  return sessions;
}
