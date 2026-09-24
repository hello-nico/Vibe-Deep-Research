export { normalizeResearchTarget, objectHref as researchObjectHref } from './objectRegistry';

export function isBareCompanyCode(name: string | undefined, symbol: string): boolean {
  const text = (name || '').trim();
  return !text || text === symbol || /^\d{6}(?:\.(SH|SZ|BJ))?$/i.test(text);
}

export function wikiPageTitle(page: { spec?: { title?: string } } | null | undefined, fallback: string): string {
  const title = page?.spec?.title?.trim();
  return title || fallback;
}
