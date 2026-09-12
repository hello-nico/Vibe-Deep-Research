import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

test("保留全部路由，但非首屏业务按需加载并保留加载/错误反馈", () => {
  const source = readFileSync(new URL("../src/verticals/finance/router.tsx", import.meta.url), "utf8");
  const paths = [...source.matchAll(/path: "([^"]+)"/g)].map(m => m[1]);
  assert.deepEqual(paths, [
    "/", "/daily-review", "/intel", "/intel/:tab", "/signals", "/signals/:tab",
    "/sectors", "/sectors/profiles", "/sectors/profiles/:key", "/sectors/legacy", "/sectors/legacy/:key", "/sectors/:key",
    "/portfolio", "/stock-data", "/debate", "/backtest", "/watchlist",
    "/research", "/research/legacy", "/my-reports", "/my-reports/read/:id", "/my-reports/legacy",
    "/my-research", "/my-research/material", "/my-research/topics/:topicHex", "/notes", "/notes/legacy", "/settings",
  ]);
  assert.equal((source.match(/lazy: async/g) ?? []).length, 22);
  assert.doesNotMatch(source, /^import .* from "@\/pages\/(?!Home|Settings)/m);
  assert.match(source, /hydrateFallbackElement:/);
  assert.match(source, /errorElement: <RouteErrorPage/);
});
