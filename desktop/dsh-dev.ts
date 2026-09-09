import fs from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";
import type { IncomingMessage } from "node:http";
import type { Plugin, PreviewServer, ViteDevServer } from "vite";
import { resolveDshPaths, prepareDshPaths, researchRuntimeEnv } from "../orchestrator/src/dsh_paths.ts";

/** Serve DSH's original Web entry. Product code is loaded by its plugin manifest. */
export function dshDevelopment(repoRoot: string): { plugin: Plugin } {
  const paths = resolveDshPaths(repoRoot);
  const target = `http://127.0.0.1:${process.env.VRA_DSH_PORT ?? "5941"}`;
  let cookie = "";
  let failure = "DSH 正在启动";
  let origin = "";
  const trusted = (req: IncomingMessage) => req.headers.host === new URL(origin).host
    && (!req.headers.origin || req.headers.origin === origin)
    && (!req.headers["sec-fetch-site"] || ["same-origin", "none"].includes(String(req.headers["sec-fetch-site"])));

  async function install(server: ViteDevServer | PreviewServer, development: boolean) {
    if (process.env.VRA_LAN === "1") throw new Error("M3 DSH 仅支持本机访问");
    const port = development ? server.config.server.port : server.config.preview.port;
    origin = `http://127.0.0.1:${port}`;
    prepareDshPaths(paths);
    fs.writeFileSync(path.join(paths.dataRoot, 'dsh-model.json'), JSON.stringify({ origin }), { mode: 0o600 });
    const profile = path.join(paths.home, "profiles/web/package.json");
    const manifest = fs.existsSync(profile) ? JSON.parse(fs.readFileSync(profile, "utf8")) : {};
    if (!manifest.dsh?.profile?.bundles?.includes("vibe-finance-ui")) throw new Error("产品 DSH 插件尚未安装，请运行 scripts/setup");
    if (!manifest.dsh?.profile?.bundles?.includes("stock-research-dsh")) throw new Error("研究 DSH 插件尚未安装，请运行 scripts/setup");
    const bundle = path.join(repoRoot, "desktop/dsh/finance-ui/lib/client.js");
    // Start DSH only after the watch builder has produced its first complete bundle.
    // Starting a second build beside DSH could delete the bundle during plugin discovery.
    const watch = development ? spawn(process.execPath, ["dsh/build-ui.mjs", "--watch"], {
      cwd: path.join(repoRoot, "desktop"), stdio: ["ignore", "pipe", "inherit"],
    }) : undefined;
    if (watch) {
      server.httpServer?.once("close", () => watch.kill("SIGTERM"));
      await new Promise<void>((resolve, reject) => {
        let output = "";
        const timer = setTimeout(() => {
          watch.kill("SIGTERM");
          reject(new Error("产品 UI 首次构建超时"));
        }, 25_000);
        watch.stdout!.on("data", chunk => {
          process.stdout.write(chunk);
          output = (output + String(chunk)).slice(-2048);
          if (/built in \d+ms/.test(output)) { clearTimeout(timer); resolve(); }
        });
        watch.once("error", () => { clearTimeout(timer); reject(new Error("产品 UI 构建进程无法启动")); });
        watch.once("exit", code => { clearTimeout(timer); reject(new Error(`产品 UI 构建进程已退出 (${code})`)); });
      });
    }
    if (!fs.existsSync(bundle)) throw new Error("产品 UI 插件缺少构建产物，请运行 scripts/setup");
    const overlay = path.join(paths.home, "vibe-m3.patch.yml");
    fs.writeFileSync(overlay, JSON.stringify([{ id: "agent-presets", config: {
      default: "vibe", includeShippedRoot: false, includeUserRoot: false,
      roots: [{ path: path.join(repoRoot, "desktop/dsh/presets"), trust: "system" }],
    } }], null, 2));
    const child = spawn(process.execPath, [path.join(paths.runtime, "node_modules/@deepseek-ai/dsh/lib/bin.js"),
      "--profile", "web", "--patch", overlay, "--no-open", "--port", new URL(target).port, "--trusted-host", new URL(origin).host,
    ], { cwd: paths.workspace, env: { ...process.env, ...researchRuntimeEnv(paths), DSH_HOME: paths.home, VRA_FINANCE_DATA_ROOT: paths.dataRoot }, stdio: ["ignore", "pipe", "pipe"] });
    child.on("error", () => { failure = "DSH 进程无法启动，请检查运行环境"; console.error(`[dsh] ${failure}`); });
    child.on("exit", (code, signal) => { cookie = ""; failure = `DSH 服务已停止（退出码 ${code}，信号 ${signal ?? "无"}）`; console.error(`[dsh] ${failure}`); });
    let output = "";
    child.stdout.on("data", async chunk => {
      output = (output + String(chunk)).slice(-8192);
      const match = output.match(/dsh web: (http:\/\/127\.0\.0\.1:\d+\/\S*)/);
      if (!match?.[1]) return;
      output = "";
      try {
        const response = await fetch(match[1], { redirect: "manual" });
        cookie = response.headers.getSetCookie().map(value => value.split(";")[0]).join("; ");
        if (!cookie) throw new Error("Missing startup cookie");
        failure = "";
      } catch { failure = "DSH 启动认证失败"; console.error(`[dsh] ${failure}`); }
    });
    child.stderr.on("data", () => { /* Runtime diagnostics may contain credentials. */ });
    server.httpServer?.once("close", () => { watch?.kill("SIGTERM"); child.kill("SIGTERM"); });
    server.middlewares.use((req, res, next) => {
      if (!trusted(req)) { res.writeHead(403); res.end(); return; }
      const pathname = (req.url ?? "/").split("?")[0]!;
      if (pathname.startsWith("/finance-api") || pathname.startsWith("/api/") || pathname.startsWith("/plugins/")
        || pathname.startsWith("/assets/") || pathname.startsWith("/finance-research/") || pathname === "/finance-stage-model" || pathname === "/finance-model" || pathname === "/finance-host" || pathname === "/finance-ui.css"
        || pathname === "/finance-icon.svg" || pathname === "/favicon.svg" || pathname === "/manifest.webmanifest") return next();
      // A full document request receives the untouched DSH index including its boot kernel.
      if (req.method !== "GET" || (!req.headers.accept?.includes("text/html") && pathname !== "/")) return next();
      if (!cookie) {
        res.writeHead(503, { "Content-Type": "text/html; charset=utf-8", "Retry-After": "1", "Cache-Control": "no-store" });
        res.end(`<meta http-equiv="refresh" content="1"><p>${failure}</p>`); return;
      }
      void fetch(target + "/", { headers: { cookie } }).then(async response => {
        res.writeHead(response.status, { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" });
        res.end(await response.text());
      }).catch(() => { res.writeHead(502); res.end("DSH 页面读取失败"); });
    });
  }
  return { plugin: {
    name: "vibe-dsh-development", enforce: "pre",
    configResolved(config) {
      for (const section of [config.server, config.preview]) {
        section.proxy = {
          ...Object.fromEntries(["/api", "/plugins", "/assets", "/finance-research", "/finance-stage-model", "/finance-model", "/finance-host", "/finance-ui.css", "/finance-icon.svg", "/favicon.svg", "/manifest.webmanifest"].map(prefix => [prefix, {
            target, ws: true, changeOrigin: true,
            configure(proxy: import("vite").HttpProxy.Server) {
              const authorize = (request: import("node:http").ClientRequest, incoming: IncomingMessage) => {
                if (!origin || !trusted(incoming) || !cookie) { request.destroy(); return; }
                request.setHeader("cookie", cookie);
                request.setHeader("origin", target);
              };
              proxy.on("proxyReq", authorize);
              proxy.on("proxyReqWs", authorize);
              proxy.on("proxyRes", response => { delete response.headers["set-cookie"]; });
            },
          }])),
          ...section.proxy,
        };
      }
    },
    async configureServer(server) { if (!server.config.server.middlewareMode) await install(server, true); },
    async configurePreviewServer(server) { await install(server, false); },
  } };
}
