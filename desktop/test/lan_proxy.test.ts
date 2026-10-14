import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { createServer, loadConfigFromFile } from "vite";
import { isDshProxiedPath } from "../dsh-dev.ts";

test("#34 LAN 默认为关，跨站请求在进入 DSH 前被拒绝", async () => {
  const previous = process.env.VRA_LAN;
  const root = fileURLToPath(new URL("../", import.meta.url));
  try {
    for (const setting of [undefined, "0", "1"]) {
      if (setting === undefined) delete process.env.VRA_LAN; else process.env.VRA_LAN = setting;
      const loaded = await loadConfigFromFile({ command: "serve", mode: "test" }, undefined, root);
      assert.ok(loaded);
      assert.equal(loaded.config.server?.proxy?.["/finance-api"], undefined);
      assert.equal(isDshProxiedPath("/finance-api/health"), true);
      const plugins = loaded.config.plugins?.filter(p => p && !Array.isArray(p) && !("name" in p && p.name === "vibe-dsh-development"));
      const server = await createServer({ ...loaded.config, configFile: false, plugins, root, logLevel: "silent", optimizeDeps: { noDiscovery: true, include: [] }, server: {
        ...loaded.config.server,
        host: "127.0.0.1",
        port: 0,
        hmr: false,
      } });
      try {
        assert.equal(loaded.config.server?.host, setting === "1" ? "0.0.0.0" : "127.0.0.1");
        await server.listen();
        const port = (server.httpServer!.address() as { port: number }).port;
        const origin = `http://127.0.0.1:${port}`;
        if (setting === "1") {
          for (const badOrigin of ["https://evil.example", "null", `${origin}/path`, origin.replace("http:", "https:")]) {
            assert.equal((await fetch(`${origin}/finance-api/probe`, { method: "POST", headers: {
              Origin: badOrigin, "Content-Type": "application/json" }, body: "{}" })).status, 403);
          }
          for (const site of ["cross-site", "same-site"]) {
            assert.equal((await fetch(`${origin}/finance-api/probe`, { headers: { Origin: origin, "Sec-Fetch-Site": site } })).status, 403);
          }
        }
      } finally { await server.close(); }
    }
  } finally {
    if (previous === undefined) delete process.env.VRA_LAN; else process.env.VRA_LAN = previous;
  }
});
