import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dshDevelopment, dshUnavailableBody, isDshProxiedPath, isTrustedDevRequest } from "../dsh-dev.ts";

test("开发和预览入口代理报告绑定接口", () => {
  const { plugin } = dshDevelopment(process.cwd());
  const config = { server: {}, preview: {} };
  plugin.configResolved(config);
  for (const section of [config.server, config.preview]) {
    assert.ok(section.proxy['/finance-report-tasks']);
    assert.ok(section.proxy['/finance-report-runs']);
    assert.equal(section.proxy['/finance-report-runs'].target, section.proxy['/finance-topic-sessions'].target);
    assert.equal(typeof section.proxy['/api'].configure, 'function');
  }
});

test("DSH 代理路径不含本机 API，未就绪时给出可重试 JSON", () => {
  assert.equal(isDshProxiedPath('/api/session/list'), true);
  assert.equal(isDshProxiedPath('/finance-report-tasks'), true);
  assert.equal(isDshProxiedPath('/finance-maintenance-refresh'), true);
  assert.equal(isDshProxiedPath('/finance-api/health'), false);
  assert.match(dshUnavailableBody('DSH 正在启动'), /dsh_unavailable/);
  const source = readFileSync(fileURLToPath(new URL('../dsh-dev.ts', import.meta.url)), 'utf8');
  assert.match(source, /isDshProxiedPath\(pathname\)/);
  assert.match(source, /sendJson\(res, 503, dshUnavailableBody/);
  assert.match(source, /error: "dsh_unreachable"/);
});

const origin = "http://127.0.0.1:5930";

test("开发代理允许同源与无 Origin 的本机请求，拒绝跨站和 Host 不匹配", () => {
  assert.equal(isTrustedDevRequest({ headers: { host: "127.0.0.1:5930" } }, origin), true);
  assert.equal(isTrustedDevRequest({ headers: { host: "127.0.0.1:5930", origin } }, origin), true);
  assert.equal(isTrustedDevRequest({ headers: { host: "127.0.0.1:5930", origin, "sec-fetch-site": "same-origin" } }, origin), true);
  assert.equal(isTrustedDevRequest({ headers: { host: "127.0.0.1:5930", "sec-fetch-site": "none" } }, origin), true);

  assert.equal(isTrustedDevRequest({ headers: { host: "127.0.0.1:5930", origin: "https://evil.example" } }, origin), false);
  assert.equal(isTrustedDevRequest({ headers: { host: "evil.example", origin } }, origin), false);
  assert.equal(isTrustedDevRequest({ headers: { host: "127.0.0.1:5941" } }, origin), false);
  assert.equal(isTrustedDevRequest({ headers: { host: "127.0.0.1:5930", origin, "sec-fetch-site": "cross-site" } }, origin), false);
  assert.equal(isTrustedDevRequest({ headers: { host: "127.0.0.1:5930" } }, ""), false);
});
