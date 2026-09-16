import assert from "node:assert/strict";
import test from "node:test";
import { isTrustedDevRequest } from "../dsh-dev.ts";

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
