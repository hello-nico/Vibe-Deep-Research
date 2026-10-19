import assert from "node:assert/strict";
import fs from "node:fs";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { createApiServer, disposeLocalDataRuntime, handleLocalDataRequest } from "../src/api.ts";
import { openClientStoreCount } from "../src/client_store.ts";
import { abortActiveFetches, serviceContext } from "../src/service.ts";

function once(req: http.IncomingMessage, res: http.ServerResponse, ctx: ReturnType<typeof serviceContext>, token?: string) {
  return new Promise<{ status: number; body: string }>((resolve, reject) => {
    const server = token ? createApiServer(ctx, { token }) : http.createServer((request, response) => {
      void handleLocalDataRequest(request, response, ctx);
    });
    server.listen(0, "127.0.0.1", async () => {
      const port = (server.address() as { port: number }).port;
      try {
        const response = await fetch(`http://127.0.0.1:${port}${req.url}`, {
          method: req.method,
          headers: req.headers as Record<string, string>,
        });
        resolve({ status: response.status, body: await response.text() });
      } catch (error) { reject(error); }
      finally { server.close(); }
    });
  });
}

test("插件处理函数与独立入口对同一请求返回相同结果", async () => {
  const ctx = serviceContext();
  const token = "synthetic-local-data-token";
  const headers = { authorization: `Bearer ${token}` };
  const direct = await once({ url: "/health", method: "GET", headers: {} } as http.IncomingMessage, {} as http.ServerResponse, ctx);
  const standalone = await once({ url: "/health", method: "GET", headers } as http.IncomingMessage, {} as http.ServerResponse, ctx, token);
  assert.equal(direct.status, 200);
  assert.equal(standalone.status, 200);
  assert.equal(direct.body, standalone.body);
  assert.match(direct.body, /"ok":true/);
});

test("卸载后关闭 SQLite", async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "vibe-local-data-"));
  const repoRoot = serviceContext().repoRoot;
  const ctx = serviceContext({ repoRoot, env: { ...process.env, VRA_DATA_ROOT: root } });
  const { listWatch } = await import("../src/client_store.ts");
  listWatch(ctx);
  assert.equal(openClientStoreCount() > 0, true);
  disposeLocalDataRuntime();
  assert.equal(openClientStoreCount(), 0);
  abortActiveFetches();
  fs.rmSync(root, { recursive: true, force: true });
});
