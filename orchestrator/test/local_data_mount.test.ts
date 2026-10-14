import assert from "node:assert/strict";
import fs from "node:fs";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";
import test from "node:test";
import { createApiServer, disposeLocalDataRuntime, handleLocalDataRequest } from "../src/api.ts";
import { openClientStoreCount } from "../src/client_store.ts";
import { abortActiveFetches, serviceContext, trackFetchChild } from "../src/service.ts";

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

test("卸载后关闭 SQLite 并结束取数子进程", async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "vibe-local-data-"));
  const repoRoot = serviceContext().repoRoot;
  const ctx = serviceContext({ repoRoot, env: { ...process.env, VRA_DATA_ROOT: root } });
  const { listWatch } = await import("../src/client_store.ts");
  listWatch(ctx);
  assert.equal(openClientStoreCount() > 0, true);
  const child = spawn(process.execPath, ["-e", "setInterval(() => {}, 1000)"]);
  trackFetchChild(child);
  if (!child.pid) await new Promise(resolve => child.once("spawn", resolve));
  disposeLocalDataRuntime();
  await new Promise(resolve => child.once("close", resolve));
  assert.equal(child.killed || child.exitCode !== null || child.signalCode !== null, true);
  assert.equal(openClientStoreCount(), 0);
  abortActiveFetches();
  fs.rmSync(root, { recursive: true, force: true });
});
