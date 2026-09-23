import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { api } from "../src/verticals/finance/lib/api.ts";
import { localService, type Envelope, type FetchResult } from "../src/verticals/finance/lib/localService.ts";

const envelope = (evidence: Array<Record<string, unknown>>): Envelope => ({
  fetched_at: "2026-09-22T15:54:25+08:00", primary_source: "eastmoney", status: "ok",
  evidence: evidence.map(e => ({ period: "2026-09-22", ...e })),
} as unknown as Envelope);

test("短线情绪只用页面查询已取回的三个池，不再不带日期自取旧快照", async () => {
  const original = localService.fetch;
  const endpoints: string[] = [];
  localService.fetch = async (endpoint) => {
    endpoints.push(endpoint);
    return { cached: false, fetched_at: "", envelope: { evidence: [] } } as unknown as FetchResult;
  };
  try {
    const zt = envelope([
      { field: "limit_up_pool_count", value: 2 },
      { record_key: "600001", field: "pool_limit_days", value: 3, note: "600001 甲 家用电器 3天3板 首封 09:25:00" },
      { record_key: "600002", field: "pool_limit_days", value: 1, note: "600002 乙 元件 首封 09:31:00" },
    ]);
    const zb = envelope([{ field: "break_board_pool_count", value: 2 }]);
    const yzt = envelope([
      { field: "yesterday_limit_up_pool_count", value: 1 },
      { record_key: "600001", field: "pool_y_limit_days", value: 2, note: "600001 甲 家用电器" },
    ]);
    const emotion = await api.emotion({ zt_pool: zt, zb_pool: zb, yzt_pool: yzt });
    assert.equal(emotion.date, "2026-09-22");
    assert.equal(emotion.zt_count, 2);
    assert.equal(emotion.max_boards, 3);
    assert.equal(emotion.seal_rate, 0.5);
    assert.equal(emotion.promotion_rate, 1);
    assert.deepEqual(endpoints.filter(e => e.startsWith("em_")), [], "三个池都不能再自取");

    await assert.rejects(api.emotion({}), /涨停池未取到/);
    const partial = await api.emotion({ zt_pool: zt });
    assert.equal(partial.seal_rate, null, "炸板池缺失时比率给 null，不拿 0 冒充");
    assert.equal(partial.promotion_rate, null);
  } finally { localService.fetch = original; }

  const page = readFileSync(new URL("../src/verticals/finance/pages/DailyReview.tsx", import.meta.url), "utf8");
  assert.doesNotMatch(page, /api\.emotion\(\)/);
  assert.match(page, /api\.emotion\(\{ zt_pool: block\(meta, "zt_pool"\), zb_pool: block\(meta, "zb_pool"\), yzt_pool: block\(meta, "yzt_pool"\) \}\)/);
  const queries = readFileSync(new URL("../../orchestrator/src/finance/page_queries.ts", import.meta.url), "utf8");
  for (const [id, endpoint] of [["zb_pool", "em_zb_pool"], ["yzt_pool", "em_yzt_pool"]]) {
    assert.match(queries, new RegExp(`id: "${id}"[^\\n]*endpoint: "${endpoint}", injectContext: true, injectAs: \\{ date_compact: "date" \\}`));
  }
});
