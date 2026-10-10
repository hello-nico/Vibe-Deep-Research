import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { loadFinanceModule } from "./load_finance_module.ts";

const { legacyRedirect, watchPath, watchPathOfCompany } = await loadFinanceModule<typeof import("../src/verticals/finance/lib/routes.ts")>("lib/routes.ts");

test("旧入口按 N3 对照表重定向，/evidence 与新地址不动", () => {
  assert.equal(legacyRedirect("/watchlist"), "/watch");
  assert.equal(legacyRedirect("/research"), "/watch");
  assert.equal(legacyRedirect("/research", "?company=companies%2F600863-sh"), "/watch/600863");
  assert.equal(legacyRedirect("/research", "?company=companies/600309-sh&view=report"), "/watch/600309");
  assert.equal(legacyRedirect("/research", "?company=600519"), "/watch/600519");
  assert.equal(legacyRedirect("/research", "?company=%21%21"), "/watch");
  assert.equal(legacyRedirect("/daily-review"), "/feed?tab=market");
  assert.equal(legacyRedirect("/intel"), "/feed?tab=intel");
  assert.equal(legacyRedirect("/intel/filings"), "/feed?tab=intel&sub=filings");
  assert.equal(legacyRedirect("/my-research"), "/insights");
  assert.equal(legacyRedirect("/my-research", "?tab=tasks&draft=d1"), "/insights?tab=tasks&draft=d1");
  assert.equal(legacyRedirect("/my-research/topics/abc123def456"), "/insights/topics/abc123def456");
  assert.equal(legacyRedirect("/my-research/material"), "/insights");
  for (const kept of ["/evidence", "/watch", "/watch/600863", "/feed", "/insights", "/insights/topics/abc", "/sectors", "/signals", "/my-reports", "/settings", "/"]) assert.equal(legacyRedirect(kept), null, kept);
  assert.equal(watchPath("00700.HK"), "/watch/00700.HK");
  assert.equal(watchPathOfCompany("companies/600863-sh"), "/watch/600863");
});

test("路由表为旧入口挂重定向，议题与证据深链不失效", () => {
  const source = readFileSync(new URL("../src/verticals/finance/router.tsx", import.meta.url), "utf8");
  for (const path of ["/watchlist", "/research", "/daily-review", "/intel", "/intel/:tab", "/my-research", "/my-research/topics/:topicHex", "/my-research/*"])
    assert.match(source, new RegExp(`path: "${path.replace(/[/*:]/g, "\\$&")}", element: <LegacyRedirect />`), path);
  assert.match(source, /path: "\/evidence", lazy/);
  assert.match(source, /path: "\/insights\/topics\/:topicHex", lazy/);
  assert.match(source, /legacyRedirect\(pathname, search\) \?\? "\/"/);
});
