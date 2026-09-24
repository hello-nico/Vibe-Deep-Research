import * as React from "react";
import { Activity, Archive, ArrowUpRight, Loader2, MessageSquare, Paperclip, Plus } from "lucide-react";
import { RouterProvider } from "react-router-dom";
import type { Context } from "@deepseek-ai/cordis";
import { router } from "../router";
import { researchObjectSource, researchTarget } from './research-input';
import { readableTitleDecision, type TitleEventEntry } from './research-title';
import { installTriggerMenuFit } from './trigger-menu-fit';
import { installPanelConversation } from './panel-conversation';
import { selectSidePanel, type FinanceSidePanel } from './side-panel';
import { hydrateObjectLabels, objectLabel, openRegisteredObject, resolveObjectLabels } from '../lib/objectRegistry';
import { backgroundTaskForSession, loadBackgroundTasks } from '../lib/research';
import { createCitationMention, webCitationUrl } from '../lib/citationMarks';
import { LIBRARY_BATCH_MAX, LIBRARY_CONCURRENCY, LIBRARY_CITE_EVENT, LIBRARY_MAX_BYTES, deliverLibraryCiteBatch, documentRef, libraryCiteFromItem, libraryFileKind, libraryUploadError, mapPool, pendingLibraryCites, queueLibraryCites, rememberMentionLabel, uploadLibraryFile, type LibraryCite, type PendingLibraryCites } from '../lib/library';
import { SearchPreviews } from './search-previews';
import { installResultNode } from './result-node';
import { FinanceToolRow } from './tool-row';
import type {} from '@deepseek-ai/dsh-client-ui-input-trigger/client';
import { hydrateNotes } from "../lib/notes";
import { bindTopicSession, loadTopicSessions } from "../lib/topicSessions";
import { loadAssistantSessions, subscribeAssistantSeat, assistantSeatSnapshot } from "../assistant/sessions.ts";
import { applyAssistant } from "../assistant/apply.ts";
import { cancelReportRun, cancelResearchRun, legacyCompanySymbol, loadReportTasks, researchTaskStatus, startReportRun, startResearchRun } from "../lib/reportTasks";
import { FINANCE_TOOL_NAMES, projectTaskTrajectory, stableTaskTrajectory } from "../lib/taskTrajectory";
import { userFacingRuntimeError } from "../lib/userFacingError";
import { createTaskTrajectoryStore, ensureTaskHistory, historyFaceOf } from "../lib/taskHistory";
import type { StartSessionOptions, StartSessionResult, SessionState, TaskProcessRef, TaskTrajectorySnapshot, ResearchSessions } from "./research-session";
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
import "./tool-row.css";

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
  uiWorkspace: { openSession(id: string): void };
  sessions: {
    refresh(): Promise<void>;
    refreshProjections(id: string): Promise<void>;
    list: { getSnapshot(): { ids: string[]; projectionsBySession: Record<string, { state: string; values: { subagentCatalog?: { id: string; mode: 'one-shot' | 'continuable' | 'unknown' }[] } }>; byId: Record<string, { cwd?: string; title?: string; displayTitle?: string; running?: boolean; blank?: boolean; updatedAt?: number; parentId?: string; origin?: string }> }; subscribe(callback: () => void): () => void };
    create(input: { workspaceId: string }): Promise<string>;
    retain(id: string | { parentSessionId: string; childSessionId: string; mode: 'one-shot' | 'continuable' }, options: { source: string; signal?: AbortSignal }): { binding: { sessionId: string; session: HistorySession }; ready: Promise<unknown>; release(): void };
    scope(id: string): Context | undefined;
    sessionOf(ctx: Context): HistorySession | undefined;
    binding?(id: string): { sessionId: string; session: HistorySession } | undefined;
    subagentAddress?(id: string): { parentSessionId: string; childSessionId: string; mode: 'one-shot' | 'continuable' } | undefined;
    retainInfo(id: string): { getSnapshot(): { retainedBy: { mainView?: number } }; subscribe(callback: () => void): () => void };
  };
  uiConversation?: {
    binding(source: { sessionId: string; session: HistorySession }): {
      activate(target: string): void;
      target(target: string): { getSnapshot(): unknown; subscribe(callback: () => void): () => void };
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
  conversation?: {
    input: {
      for(actx: Context): {
        insertReference(
          ref: { source: string; ref: string; label: string; appearance?: 'file'; clipboardText: string },
          span: { start: number; end: number; draftRev: number },
        ): boolean;
        notify(level: 'info' | 'error', text: string): void;
        state: { getSnapshot(): { draft: string; draftRev: number } };
      };
    };
  };
}
interface HistorySession {
  open?(): Promise<void>;
  loadOlder?(): Promise<void>;
  rename(title: string): Promise<{ ok: boolean }>;
  prompt(content: { type: 'text'; text: string }[], mode: 'queue'): Promise<{ ok: boolean }>;
  cancel?(): Promise<{ ok: boolean }>;
  eventSource?: { getSnapshot(): { entries: readonly TitleEventEntry[] }; subscribe(listener: () => void): () => void };
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
export const inject = ["slots", "connection", "theme", "sessions", "workspaces", "uiWorkspace", "inputTriggers", "uiConversation", "conversation", "modelDirectories"];

function openResearchTarget(value: string) { openRegisteredObject(value); }

/** Product composition; the standard DSH Web kernel boots and mounts it. */
export function apply(ctx: Context) {
  installResultNode(ctx);
  installPanelConversation(ctx, () => sidePanel);
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
      void resolveObjectLabels([value]);
      const label = objectLabel(value);
      return { label, title: label, open() { openResearchTarget(value); } };
    } };
  } });
  const client = ctx as unknown as Client;
  for (const name of FINANCE_TOOL_NAMES) {
    client.slots.inject('tool.call.toolview', () => client.slots.register({ name: 'tool.call.toolview', key: name }, FinanceToolRow));
  }
  let disposed = false;
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
  const openMention = (event: Event) => {
    const ref = (event as CustomEvent<string>).detail;
    if (ref) openResearchTarget(ref);
  };
  const navigateObject = (event: Event) => {
    const href = (event as CustomEvent<string>).detail;
    if (href) void router.navigate(href);
  };
  window.addEventListener("vibe-theme-change", fromProduct);
  window.addEventListener("finance-open-research-mention", openMention);
  window.addEventListener('finance-object-navigate', navigateObject);
  const disposeMenuFit = installTriggerMenuFit();
  ctx.effect(() => () => {
    disposed = true;
    window.removeEventListener("vibe-theme-change", fromProduct);
    window.removeEventListener("finance-open-research-mention", openMention);
    window.removeEventListener('finance-object-navigate', navigateObject);
    disposeMenuFit();
    document.body.classList.remove("vibe-dsh-host");
  });
  presentTheme();
  // 自选 / 研究名单 / 偏好走产品本地服务；记录失败不能挡住工作台挂载。
  // 对象名称预热：有上限、不阻塞失败，只为首次渲染的引用标签带上真名。
  const labels = Promise.race([hydrateObjectLabels(), new Promise<void>(resolve => setTimeout(resolve, 2500))]);
  const ready = Promise.all([hydrateWatch(), hydrateRoster(), hydratePrefs(), labels]);
  void hydrateNotes().catch(() => {});
  void ready.catch(() => {}); // The mounted frame presents the failure and retry action.
  let session: Promise<void> | undefined;
  let workspace = '';
  let workspaceId = '';
  const companyStarts = new Map<string, Promise<StartSessionResult>>();
  const reportStarts = new Map<string, Promise<StartSessionResult>>();
  let openedSessionId = "";
  let openedTopicId = "";
  const insertLibraryCitations = (items: LibraryCite[], sessionId: string) => {
    const scope = sessionId ? client.sessions.scope(sessionId) : undefined;
    const input = scope && client.conversation?.input.for(scope);
    if (!input) return false;
    for (const item of items) {
      const snap = input.state.getSnapshot();
      const end = snap.draft.length;
      const ref = documentRef(item.document_id, item.parse_revision_id, item.parsed_content_sha256);
      rememberMentionLabel(ref, item.title);
      const ok = input.insertReference({
        source: '研究对象',
        ref,
        label: item.has_parsed ? item.title : `${item.title}（正文未就绪）`,
        appearance: 'file',
        clipboardText: item.title,
      }, { start: end, end, draftRev: snap.draftRev });
      if (!ok) {
        input.notify('error', '无法放入输入框，请用 @ 选择同一份资料。');
        return false;
      }
    }
    input.notify(items.every(item => item.has_parsed) ? 'info' : 'error', items.every(item => item.has_parsed)
      ? '资料已经保存。'
      : '资料已经保存；正文未就绪的资料发送前不能按正文阅读。');
    return true;
  };
  const currentSessionId = () => openedSessionId;
  const withSession = async <T,>(id: string, use: (face: HistorySession) => Promise<T>): Promise<T> => {
    const reference = client.sessions.retain(id, { source: 'controllerOperation' });
    try {
      await reference.ready;
      return await use(reference.binding.session);
    } finally { reference.release(); }
  };
  const titleWatches = new Set<() => void>();
  ctx.effect(() => () => { for (const stop of [...titleWatches]) stop(); });
  const watchReadableTitle = (id: string) => {
    const reference = client.sessions.retain(id, { source: 'controllerOperation' });
    let active = true;
    let unsubscribe = () => {};
    const timer = window.setTimeout(() => stop(), 5 * 60_000);
    const stop = () => {
      if (!active) return;
      active = false;
      window.clearTimeout(timer);
      unsubscribe();
      reference.release();
      titleWatches.delete(stop);
    };
    titleWatches.add(stop);
    void reference.ready.then(() => {
      if (!active) return;
      const face = reference.binding.session;
      const source = face.eventSource;
      if (!source) { stop(); return; }
      let renaming = false;
      const check = () => {
        if (!active || renaming) return;
        const decision = readableTitleDecision(source.getSnapshot().entries);
        if (decision.status === 'skip') { stop(); return; }
        if (decision.status !== 'rename') return;
        renaming = true;
        void Promise.resolve().then(async () => {
          const latest = readableTitleDecision(source.getSnapshot().entries);
          if (latest.status === 'rename' && latest.eventSeq === decision.eventSeq)
            await face.rename(latest.title);
        }).catch(() => {}).finally(stop);
      };
      unsubscribe = source.subscribe(check);
      check();
    }).catch(stop);
  };
  const deliverLibraryCitations = (items: LibraryCite[], preferredSessionId?: string) => {
    return deliverLibraryCiteBatch(queueLibraryCites(items, preferredSessionId), currentSessionId(),
      (item, id) => insertLibraryCitations([item], id));
  };
  const flushPendingCites = () => {
    for (const pending of pendingLibraryCites()) {
      deliverLibraryCiteBatch(pending, currentSessionId(), (item, id) => insertLibraryCitations([item], id));
    }
  };
  ctx.effect(() => {
    const onCite = (event: Event) => {
      const batch = (event as CustomEvent<PendingLibraryCites>).detail;
      if (!batch?.items.length) return;
      deliverLibraryCiteBatch(batch, currentSessionId(), (item, id) => insertLibraryCitations([item], id));
    };
    window.addEventListener(LIBRARY_CITE_EVENT, onCite);
    return () => window.removeEventListener(LIBRARY_CITE_EVENT, onCite);
  });
  const sessionListeners = new Set<() => void>();
  let sidePanel: FinanceSidePanel | null = null;
  const sidePanelListeners = new Set<() => void>();
  let unwatchMain: (() => void) | undefined;
  const setSidePanel = (next: FinanceSidePanel | null) => {
    unwatchMain?.();
    unwatchMain = undefined;
    const selected = selectSidePanel(sidePanel, next, openedSessionId);
    const panelSessionId = selected && 'sessionId' in selected ? selected.sessionId : '';
    const main = panelSessionId ? client.sessions.retainInfo(panelSessionId) : null;
    sidePanel = main?.getSnapshot().retainedBy.mainView ? null : selected;
    if (sidePanel && main) unwatchMain = main.subscribe(() => {
      if (main.getSnapshot().retainedBy.mainView) setSidePanel(null);
    });
    sidePanelListeners.forEach(listener => listener());
  };
  const remember = (id: string, topicId = "") => {
    const changed = openedSessionId !== id || openedTopicId !== topicId;
    openedSessionId = id;
    openedTopicId = topicId;
    storageSet(`vibe-dsh-session:vibe:${workspaceId}`, id);
    client.uiWorkspace.openSession(id);
    if (sidePanel && 'sessionId' in sidePanel && sidePanel.sessionId === id) setSidePanel(null);
    if (changed) sessionListeners.forEach(listener => listener());
    flushPendingCites();
  };
  type HiddenChats = { status: 'loading' } | { status: 'ready'; ids: Set<string> } | { status: 'error' };
  let hiddenChats: HiddenChats = { status: 'loading' };
  const hiddenListeners = new Set<() => void>();
  const notifyHidden = () => hiddenListeners.forEach(listener => listener());
  const nativeBackground = (item: { parentId?: string; origin?: string; blank?: boolean } | undefined) =>
    Boolean(item?.parentId || item?.origin === 'subagent' || item?.blank);
  const isBackgroundChat = (id: string, item: { parentId?: string; origin?: string; blank?: boolean } | undefined, hidden: HiddenChats) => {
    if (nativeBackground(item)) return true;
    if (legacyCompanySymbol((item as { title?: string } | undefined)?.title || '')) return true;
    if (hidden.status !== 'ready') return true;
    return hidden.ids.has(id);
  };
  const refreshHiddenChats = async (): Promise<HiddenChats> => {
    try {
      const store = await loadReportTasks();
      const ids = new Set(Object.keys(store.sessions || {}));
      if (store.host_session_id) ids.add(store.host_session_id);
      try {
        const assistant = await loadAssistantSessions();
        for (const id of Object.keys(assistant.sessions || {})) ids.add(id);
      } catch { /* assistant sessions stay visible if the bind file is unread */ }
      hiddenChats = { status: 'ready', ids };
    } catch {
      hiddenChats = { status: 'error' };
    }
    notifyHidden();
    return hiddenChats;
  };
  const historyFace = (sessionId: string) => historyFaceOf(client, sessionId);
  const openErrorText = (snap?: ReturnType<NonNullable<HistorySession['getSnapshot']>>) => {
    if (!snap?.openError) return undefined;
    return '执行记录读取失败';
  };
  const lastTrajectory = new Map<string, TaskTrajectorySnapshot>();
  const taskParents = new Map<string, string>();
  const trajectoryStores = new Map<string, { subscribe(listener: () => void): () => void; getSnapshot(): TaskTrajectorySnapshot; loadOlder(): Promise<void> }>();
  const projectTrajectory = (sessionId: string, raw: unknown, terminal?: unknown): TaskTrajectorySnapshot => {
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
      terminal,
    });
    const prev = lastTrajectory.get(sessionId);
    const stable = stableTaskTrajectory(prev, next);
    if (stable !== prev) lastTrajectory.set(sessionId, stable);
    return stable;
  };
  const loadTaskHistory = (sessionId: string, signal?: AbortSignal) => ensureTaskHistory({
    client, sessionId, signal, parents: taskParents, loadReportTasks,
  });
  async function openSession() {
    const response = await fetch("/finance-host");
    if (!response.ok) throw new Error(`研究服务暂时连不上（${response.status}），请稍后重试`);
    ({ workspace } = await response.json() as { workspace: string });
    if (!workspace || typeof workspace !== "string") throw new Error("研究服务暂时连不上，请稍后重试");
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
    if (!existing && !fallback) watchReadableTitle(id);
    remember(id);
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
    if (!workspaceId) throw new Error('研究服务正在连接，请稍后再试');
    await client.sessions.refresh();
    const list = client.sessions.list.getSnapshot();
    const archived = new Set(client.workspaces.list.getSnapshot().archivedSessionIds);
    const symbols = list.ids.flatMap(id => {
      const item = list.byId[id];
      const symbol = item?.cwd === workspace && !archived.has(id)
        ? legacyCompanySymbol(item.title ?? '') : undefined;
      return symbol ? [symbol] : [];
    });
    const tasks = await loadReportTasks().catch(() => null);
    return [...new Set([...symbols, ...Object.values(tasks?.sessions || {}).filter(binding => binding.kind === 'research').map(binding => binding.symbol || '')])].filter(Boolean);
  }, async legacyCompanyTasks() {
    await session;
    await client.sessions.refresh();
    const list = client.sessions.list.getSnapshot();
    return list.ids.flatMap(id => {
      const item = list.byId[id];
      const symbol = item?.cwd === workspace ? legacyCompanySymbol(item.title || '') : undefined;
      return symbol ? [{ sessionId: id, title: item?.title || '', symbol, running: Boolean(item?.running), updatedAt: item?.updatedAt }] : [];
    });
  }, async listRunningCompanySymbols() {
    await session;
    if (!workspaceId) return [];
    await client.sessions.refresh();
    const list = client.sessions.list.getSnapshot();
    const archived = new Set(client.workspaces.list.getSnapshot().archivedSessionIds);
    const symbols = new Set<string>();
    for (const id of list.ids) {
      const item = list.byId[id];
      if (item?.cwd !== workspace || archived.has(id) || !item.running) continue;
      const symbol = legacyCompanySymbol(item.title ?? '');
      if (symbol) symbols.add(symbol);
    }
    const tasks = await loadReportTasks().catch(() => null);
    for (const [id, binding] of Object.entries(tasks?.sessions || {})) {
      if (binding.kind === 'research' && list.byId[id]?.running && binding.symbol) symbols.add(binding.symbol);
    }
    return [...symbols];
  }, async start(question: string, company?: { symbol: string; name: string }, options?: StartSessionOptions): Promise<StartSessionResult> {
    await session;
    if (!workspaceId) throw new Error('研究服务正在连接，请稍后再试');
    const task = options?.task;
    if (task?.kind === 'report') return startReportTask(question, task);
    if (task?.kind === 'research') {
      const key = task.slug;
      if (companyStarts.has(key)) return companyStarts.get(key)!;
      const run = (async (): Promise<StartSessionResult> => {
        const result = await startResearchRun({ slug: task.slug, symbol: task.symbol, prompt: question, title: task.title });
        await client.sessions.refresh().catch(() => {});
        return { sessionId: result.session_id, status: result.status };
      })();
      companyStarts.set(key, run);
      try { return await run; } finally { companyStarts.delete(key); }
    }
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
      await withSession(id, async face => {
        if (title && !(await face.rename(title)).ok) throw new Error('公司研究绑定失败，请重试');
        remember(id);
        if (!(await face.prompt([{ type: 'text', text: question }], 'queue')).ok) throw new Error('研究问题未被接收，请检查模型设置后回到深度对话重试');
      });
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
    const tasks = await loadReportTasks().catch(() => null);
    const bound = Object.entries(tasks?.sessions || {}).filter(([, binding]) => binding.kind === 'research' && binding.symbol === symbol);
    bound.sort((a, b) => String(b[1].bound_at || '').localeCompare(String(a[1].bound_at || '')));
    if (bound.length) {
      const [id, binding] = bound[0]!;
      const running = Boolean(list.byId[id]?.running);
      const settlement = await loadBackgroundTasks().then(items => backgroundTaskForSession(items, id)).catch(() => null);
      const status = researchTaskStatus(binding, running, settlement);
      return { sessionId: id, title: binding.title || `公司研究 · ${symbol}`, running: status === 'researching',
        updatedAt: binding.finished_at || binding.bound_at,
        status, runStatus: binding.run_status };
    }
    const archived = new Set(client.workspaces.list.getSnapshot().archivedSessionIds);
    const ids = list.ids.filter(id => {
      const item = list.byId[id];
      return item?.cwd === workspace && !archived.has(id) && legacyCompanySymbol(item.title ?? '') === symbol;
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
    const store = await loadReportTasks();
    const bindings = store.sessions || {};
    const ids = Object.keys(bindings).filter(id => (bindings[id]?.kind || 'report') === 'report' && bindings[id]?.slug === slug && id !== store.host_session_id);
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
    if (bound.parent_id) {
      taskParents.set(id, bound.parent_id);
      await client.sessions.refreshProjections(bound.parent_id);
      const catalog = client.sessions.list.getSnapshot().projectionsBySession[bound.parent_id];
      if (catalog?.state === 'error') throw new Error('报告任务状态读取失败');
      const child = catalog?.values.subagentCatalog?.find(item => item.id === id);
      return { sessionId: id, slug, inputHash: bound.input_hash, running: Boolean(child && list.byId[id]?.running) };
    }
    const scope = client.sessions.scope(id);
    const snap = scope && client.sessions.sessionOf(scope)?.getSnapshot?.();
    return { sessionId: id, slug, inputHash: bound.input_hash, running: Boolean(list.byId[id]?.running || snap?.running), updatedAt: list.byId[id]?.updatedAt };
  }, sessionState(sessionId: string): SessionState | null {
    const scope = client.sessions.scope(sessionId);
    const face = scope && client.sessions.sessionOf(scope);
    const snap = face?.getSnapshot?.();
    const trajectory = lastTrajectory.get(sessionId);
    if (!snap && !trajectory) return null;
    if (snap?.openState === 'cold' || snap?.openState === 'loading') return null;
    return {
      running: Boolean(snap?.running),
      lastAgentError: snap?.lastAgentError || null,
      promptError: snap?.promptError ? 'prompt failed' : null,
      failed: Boolean(snap?.lastAgentError || snap?.promptError || trajectory?.failed),
      removed: Boolean(snap?.removed),
      awaitingFirstTurn: Boolean(snap?.awaitingFirstTurn),
    };
  }, async restoreTopic(topicId: string, title = "", signal?: AbortSignal) {
    await session;
    if (!workspaceId) throw new Error('研究服务正在连接，请稍后再试');
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
    if (!reusable) watchReadableTitle(id);
    await bindTopicSession(topicId, id, title || topicBind?.title || topicId);
    signal?.throwIfAborted();
    return { topicId, sessionId: id };
  }, async startTopic(input: { topicId: string; title: string; prompt: string; fresh?: boolean; onSessionReady?: (sessionId: string) => void }) {
    await session;
    if (!workspaceId) throw new Error('研究服务正在连接，请稍后再试');
    let id: string;
    if (input.fresh) {
      id = await client.sessions.create({ workspaceId });
      watchReadableTitle(id);
      await bindTopicSession(input.topicId, id, input.title);
    } else {
      id = (await research.restoreTopic(input.topicId, input.title)).sessionId;
    }
    input.onSessionReady?.(id);
    await withSession(id, async face => {
      if (!(await face.prompt([{ type: 'text', text: input.prompt }], 'queue')).ok) {
        throw new Error('议题研究未被接收，请检查模型设置后重试');
      }
    });
    return id;
  }, async openSession(sessionId: string) {
    await session;
    if (!workspaceId) throw new Error('研究服务正在连接，请稍后再试');
    await client.sessions.refresh();
    const list = client.sessions.list.getSnapshot();
    const hidden = await refreshHiddenChats();
    const item = list.byId[sessionId];
    if (hidden.status !== 'ready' && !nativeBackground(item)) throw new Error('任务记录暂时加载不出来，请稍后重试');
    if (isBackgroundChat(sessionId, item, hidden)) {
      research.openTaskProcess({ sessionId, title: item?.displayTitle || item?.title || '任务过程', kind: hidden.status === 'ready' && hidden.ids.has(sessionId) ? 'report' : 'knowledge' });
      return;
    }
    if (!item) throw new Error('这条执行记录已不存在');
    remember(sessionId);
    await router.navigate('/');
  }, openTaskProcess(task: TaskProcessRef) {
    if (task.parentSessionId) taskParents.set(task.sessionId, task.parentSessionId);
    if (task.parentSessionId && task.settlementSessionId) taskParents.set(task.settlementSessionId, task.parentSessionId);
    setSidePanel({ kind: 'task', task });
  }, closeTaskProcess() {
    if (sidePanel?.kind === 'task') setSidePanel(null);
  }, getTaskProcess() {
    return sidePanel?.kind === 'task' ? sidePanel.task : null;
  }, subscribeTaskProcess(listener: () => void) {
    sidePanelListeners.add(listener);
    return () => { sidePanelListeners.delete(listener); };
  }, openTopicPanel(topic: Extract<FinanceSidePanel, { kind: 'topic' }>) {
    setSidePanel(topic);
  }, openAssistantPanel(sessionId: string, pageName = '问助手') {
    setSidePanel({ kind: 'assistant', sessionId, pageName });
  }, closeSidePanel() {
    setSidePanel(null);
  }, getSidePanel() {
    return sidePanel;
  }, subscribeSidePanel(listener: () => void) {
    sidePanelListeners.add(listener);
    return () => { sidePanelListeners.delete(listener); };
  }, trajectory(sessionId: string) {
    const existing = trajectoryStores.get(sessionId);
    if (existing) return existing;
    const store = createTaskTrajectoryStore({
      sessionId,
      client,
      ensureHistory: loadTaskHistory,
      project: projectTrajectory,
      lastTrajectory,
    });
    trajectoryStores.set(sessionId, store);
    return store;
  }, async cancelTask(sessionId: string) {
    const binding = (await loadReportTasks()).sessions[sessionId];
    if (binding?.kind === 'research') await cancelResearchRun(sessionId);
    else await cancelReportRun(sessionId);
  }, taskRunning(sessionId: string) {
    return Boolean(client.sessions.list.getSnapshot().byId[sessionId]?.running);
  }, async cancelSession(sessionId: string) {
    await session;
    const reference = client.sessions.retain(sessionId, { source: 'controllerOperation' });
    try {
      await reference.ready;
      const face = reference.binding.session;
      if (!face.cancel) throw new Error('当前会话无法中止');
      if (!(await face.cancel()).ok) throw new Error('没能停止当前回答');
    } finally {
      reference.release();
    }
  }, subscribeSession(listener: () => void) {
    sessionListeners.add(listener);
    return () => { sessionListeners.delete(listener); };
  }, subscribeSessionList(listener: () => void) {
    const offSessions = client.sessions.list.subscribe(listener);
    const offArchives = client.workspaces.list.subscribe(listener);
    return () => { offSessions(); offArchives(); };
  } };
  const researchHost = applyAssistant(ctx, research as ResearchSessions, {
    client,
    waitSession: () => session ?? Promise.resolve(),
    getWorkspaceId: () => workspaceId,
    getWorkspace: () => workspace,
    openAssistantPanel: id => research.openAssistantPanel(id),
  });
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
        if (!workspaceId) throw new Error('研究服务正在连接，请稍后再试');
        const topicId = openedTopicId;
        const id = await client.sessions.create({ workspaceId });
        watchReadableTitle(id);
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
  const notifyUpload = (sessionId: string, level: 'info' | 'error', text: string) => {
    const scope = sessionId ? client.sessions.scope(sessionId) : undefined;
    const input = scope && client.conversation?.input.for(scope);
    input?.notify(level, text);
    return Boolean(input);
  };
  client.slots.inject('conversation.input.left', () => client.slots.register({
    name: 'conversation.input.left', id: 'finance-library-upload', order: 10,
  }, function LibraryUploadAttach() {
    const inputRef = React.useRef<HTMLInputElement>(null);
    const boundSessionId = React.useRef('');
    const [busy, setBusy] = React.useState(false);
    const [status, setStatus] = React.useState('');
    const upload = async (files: File[]) => {
      boundSessionId.current = currentSessionId();
      const chosen = files.slice(0, LIBRARY_BATCH_MAX);
      if (!chosen.length) return;
      setBusy(true);
      setStatus('');
      const saved: LibraryCite[] = [];
      const failed: string[] = [];
      try {
        await mapPool(chosen, LIBRARY_CONCURRENCY, async file => {
          if (file.size > LIBRARY_MAX_BYTES) { failed.push(`${file.name}：文件不能超过 32 MB`); return; }
          if (!libraryFileKind(file)) { failed.push(`${file.name}：仅支持 PDF、TXT 或 Markdown`); return; }
          try {
            const item = await uploadLibraryFile(file);
            saved.push(libraryCiteFromItem({ ...item, title: item.title || file.name }));
          } catch (error) {
            failed.push(`${file.name}：${libraryUploadError(error)}`);
          }
        });
        if (saved.length) deliverLibraryCitations(saved, boundSessionId.current);
        const summary = [
          saved.length ? `已保存 ${saved.length} 份到我的资料` : '',
          failed.length ? failed.join('；') : '',
        ].filter(Boolean).join('。');
        if (failed.length) notifyUpload(boundSessionId.current, 'error', failed.join('；'));
        else if (!saved.length && summary) notifyUpload(boundSessionId.current, 'error', summary);
        setStatus(summary);
      } finally {
        setBusy(false);
      }
    };
    return <div className="finance-library-attach">
      <input ref={inputRef} className="sr-only" type="file" multiple accept=".pdf,.txt,.md,application/pdf,text/plain,text/markdown" disabled={busy} onChange={event => { void upload(Array.from(event.target.files || [])); event.target.value = ''; }} />
      <button type="button" className="finance-library-attach-btn" disabled={busy} aria-label={busy ? '正在保存到我的资料' : '上传到我的资料'} title={busy ? '正在保存到我的资料' : '上传 PDF、TXT 或 Markdown 到我的资料'} onClick={() => inputRef.current?.click()}>
        {busy ? <Loader2 size={14} className="animate-spin" /> : <Paperclip size={14} />}
      </button>
      {status && <p role="status" className="sr-only">{status}</p>}
    </div>;
  }));
  client.slots.inject('conversation.input.dock', () => client.slots.register<{ session: { blank: boolean } }>({
    name: 'conversation.input.dock', id: 'finance-recent', order: 40,
  }, function Recent({ session }) {
    const seated = React.useSyncExternalStore(subscribeAssistantSeat, () => assistantSeatSnapshot().seated, () => false);
    if (seated) return null;
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
      {hidden.status === 'loading' && !compact && <p role="status" className="text-sm text-muted-foreground">正在加载对话…</p>}
      {hidden.status === 'error' && <p role="alert" className="text-sm text-destructive">历史对话暂时加载不出来。<button type="button" className="workspace-action workspace-action-compact ml-2" onClick={() => { void refreshHiddenChats(); }}>重试</button></p>}
      {readyHidden && ids.length === 0 && <div className="rounded-2xl border border-dashed border-border p-12 text-center"><MessageSquare size={28} className="mx-auto mb-4 text-muted-foreground/50" /><p className="text-sm text-muted-foreground">还没有历史对话，从一个感兴趣的问题开始吧。</p></div>}
      <div className={compact ? 'grid max-h-64 gap-2 overflow-y-auto' : 'space-y-3'} style={compact ? { gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 24rem), 1fr))' } : undefined}>{ids.map(id => <div key={id} className="group flex min-w-0 items-center rounded-xl border border-border bg-card shadow-sm transition-colors hover:border-primary/30 hover:bg-muted/30 focus-within:border-primary/40"><button className="flex min-w-0 flex-1 items-center gap-4 rounded-xl px-5 py-4 text-left outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary/40" onClick={() => { void research.openSession(id).then(() => openView('chat')).catch(err => setError(userFacingRuntimeError(err, '无法打开该对话'))); }}>
        <span className="shrink-0 rounded-xl bg-primary/10 p-2.5 text-primary"><MessageSquare size={18} /></span><span className="min-w-0 flex-1"><span className="block truncate whitespace-nowrap text-sm font-medium">{list.byId[id]?.displayTitle || list.byId[id]?.title || '新对话'}</span><span className="mt-1 block truncate whitespace-nowrap text-xs text-muted-foreground">{list.byId[id]?.running ? '研究进行中' : '继续研究'}{updated(id) > 0 && <span> · {new Date(updated(id)).toLocaleString('zh-CN', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' })}</span>}</span></span><ArrowUpRight size={16} className="shrink-0 text-muted-foreground group-hover:text-primary" />
      </button><div className="mr-3 shrink-0 border-l border-border pl-3"><button type="button" disabled={archiving !== null || list.byId[id]?.running} title={list.byId[id]?.running ? '研究结束后可归档' : '归档后从历史列表移除，保留对话内容'} aria-label={`归档 ${list.byId[id]?.displayTitle || list.byId[id]?.title || '新对话'}`} className="inline-flex h-10 w-24 items-center justify-center gap-2 rounded-lg text-sm text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 disabled:cursor-not-allowed disabled:opacity-40" onClick={() => { void archive(id); }}><Archive size={16} />{archiving === id ? '归档中' : '归档'}</button></div></div>)}</div>
    </div></div>;
  }
  client.slots.register<SlotProps>({ name: "root", inject: () => ({ hooks: { connectionState: client.connection.state } }), children: {
    sidebar: { kind: "single", scope: "root" },
    main: { kind: "keyed", scope: "root" },
    rightbar: { kind: "single", scope: "root" },
    "finance.panel.conversation": { kind: "single", scope: "root" },
    "shell.overlay": { kind: "list", scope: "root" },
  } }, function FinanceFrame(props) {
    const [state, setState] = React.useState<"loading" | "ready" | Error>("loading");
    const [sessionError, setSessionError] = React.useState("");
    React.useEffect(() => {
      let active = true;
      void ready.then(() => {
        if (!active) return;
        setState("ready");
        session ??= openSession();
        void session.catch(error => { if (active) setSessionError(userFacingRuntimeError(error, '研究服务暂时连不上，请稍后重试')); });
      }, error => { if (active) setState(error instanceof Error ? error : new Error(String(error))); });
      return () => { active = false; };
    }, []);
    if (state !== "ready") return <div role="status" className="p-6">{state === "loading" ? <ResearchLoading title="正在读取工作台数据" sections={["自选", "研究名单", "界面偏好"]} /> : <>连不上本机服务，自选和研究名单暂时加载不出来。{userFacingRuntimeError(state, '请重新连接')}<button onClick={() => location.reload()}>重新连接</button></>}</div>;
    return <FinanceRoot slots={props} research={researchHost} sessionError={sessionError}>
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
