import type { TaskTrajectorySnapshot } from '../dsh/research-session';

export interface TaskHistoryFace {
  open?(): Promise<void>;
  loadOlder?(): Promise<void>;
  subscribe?(callback: () => void): () => void;
  getSnapshot?(): {
    running?: boolean;
    lastAgentError?: string | null;
    promptError?: { op?: string; error?: unknown } | null;
    removed?: boolean;
    awaitingFirstTurn?: boolean;
    openState?: 'cold' | 'loading' | 'open' | 'error';
    openError?: { message?: string } | string | null;
    hasMore?: boolean;
    loadingOlder?: boolean;
  };
}
interface TaskHistoryBinding { sessionId: string; session: TaskHistoryFace }

export interface TaskHistoryClient {
  sessions: {
    refresh?(): Promise<void>;
    refreshProjections?(parentSessionId: string): Promise<void>;
    subagentAddress?(id: string): { parentSessionId: string; childSessionId: string; mode: 'one-shot' | 'continuable' } | undefined;
    list: {
      getSnapshot(): {
        byId: Record<string, { parentId?: string }>;
      };
      subscribe(callback: () => void): () => void;
    };
    binding?(id: string): TaskHistoryBinding | undefined;
    scope?(id: string): object | undefined;
    sessionOf?(ctx: object): TaskHistoryFace | undefined;
    retain(target: string | { parentSessionId: string; childSessionId: string; mode: 'one-shot' | 'continuable' }, options: { source: string; signal?: AbortSignal }): { binding: TaskHistoryBinding; ready: Promise<unknown>; release(): void };
  };
  uiConversation?: {
    binding(source: TaskHistoryBinding): {
      activate(target: string): void;
      target(target: string): { getSnapshot(): unknown; subscribe(callback: () => void): () => void };
    };
  };
}

export function historyFaceOf(client: TaskHistoryClient, sessionId: string): TaskHistoryFace | undefined {
  const bound = client.sessions.binding?.(sessionId)?.session;
  if (bound) return bound;
  const scope = client.sessions.scope?.(sessionId);
  return scope ? client.sessions.sessionOf?.(scope) : undefined;
}

export async function ensureTaskHistory(input: {
  client: TaskHistoryClient;
  sessionId: string;
  signal?: AbortSignal;
  parents: Map<string, string>;
  loadReportTasks: () => Promise<{ sessions?: Record<string, { parent_id?: string }> }>;
}): Promise<{ face: TaskHistoryFace; release: () => void }> {
  const { client, sessionId, signal, parents } = input;
  await client.sessions.refresh?.().catch?.(() => {});
  let parent = parents.get(sessionId) || client.sessions.subagentAddress?.(sessionId)?.parentSessionId
    || client.sessions.list.getSnapshot().byId[sessionId]?.parentId;
  if (!parent) {
    const reports = await input.loadReportTasks();
    parent = reports.sessions?.[sessionId]?.parent_id;
  }
  signal?.throwIfAborted();
  let target: string | { parentSessionId: string; childSessionId: string; mode: 'one-shot' | 'continuable' } = sessionId;
  if (parent) {
    parents.set(sessionId, parent);
    await client.sessions.refreshProjections?.(parent);
    signal?.throwIfAborted();
    const address = client.sessions.subagentAddress?.(sessionId);
    if (!address || address.parentSessionId !== parent) throw new Error('执行记录读取失败');
    target = address;
  }
  const retained = client.sessions.retain(target, { source: 'taskProcess', signal });
  const release = () => { signal?.removeEventListener('abort', release); retained.release(); };
  signal?.addEventListener('abort', release, { once: true });
  try {
    const binding = await retained.ready as TaskHistoryBinding;
    const face = binding.session;
    if (face.getSnapshot?.().openState === 'error') throw new Error('执行记录读取失败');
    signal?.throwIfAborted();
    return { face, release };
  } catch (error) { release(); throw error; }
}

export function createTaskTrajectoryStore(input: {
  sessionId: string;
  client: TaskHistoryClient;
  ensureHistory: (sessionId: string, signal?: AbortSignal) => Promise<{ face: TaskHistoryFace; release: () => void }>;
  project: (sessionId: string, raw: unknown, terminal?: unknown) => TaskTrajectorySnapshot;
  lastTrajectory: Map<string, TaskTrajectorySnapshot>;
}): { subscribe(listener: () => void): () => void; getSnapshot(): TaskTrajectorySnapshot; loadOlder(): Promise<void> } {
  const { sessionId, client, ensureHistory, project, lastTrajectory } = input;
  const listeners = new Set<() => void>();
  let generation = 0;
  let cleanup = () => {};
  let loadError = false;
  let activeBinding: TaskHistoryBinding | undefined;
  const notify = () => listeners.forEach(listener => listener());
  return {
    subscribe(listener: () => void) {
      listeners.add(listener);
      if (listeners.size === 1) {
        const mine = ++generation;
        const controller = new AbortController();
        cleanup = () => controller.abort();
        loadError = false;
        void ensureHistory(sessionId, controller.signal).then(({ face, release }) => {
          if (mine !== generation) { release(); return; }
          try {
            activeBinding = client.sessions.binding?.(sessionId);
            const binding = activeBinding && client.uiConversation?.binding(activeBinding);
            binding?.activate('trajectory');
            binding?.activate('chat');
            const offTarget = binding?.target('trajectory')?.subscribe(notify);
            const offTerminal = binding?.target('chat')?.subscribe(notify);
            const offFace = face.subscribe?.(notify);
            const offList = client.sessions.list.subscribe(notify);
            cleanup = () => { offTarget?.(); offTerminal?.(); offFace?.(); offList(); activeBinding = undefined; release(); };
            notify();
          } catch { release(); loadError = true; notify(); }
        }).catch(() => { if (mine === generation) { loadError = true; notify(); } });
      }
      return () => { listeners.delete(listener); if (!listeners.size) { generation++; cleanup(); cleanup = () => {}; } };
    },
    getSnapshot() {
      if (loadError) {
        const previous = lastTrajectory.get(sessionId);
        if (previous?.openState === 'error') return previous;
        const next = { ...project(sessionId, undefined), openState: 'error' as const, openError: '执行记录读取失败，请关闭后重试。' };
        lastTrajectory.set(sessionId, next);
        return next;
      }
      try {
        const binding = activeBinding && client.uiConversation?.binding(activeBinding);
        binding?.activate('trajectory');
        binding?.activate('chat');
        return project(sessionId, binding?.target('trajectory')?.getSnapshot(), binding?.target('chat')?.getSnapshot());
      } catch {
        return project(sessionId, undefined);
      }
    },
    async loadOlder() {
      const face = historyFaceOf(client, sessionId);
      if (typeof face?.loadOlder === 'function') await face.loadOlder();
    },
  };
}
