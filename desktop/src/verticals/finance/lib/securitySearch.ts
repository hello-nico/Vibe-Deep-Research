import { researchRead } from './research';
import { marketOfSymbol, normalizeMarketSymbol, parseMarketSymbols } from './marketSymbol';

/** Backend `GET /securities/search` 的一行；`symbol` 带交易所后缀（600547.SH）。 */
export interface SecurityHit { symbol: string; name: string; exchange: string; match?: string }
export const SECURITY_SEARCH_LIMIT = 5;
export const SECURITY_SEARCH_DELAY_MS = 250;

type Read = <T>(route: string, init?: RequestInit) => Promise<T>;

/** 按名称或代码找 A 股；名单没拉到（503）或网络失败返回 null，由页面当作「没有候选」，不报错。 */
export async function searchSecurities(q: string, signal?: AbortSignal, read: Read = researchRead): Promise<SecurityHit[] | null> {
  const text = q.trim();
  if (!text) return [];
  try {
    const body = await read<{ items?: SecurityHit[] }>(`/securities/search?${new URLSearchParams({ q: text, limit: String(SECURITY_SEARCH_LIMIT) })}`, { signal });
    return Array.isArray(body?.items) ? body.items.slice(0, SECURITY_SEARCH_LIMIT) : null;
  } catch (error) {
    if (signal?.aborted) throw error;
    return null;
  }
}

/** 后端代码 → 产品里统一的代码（600547.SH → 600547）。 */
export const hitSymbol = (hit: SecurityHit) => normalizeMarketSymbol(hit.symbol);

/**
 * 只输入一个港股或美股代码时给「加入 AAPL」。1–4 位纯数字多半是还没输完的 A 股代码，美股代码最多 5 位字母，
 * 避免把拼音或半截输入当成代码。
 */
export function lonelyForeignCode(raw: string): string | null {
  const token = raw.trim();
  if (!token || /[\s,，、;；]/.test(token)) return null;
  const symbol = normalizeMarketSymbol(token);
  const market = symbol ? marketOfSymbol(symbol) : null;
  if (market === 'HK') return /^hk|\.hk$/i.test(token) || /^\d{5}$/.test(token) ? symbol : null;
  if (market === 'US') return /^[A-Za-z][A-Za-z0-9]{0,4}(?:[.-][A-Za-z0-9]{1,4})?$/.test(token) ? symbol : null;
  return null;
}

/** 粘贴了多个代码（2 个及以上）时的全部代码；否则为空。 */
export function pastedCodes(raw: string): string[] {
  const codes = parseMarketSymbols(raw);
  return codes.length >= 2 ? codes : [];
}
