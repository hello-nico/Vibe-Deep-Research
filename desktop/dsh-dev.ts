import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { spawn } from "node:child_process";
import type { IncomingMessage } from "node:http";
import type { Plugin } from "vite";
import { resolveDshPaths, prepareDshPaths } from "../orchestrator/src/dsh_paths.ts";

/** Development host: authenticated DSH routes share the existing Vite origin. */
export function dshDevelopment(repoRoot: string): { plugin: Plugin; aliases: { find: string; replacement: string }[] } {
  const paths = resolveDshPaths(repoRoot);
  const runtimeRequire = createRequire(path.join(paths.runtime, "package.json"));
  const aliases = ["@deepseek-ai/cordis", "@deepseek-ai/cordis-plugin-loader", "@deepseek-ai/dsh-client-store", "@deepseek-ai/dsh-client-ui-slots", "@deepseek-ai/dsh-client-ui-primitives"]
    .map(find => ({ find, replacement: runtimeRequire.resolve(find) }));
  let boot = "";
  let cookie = "";
  let failure = "DSH 正在启动";
  const target = "http://127.0.0.1:5941";
  const trusted = (req: IncomingMessage) => req.headers.host === "127.0.0.1:5930"
    && (!req.headers.origin || req.headers.origin === "http://127.0.0.1:5930")
    && req.headers["sec-fetch-site"] !== "cross-site";
  return { aliases, plugin: {
    name: "vibe-dsh-development",
    enforce: "pre",
    configResolved(config) {
      config.server.proxy = Object.fromEntries([
        ...["^/api/remote\\.mux$", "/dsh-api", "/plugins", "/assets"].map(prefix => [prefix, {
          target, ws: true, changeOrigin: true,
          rewrite: (url: string) => url.replace(/^\/dsh-api\//, "/api/"),
          configure(p: import("vite").HttpProxy.Server) {
            p.on("proxyReq", (request, incoming) => {
              if (!trusted(incoming)) { request.destroy(); return; }
              if (cookie) request.setHeader("cookie", cookie);
              request.setHeader("origin", target);
            });
            p.on("proxyReqWs", (request, incoming) => {
              if (!trusted(incoming)) { request.destroy(); return; }
              if (cookie) request.setHeader("cookie", cookie);
              request.setHeader("origin", target);
            });
          },
        }]),
        ...Object.entries(config.server.proxy ?? {}),
      ]);
      config.server.fs.allow.push(paths.runtime);
    },
    resolveId(id) {
      if (id === "node:module" || id === "node:url") return "\0vibe-dsh-node-unavailable";
    },
    load(id) {
      if (id === "\0vibe-dsh-node-unavailable") return 'export function createRequire() { throw new Error("Node module loading is unavailable in the browser; use the DSH client module loader") } export function pathToFileURL() { throw new Error("Node paths are unavailable in the browser") }';
    },
    configureServer(server) {
      if (server.config.server.middlewareMode) return;
      if (process.env.VRA_LAN === "1") throw new Error("M3 DSH 开发版仅支持本机访问");
      prepareDshPaths(paths);
      const profile = path.join(paths.home, "profiles/web");
      fs.mkdirSync(profile, { recursive: true, mode: 0o700 });
      const manifest = path.join(profile, "package.json");
      if (!fs.existsSync(manifest)) fs.writeFileSync(manifest, JSON.stringify({ name: "vibe-dsh-web", private: true, dsh: { profile: { bundles: ["@deepseek-ai/dsh-base", "@deepseek-ai/dsh-web-app"] } } }, null, 2));
      if (!fs.existsSync(path.join(profile, "cordis.yml"))) fs.writeFileSync(path.join(profile, "cordis.yml"), "[]\n");
      // Overlay belongs to this host, not to the user's editable DSH model settings.
      const overlay = path.join(paths.home, "vibe-m3.patch.yml");
      // Web tools and persona are preset-owned, not host-owned.
      fs.writeFileSync(overlay, JSON.stringify([{ id: "agent-presets", config: {
        default: "vibe", includeShippedRoot: false, includeUserRoot: false,
        roots: [{ path: path.join(repoRoot, "desktop/dsh/presets"), trust: "system" }],
      } }], null, 2));
      const child = spawn(process.execPath, [path.join(paths.runtime, "node_modules/@deepseek-ai/dsh/lib/bin.js"), "--profile", "web", "--patch", overlay, "--no-open", "--port", "5941", "--trusted-host", "127.0.0.1:5930"], {
        cwd: paths.workspace, env: { ...process.env, DSH_HOME: paths.home }, stdio: ["ignore", "pipe", "pipe"],
      });
      child.on("error", () => { failure = "DSH 进程无法启动，请检查运行环境配置"; });
      child.on("exit", () => { boot = ""; failure = "DSH 服务已停止"; });
      let output = "";
      child.stdout.on("data", async chunk => {
        output += String(chunk);
        const match = output.match(/dsh web: (http:\/\/127\.0\.0\.1:5941\/\S*)/);
        if (!match?.[1]) { output = output.slice(-8192); return; }
        output = "";
        try {
          const response = await fetch(match[1], { redirect: "manual" });
          cookie = response.headers.getSetCookie().map(v => v.split(";")[0]).join("; ");
          const page = await fetch(target, { headers: { cookie } });
          if (!page.ok) throw new Error("auth");
          boot = await page.text(); failure = "";
        } catch { failure = "DSH 启动认证失败"; }
      });
      child.stderr.on("data", () => { /* Do not expose runtime output that can include credentials. */ });
      server.httpServer?.once("close", () => child.kill("SIGTERM"));
      server.middlewares.use((req, res, next) => {
        const url = req.url ?? "/";
        if (!url.startsWith("/dsh-bootstrap") && !url.startsWith("/dsh-api/") && url !== "/api" && !url.startsWith("/plugins/") && !url.startsWith("/assets/")) return next();
        if (!trusted(req)) { res.writeHead(403); res.end(); return; }
        if (url === "/dsh-bootstrap") {
          res.setHeader("Content-Type", "application/json");
          res.setHeader("Cache-Control", "no-store");
          res.end(JSON.stringify({ html: boot, workspace: paths.workspace, error: failure })); return;
        }
        next();
      });
    },
  } };
}
