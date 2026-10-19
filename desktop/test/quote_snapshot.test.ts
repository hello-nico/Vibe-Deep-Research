import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { api } from "../src/verticals/finance/lib/api.ts";
import { researchRoute } from "../dsh/finance-ui/research.mjs";
import { quoteSnapshotTime } from "../src/verticals/finance/lib/quoteSnapshot.ts";

test("报价走 Backend /market/quotes：A 股代码补后缀，字段映射成亿元，缺失保持 null，时间取源 as_of", async t => {
  const seen: string[] = [];
  const stamp = "2026-09-04T01:30:00Z";
  t.mock.method(globalThis, "fetch", async (url: string) => {
    seen.push(url);
    return Response.json({ quotes: [
      { symbol: "600519.SH", name: "贵州茅台", price: 100, change: 1, change_pct: 1.01, open: null, high: null, low: null,
        prev_close: 99, limit_up: 109.9, limit_down: 89.1, volume: 1000, amount: 2.5e8, market_cap: 1.25e12, pe_ttm: 31.2, as_of: stamp },
      { symbol: "000001.SZ", name: null, price: null, change: null, change_pct: null, open: null, high: null, low: null,
        prev_close: null, limit_up: null, limit_down: null, volume: null, amount: null, market_cap: null, pe_ttm: null, as_of: null },
    ], missing: [] });
  });
  const quotes = await api.quote("600519,000001,00700,AAPL", true);
  assert.deepEqual(seen, ["/finance-research/market/quotes?symbols=600519.SH%2C000001.SZ"]);
  assert.equal(quotes["600519"]?.price, 100);
  assert.equal(quotes["600519"]?.last_close, 99);
  assert.equal(quotes["600519"]?.mcap_yi, 12500);
  assert.equal(quotes["600519"]?.amount_yuan, 2.5e8);
  assert.equal(quotes["600519"]?.pe_ttm, 31.2);
  assert.equal(quotes["000001"]?.pe_ttm, null);
  assert.equal(quotes["600519"]?.fetched_at, stamp);
  assert.equal(quotes["000001"]?.price, null);
  assert.equal(quotes["000001"]?.change_pct, null);
  assert.equal(quotes["00700"], undefined);
  assert.equal(quoteSnapshotTime(quotes), Date.parse(stamp));
});

test("公告与新闻各一次批量请求，symbols 全部补后缀，limit 透传", async t => {
  const seen: string[] = [];
  t.mock.method(globalThis, "fetch", async (url: string) => {
    seen.push(url);
    return Response.json({ items: [{ symbol: "600519.SH", title: "公告", published_at: "2026-09-04T00:00:00Z", url: null, document_id: null }] });
  });
  const list = await api.announcements(["600519", "300750"], 30);
  assert.equal(list[0]?.title, "公告");
  await api.news(["600519"], 10);
  assert.deepEqual(seen, [
    "/finance-research/feed/announcements?symbols=600519.SH%2C300750.SZ&limit=30",
    "/finance-research/feed/news?symbols=600519.SH&limit=10",
  ]);
  assert.deepEqual(await api.news(["00700"], 10), []);
  assert.equal(seen.length, 2);
});

test("轮询：3 秒间隔、仍按交易时段暂停", () => {
  const hook = readFileSync(new URL("../src/verticals/finance/hooks/useLiveQuotes.ts", import.meta.url), "utf8");
  assert.match(hook, /LIVE_INTERVAL_MS = 3000/);
  assert.match(hook, /isTradingHours\(/);
  assert.doesNotMatch(hook, /setUpdatedAt\(Date\.now\(\)\)/);
});

test("混合市场显示最早快照；空值与缺时间不伪造新时间", () => {
  const old = { price: 10, fetched_at: "2026-09-03T12:00:00Z" };
  const fresh = { price: 20, fetched_at: "2026-09-04T12:00:00Z" };
  assert.equal(quoteSnapshotTime({ old, fresh }), Date.parse(old.fetched_at));
  assert.equal(quoteSnapshotTime({}), null);
  assert.equal(quoteSnapshotTime({ empty: { price: null, fetched_at: fresh.fetched_at } }), null);
  assert.equal(quoteSnapshotTime({ old, unknown: { price: 30 } }), null);
  assert.equal(quoteSnapshotTime({ bad: { price: 30, fetched_at: "bad" } }), null);
});

test("宿主白名单只放行三条行情/公告/新闻的读取，不放行写", () => {
  for (const route of ["/market/quotes", "/feed/announcements", "/feed/news"]) {
    assert.equal(researchRoute("GET", route), true, route);
    assert.equal(researchRoute("POST", route), false, route);
  }
});
