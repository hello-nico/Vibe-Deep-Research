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

export function clipCompanyOneLiner(text?: string | null, max = 60): string | null {
  const value = (text || '').replace(/\s+/g, ' ').trim();
  if (!value) return null;
  return value.length > max ? `${value.slice(0, max)}…` : value;
}
