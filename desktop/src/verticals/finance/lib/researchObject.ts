/** 研究任务 / 过程面板跳转：按对象 slug 生成公司或行业研究页链接。 */
import { companySlug } from './researchSymbol.ts';

/** 旧记录 `companies/600309`、裸代码或带交易所后缀，一律收成完整公司 slug。 */
export function normalizeResearchTarget(target: string): string | undefined {
  const text = String(target || '').trim();
  if (!text) return undefined;
  if (text.startsWith('industries/')) return text;
  const full = /^companies\/(\d{6})-(sh|sz|bj)$/i.exec(text);
  if (full?.[1] && full[2]) return `companies/${full[1]}-${full[2].toLowerCase()}`;
  const code = text.replace(/^companies\//, '').replace(/\.(SH|SZ|BJ)$/i, '');
  const fromCode = companySlug(code);
  if (fromCode) return fromCode;
  if (text.startsWith('companies/')) return text;
  return undefined;
}

/** 公司 → `/research?company=<完整 slug>`；行业 → `/sectors/<短名>`（与 IndustryCenter 卡片一致）。 */
export function researchObjectHref(target: string): string | undefined {
  const slug = normalizeResearchTarget(target);
  if (!slug) return undefined;
  if (slug.startsWith('companies/')) return `/research?company=${encodeURIComponent(slug)}`;
  if (slug.startsWith('industries/')) {
    const key = slug.replace(/^industries\/(?:nbs-)?/, '');
    return key ? `/sectors/${encodeURIComponent(key)}` : undefined;
  }
  return undefined;
}

export function isBareCompanyCode(name: string | undefined, symbol: string): boolean {
  const text = (name || '').trim();
  return !text || text === symbol || /^\d{6}(?:\.(SH|SZ|BJ))?$/i.test(text);
}

export function wikiPageTitle(page: { spec?: { title?: string } } | null | undefined, fallback: string): string {
  const title = page?.spec?.title?.trim();
  return title || fallback;
}
