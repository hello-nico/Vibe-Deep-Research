import fs from "node:fs";
import { installPageModel } from './model.mjs';
import { installResearchApi, installWikiPublish } from './research.mjs';
import { installCompanyRefresh } from './maintenance.mjs';
import { installHostState } from './host-state.mjs';

export const inject = ["webServer", "llm", "agentDefaultModel", "sessions", "sessionPersistence", "agents", "subagents"];

function trackDisposer(owned, disposer) {
  if (typeof disposer === "function") owned.push(disposer);
  else if (Array.isArray(disposer)) for (const item of disposer) trackDisposer(owned, item);
}

export function bindPluginRoutes(ctx, install) {
  const owned = [];
  try {
    install(disposer => { trackDisposer(owned, disposer); return disposer; });
    ctx.effect(() => () => { while (owned.length) owned.pop()(); });
  } catch (error) {
    while (owned.length) owned.pop()();
    throw error;
  }
  return owned;
}

/** The host exposes only the configured workspace, never model credentials. */
export function apply(ctx) {
  bindPluginRoutes(ctx, track => {
    track(ctx.webServer.register({ kind: "exact", path: "/finance-icon.svg", handler(_req, res) {
      res.setHeader("Content-Type", "image/svg+xml");
      res.end('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path d="M2 12h4l3-9 6 18 3-9h4" fill="none" stroke="#ff5722" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>');
    } }));
    track(installPageModel(ctx));
    track(installResearchApi(ctx));
    track(installWikiPublish(ctx));
    track(installCompanyRefresh(ctx));
    installHostState(ctx, track);
    track(ctx.webServer.register({ kind: "exact", path: "/finance-pdfium.wasm", handler(_req, res) {
      res.setHeader("Content-Type", "application/wasm");
      res.setHeader("Cache-Control", "no-cache");
      const stream = fs.createReadStream(new URL("./lib/pdfium.wasm", import.meta.url));
      stream.on("error", () => { if (!res.headersSent) res.writeHead(503); res.end(); });
      stream.pipe(res);
    } }));
    track(ctx.webServer.register({ kind: "exact", path: "/finance-host", handler(_req, res) {
      res.setHeader("Content-Type", "application/json");
      res.setHeader("Cache-Control", "no-store");
      res.end(JSON.stringify({ workspace: process.cwd() }));
    } }));
    track(ctx.webServer.register({ kind: "exact", path: "/finance-ui.css", handler(_req, res) {
      res.setHeader("Content-Type", "text/css");
      res.setHeader("Cache-Control", "no-cache");
      res.end(fs.readFileSync(new URL("./lib/style.css", import.meta.url)));
    } }));
  });
  ctx.on("webserver/index-inject", table => {
    table.push({ kind: "html", placement: "head", html: '<link rel="stylesheet" href="/finance-ui.css">' });
  });
}
