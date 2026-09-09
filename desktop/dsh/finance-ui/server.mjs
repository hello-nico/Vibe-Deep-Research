import fs from "node:fs";
import { installResearchApi } from "./research.mjs";

export const inject = ["webServer"];

/** The host exposes only the configured workspace, never model credentials. */
export function apply(ctx) {
  installResearchApi(ctx);
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
