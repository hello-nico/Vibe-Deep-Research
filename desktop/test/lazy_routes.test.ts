import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

test("现用业务按需加载，退役页面只挂重定向并保留加载/错误反馈", () => {
  const source = readFileSync(new URL("../src/verticals/finance/router.tsx", import.meta.url), "utf8");
  const paths = [...source.matchAll(/path: "([^"]+)"/g)].map(m => m[1]);
  assert.deepEqual(paths, [
    "/", "/feed", "/tracking", "/insights", "/insights/topics/:topicHex", "/insights/*", "/watch", "/watch/:symbol",
    "/my-reports", "/my-reports/read/:id", "/evidence", "/settings",
    "/signals", "/signals/*", "/sectors", "/sectors/*",
    "/watchlist", "/research", "/daily-review", "/intel", "/intel/:tab", "/my-research", "/my-research/topics/:topicHex", "/my-research/*",
  ]);
  assert.equal((source.match(/lazy: async/g) ?? []).length, 8);
  assert.doesNotMatch(source, /path: "\/my-research\/material"/);
  assert.doesNotMatch(source, /^import .* from "@\/pages\/(?!Home|Settings)/m);
  assert.match(source, /hydrateFallbackElement:/);
  assert.match(source, /errorElement: <RouteErrorPage/);
});
