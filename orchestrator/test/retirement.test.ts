import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { createApiServer } from "../src/api.ts";
import { closeClientStores } from "../src/client_store.ts";
import type { ServiceContext } from "../src/service.ts";

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

test("retired HTTP operations cannot run; Client choices survive server reopen", async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "vra-retirement-"));
  const ctx: ServiceContext = { repoRoot: repo, dataRoot: root, node: process.execPath, python: "python3", providerEnvKey: null };
  const token = "retirement-test-token";
  let server = createApiServer(ctx, { token });
  const open = async () => {
    await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
    return `http://127.0.0.1:${(server.address() as {port: number}).port}`;
  };
  const close = async () => { server.closeAllConnections(); await new Promise<void>(resolve => server.close(() => resolve())); };
  const request = (base: string, route: string, method = "GET", body = {}) => fetch(base + route, {
    method, headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
    ...(method === "POST" ? { body: JSON.stringify(body) } : {}),
  });
  try {
    let base = await open();
    assert.equal((await fetch(base + "/health")).status, 401);
    assert.equal((await request(base, "/health")).status, 200);
    for (const route of ["/research", "/reports", "/chat", "/tasks/run", "/tool", "/debate/start"]) {
      assert.equal((await request(base, route, "POST")).status, 404, route);
    }
    for (const route of ["/reports", "/runs", "/knowledge/SH/600674", "/ui", "/login?token=test"]) {
      assert.equal((await request(base, route)).status, 404, route);
    }
    assert.deepEqual(fs.readdirSync(root), [], "retired calls must not create runs or reports");
    const added = await request(base, "/client/research", "POST", { symbol: "600674" });
    assert.equal(added.status, 200);
    const before = await (await request(base, "/client/research")).json();
    assert.match(JSON.stringify(before), /600674/);
    await close();
    closeClientStores();
    server = createApiServer(ctx, { token });
    base = await open();
    assert.deepEqual(await (await request(base, "/client/research")).json(), before);
  } finally {
    await close();
    closeClientStores();
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("actual stdio MCP exposes only data tools and rejects retired research", async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "vra-retirement-mcp-"));
  const client = new Client({ name: "retirement-test", version: "1.0.0" });
  const transport = new StdioClientTransport({
    command: process.execPath, args: [path.join(repo, "orchestrator/src/mcp.ts"), "--repo-root", repo],
    env: { PATH: process.env.PATH ?? "", VRA_DATA_ROOT: root }, stderr: "pipe",
  });
  try {
    await client.connect(transport);
    const listed = await client.listTools();
    assert.deepEqual(listed.tools.map(t => t.name).sort(), ["fetch_endpoint", "list_endpoints"]);
    const result = await client.callTool({ name: "start_research", arguments: { symbol: "600674.SH" } });
    assert.equal(result.isError, true);
    assert.equal(fs.existsSync(path.join(root, "runs")), false);
  } finally {
    await client.close();
    fs.rmSync(root, { recursive: true, force: true });
  }
});
