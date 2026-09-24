import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

test("保留全部路由，但非首屏业务按需加载并保留加载/错误反馈", () => {
  const source = readFileSync(new URL("../src/verticals/finance/router.tsx", import.meta.url), "utf8");
  const paths = [...source.matchAll(/path: "([^"]+)"/g)].map(m => m[1]);
  assert.deepEqual(paths, [
    "/", "/daily-review", "/intel", "/intel/:tab", "/signals", "/signals/:tab",
    "/sectors", "/sectors/profiles", "/sectors/profiles/:key", "/sectors/:key", "/watchlist",
    "/research", "/my-reports", "/my-reports/read/:id", "/evidence",
    "/my-research", "/my-research/topics/:topicHex", "/my-research/*", "/settings",
  ]);
  assert.equal((source.match(/lazy: async/g) ?? []).length, 16);
  assert.doesNotMatch(source, /path: "\/my-research\/material"/);
  assert.doesNotMatch(source, /^import .* from "@\/pages\/(?!Home|Settings)/m);
  assert.match(source, /hydrateFallbackElement:/);
  assert.match(source, /errorElement: <RouteErrorPage/);
});
