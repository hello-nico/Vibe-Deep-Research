import { useEffect, useState } from "react";
import { aShareQualified } from "./research";

/**
 * 关注卡走势线：近 60 个交易日收盘。只用现有的单只行情预览接口（A 股），不新增 Backend 接口；
 * 取不到就返回 undefined，调用方保留这一行的位置。同一代码只请求一次，并发限制 3。
 */
const cache = new Map<string, number[] | null>();
const pending = new Map<string, Promise<number[] | null>>();
let running = 0;
const queue: (() => void)[] = [];

export const CLOSE_DAYS = 60;

export function closesFromRows(rows: unknown, days = CLOSE_DAYS): number[] | null {
  if (!Array.isArray(rows)) return null;
  const closes = rows.map(row => (row && typeof row === "object" ? Number((row as Record<string, unknown>).close) : NaN)).filter(value => Number.isFinite(value) && value > 0);
  return closes.length >= 2 ? closes.slice(-days) : null;
}

function acquire(): Promise<void> {
  if (running < 3) { running++; return Promise.resolve(); }
  return new Promise(resolve => queue.push(() => { running++; resolve(); }));
}
function release() { running--; queue.shift()?.(); }

export function loadCloseSeries(symbol: string): Promise<number[] | null> {
  const qualified = aShareQualified(symbol);
  if (!qualified) return Promise.resolve(null);
  if (cache.has(symbol)) return Promise.resolve(cache.get(symbol) ?? null);
  const inflight = pending.get(symbol);
  if (inflight) return inflight;
  const job = (async () => {
    await acquire();
    try {
      const response = await fetch("/finance-research/research-results/market/preview", {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ symbol: qualified }),
      });
      if (!response.ok) return null;
      const value = await response.json() as { payload?: { rows?: unknown } };
      return closesFromRows(value.payload?.rows);
    } catch { return null; } finally { release(); }
  })().then(result => { cache.set(symbol, result); pending.delete(symbol); return result; });
  pending.set(symbol, job);
  return job;
}

export function useCloseSeries(symbol: string, enabled = true): number[] | undefined {
  const [series, setSeries] = useState<number[] | undefined>(() => cache.get(symbol) ?? undefined);
  useEffect(() => {
    if (!enabled) return;
    let alive = true;
    void loadCloseSeries(symbol).then(value => { if (alive) setSeries(value ?? undefined); });
    return () => { alive = false; };
  }, [symbol, enabled]);
  return series;
}
