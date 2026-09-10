import fs from "node:fs";
import { installPageModel } from './model.mjs';
import { installResearchApi } from './research.mjs';
import { installStageModel } from './stage-model.mjs';

export const inject = ["webServer", "llm", "agentDefaultModel"];

/** The host exposes only the configured workspace, never model credentials. */
export function apply(ctx) {
  ctx.webServer.register({ kind: "exact", path: "/finance-icon.svg", handler(_req, res) {
    res.setHeader("Content-Type", "image/svg+xml");
    res.end('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path d="M2 12h4l3-9 6 18 3-9h4" fill="none" stroke="#ff5722" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>');
  } });
  installPageModel(ctx);
  installStageModel(ctx);
  installResearchApi(ctx);
  ctx.webServer.register({ kind: "exact", path: "/finance-pdfium.wasm", handler(_req, res) {
    res.setHeader("Content-Type", "application/wasm");
    res.setHeader("Cache-Control", "no-cache");
    const stream = fs.createReadStream(new URL("./lib/pdfium.wasm", import.meta.url));
    stream.on("error", () => { if (!res.headersSent) res.writeHead(503); res.end(); });
    stream.pipe(res);
  } });
  ctx.webServer.register({ kind: "exact", path: "/finance-host", handler(_req, res) {
    res.setHeader("Content-Type", "application/json");
    res.setHeader("Cache-Control", "no-store");
    res.end(JSON.stringify({ workspace: process.cwd() }));
  } });
  ctx.webServer.register({ kind: "exact", path: "/finance-ui.css", handler(_req, res) {
    res.setHeader("Content-Type", "text/css");
    res.setHeader("Cache-Control", "no-cache");
    res.end(fs.readFileSync(new URL("./lib/style.css", import.meta.url)));
  } });
  ctx.on("webserver/index-inject", table => {
    table.push({ kind: "html", placement: "head", html: '<link rel="stylesheet" href="/finance-ui.css">' });
  });
}
