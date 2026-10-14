import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { installLocalData, productRepoRoot } from "../dsh/finance-ui/local-data.mjs";

function capture(handler) {
  const res = { status: 0, body: "", headers: {}, writeHead(status, headers) { this.status = status; this.headers = headers || {}; }, end(body) { this.body = body || ""; }, setHeader() {} };
  return { res, done: handler.then?.() };
}

test("未认证请求被 DSH Host 拒绝，通过后与独立处理函数同一路径", async () => {
  const routes = [];
  const ctx = {
    connection: { admit: (req) => req.headers["x-auth"] === "ok" ? { peer: {} } : { rejection: 401 } },
    webServer: { register(route) { routes.push(route); return () => {}; } },
  };
  installLocalData(ctx);
  const route = routes.find(item => item.path === "/finance-api");
  const denied = { status: 0, body: "", writeHead(status) { this.status = status; }, end(body) { this.body = body || ""; } };
  await route.handler({ method: "GET", url: "/finance-api/health", headers: {} }, denied);
  assert.equal(denied.status, 401);
  assert.equal(denied.body, "unauthorized");

  const allowed = { status: 0, body: "", headersSent: false, writableEnded: false, writeHead(status, headers) { this.status = status; this.headers = headers; }, end(body) { this.body = body || ""; this.writableEnded = true; }, setHeader() {}, once() {}, removeListener() {} };
  await route.handler({ method: "GET", url: "/finance-api/health", headers: { "x-auth": "ok" }, aborted: false, once() {}, removeListener() {} }, allowed);
  assert.equal(allowed.status, 200);
  assert.match(allowed.body, /"ok":true/);
});

test("在非仓库目录启动时仍指向产品根", () => {
  const previous = process.cwd();
  const envRoot = process.env.VRA_REPO_ROOT;
  delete process.env.VRA_REPO_ROOT;
  try {
    process.chdir(os.tmpdir());
    assert.equal(productRepoRoot(), path.resolve(fileURLToPath(new URL("../..", import.meta.url))));
  } finally {
    process.chdir(previous);
    if (envRoot === undefined) delete process.env.VRA_REPO_ROOT;
    else process.env.VRA_REPO_ROOT = envRoot;
  }
});
