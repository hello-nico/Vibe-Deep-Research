import * as React from "react";
import { RouterProvider } from "react-router-dom";
import type { Context } from "@deepseek-ai/cordis";
import { router } from "../router";
import { hydrateNotes } from "../lib/notes";
import { hydrateWatch } from "../lib/watchlist";
import { storageGet, storageSet } from "../lib/storage";
import { FinanceSlots, type SlotProps } from "./NativeDsh";
import { ResearchSessionContext } from "./research-session";
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
  document.title = "Vibe Finance";
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
  const research = { async start(question: string, company?: { symbol: string; name: string }) {
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
    return <FinanceSlots.Provider value={props}>
      <ResearchSessionContext.Provider value={research}><RouterProvider router={router} /></ResearchSessionContext.Provider>
      {sessionError && <div role="alert" className="fixed bottom-4 right-4 z-50 rounded border bg-background p-4">{sessionError}</div>}
      {props.renderSlot("shell.overlay", {})}
      {showDetails && <div style={{ position: "fixed", inset: "64px 0 0 auto", width: "min(480px, 100vw)", zIndex: 60, background: "var(--background, #161820)" }}>{props.renderSlot("details", {})}</div>}
    </FinanceSlots.Provider>;
  });
  client.slots.register<SlotProps>({ name: "sidebar", children: { "sidebar.settings": { kind: "single", scope: "root" } } },
    props => <>{props.renderSlot("sidebar.settings", { wide: true })}</>);
}
