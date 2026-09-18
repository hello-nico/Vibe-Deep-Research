import * as React from "react";
import { Activity, MessageSquare, Plus, ArrowUpRight, Archive } from "lucide-react";
import { RouterProvider } from "react-router-dom";
import type { Context } from "@deepseek-ai/cordis";
import { router } from "../router";
import { researchObjectSource, researchTarget } from './research-input';
import { createCitationMention, webCitationUrl } from '../lib/citationMarks';
import { SearchPreviews } from './search-previews';
import { installResultNode } from './result-node';
import type {} from '@deepseek-ai/dsh-client-ui-input-trigger/client';
import { hydrateNotes } from "../lib/notes";
import { bindTopicSession, loadTopicSessions } from "../lib/topicSessions";
import { cancelReportRun, loadReportTasks, startReportRun } from "../lib/reportTasks";
import { projectTaskTrajectory, sameTaskTrajectory } from "../lib/taskTrajectory";
import type { StartSessionOptions, StartSessionResult, SessionState, TaskProcessRef, TaskTrajectorySnapshot } from "./research-session";
import { hydrateWatch } from "../lib/watchlist";
import { hydrateRoster } from "../lib/researchRoster";
import { hydratePrefs } from "../lib/prefs";
import { storageGet, storageSet } from "../lib/storage";
import { type SlotProps } from "./NativeDsh";
import { ResearchLoading } from "../components/ui/ResearchLoading";
import { FinanceRoot } from '../components/layout/FinanceRoot';
import { FinanceAssistantSeat } from '../components/layout/FinanceAssistantSurface';
import "../../../index.css";
import "./native-dsh.css";

interface Client {
  on(event: "theme/change", callback: () => void): () => void;
  theme: {
    getTheme(): { active: { colorScheme: string; tokens: Record<string, string> }; fontSize: number };
    setTheme(theme: string): void;
  };
  connection: { state: { getSnapshot(): string | undefined; subscribe(callback: () => void): () => void } };
  slots: {
    register<P>(options: Record<string, unknown>, component: React.ComponentType<P>): () => void;
    inject(name: string, callback: () => () => void): () => void;
  };
  workspaces: {
    create(input: { path: string }): Promise<{ workspaceId: string }>;
    archiveSession(id: string): Promise<void>;
    list: { getSnapshot(): { archivedSessionIds: readonly string[] }; subscribe(callback: () => void): () => void };
  };
  sessions: {
    refresh(): Promise<void>;
    list: { getSnapshot(): { ids: string[]; current?: string; byId: Record<string, { cwd?: string; title?: string; displayTitle?: string; running?: boolean; blank?: boolean; updatedAt?: string; parentId?: string; origin?: string }> }; subscribe(callback: () => void): () => void };
    create(input: { workspaceId: string }): Promise<string>;
    open(id: string): void;
    scope(id: string): Context | undefined;
    sessionOf(ctx: Context): HistorySession | undefined;
    binding?(id: string): { sessionId: string; session?: HistorySession } | undefined;
  };
  uiConversation?: {
    binding(source: string): {
      activate(target: string): void;
      target(target: string): { getSnapshot(): unknown; subscribe(callback: () => void): () => void };
    };
  };
}
interface HistorySession {
  open?(): Promise<void>;
  loadOlder?(): Promise<void>;
  rename(title: string): Promise<{ ok: boolean }>;
  prompt(content: { type: 'text'; text: string }[], mode: 'queue'): Promise<{ ok: boolean }>;
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
  subscribe?(callback: () => void): () => void;
}
export const inject = ["slots", "connection", "theme", "sessions", "workspaces", "inputTriggers", "uiConversation"];

/** Product composition; the standard DSH Web kernel boots and mounts it. */
export function apply(ctx: Context) {
  installResultNode(ctx);
  ctx.effect(() => ctx.inputTriggers.registerSource(researchObjectSource));
  ctx.provide('chatFileMentions', { forClosing() {
    const citation = createCitationMention(reference => window.dispatchEvent(new CustomEvent('finance-open-evidence', { detail: reference })));
    return { resolve(value: string) {
      const target = researchTarget(value);
      if (target?.kind === 'evidence') return citation(target.id);
      const web = webCitationUrl(value);
      if (web) {
        const mention = citation(web);
        return { ...mention, open: () => { window.open(web, '_blank', 'noopener,noreferrer'); } };
      }
      if (!target) return undefined;
      return { label: '打开研究材料', title: '', open() {
        if (target.kind === 'topic') void router.navigate(`/my-research/topics/${target.id.slice(6)}`);
        else void router.navigate('/my-research/material?' + new URLSearchParams({ slug: target.id, from: window.location.pathname + window.location.search }));
      } };
    } };
  } });
  const client = ctx as unknown as Client;
  let detailsOpen = false;
  let disposed = false;
  const listeners = new Set<() => void>();
  const setDetails = (open: boolean) => { detailsOpen = open; listeners.forEach(listener => listener()); };
  ctx.reflect.provide("layout", {
    toggleSidebar: () => window.dispatchEvent(new Event("vibe-toggle-sidebar")),
    openDetails: () => setDetails(true), closeDetails: () => setDetails(false),
  });
  document.body.classList.add("vibe-dsh-host");
  document.title = "Vibe-Finance";
  const icon = document.createElement('link');
  icon.rel = 'icon';
  icon.type = 'image/svg+xml';
  icon.href = '/finance-icon.svg';
  document.querySelectorAll('link[rel~="icon"]').forEach(node => node.remove());
  document.head.append(icon);
  client.slots.inject('conversation.hero.brand.mark', () => client.slots.register<{ size: number }>({
    name: 'conversation.hero.brand.mark',
  }, ({ size }) => <Activity width={size} height={size} color="hsl(var(--primary))" aria-label="Vibe-Finance" />));
  const presentTheme = () => {
    const snapshot = client.theme.getTheme();
    const dark = snapshot.active.colorScheme === "dark";
    document.body.toggleAttribute("data-ds-dark-theme", dark);
    document.documentElement.style.colorScheme = dark ? "dark" : "light";
    document.body.style.setProperty("--dsh-content-font-size", `${snapshot.fontSize}px`);
    for (const [key, value] of Object.entries(snapshot.active.tokens)) document.body.style.setProperty(key, value);
    window.dispatchEvent(new CustomEvent("dsh-theme-change", { detail: dark }));
  };
  client.on("theme/change", presentTheme);
  const fromProduct = (event: Event) => client.theme.setTheme((event as CustomEvent<boolean>).detail ? "dark" : "light");
  window.addEventListener("vibe-theme-change", fromProduct);
  ctx.effect(() => () => {
    disposed = true;
    window.removeEventListener("vibe-theme-change", fromProduct);
    document.body.classList.remove("vibe-dsh-host");
  });
  presentTheme();
  // 自选 / 研究名单 / 偏好走产品本地服务；记录失败不能挡住工作台挂载。
  const ready = Promise.all([hydrateWatch(), hydrateRoster(), hydratePrefs()]);
  void hydrateNotes().catch(() => {});
  void ready.catch(() => {}); // The mounted frame presents the failure and retry action.
  let session: Promise<void> | undefined;
  let workspace = '';
  let workspaceId = '';
  const companyStarts = new Map<string, Promise<StartSessionResult>>();
  const reportStarts = new Map<string, Promise<StartSessionResult>>();
  let openedSessionId = "";
  let openedTopicId = "";
  const sessionListeners = new Set<() => void>();
  let taskProcess: TaskProcessRef | null = null;
  const taskProcessListeners = new Set<() => void>();
  const remember = (id: string, topicId = "") => {
    const changed = openedSessionId !== id || openedTopicId !== topicId;
    openedSessionId = id;
    openedTopicId = topicId;
    storageSet(`vibe-dsh-session:vibe:${workspaceId}`, id);
    client.sessions.open(id);
    if (changed) sessionListeners.forEach(listener => listener());
  };
  type HiddenChats = { status: 'loading' } | { status: 'ready'; ids: Set<string> } | { status: 'error' };
  let hiddenChats: HiddenChats = { status: 'loading' };
  const hiddenListeners = new Set<() => void>();
  const notifyHidden = () => hiddenListeners.forEach(listener => listener());
  const nativeBackground = (item: { parentId?: string; origin?: string; blank?: boolean } | undefined) =>
    Boolean(item?.parentId || item?.origin === 'subagent' || item?.blank);
  const isBackgroundChat = (id: string, item: { parentId?: string; origin?: string; blank?: boolean } | undefined, hidden: HiddenChats) => {
    if (nativeBackground(item)) return true;
    if (hidden.status !== 'ready') return true;
    return hidden.ids.has(id);
  };
  const refreshHiddenChats = async (): Promise<HiddenChats> => {
    try {
      const store = await loadReportTasks();
      const ids = new Set(Object.keys(store.sessions || {}));
      if (store.host_session_id) ids.add(store.host_session_id);
      hiddenChats = { status: 'ready', ids };
    } catch {
      hiddenChats = { status: 'error' };
    }
    notifyHidden();
    return hiddenChats;
  };
  const historyFace = (sessionId: string) => {
    const bound = client.sessions.binding?.(sessionId)?.session;
    if (bound) return bound;
    const scope = client.sessions.scope(sessionId);
    return scope ? client.sessions.sessionOf(scope) : undefined;
  };
  const openErrorText = (snap?: ReturnType<NonNullable<HistorySession['getSnapshot']>>) => {
    if (!snap?.openError) return undefined;
    return '执行记录读取失败';
  };
  const lastTrajectory = new Map<string, TaskTrajectorySnapshot>();
  const trajectoryStores = new Map<string, { subscribe(listener: () => void): () => void; getSnapshot(): TaskTrajectorySnapshot; loadOlder(): Promise<void> }>();
  const projectTrajectory = (sessionId: string, raw: unknown): TaskTrajectorySnapshot => {
    const list = client.sessions.list.getSnapshot();
    const item = list.byId[sessionId];
    const face = historyFace(sessionId);
    const snap = face?.getSnapshot?.();
    const next = projectTaskTrajectory({
      running: Boolean(item?.running || snap?.running),
      failed: Boolean(snap?.lastAgentError || snap?.promptError),
      openState: snap?.openState || 'cold',
      openError: openErrorText(snap),
      hasMore: Boolean(snap?.hasMore),
      loadingOlder: Boolean(snap?.loadingOlder),
      raw,
    });
    const prev = lastTrajectory.get(sessionId);
    if (prev && sameTaskTrajectory(prev, next)) return prev;
    lastTrajectory.set(sessionId, next);
    return next;
  };
  const ensureTaskHistory = async (sessionId: string) => {
    const face = historyFace(sessionId);
    if (typeof face?.open === 'function') await face.open();
  };
  async function openSession() {
    const response = await fetch("/finance-host");
    if (!response.ok) throw new Error(`工作区配置读取失败 (${response.status})`);
    ({ workspace } = await response.json() as { workspace: string });
    if (!workspace || typeof workspace !== "string") throw new Error("内部工作区配置缺失");
    const registered = await client.workspaces.create({ path: workspace });
    workspaceId = registered.workspaceId;
    await client.sessions.refresh();
    if (disposed) return;
    const hidden = await refreshHiddenChats();
    if (disposed) return;
    const list = client.sessions.list.getSnapshot();
    const key = `vibe-dsh-session:vibe:${registered.workspaceId}`;
    const saved = storageGet(key);
    const archived = new Set(client.workspaces.list.getSnapshot().archivedSessionIds);
    const existing = saved && list.byId[saved]?.cwd === workspace && !archived.has(saved) && !isBackgroundChat(saved, list.byId[saved], hidden) ? saved : undefined;
    const fallback = list.ids.find(id => list.byId[id]?.cwd === workspace && !archived.has(id) && !isBackgroundChat(id, list.byId[id], hidden));
    const id = existing ?? fallback ?? await client.sessions.create({ workspaceId: registered.workspaceId });
    if (disposed) return;
    storageSet(key, id);
    client.sessions.open(id);
  }
  // 报告任务走宿主 spawn；绑定写在子 Agent 创建窗口，早于 followup 首请求。
  async function startReportTask(question: string, task: { slug: string; inputHash: string; title?: string }): Promise<StartSessionResult> {
    const key = `${task.slug}:${task.inputHash}`;
    if (reportStarts.has(key)) return reportStarts.get(key)!;
    const run = (async (): Promise<StartSessionResult> => {
      const result = await startReportRun({
        slug: task.slug,
        input_hash: task.inputHash,
        prompt: question,
        title: task.title || `报告生成 · ${task.slug}`,
      });
      await client.sessions.refresh().catch(() => {});
      return { sessionId: result.session_id, status: result.status };
    })();
    reportStarts.set(key, run);
    try { return await run; } finally { reportStarts.delete(key); }
  }
  const research = { async companySymbols() {
    await session;
    if (!workspaceId) throw new Error('研究工作区尚未连接');
    await client.sessions.refresh();
    const list = client.sessions.list.getSnapshot();
    const archived = new Set(client.workspaces.list.getSnapshot().archivedSessionIds);
    return list.ids.flatMap(id => {
      const item = list.byId[id];
      const symbol = item?.cwd === workspace && !archived.has(id)
        ? /^公司研究 · (\d{6}) · /.exec(item.title ?? '')?.[1] : undefined;
      return symbol ? [symbol] : [];
    });
  }, async start(question: string, company?: { symbol: string; name: string }, options?: StartSessionOptions): Promise<StartSessionResult> {
    await session;
    if (!workspaceId) throw new Error('研究工作区尚未连接');
    const task = options?.task;
    if (task?.kind === 'report') return startReportTask(question, task);
    const key = company?.symbol;
    if (key && companyStarts.has(key)) return companyStarts.get(key)!;
    const go = options?.navigate !== false;
    const run = (async (): Promise<StartSessionResult> => {
      await client.sessions.refresh();
      const title = company ? `公司研究 · ${company.symbol} · ${company.name}` : undefined;
      const list = client.sessions.list.getSnapshot();
      const existing = title && list.ids.find(id => list.byId[id]?.cwd === workspace && list.byId[id]?.title === title && list.byId[id]?.running);
      if (existing) {
        remember(existing);
        if (go) await router.navigate('/');
        return { sessionId: existing, status: 'running' };
      }
      const id = await client.sessions.create({ workspaceId });
      const scope = client.sessions.scope(id);
      const face = scope && client.sessions.sessionOf(scope);
      if (!face) throw new Error('研究会话创建失败');
      if (title && !(await face.rename(title)).ok) throw new Error('公司研究绑定失败，请重试');
      remember(id);
      if (!(await face.prompt([{ type: 'text', text: question }], 'queue')).ok) throw new Error('研究问题未被接收，请检查模型设置后回到深度对话重试');
      if (go) await router.navigate('/');
      return { sessionId: id, status: 'started' };
    })();
    if (key) companyStarts.set(key, run);
    try { return await run; } finally { if (key) companyStarts.delete(key); }
  }, async findCompanySession(symbol: string) {
    await session;
    if (!workspaceId) return null;
    await client.sessions.refresh();
    const list = client.sessions.list.getSnapshot();
    const archived = new Set(client.workspaces.list.getSnapshot().archivedSessionIds);
    const prefix = `公司研究 · ${symbol} · `;
    const ids = list.ids.filter(id => {
      const item = list.byId[id];
      return item?.cwd === workspace && !archived.has(id) && (item.title ?? '').startsWith(prefix);
    });
    ids.sort((a, b) => (new Date(list.byId[b]?.updatedAt ?? 0).getTime() || 0) - (new Date(list.byId[a]?.updatedAt ?? 0).getTime() || 0));
    const id = ids[0];
    if (!id) return null;
    const item = list.byId[id];
    return { sessionId: id, title: item?.title ?? '', running: Boolean(item?.running), updatedAt: item?.updatedAt };
  }, async findReportTask(slug: string) {
    await session;
    if (!workspaceId) return null;
    await client.sessions.refresh();
    const list = client.sessions.list.getSnapshot();
    const archived = new Set(client.workspaces.list.getSnapshot().archivedSessionIds);
    const store = await loadReportTasks().catch(() => ({ sessions: {} as Record<string, { slug: string; input_hash: string; bound_at?: string }>, host_session_id: '' }));
    const bindings = store.sessions || {};
    const ids = Object.keys(bindings).filter(id => bindings[id]?.slug === slug && !archived.has(id) && id !== store.host_session_id);
    ids.sort((a, b) => {
      const run = Number(Boolean(list.byId[b]?.running)) - Number(Boolean(list.byId[a]?.running));
      if (run) return run;
      const updated = (new Date(list.byId[b]?.updatedAt ?? 0).getTime() || 0) - (new Date(list.byId[a]?.updatedAt ?? 0).getTime() || 0);
      if (updated) return updated;
      return (new Date(bindings[b]?.bound_at ?? 0).getTime() || 0) - (new Date(bindings[a]?.bound_at ?? 0).getTime() || 0);
    });
    const id = ids[0];
    const bound = id ? bindings[id] : undefined;
    if (!id || !bound) return null;
    return { sessionId: id, slug, inputHash: bound.input_hash, running: Boolean(list.byId[id]?.running), updatedAt: list.byId[id]?.updatedAt };
  }, sessionState(sessionId: string): SessionState | null {
    const scope = client.sessions.scope(sessionId);
    const face = scope && client.sessions.sessionOf(scope);
    const snap = face?.getSnapshot?.();
    if (!snap) return null;
    return {
      running: Boolean(snap.running),
      lastAgentError: snap.lastAgentError ?? null,
      promptError: snap.promptError ? 'prompt failed' : null,
      removed: Boolean(snap.removed),
      awaitingFirstTurn: Boolean(snap.awaitingFirstTurn),
    };
  }, async restoreTopic(topicId: string, title = "", signal?: AbortSignal) {
    await session;
    if (!workspaceId) throw new Error('研究工作区尚未连接');
    await client.sessions.refresh();
    const list = client.sessions.list.getSnapshot();
    const archived = new Set(client.workspaces.list.getSnapshot().archivedSessionIds);
    const bound = await loadTopicSessions();
    const topicBind = bound.topics[topicId];
    const reusable = topicBind?.active_session_id
      && list.byId[topicBind.active_session_id]?.cwd === workspace
      && !archived.has(topicBind.active_session_id)
      ? topicBind.active_session_id : undefined;
    signal?.throwIfAborted();
    const id = reusable ?? await client.sessions.create({ workspaceId });
    await bindTopicSession(topicId, id, title || topicBind?.title || topicId);
    signal?.throwIfAborted();
    remember(id, topicId);
    return { topicId, sessionId: id, matched: openedTopicId === topicId && openedSessionId === id };
  }, async startTopic(input: { topicId: string; title: string; prompt: string; fresh?: boolean }) {
    await session;
    if (!workspaceId) throw new Error('研究工作区尚未连接');
    if (input.fresh) {
      const id = await client.sessions.create({ workspaceId });
      await bindTopicSession(input.topicId, id, input.title);
      remember(id, input.topicId);
    } else if (openedTopicId !== input.topicId || !openedSessionId) {
      await research.restoreTopic(input.topicId, input.title);
    } else {
      remember(openedSessionId, input.topicId);
    }
    const id = openedSessionId;
    const scope = client.sessions.scope(id);
    const face = scope && client.sessions.sessionOf(scope);
    if (!face) throw new Error('议题会话创建失败');
    if (!(await face.prompt([{ type: 'text', text: input.prompt }], 'queue')).ok) {
      throw new Error('议题研究未被接收，请检查模型设置后重试');
    }
  }, async openSession(sessionId: string) {
    await session;
    if (!workspaceId) throw new Error('研究工作区尚未连接');
    await client.sessions.refresh();
    const list = client.sessions.list.getSnapshot();
    const hidden = await refreshHiddenChats();
    const item = list.byId[sessionId];
    if (hidden.status !== 'ready' && !nativeBackground(item)) throw new Error('后台任务身份暂时无法核对，请稍后重试');
    if (isBackgroundChat(sessionId, item, hidden)) {
      research.openTaskProcess({ sessionId, title: item?.displayTitle || item?.title || '任务过程', kind: hidden.status === 'ready' && hidden.ids.has(sessionId) ? 'report' : 'knowledge' });
      return;
    }
    if (!item) throw new Error('找不到该执行记录');
    remember(sessionId);
    await router.navigate('/');
  }, openTaskProcess(task: TaskProcessRef) {
    taskProcess = task;
    taskProcessListeners.forEach(listener => listener());
    void ensureTaskHistory(task.sessionId).catch(() => {});
  }, closeTaskProcess() {
    taskProcess = null;
    taskProcessListeners.forEach(listener => listener());
  }, getTaskProcess() {
    return taskProcess;
  }, subscribeTaskProcess(listener: () => void) {
    taskProcessListeners.add(listener);
    return () => { taskProcessListeners.delete(listener); };
  }, trajectory(sessionId: string) {
    const existing = trajectoryStores.get(sessionId);
    if (existing) return existing;
    const store = {
      subscribe(listener: () => void) {
        void ensureTaskHistory(sessionId).catch(() => {});
        try {
          const binding = client.uiConversation?.binding(sessionId);
          binding?.activate('trajectory');
          const source = binding?.target('trajectory');
          const face = historyFace(sessionId);
          const offList = client.sessions.list.subscribe(listener);
          const offTarget = source?.subscribe(listener);
          const offFace = face?.subscribe?.(listener);
          return () => { offTarget?.(); offList(); offFace?.(); };
        } catch {
          return client.sessions.list.subscribe(listener);
        }
      },
      getSnapshot() {
        try {
          const binding = client.uiConversation?.binding(sessionId);
          binding?.activate('trajectory');
          return projectTrajectory(sessionId, binding?.target('trajectory')?.getSnapshot());
        } catch {
          return projectTrajectory(sessionId, undefined);
        }
      },
      async loadOlder() {
        const face = historyFace(sessionId);
        if (typeof face?.loadOlder === 'function') await face.loadOlder();
      },
    };
    trajectoryStores.set(sessionId, store);
    return store;
  }, async cancelTask(sessionId: string) {
    await cancelReportRun(sessionId);
  }, topicSessionMatches(topicId: string) {
    return openedTopicId === topicId && !!openedSessionId;
  }, subscribeSession(listener: () => void) {
    sessionListeners.add(listener);
    return () => { sessionListeners.delete(listener); };
  }, subscribeSessionList(listener: () => void) {
    const offSessions = client.sessions.list.subscribe(listener);
    const offArchives = client.workspaces.list.subscribe(listener);
    return () => { offSessions(); offArchives(); };
  } };
  client.slots.inject('conversation.view', () => client.slots.register<{ openView(view: string, focus?: string): void }>({
    name: 'conversation.view', id: 'finance-history', order: 30, label: () => '历史对话',
  }, History));
  client.slots.inject('conversation.session.header.utilities', () => client.slots.register({
    name: 'conversation.session.header.utilities', id: 'finance-new-conversation', order: -10,
  }, NewConversation));
  function NewConversation({ openView }: { openView?: (view: string) => void }) {
    const pending = React.useRef(false);
    const [creating, setCreating] = React.useState(false);
    const [error, setError] = React.useState('');
    const create = async () => {
      if (pending.current) return;
      pending.current = true;
      setCreating(true); setError('');
      try {
        if (!workspaceId) throw new Error('研究工作区尚未连接');
        const topicId = openedTopicId;
        const id = await client.sessions.create({ workspaceId });
        if (topicId) await bindTopicSession(topicId, id, topicId);
        openView?.('chat');
        remember(id, topicId);
      } catch {
        setError('新建对话失败，请重试');
      } finally {
        pending.current = false; setCreating(false);
      }
    };
    return <div className="flex flex-wrap items-center gap-2">
      <button type="button" disabled={creating} onClick={() => { void create(); }} className="finance-session-action"><span>{creating ? '正在新建…' : '新建对话'}</span><Plus size={16} /></button>
      {error && <span role="alert" className="text-xs text-destructive">{error}</span>}
    </div>;
  }
  client.slots.inject('conversation.input.dock', () => client.slots.register<{ session: { blank: boolean } }>({
    name: 'conversation.input.dock', id: 'finance-recent', order: 40,
  }, function Recent({ session }) {
    return session.blank ? <History compact openView={() => {}} /> : null;
  }));
  function History({ openView, compact = false }: { openView(view: string): void; compact?: boolean }) {
    const list = React.useSyncExternalStore(client.sessions.list.subscribe, client.sessions.list.getSnapshot);
    const [error, setError] = React.useState('');
    const subscribeArchives = React.useCallback((notify: () => void) => client.workspaces.list.subscribe(notify), []);
    const readArchives = React.useCallback(() => client.workspaces.list.getSnapshot(), []);
    const archives = React.useSyncExternalStore(subscribeArchives, readArchives);
    const subscribeHidden = React.useCallback((notify: () => void) => {
      hiddenListeners.add(notify);
      return () => { hiddenListeners.delete(notify); };
    }, []);
    const readHidden = React.useCallback(() => hiddenChats, []);
    const hidden = React.useSyncExternalStore(subscribeHidden, readHidden, readHidden);
    const [archiving, setArchiving] = React.useState<string | null>(null);
    const [showAll, setShowAll] = React.useState(false);
    React.useEffect(() => { void client.sessions.refresh().catch(() => setError('历史对话读取失败')); }, []);
    React.useEffect(() => { void refreshHiddenChats(); }, [list.ids.join(',')]);
    const updated = (id: string) => new Date(list.byId[id]?.updatedAt ?? 0).getTime() || 0;
    const readyHidden = hidden.status === 'ready';
    const allIds = readyHidden
      ? list.ids.filter(id => list.byId[id]?.cwd === workspace && !archives.archivedSessionIds.includes(id) && !isBackgroundChat(id, list.byId[id], hidden)).sort((a, b) => updated(b) - updated(a))
      : [];
    const ids = compact && !showAll ? allIds.slice(0, 4) : allIds;
    const archive = async (id: string) => {
      setError(''); setArchiving(id);
      try { await client.workspaces.archiveSession(id); }
      catch { setError('归档失败，请重试'); }
      finally { setArchiving(null); }
    };
    if (compact && hidden.status === 'loading') return null;
    if (compact && allIds.length === 0 && !error) return null;
    return <div className={compact ? 'finance-recent mx-auto mt-5 w-full px-4' : 'h-full overflow-auto p-6 sm:p-8'}><div className={compact ? 'w-full' : 'mx-auto max-w-4xl'}>
      {compact ? <div className="mb-3 flex items-center justify-between"><h2 className="text-sm font-medium text-muted-foreground">最近对话</h2>{allIds.length > 4 && <button className="text-xs text-muted-foreground hover:text-primary" onClick={() => setShowAll(!showAll)}>{showAll ? '收起' : '查看全部'}</button>}</div> : <>
      <div className="mb-6 flex items-center justify-between gap-4"><div><h2 className="text-lg font-semibold">继续你的研究</h2><p className="mt-2 text-sm text-muted-foreground">找回之前的问题，接着聊。</p></div>
        <NewConversation openView={openView} /></div></>}
      {error && <p role="alert">{error}</p>}
      {hidden.status === 'loading' && !compact && <p role="status" className="text-sm text-muted-foreground">正在核对对话列表…</p>}
      {hidden.status === 'error' && <p role="alert" className="text-sm text-destructive">后台任务身份暂时无法核对，历史对话暂不展示。<button type="button" className="workspace-action workspace-action-compact ml-2" onClick={() => { void refreshHiddenChats(); }}>重试</button></p>}
      {readyHidden && ids.length === 0 && <div className="rounded-2xl border border-dashed border-border p-12 text-center"><MessageSquare size={28} className="mx-auto mb-4 text-muted-foreground/50" /><p className="text-sm text-muted-foreground">还没有历史对话，从一个感兴趣的问题开始吧。</p></div>}
      <div className={compact ? 'grid max-h-64 grid-cols-1 gap-2 overflow-y-auto sm:grid-cols-2' : 'space-y-3'}>{ids.map(id => <div key={id} className="group flex items-center rounded-xl border border-border bg-card shadow-sm transition-colors hover:border-primary/30 hover:bg-muted/30 focus-within:border-primary/40"><button className="flex min-w-0 flex-1 items-center gap-4 rounded-xl px-5 py-4 text-left outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary/40" onClick={() => { void research.openSession(id).then(() => openView('chat')).catch(err => setError(err instanceof Error ? err.message : '无法打开该对话')); }}>
        <span className="rounded-xl bg-primary/10 p-2.5 text-primary"><MessageSquare size={18} /></span><span className="min-w-0 flex-1"><span className="block truncate text-sm font-medium">{list.byId[id]?.displayTitle || list.byId[id]?.title || '新对话'}</span><span className="mt-1 block text-xs text-muted-foreground">{list.byId[id]?.running ? '研究进行中' : '继续研究'}{updated(id) > 0 && <span> · {new Date(updated(id)).toLocaleString('zh-CN', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' })}</span>}</span></span><ArrowUpRight size={16} className="shrink-0 text-muted-foreground group-hover:text-primary" />
      </button><div className="mr-3 shrink-0 border-l border-border pl-3"><button type="button" disabled={archiving !== null || list.byId[id]?.running} title={list.byId[id]?.running ? '研究结束后可归档' : '归档后从历史列表移除，保留对话内容'} aria-label={`归档 ${list.byId[id]?.displayTitle || list.byId[id]?.title || '新对话'}`} className="inline-flex h-10 w-24 items-center justify-center gap-2 rounded-lg text-sm text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 disabled:cursor-not-allowed disabled:opacity-40" onClick={() => { void archive(id); }}><Archive size={16} />{archiving === id ? '归档中' : '归档'}</button></div></div>)}</div>
    </div></div>;
  }
  client.slots.register<SlotProps>({ name: "root", inject: () => ({ hooks: { connectionState: client.connection.state } }), children: {
    sidebar: { kind: "single", scope: "root" },
    conversation: { kind: "single", scope: "session-maybe" },
    details: { kind: "single", scope: "session" },
    "shell.overlay": { kind: "list", scope: "root" },
  } }, function FinanceFrame(props) {
    const [state, setState] = React.useState<"loading" | "ready" | Error>("loading");
    const [sessionError, setSessionError] = React.useState("");
    const showDetails = React.useSyncExternalStore(callback => { listeners.add(callback); return () => { listeners.delete(callback); }; }, () => detailsOpen);
    React.useEffect(() => {
      let active = true;
      void ready.then(() => {
        if (!active) return;
        setState("ready");
        session ??= openSession();
        void session.catch(error => { if (active) setSessionError(String(error)); });
      }, error => { if (active) setState(error instanceof Error ? error : new Error(String(error))); });
      return () => { active = false; };
    }, []);
    if (state !== "ready") return <div role="status" className="p-6">{state === "loading" ? <ResearchLoading title="正在读取工作台数据" sections={["自选", "研究名单", "界面偏好"]} /> : <>连不上本机服务，未加载选择：{state.message}<button onClick={() => location.reload()}>重新连接</button></>}</div>;
    return <FinanceRoot slots={props} research={research} sessionError={sessionError} showDetails={showDetails}>
      <RouterProvider router={router} />
    </FinanceRoot>;
  });
  client.slots.inject('shell.overlay', () => client.slots.register({
    name: 'shell.overlay', id: 'finance-page-assistant',
  }, FinanceAssistantSeat));
  client.slots.inject('conversation.chat.assistant-actions', () => client.slots.register({
    name: 'conversation.chat.assistant-actions', id: 'finance-search-previews',
  }, SearchPreviews));
  client.slots.register<SlotProps>({ name: "sidebar", children: { "sidebar.settings": { kind: "single", scope: "root" } } },
    props => <>{props.renderSlot("sidebar.settings", { wide: true })}</>);
}
