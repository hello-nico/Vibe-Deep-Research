export interface CompanyPageSummary {
  industry: string | null;
  industry_code: string | null;
  parent_industry: string | null;
  one_liner: string | null;
  as_of: string | null;
}

export function companyIndustryLabel(summary?: CompanyPageSummary | null): string | null {
  const name = summary?.industry?.trim() || summary?.parent_industry?.trim() || '';
  return name || null;
}

export function companyAsOfLabel(asOf?: string | null): string | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(asOf || '');
  return match ? `${match[2]}-${match[3]}` : null;
}

/**
 * 最近一次核对（研究结束、刷新资料检查）晚于资料日期时返回核对日 MM-DD；
 * 没有新资料时“资料截至”不变，用它说明最近检查过。按本地日期比较。
 */
export function companyCheckedLabel(asOf: string | null | undefined, checkedTimes: readonly (string | null | undefined)[]): string | null {
  const day = (time: Date) => `${time.getFullYear()}-${String(time.getMonth() + 1).padStart(2, '0')}-${String(time.getDate()).padStart(2, '0')}`;
  const latest = checkedTimes.map(time => new Date(time || '')).filter(time => !Number.isNaN(time.getTime()))
    .sort((a, b) => b.getTime() - a.getTime())[0];
  if (!latest) return null;
  const checked = day(latest);
  const base = /^(\d{4}-\d{2}-\d{2})/.exec(asOf || '')?.[1];
  return base && checked <= base ? null : checked.slice(5);
}

export function clipCompanyOneLiner(text?: string | null, max = 60): string | null {
  const value = (text || '').replace(/\s+/g, ' ').trim();
  if (!value) return null;
  return value.length > max ? `${value.slice(0, max)}…` : value;
}
