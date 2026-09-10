import * as React from "react";
import { Activity, MessageSquare, Plus, ArrowUpRight, Archive } from "lucide-react";
import { RouterProvider } from "react-router-dom";
import type { Context } from "@deepseek-ai/cordis";
import { router } from "../router";
import { hydrateNotes } from "../lib/notes";
import { hydrateWatch } from "../lib/watchlist";
import { storageGet, storageSet } from "../lib/storage";
import { type SlotProps } from "./NativeDsh";
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
    list: { getSnapshot(): { ids: string[]; byId: Record<string, { cwd?: string; title?: string; displayTitle?: string; running?: boolean; blank?: boolean; updatedAt?: string; parentId?: string }> }; subscribe(callback: () => void): () => void };
    create(input: { workspaceId: string }): Promise<string>;
    open(id: string): void;
    scope(id: string): Context | undefined;
    sessionOf(ctx: Context): { rename(title: string): Promise<{ ok: boolean }>; prompt(content: { type: 'text'; text: string }[], mode: 'queue'): Promise<{ ok: boolean }> } | undefined;
  };
}
export const inject = ["slots", "connection", "theme", "sessions", "workspaces"];

/** Product composition; the standard DSH Web kernel boots and mounts it. */
export function apply(ctx: Context) {
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
  // Existing pages synchronously read these durable caches on first render.
  const ready = Promise.all([hydrateNotes(), hydrateWatch()]);
  void ready.catch(() => {}); // The mounted frame presents the failure and retry action.
  let session: Promise<void> | undefined;
  let workspace = '';
  let workspaceId = '';
  const companyStarts = new Map<string, Promise<void>>();
  const remember = (id: string) => { storageSet(`vibe-dsh-session:vibe:${workspaceId}`, id); client.sessions.open(id); };
  async function openSession() {
    const response = await fetch("/finance-host");
    if (!response.ok) throw new Error(`工作区配置读取失败 (${response.status})`);
    ({ workspace } = await response.json() as { workspace: string });
    if (!workspace || typeof workspace !== "string") throw new Error("内部工作区配置缺失");
    const registered = await client.workspaces.create({ path: workspace });
    workspaceId = registered.workspaceId;
    await client.sessions.refresh();
    if (disposed) return;
    const list = client.sessions.list.getSnapshot();
    const key = `vibe-dsh-session:vibe:${registered.workspaceId}`;
    const saved = storageGet(key);
    const existing = saved && list.byId[saved]?.cwd === workspace && !client.workspaces.list.getSnapshot().archivedSessionIds.includes(saved) ? saved : undefined;
    const id = existing ?? await client.sessions.create({ workspaceId: registered.workspaceId });
    if (disposed) return;
    storageSet(key, id);
    client.sessions.open(id);
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
  }, async start(question: string, company?: { symbol: string; name: string }) {
    await session;
    if (!workspaceId) throw new Error('研究工作区尚未连接');
    const key = company?.symbol;
    if (key && companyStarts.has(key)) return companyStarts.get(key)!;
    const run = (async () => {
      await client.sessions.refresh();
      const title = company ? `公司研究 · ${company.symbol} · ${company.name}` : undefined;
      const list = client.sessions.list.getSnapshot();
      const existing = title && list.ids.find(id => list.byId[id]?.cwd === workspace && list.byId[id]?.title === title && list.byId[id]?.running);
      if (existing) { remember(existing); await router.navigate('/'); return; }
      const id = await client.sessions.create({ workspaceId });
      const scope = client.sessions.scope(id);
      const face = scope && client.sessions.sessionOf(scope);
      if (!face) throw new Error('研究会话创建失败');
      if (title && !(await face.rename(title)).ok) throw new Error('公司研究绑定失败，请重试');
      remember(id);
      if (!(await face.prompt([{ type: 'text', text: question }], 'queue')).ok) throw new Error('研究问题未被接收，请检查模型设置后回到深度对话重试');
      await router.navigate('/');
    })();
    if (key) companyStarts.set(key, run);
    try { await run; } finally { if (key) companyStarts.delete(key); }
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
        const id = await client.sessions.create({ workspaceId });
        openView?.('chat');
        remember(id);
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
    const [archiving, setArchiving] = React.useState<string | null>(null);
    const [showAll, setShowAll] = React.useState(false);
    React.useEffect(() => { void client.sessions.refresh().catch(() => setError('历史对话读取失败')); }, []);
    const updated = (id: string) => new Date(list.byId[id]?.updatedAt ?? 0).getTime() || 0;
    const allIds = list.ids.filter(id => list.byId[id]?.cwd === workspace && !list.byId[id]?.parentId && !list.byId[id]?.blank && !archives.archivedSessionIds.includes(id)).sort((a, b) => updated(b) - updated(a));
    const ids = compact && !showAll ? allIds.slice(0, 4) : allIds;
    const archive = async (id: string) => {
      setError(''); setArchiving(id);
      try { await client.workspaces.archiveSession(id); }
      catch { setError('归档失败，请重试'); }
      finally { setArchiving(null); }
    };
    if (compact && allIds.length === 0 && !error) return null;
    return <div className={compact ? 'finance-recent mx-auto mt-5 w-full px-4 pb-4' : 'h-full overflow-auto p-6 sm:p-8'}><div className={compact ? 'w-full' : 'mx-auto max-w-4xl'}>
      {compact ? <div className="mb-3 flex items-center justify-between"><h2 className="text-sm font-medium text-muted-foreground">最近对话</h2>{allIds.length > 4 && <button className="text-xs text-muted-foreground hover:text-primary" onClick={() => setShowAll(!showAll)}>{showAll ? '收起' : '查看全部'}</button>}</div> : <>
      <div className="mb-6 flex items-center justify-between gap-4"><div><h2 className="text-lg font-semibold">继续你的研究</h2><p className="mt-2 text-sm text-muted-foreground">找回之前的问题，接着聊。</p></div>
        <NewConversation openView={openView} /></div></>}
      {error && <p role="alert">{error}</p>}
      {ids.length === 0 && <div className="rounded-2xl border border-dashed border-border p-12 text-center"><MessageSquare size={28} className="mx-auto mb-4 text-muted-foreground/50" /><p className="text-sm text-muted-foreground">还没有历史对话，从一个感兴趣的问题开始吧。</p></div>}
      <div className={compact ? 'grid max-h-64 grid-cols-1 gap-2 overflow-y-auto sm:grid-cols-2' : 'space-y-3'}>{ids.map(id => <div key={id} className="group flex items-center rounded-xl border border-border bg-card shadow-sm transition-colors hover:border-primary/30 hover:bg-muted/30 focus-within:border-primary/40"><button className="flex min-w-0 flex-1 items-center gap-4 rounded-xl px-5 py-4 text-left outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary/40" onClick={() => { openView('chat'); remember(id); }}>
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
    if (state !== "ready") return <div role="status" className="p-6">{state === "loading" ? "正在读取工作台数据…" : `连不上后端，未加载台账：${state.message}`}<button onClick={() => location.reload()}>重新连接</button></div>;
    return <FinanceRoot slots={props} research={research} sessionError={sessionError} showDetails={showDetails}>
      <RouterProvider router={router} />
    </FinanceRoot>;
  });
  client.slots.inject('shell.overlay', () => client.slots.register({
    name: 'shell.overlay', id: 'finance-page-assistant',
  }, FinanceAssistantSeat));
  client.slots.register<SlotProps>({ name: "sidebar", children: { "sidebar.settings": { kind: "single", scope: "root" } } },
    props => <>{props.renderSlot("sidebar.settings", { wide: true })}</>);
}
