import * as React from "react";
import * as JsxRuntime from "react/jsx-runtime";
import * as ReactDom from "react-dom";
import * as ReactDomClient from "react-dom/client";
import * as Cordis from "@deepseek-ai/cordis";
import Loader from "@deepseek-ai/cordis-plugin-loader";
import * as ClientStore from "@deepseek-ai/dsh-client-store";
import * as UiSlots from "@deepseek-ai/dsh-client-ui-slots";
import * as UiPrimitives from "@deepseek-ai/dsh-client-ui-primitives";
import "./native-dsh.css";

// Narrow host seam against the installed rc.1 client. Business behavior stays in its plugins.
interface SlotProps {
  renderSlot(name: string, owner: object): React.ReactNode;
  useConnectionState<T>(selector: (state: string | undefined) => T): T;
}
interface Client {
  on(event: "theme/change", listener: () => void): () => void;
  theme: {
    getTheme(): { active: { colorScheme: string; tokens: Record<string, string> }; fontSize: number };
    setTheme(theme: string): void;
  };
  connection: { state: { getSnapshot(): string | undefined; subscribe(callback: () => void): () => void } };
  slots: {
    entries(name: string): { options: Record<string, unknown> }[];
    register(options: Record<string, unknown>, component: React.ComponentType<SlotProps>): () => void;
  };
  workspaces: { create(input: { path: string }): Promise<{ workspaceId: string }> };
  sessions: {
    refresh(): Promise<void>;
    list: { getSnapshot(): { ids: string[]; byId: Record<string, { cwd?: string }> } };
    create(input: { workspaceId: string }): Promise<string>;
    open(id: string): void;
  };
  uiRenderer: { mount(element: HTMLElement): () => void };
}
interface Modules {
  manifest: { plugins: { id: string; immediately?: boolean }[] };
  prefetch(id: string): Promise<void>;
}
interface BootWindow extends Window {
  __DSH_TRANSPORT__?: { fetch(input: URL, init: RequestInit): Promise<Response> };
  __DSH_BOOT_READY__?: { promise: Promise<void> };
  __DSH_BOOT__?: unknown;
  __ModuleLoader__?: { create(options: { boot: unknown; staticModules: Record<string, unknown> }): Modules };
}

function target(id: string): HTMLElement {
  const element = document.getElementById(id);
  if (!element) throw new Error(`DSH 挂载点缺失：${id}`);
  return element;
}

async function bootstrap(): Promise<{ html: string; workspace: string }> {
  for (let attempt = 0; attempt < 45; attempt++) {
    const response = await fetch("/dsh-bootstrap");
    if (!response.ok) throw new Error(`DSH 启动入口返回 ${response.status}`);
    const data = await response.json() as { html: string; workspace: string; error: string };
    if (data.html) return data;
    if (data.error !== "DSH 正在启动") throw new Error(data.error);
    await new Promise(resolve => setTimeout(resolve, 1000));
  }
  throw new Error("DSH 启动超时，请检查开发服务");
}

async function bootClient(container: HTMLElement): Promise<void> {
  document.body.classList.add("vibe-dsh-host");
  const { html, workspace } = await bootstrap();
  const page = new DOMParser().parseFromString(html, "text/html");
  // Load the published bootstrap and CSS, not its second React/application entry.
  for (const node of page.querySelectorAll('script:not([type="module"]), link[rel="stylesheet"]')) {
    if (node instanceof HTMLLinkElement) {
      const link = document.createElement("link");
      link.rel = "stylesheet"; link.href = node.getAttribute("href")!.replace(/^\.\//, "/");
      document.head.append(link);
    } else if (node instanceof HTMLScriptElement) {
      const script = document.createElement("script");
      const src = node.getAttribute("src");
      if (src) {
        script.src = src;
        await new Promise<void>((resolve, reject) => {
          script.onload = () => resolve(); script.onerror = () => reject(new Error("DSH 客户端模块加载失败"));
          document.head.append(script);
        });
      } else { script.textContent = node.textContent; document.head.append(script); }
    }
  }
  const win = window as BootWindow;
  win.__DSH_TRANSPORT__ = { fetch(input, init) {
    const url = new URL(input);
    if (url.origin !== location.origin || !url.pathname.startsWith("/api/")) throw new Error("未知 DSH 请求地址");
    url.pathname = url.pathname.replace(/^\/api\//, "/dsh-api/");
    return fetch(url, init);
  } };
  await win.__DSH_BOOT_READY__?.promise;
  if (!win.__ModuleLoader__) throw new Error("DSH 模块加载器缺失");
  const modules = win.__ModuleLoader__.create({ boot: win.__DSH_BOOT__, staticModules: {
    react: React, "react/jsx-runtime": JsxRuntime, "react-dom": ReactDom, "react-dom/client": ReactDomClient,
    "@deepseek-ai/cordis": Cordis, "@deepseek-ai/dsh-client-store": ClientStore,
    "@deepseek-ai/dsh-client-ui-slots": UiSlots, "@deepseek-ai/dsh-client-ui-primitives": UiPrimitives,
  } });
  const ctx = new Cordis.Context();
  try {
    await ctx.plugin(Loader);
    ctx.loader.internal = modules as never;
    await Promise.all(modules.manifest.plugins.filter(row => row.immediately).map(row => modules.prefetch(row.id)));
    // This product owns the shell. Omit the two upstream shell plugins rather than shadowing their children.
    const shellPlugins = new Set(["@deepseek-ai/dsh-client-ui-layout", "@deepseek-ai/dsh-client-ui-sidebar"]);
    const loading = Promise.all(modules.manifest.plugins.filter(row => !shellPlugins.has(row.id)).map(row => ctx.loader.create({ name: row.id })));
    const shell = ctx.inject(["slots", "connection"], scope => {
    const client = scope as unknown as Client;
    let detailsOpen = false;
    const listeners = new Set<() => void>();
    const setDetails = (open: boolean) => { detailsOpen = open; for (const listener of listeners) listener(); };
    scope.reflect.provide("layout", {
      toggleSidebar: () => window.dispatchEvent(new Event("vibe-toggle-sidebar")),
      openDetails: () => setDetails(true), closeDetails: () => setDetails(false),
    });
    client.slots.register({ name: "root", inject: () => ({ hooks: { connectionState: client.connection.state } }), children: {
      sidebar: { kind: "single", scope: "root" },
      conversation: { kind: "single", scope: "session-maybe" },
      details: { kind: "single", scope: "session" },
      "shell.overlay": { kind: "list", scope: "root" },
    } }, function FinanceFrame(props) {
      const connection = props.useConnectionState(s => s);
      const showDetails = React.useSyncExternalStore(callback => { listeners.add(callback); return () => { listeners.delete(callback); }; }, () => detailsOpen);
      return <>
        {ReactDom.createPortal(<span role="status">{connection === "connected" ? "DSH 已连接" : connection === "disconnected" ? "DSH 连接中断" : "DSH 连接中"}</span>, target("dsh-status"))}
        {ReactDom.createPortal(<div style={{ height: "100%", display: "flex", flexDirection: "column", minHeight: 0 }}>{props.renderSlot("conversation", {})}</div>, target("dsh-conversation"))}
        {props.renderSlot("sidebar", { collapsed: false, width: 228 })}
        {props.renderSlot("shell.overlay", {})}
        {showDetails && <div style={{ position: "fixed", inset: "64px 0 0 auto", width: "min(480px, 100vw)", zIndex: 60, background: "var(--background, #161820)" }}>{props.renderSlot("details", {})}</div>}
      </>;
    });
    client.slots.register({ name: "sidebar", children: {
      "sidebar.settings": { kind: "single", scope: "root" },
    } }, function FinanceSettings(props) {
      return ReactDom.createPortal(props.renderSlot("sidebar.settings", { wide: true }), target("dsh-settings"));
    });
    });
    target("dsh-status").textContent = "DSH 装配插件中";
    await loading;
    target("dsh-status").textContent = "DSH 装配界面中";
    await shell;
    target("dsh-status").textContent = "DSH 等待插件就绪";
    await ctx.loader.await();
    const client = ctx as unknown as Client;
    // The replaced upstream layout also owned theme presentation. Preserve that
    // responsibility here; otherwise only the bootstrap's light palette survives.
    const presentTheme = () => {
      const snapshot = client.theme.getTheme();
      const dark = snapshot.active.colorScheme === "dark";
      document.body.toggleAttribute("data-ds-dark-theme", dark);
      document.documentElement.style.colorScheme = dark ? "dark" : "light";
      document.body.style.setProperty("--dsh-content-font-size", `${snapshot.fontSize}px`);
      for (const [name, value] of Object.entries(snapshot.active.tokens)) document.body.style.setProperty(name, value);
      window.dispatchEvent(new CustomEvent("dsh-theme-change", { detail: dark }));
    };
    const fromProduct = (event: Event) => client.theme.setTheme((event as CustomEvent<boolean>).detail ? "dark" : "light");
    client.on("theme/change", presentTheme);
    window.addEventListener("vibe-theme-change", fromProduct);
    ctx.effect(() => () => window.removeEventListener("vibe-theme-change", fromProduct));
    presentTheme();
    target("dsh-status").textContent = "";
    target("dsh-conversation").textContent = "";
    client.uiRenderer.mount(container);
    const registered = await client.workspaces.create({ path: workspace });
    await client.sessions.refresh();
    const list = client.sessions.list.getSnapshot();
    const selectionKey = `vibe-dsh-session:vibe:${registered.workspaceId}`;
    const saved = localStorage.getItem(selectionKey);
    const existing = saved && list.byId[saved]?.cwd === workspace ? saved : undefined;
    const sessionId = existing ?? await client.sessions.create({ workspaceId: registered.workspaceId });
    localStorage.setItem(selectionKey, sessionId);
    client.sessions.open(sessionId);
    window.addEventListener("pagehide", () => { void ctx.fiber.dispose(); }, { once: true });
  } catch (error) { await ctx.fiber.dispose(); throw error; }
}

let started: Promise<void> | undefined;
export function NativeDshHost() {
  const ref = React.useRef<HTMLDivElement>(null);
  React.useEffect(() => {
    if (!ref.current) return;
    started ??= bootClient(ref.current);
    void started.catch(error => {
      const message = error instanceof Error ? error.message : "DSH 启动失败";
      target("dsh-status").textContent = "DSH 未就绪";
      target("dsh-conversation").textContent = message;
    });
  }, []);
  return <div ref={ref} />;
}

// A changed boot graph requires disposing the whole client, not mounting a second runtime.
if (import.meta.hot) import.meta.hot.accept(() => window.location.reload());
