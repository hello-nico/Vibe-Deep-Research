/** 行情、公告、新闻的页面适配器：经宿主 `/finance-research` 代理读 Backend 的公共接口（R1），本机不再取数。缺失数字保持 null。 */
import {
  currencyOfSymbol, marketOfSymbol, normalizeMarketSymbol,
  type CurrencyCode, type MarketCode,
} from "./marketSymbol.ts";
import { ApiError } from "./localService.ts";

export { ApiError };

export interface Quote {
  /** 报价源的取数时刻（Backend 的 as_of），不是浏览器收到回包的时间，也不是逐笔成交时间。 */
  fetched_at?: string | null;
  /** 全部可为 null：Backend 取不到的字段不编造，页面显示缺口而不是 0。 */
  name: string; price: number | null; last_close: number | null; change_pct: number | null;
  market: MarketCode; currency: CurrencyCode;
  pe_ttm: number | null; pb: number | null; mcap_yi: number | null; turnover_pct: number | null;
  limit_up: number | null; limit_down: number | null;
  float_mcap_yi: number | null;
  /** 成交额，元（Backend 已按元返回）。 */
  amount_yuan: number | null;
}

/** 关注公司公告。`document_id` 非空表示已在 Backend 入库，可在资料里打开。 */
export interface Announcement {
  symbol: string; title: string; published_at: string | null; url: string | null; document_id: string | null;
  /** Jev 判为例行（只在「查看全部」里出现）。 */
  routine?: boolean;
}

/** Backend 的 Jev 读到的这条新闻碰到公司哪个驱动与方向；没读到的新闻没有这个字段，页面用关键词结果。 */
export interface NewsFactor { driver: string; direction: "positive" | "negative" | "unclear"; p?: number | null }
export interface NewsItem {
  symbol: string; title: string; source: string | null; published_at: string | null; url: string | null;
  factor?: NewsFactor;
  /** 同一事件的另有几篇改写报道已合并到这一条。 */
  also?: number;
  /** 同一事件的新进展。 */
  follow_up?: boolean;
}

interface QuoteRow {
  symbol: string; name: string | null; price: number | null; change: number | null; change_pct: number | null;
  open: number | null; high: number | null; low: number | null; prev_close: number | null;
  limit_up: number | null; limit_down: number | null; volume: number | null; amount: number | null;
  market_cap: number | null; pe_ttm: number | null; as_of: string | null;
}

const YI = 1e8;
const nullable = (value: number | null | undefined): number | null => (typeof value === "number" && Number.isFinite(value) ? value : null);

/** 页面用 6 位代码；Backend 用 `600519.SH`。Backend 只提供 A 股报价，港美股不请求、也不显示报价。 */
export function qualified(code: string): string | null {
  const symbol = normalizeMarketSymbol(code);
  if (!symbol || marketOfSymbol(symbol) !== "CN") return null;
  const suffix = /^(?:92|4|8)/.test(symbol) ? "BJ" : /^[69]/.test(symbol) ? "SH" : "SZ";
  return `${symbol}.${suffix}`;
}

/** 经宿主代理读 Backend；失败带状态码抛 ApiError，页面据此区分“没数据”和“读不到”。 */
async function read<T>(route: string, params: Record<string, string>): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`/finance-research${route}?${new URLSearchParams(params)}`);
  } catch (error) {
    throw new ApiError(`连不上研究服务（${error instanceof Error ? error.message : String(error)}）`, 0, "network");
  }
  const raw = await response.text();
  let body: unknown = null;
  try { body = raw ? JSON.parse(raw) : null; } catch { /* 代理错误页是 HTML */ }
  if (!response.ok) {
    const detail = (body as { detail?: unknown } | null)?.detail;
    const message = typeof detail === "string" ? detail
      : detail && typeof detail === "object" && typeof (detail as { message?: unknown }).message === "string"
        ? (detail as { message: string }).message : `研究服务暂不可用（HTTP ${response.status}）`;
    throw new ApiError(message, response.status, String(response.status));
  }
  if (body === null || typeof body !== "object") throw new ApiError("行情服务返回了无法识别的内容", response.status, "bad_response");
  return body as T;
}

async function quoteMap(codes: string[]): Promise<Record<string, Quote>> {
  const requested = new Map<string, string>();
  for (const code of codes) {
    const symbol = normalizeMarketSymbol(code);
    const full = qualified(code);
    if (symbol && full) requested.set(full, symbol);
  }
  if (!requested.size) return {};
  const body = await read<{ quotes: QuoteRow[]; missing: string[] }>("/market/quotes", { symbols: [...requested.keys()].join(",") });
  const out: Record<string, Quote> = {};
  for (const row of body.quotes ?? []) {
    const symbol = requested.get(row.symbol);
    const market = symbol ? marketOfSymbol(symbol) : null;
    const currency = symbol ? currencyOfSymbol(symbol) : null;
    if (!symbol || !market || !currency) continue;
    const cap = nullable(row.market_cap);
    out[symbol] = {
      fetched_at: row.as_of ?? null,
      name: row.name ?? "",
      market, currency,
      price: nullable(row.price),
      last_close: nullable(row.prev_close),
      change_pct: nullable(row.change_pct),
      pe_ttm: nullable(row.pe_ttm), pb: null, turnover_pct: null,
      mcap_yi: cap === null ? null : cap / YI,
      limit_up: nullable(row.limit_up),
      limit_down: nullable(row.limit_down),
      float_mcap_yi: null,
      amount_yuan: nullable(row.amount),
    };
  }
  return out;
}

/** 资讯在浏览器内存里缓存 30 分钟（刷新页面即清空）；键为接口 + 规范化代码 + limit，失败不缓存。 */
export const FEED_CACHE_MS = 30 * 60 * 1000;
const feedCache = new Map<string, { at: number; items: unknown[]; hidden: number }>();
export interface FeedOptions { /** 绕过缓存重取，并覆盖缓存。 */ force?: boolean; /** 公告：连 Jev 判为例行的一起要。 */ all?: boolean }

function feedKey(route: string, codes: string[], limit: number, all = false): { key: string; symbols: string[] } {
  const symbols = [...new Set(codes.map(qualified).filter((code): code is string => code !== null))];
  return { key: `${route}|${[...symbols].sort().join(",")}|${limit}${all ? "|all" : ""}`, symbols };
}
/** 公告里被 Jev 隐藏的例行条数（读最近一次不带 all 的结果）；没有缓存为 0。 */
export function feedHidden(codes: string[], limit: number): number {
  return (feedCache.get(feedKey("/feed/announcements", codes, limit).key) ?? feedCache.get(feedKey("/feed/announcements", codes, limit, true).key))?.hidden ?? 0;
}

/** 该组合缓存写入的时刻（毫秒）；没有有效缓存时为 null。页面据此显示「更新于 HH:MM」。 */
export function feedCachedAt(route: "/feed/announcements" | "/feed/news", codes: string[], limit: number, all = false): number | null {
  const hit = feedCache.get(feedKey(route, codes, limit, all).key);
  return hit && Date.now() - hit.at < FEED_CACHE_MS ? hit.at : null;
}

/** 仅测试用：清空缓存。 */
export function clearFeedCache(): void { feedCache.clear(); }

async function feedItems<T>(route: "/feed/announcements" | "/feed/news", codes: string[], limit: number, options: FeedOptions = {}): Promise<T[]> {
  const all = route === "/feed/announcements" && options.all === true;
  const { key, symbols } = feedKey(route, codes, limit, all);
  if (!symbols.length) return [];
  const hit = feedCache.get(key);
  if (!options.force && hit && Date.now() - hit.at < FEED_CACHE_MS) return hit.items as T[];
  const body = await read<{ items: T[]; hidden?: number }>(route, { symbols: symbols.join(","), limit: String(limit), ...(all ? { all: "1" } : {}) });
  const items = body.items ?? [];
  feedCache.set(key, { at: Date.now(), items, hidden: typeof body.hidden === "number" ? body.hidden : 0 });
  return items;
}

export const api = {
  /** 报价；Backend 自带 3 秒共享缓存，不需要也不支持强制刷新。 */
  quote: (codes: string) => quoteMap(codes.split(",").map((c) => c.trim()).filter(Boolean)),
  announcements: (codes: string[], limit = 20, options?: FeedOptions) => feedItems<Announcement>("/feed/announcements", codes, limit, options),
  news: (codes: string[], limit = 20, options?: FeedOptions) => feedItems<NewsItem>("/feed/news", codes, limit, options),
};
