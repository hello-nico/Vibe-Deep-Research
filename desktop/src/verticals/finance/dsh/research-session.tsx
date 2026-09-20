import { createContext, useContext } from 'react';

export interface TopicSessionMatch {
  topicId: string;
  sessionId: string;
  matched: boolean;
}

export interface CompanySessionRef {
  sessionId: string;
  title: string;
  running: boolean;
  updatedAt?: string;
}

export interface StartSessionOptions {
  navigate?: boolean;
  // 报告生成任务：独立会话身份 + host 绑定（slug + 输入版本），DSH 据此识别受限报告角色。
  // 不与公司研究会话去重；同题同版本运行中复用，完成后重试开新子 Agent。
  task?: { kind: 'report'; slug: string; inputHash: string; title?: string };
}

export interface StartSessionResult {
  sessionId: string;
  // started：本次已投递；running：同题任务仍在执行（直接关联，未重复投递）；
  // busy_other_version：绑定会话正生成另一输入版本，需等其结束。
  status: 'started' | 'running' | 'busy_other_version';
  mode?: 'ask' | 'agent';
}

// 报告任务引用：来自 report-tasks 绑定索引；inputHash 是任务钉住的 Wiki 输入版本。
export interface ReportTaskRef {
  sessionId: string;
  slug: string;
  inputHash: string;
  running: boolean;
  updatedAt?: string;
}

export interface TaskProcessRef {
  sessionId: string;
  title: string;
  kind: 'report' | 'knowledge';
  parentSessionId?: string;
  resultHref?: string;
}

export interface TaskTrajectoryStep {
  id: string;
  kind: string;
  title: string;
  body?: string;
  detail?: string;
  args?: string;
  error?: string;
  time?: number;
  durationMs?: number;
  failed?: boolean;
  streaming?: boolean;
}

export interface TaskTrajectorySnapshot {
  running: boolean;
  failed: boolean;
  openState: 'cold' | 'loading' | 'open' | 'error';
  openError?: string;
  hasMore: boolean;
  loadingOlder: boolean;
  runningCalls: { id: string; name: string; args?: string; startedAt?: number }[];
  steps: TaskTrajectoryStep[];
  streaming: boolean;
}

// 会话执行快照：错误字段仅用于判定成败，原始错误不向用户展示。
export interface SessionState {
  running: boolean;
  lastAgentError: string | null;
  promptError: string | null;
  removed: boolean;
  awaitingFirstTurn: boolean;
}

export interface ResearchSessions {
  companySymbols(): Promise<string[]>;
  start(question: string, company?: { symbol: string; name: string }, options?: StartSessionOptions): Promise<StartSessionResult>;
  /** Find this company's research session by the shared title convention. */
  findCompanySession(symbol: string): Promise<CompanySessionRef | null>;
  /** Find the report task bound to this slug (any input version), newest session first. */
  findReportTask(slug: string): Promise<ReportTaskRef | null>;
  /** Live snapshot of an open session; null when the session scope is unavailable. */
  sessionState(sessionId: string): SessionState | null;
  restoreTopic(topicId: string, title?: string, signal?: AbortSignal): Promise<TopicSessionMatch>;
  startTopic(input: { topicId: string; title: string; prompt: string; fresh?: boolean }): Promise<void>;
  startAssistant(input: {
    pageKey: string;
    title: string;
    mode: 'ask' | 'agent';
    plugin?: 'company_wiki' | 'industry_wiki' | 'deep_research' | 'market' | 'intel' | 'industry_profile';
    target?: string;
    prompt?: string;
    objects?: { kind?: string; id: string; label: string; version?: string; url?: string; hint?: string; source?: string; time?: string }[];
    fresh?: boolean;
  }): Promise<StartSessionResult>;
  ensureAssistant(input: {
    pageKey: string;
    title: string;
    mode: 'ask' | 'agent';
    plugin?: 'company_wiki' | 'industry_wiki' | 'deep_research' | 'market' | 'intel' | 'industry_profile';
    target?: string;
    fresh?: boolean;
  }): Promise<StartSessionResult>;
  insertAssistantObjects(sessionId: string, objects: { source: string; ref: string; label: string; clipboardText: string }[]): void;
  assistantModel?(sessionId: string): {
    subscribe(listener: () => void): () => void;
    getSnapshot(): {
      current: { provider: string; model: string } | null;
      groups: { id: string; name: string; models: { id: string; name: string }[] }[];
      status: string;
      error: string | null;
    };
    load(): Promise<void>;
    select(selection: { provider: string; model: string }): Promise<void>;
  } | null;
  switchAssistantMode(sessionId: string, mode: 'ask' | 'agent', pageKey?: string): Promise<void>;
  focusAssistantSession(sessionId: string): () => void;
  openSession(sessionId: string): Promise<void>;
  openTaskProcess(task: TaskProcessRef): void;
  closeTaskProcess(): void;
  getTaskProcess(): TaskProcessRef | null;
  subscribeTaskProcess(listener: () => void): () => void;
  trajectory(sessionId: string): {
    subscribe(listener: () => void): () => void;
    getSnapshot(): TaskTrajectorySnapshot;
    loadOlder(): Promise<void>;
  } | null;
  cancelTask(sessionId: string): Promise<void>;
  topicSessionMatches(topicId: string): boolean;
  subscribeSession(listener: () => void): () => void;
  /** Fires when the session list snapshot (running state, titles) changes. */
  subscribeSessionList(listener: () => void): () => void;
}
export const ResearchSessionContext = createContext<ResearchSessions | null>(null);
export function useResearchSessions() {
  const sessions = useContext(ResearchSessionContext);
  if (!sessions) throw new Error('研究会话尚未连接');
  return sessions;
}
