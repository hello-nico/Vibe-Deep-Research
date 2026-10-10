import { normalizeMarketSymbol } from './marketSymbol';
import { symbolFromCompanySlug } from './research';

/** 个股页地址：`/watch/<symbol>`，symbol 为台账规范形（A 股 6 位）。 */
export const watchPath = (symbol: string) => `/watch/${encodeURIComponent(symbol)}`;
/** 研究页地址里的公司对象（Wiki slug 或代码）→ 个股页；认不出代码时回到关注列表。 */
export function watchPathOfCompany(slugOrSymbol: string) {
  const symbol = symbolFromCompanySlug(slugOrSymbol) ?? normalizeMarketSymbol(slugOrSymbol);
  return symbol ? watchPath(symbol) : '/watch';
}
export const insightsTopicPath = (hex: string) => `/insights/topics/${hex}`;

/**
 * 旧地址 → 新地址（六入口收敛）。返回 null 表示不是旧地址。
 * `/evidence` 深链不在此列，保持原样。
 */
export function legacyRedirect(pathname: string, search = ''): string | null {
  const params = new URLSearchParams(search);
  const path = pathname.replace(/\/+$/, '') || '/';
  if (path === '/watchlist') return '/watch';
  if (path === '/research') {
    const company = params.get('company');
    return company ? watchPathOfCompany(company) : '/watch';
  }
  if (path === '/daily-review') return '/feed?tab=market';
  if (path === '/intel') return '/feed?tab=intel';
  const intel = /^\/intel\/([^/]+)$/.exec(path);
  if (intel) return `/feed?tab=intel&sub=${intel[1]}`;
  if (path === '/my-research') return `/insights${search}`;
  const topic = /^\/my-research\/topics\/([^/]+)$/.exec(path);
  if (topic) return `/insights/topics/${topic[1]}${search}`;
  if (path.startsWith('/my-research/')) return '/insights';
  return null;
}
