import assert from "node:assert/strict";
import test from "node:test";
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { dshDevelopment, dshUnavailableBody, isDshProxiedPath, isTrustedDevRequest, readTrustedRemote } from "../dsh-dev.ts";

test("开发和预览入口代理报告绑定接口", () => {
  const { plugin } = dshDevelopment(process.cwd());
  const config = { server: {}, preview: {} };
  plugin.configResolved(config);
  for (const section of [config.server, config.preview]) {
    assert.ok(section.proxy['/finance-report-tasks']);
    assert.ok(section.proxy['/finance-report-runs']);
    assert.ok(section.proxy['/finance-research-runs']);
    assert.equal(section.proxy['/finance-report-runs'].target, section.proxy['/finance-topic-sessions'].target);
    assert.equal(typeof section.proxy['/api'].configure, 'function');
  }
});

test("DSH 代理路径不含本机 API，未就绪时给出可重试 JSON", () => {
  assert.equal(isDshProxiedPath('/api/session/list'), true);
  assert.equal(isDshProxiedPath('/finance-report-tasks'), true);
  assert.equal(isDshProxiedPath('/finance-maintenance-refresh'), true);
  assert.equal(isDshProxiedPath('/finance-api/health'), true);
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

test("经 tailscale serve 的手机访问：只认配置的 ts.net 来源，且 Tailscale 登录名必须是本人", () => {
  const remote = { origin: "https://mac.tail1.ts.net:8443", host: "mac.tail1.ts.net:8443", user: "me@" };
  const phone = { host: remote.host, origin: remote.origin, "sec-fetch-site": "same-origin", "tailscale-user-login": "me@" };
  assert.equal(isTrustedDevRequest({ headers: phone }, origin, remote), true);
  assert.equal(isTrustedDevRequest({ headers: { host: remote.host, "tailscale-user-login": "me@" } }, origin, remote), true, "页面导航不带 Origin");
  assert.equal(isTrustedDevRequest({ headers: { ...phone, "tailscale-user-login": "other@" } }, origin, remote), false, "tailnet 里别人的设备");
  const { "tailscale-user-login": _drop, ...anonymous } = phone;
  assert.equal(isTrustedDevRequest({ headers: anonymous }, origin, remote), false, "没经 tailscale serve 就没有登录名");
  assert.equal(isTrustedDevRequest({ headers: { ...phone, origin: "https://evil.example" } }, origin, remote), false);
  assert.equal(isTrustedDevRequest({ headers: { ...phone, "sec-fetch-site": "cross-site" } }, origin, remote), false);
  assert.equal(isTrustedDevRequest({ headers: { ...phone, host: "other.tail1.ts.net:8443" } }, origin, remote), false);
  assert.equal(isTrustedDevRequest({ headers: phone }, origin), false, "没有配置就只信本机");
  assert.equal(isTrustedDevRequest({ headers: { host: "127.0.0.1:5930", origin: remote.origin } }, origin, remote), false, "本机 Host 配外来 Origin 仍拒绝");
});

test("trusted-remote.json：没有文件只信本机；只接受 https 的 ts.net 地址和非空登录名", () => {
  const root = mkdtempSync(join(tmpdir(), "vra-remote-"));
  assert.equal(readTrustedRemote(root), null);
  mkdirSync(join(root, ".local"));
  const write = (value: unknown) => writeFileSync(join(root, ".local", "trusted-remote.json"), JSON.stringify(value));
  write({ origin: "https://mac.tail1.ts.net:8443", user: "me@" });
  assert.deepEqual(readTrustedRemote(root), { origin: "https://mac.tail1.ts.net:8443", host: "mac.tail1.ts.net:8443", user: "me@" });
  for (const bad of [{ origin: "http://mac.tail1.ts.net:8443", user: "me@" }, { origin: "https://evil.example", user: "me@" }, { origin: "https://mac.tail1.ts.net:8443/x", user: "me@" }, { origin: "https://mac.tail1.ts.net:8443", user: " " }]) {
    write(bad);
    assert.throws(() => readTrustedRemote(root), /trusted-remote\.json/);
  }
});

test("宿主注册的每个 /finance-* 接口都经开发入口转发", () => {
  const host = readFileSync(fileURLToPath(new URL("../dsh/finance-ui/host-state.mjs", import.meta.url)), "utf8");
  const routes = [...host.matchAll(/path: '(\/finance-[^']+)'/g)].map(match => match[1]);
  assert.ok(routes.includes("/finance-assistant-page-context"));
  for (const route of routes) assert.ok(isDshProxiedPath(route), `${route} 未加入开发入口转发`);
});
