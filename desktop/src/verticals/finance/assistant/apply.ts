import type { Context } from '@deepseek-ai/cordis';
import type { CompanySnapshotQuote } from '../../../core/ai/pageContext.tsx';
import type { ResearchSessions, StartSessionResult } from '../dsh/research-session.tsx';
import { bindAssistantPrompt } from './prompt.ts';
import { assistantBindingForPage, type AssistantPlugin } from './binding.ts';
import {
  bindAssistantSession,
  loadAssistantSessions,
} from './sessions.ts';

interface AssistantClient {
  sessions: {
    refresh(): Promise<void>;
    create(input: { workspaceId: string }): Promise<string>;
    open(id: string): void;
    list: {
      getSnapshot(): {
        byId: Record<string, { cwd?: string }>;
      };
    };
    scope(id: string): object | undefined;
    sessionOf(ctx: object): {
      rename(title: string): Promise<{ ok: boolean }>;
      prompt(content: { type: 'text'; text: string }[], mode: 'queue'): Promise<{ ok: boolean }>;
    } | undefined;
  };
  workspaces: {
    list: { getSnapshot(): { archivedSessionIds: readonly string[] } };
  };
  conversation?: {
    input: {
      for(actx: object): {
        insertReference(
          ref: { source: string; ref: string; label: string; appearance?: 'file'; clipboardText: string },
          span: { start: number; end: number; draftRev: number },
        ): boolean;
        state: { getSnapshot(): { draft: string; draftRev: number } };
      };
    };
  };
  modelDirectories?: {
    directoryFor(sessionId: string): {
      store: {
        getSnapshot(): {
          current: { provider: string; model: string } | null;
          groups: { id: string; name: string; models: { id: string; name: string }[] }[];
          status: string;
          error: string | null;
        };
        subscribe(callback: () => void): () => void;
      };
      load(): Promise<unknown>;
      select(selection: { provider: string; model: string }): Promise<void>;
    };
  };
}

export interface AssistantHostDeps {
  client: AssistantClient;
  waitSession: () => Promise<void>;
  getWorkspaceId: () => string;
  getWorkspace: () => string;
  remember: (id: string, topicId?: string) => void;
  currentSessionId: () => string;
  getOpened: () => { sessionId: string; topicId: string };
  setOpenedSession: (id: string) => void;
  notifySession: () => void;
  getHold: () => { sessionId: string; topicId: string } | null;
  setHold: (next: { sessionId: string; topicId: string } | null) => void;
}

type AssistantMethods = Pick<ResearchSessions,
  'startAssistant' | 'ensureAssistant' | 'insertAssistantObjects' | 'switchAssistantMode' | 'assistantModel' | 'focusAssistantSession'
>;

export function createAssistantHost(deps: AssistantHostDeps): AssistantMethods {
  const assistantStarts = new Map<string, Promise<StartSessionResult>>();
  const emptyModelSnap = { current: null as { provider: string; model: string } | null, groups: [] as { id: string; name: string; models: { id: string; name: string }[] }[], status: 'idle', error: null as string | null };
  const modelStores = new Map<string, NonNullable<ReturnType<NonNullable<ResearchSessions['assistantModel']>>>>();
  const { client } = deps;

  const insertAssistantRefs = (objects: { source: string; ref: string; label: string; clipboardText: string }[] | undefined, sessionId: string) => {
    if (!objects?.length) return;
    const scope = sessionId ? client.sessions.scope(sessionId) : undefined;
    if (!scope) return;
    const input = client.conversation?.input.for(scope);
    if (!input) return;
    for (const item of objects) {
      const snap = input.state.getSnapshot();
      const end = snap.draft.length;
      input.insertReference({
        source: item.source || '研究对象',
        ref: item.ref,
        label: item.label,
        appearance: 'file',
        clipboardText: item.clipboardText || item.label,
      }, { start: end, end, draftRev: snap.draftRev });
    }
  };

  const ensureAssistantSession = async (input: {
    pageKey: string;
    title: string;
    mode: 'ask' | 'agent';
    plugin?: AssistantPlugin;
    target?: string;
    fresh?: boolean;
  }) => {
    const derived = assistantBindingForPage(input.pageKey);
    if (!derived && !input.plugin) throw new Error('本页没有问助手');
    const plugin = input.plugin || derived?.plugin;
    if (!plugin) throw new Error('本页没有问助手');
    const target = input.target ?? derived?.target ?? '';
    const bindKey = derived?.bindKey || `${plugin}:${input.pageKey}`;
    const workspaceId = deps.getWorkspaceId();
    const workspace = deps.getWorkspace();
    if (!workspaceId) throw new Error('研究工作区尚未连接');
    await client.sessions.refresh();
    const list = client.sessions.list.getSnapshot();
    const archived = new Set(client.workspaces.list.getSnapshot().archivedSessionIds);
    const bound = input.fresh ? null : await loadAssistantSessions().catch(() => ({
      sessions: {} as Record<string, { mode: 'ask' | 'agent' }>,
      pages: {} as Record<string, { session_id: string }>,
    }));
    const pageBind = bound?.pages?.[bindKey] || bound?.pages?.[input.pageKey];
    const reusable = pageBind?.session_id
      && list.byId[pageBind.session_id]?.cwd === workspace
      && !archived.has(pageBind.session_id)
      ? pageBind.session_id : undefined;
    if (reusable) {
      const reusedMode = input.fresh ? input.mode : (bound?.sessions?.[reusable]?.mode || input.mode);
      await bindAssistantSession({ session_id: reusable, plugin, mode: reusedMode, target, page_key: bindKey });
      return { id: reusable, mode: reusedMode as 'ask' | 'agent' };
    }
    const id = await client.sessions.create({ workspaceId });
    const scope = client.sessions.scope(id);
    const face = scope ? client.sessions.sessionOf(scope) : undefined;
    if (!face) throw new Error('问助手会话创建失败');
    const title = `问助手 · ${input.title}`.slice(0, 80);
    if (!(await face.rename(title)).ok) throw new Error('问助手绑定失败，请重试');
    await bindAssistantSession({ session_id: id, plugin, mode: input.mode, target, page_key: bindKey });
    return { id, mode: input.mode };
  };

  return {
    async startAssistant(input) {
      await deps.waitSession();
      if (!deps.getWorkspaceId()) throw new Error('研究工作区尚未连接');
      const key = `${input.pageKey}:${input.plugin || ''}:${input.target || ''}:${input.fresh ? 'new' : 'reuse'}`;
      if (assistantStarts.has(key)) return assistantStarts.get(key)!;
      const run = (async (): Promise<StartSessionResult> => {
        const { id, mode } = await ensureAssistantSession(input);
        if (input.prompt?.trim()) {
          const scope = client.sessions.scope(id);
          const face = scope ? client.sessions.sessionOf(scope) : undefined;
          if (!face) throw new Error('问助手会话不可用');
          const bound = await bindAssistantPrompt({
            prompt: input.prompt,
            title: input.title,
            mode,
            pageSnapshot: input.pageSnapshot,
            marketIndices: input.marketIndices,
            companyQuotes: input.companyQuotes as CompanySnapshotQuote[] | undefined,
            objects: (input.objects || []).map(item => ({
              kind: item.kind || 'object',
              id: item.id,
              label: item.label,
              version: item.version,
              url: item.url,
              hint: item.hint,
              source: item.source,
              time: item.time,
              locator: item.locator,
              section: item.section,
              detail: item.detail,
            })),
          });
          if (!(await face.prompt([{ type: 'text', text: bound }], 'queue')).ok) {
            throw new Error('问助手问题未被接收，请检查模型设置后重试');
          }
        }
        return { sessionId: id, status: 'started', mode };
      })();
      assistantStarts.set(key, run);
      try { return await run; } finally { assistantStarts.delete(key); }
    },
    async ensureAssistant(input) {
      await deps.waitSession();
      if (!deps.getWorkspaceId()) throw new Error('研究工作区尚未连接');
      const key = `${input.pageKey}:${input.plugin || ''}:${input.target || ''}:${input.fresh ? 'new' : 'reuse'}`;
      if (assistantStarts.has(key)) return assistantStarts.get(key)!;
      const run = (async (): Promise<StartSessionResult> => {
        const { id, mode } = await ensureAssistantSession(input);
        return { sessionId: id, status: 'started', mode };
      })();
      assistantStarts.set(key, run);
      try { return await run; } finally { assistantStarts.delete(key); }
    },
    insertAssistantObjects(sessionId, objects) {
      insertAssistantRefs(objects, sessionId);
    },
    async switchAssistantMode(sessionId, mode, pageKey) {
      await deps.waitSession();
      const store = await loadAssistantSessions().catch(() => ({ sessions: {} as Record<string, { plugin?: AssistantPlugin; target?: string; page_key?: string }> }));
      const bound = store.sessions[sessionId];
      const derived = pageKey ? assistantBindingForPage(pageKey) : null;
      await bindAssistantSession({
        session_id: sessionId,
        mode,
        plugin: bound?.plugin,
        target: bound?.target,
        page_key: derived?.bindKey || bound?.page_key || pageKey,
      });
    },
    assistantModel(sessionId) {
      const existing = modelStores.get(sessionId);
      if (existing) return existing;
      let directory: ReturnType<NonNullable<AssistantClient['modelDirectories']>['directoryFor']> | undefined;
      try { directory = client.modelDirectories?.directoryFor(sessionId); }
      catch { return null; }
      const store = directory?.store && typeof directory.store.getSnapshot === 'function' && typeof directory.store.subscribe === 'function'
        ? directory.store
        : null;
      if (!store || !directory) return null;
      let last = emptyModelSnap;
      const wrapped = {
        subscribe: (listener: () => void) => {
          try { return store.subscribe(listener); }
          catch { return () => {}; }
        },
        getSnapshot: () => {
          try {
            const next = store.getSnapshot();
            if (last && JSON.stringify(last) === JSON.stringify(next)) return last;
            last = next;
            return next;
          } catch {
            return last;
          }
        },
        load: async () => { try { void directory.load(); } catch { /* 模型目录失败时隐藏选择，不打断发送 */ } },
        select: (selection: { provider: string; model: string }) => directory.select(selection),
      };
      modelStores.set(sessionId, wrapped);
      return wrapped;
    },
    focusAssistantSession(sessionId) {
      if (!deps.getHold()) deps.setHold({ sessionId: deps.currentSessionId(), topicId: deps.getOpened().topicId });
      client.sessions.open(sessionId);
      deps.setOpenedSession(sessionId);
      deps.notifySession();
      return () => {
        const hold = deps.getHold();
        deps.setHold(null);
        if (hold?.sessionId) deps.remember(hold.sessionId, hold.topicId);
      };
    },
  };
}

export function applyAssistant(_ctx: Context, research: ResearchSessions, deps: AssistantHostDeps): ResearchSessions {
  return Object.assign(research, createAssistantHost(deps));
}
