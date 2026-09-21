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

export interface TaskHistoryClient {
  sessions: {
    refresh?(): Promise<void>;
    refreshSubagents?(parentSessionId: string): Promise<void>;
    subagentAddress?(id: string): { parentSessionId: string } | undefined;
    list: {
      getSnapshot(): {
        current?: string;
        byId: Record<string, { parentId?: string }>;
        subagentsByParent?: Record<string, { entries: { id: string; kind: string; mode?: 'one-shot' | 'continuable' }[] }>;
      };
      subscribe(callback: () => void): () => void;
    };
    binding?(id: string): { session?: TaskHistoryFace } | undefined;
    scope?(id: string): object | undefined;
    sessionOf?(ctx: object): TaskHistoryFace | undefined;
    retainSubagent?(address: {
      parentSessionId: string;
      childSessionId: string;
      mode: 'one-shot' | 'continuable';
    }): { binding: { session: TaskHistoryFace }; dispose(): void };
    open?(id: string): void;
  };
  uiConversation?: {
    binding(source: string): {
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
  let dispose = () => {};
  const release = () => { signal?.removeEventListener('abort', release); dispose(); };
  let face: TaskHistoryFace | undefined;
  if (parent) {
    parents.set(sessionId, parent);
    await client.sessions.refreshSubagents?.(parent);
    signal?.throwIfAborted();
    const child = client.sessions.list.getSnapshot().subagentsByParent?.[parent]?.entries.find(item => item.id === sessionId && item.kind === 'child');
    if (!child?.mode || !client.sessions.retainSubagent) throw new Error('执行记录读取失败');
    const retained = client.sessions.retainSubagent({ parentSessionId: parent, childSessionId: sessionId, mode: child.mode });
    dispose = retained.dispose;
    signal?.addEventListener('abort', release, { once: true });
    face = retained.binding.session;
  } else {
    face = historyFaceOf(client, sessionId);
  }
  try {
    if (typeof face?.open !== 'function') throw new Error('执行记录读取失败');
    await face.open();
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
            const binding = client.uiConversation?.binding(sessionId);
            binding?.activate('trajectory');
            binding?.activate('chat');
            const offTarget = binding?.target('trajectory')?.subscribe(notify);
            const offTerminal = binding?.target('chat')?.subscribe(notify);
            const offFace = face.subscribe?.(notify);
            const offList = client.sessions.list.subscribe(notify);
            cleanup = () => { offTarget?.(); offTerminal?.(); offFace?.(); offList(); release(); };
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
        const binding = client.uiConversation?.binding(sessionId);
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
