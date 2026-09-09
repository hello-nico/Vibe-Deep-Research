import * as React from "react";
import { RouterProvider } from "react-router-dom";
import type { Context } from "@deepseek-ai/cordis";
import { router } from "../router";
import { hydrateNotes } from "../lib/notes";
import { hydrateWatch } from "../lib/watchlist";
import { storageGet, storageSet } from "../lib/storage";
import { FinanceSlots, type SlotProps } from "./NativeDsh";
import "../../../index.css";
import "./native-dsh.css";

interface Client {
  on(event: "theme/change", callback: () => void): () => void;
  theme: {
    getTheme(): { active: { colorScheme: string; tokens: Record<string, string> }; fontSize: number };
    setTheme(theme: string): void;
  };
  connection: { state: { getSnapshot(): string | undefined; subscribe(callback: () => void): () => void } };
  slots: { register(options: Record<string, unknown>, component: React.ComponentType<SlotProps>): () => void };
  workspaces: { create(input: { path: string }): Promise<{ workspaceId: string }> };
  sessions: {
    refresh(): Promise<void>;
    list: { getSnapshot(): { ids: string[]; byId: Record<string, { cwd?: string }> } };
    create(input: { workspaceId: string }): Promise<string>;
    open(id: string): void;
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
  async function openSession() {
    const response = await fetch("/finance-host");
    if (!response.ok) throw new Error(`工作区配置读取失败 (${response.status})`);
    const { workspace } = await response.json() as { workspace: string };
    if (!workspace || typeof workspace !== "string") throw new Error("内部工作区配置缺失");
    const registered = await client.workspaces.create({ path: workspace });
    await client.sessions.refresh();
    if (disposed) return;
    const list = client.sessions.list.getSnapshot();
    const key = `vibe-dsh-session:vibe:${registered.workspaceId}`;
    const saved = storageGet(key);
    const existing = saved && list.byId[saved]?.cwd === workspace ? saved : undefined;
    const id = existing ?? await client.sessions.create({ workspaceId: registered.workspaceId });
    if (disposed) return;
    storageSet(key, id);
    client.sessions.open(id);
  }
  client.slots.register({ name: "root", inject: () => ({ hooks: { connectionState: client.connection.state } }), children: {
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
      <RouterProvider router={router} />
      {sessionError && <div role="alert" className="fixed bottom-4 right-4 z-50 rounded border bg-background p-4">{sessionError}</div>}
      {props.renderSlot("shell.overlay", {})}
      {showDetails && <div style={{ position: "fixed", inset: "64px 0 0 auto", width: "min(480px, 100vw)", zIndex: 60, background: "var(--background, #161820)" }}>{props.renderSlot("details", {})}</div>}
    </FinanceSlots.Provider>;
  });
  client.slots.register({ name: "sidebar", children: { "sidebar.settings": { kind: "single", scope: "root" } } },
    props => <>{props.renderSlot("sidebar.settings", { wide: true })}</>);
}
