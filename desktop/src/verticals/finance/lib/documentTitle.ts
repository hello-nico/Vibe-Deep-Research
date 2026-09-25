const QUARTER_NAME: Record<string, string> = { Q1: '第一季度报告', Q3: '第三季度报告', H1: '半年度报告' };

/** "FY2025" → "2025 年年度报告", "2026H1" → "2026 年半年度报告"; unknown periods fall back to period + type. */
export function legacyReportTitle(period: string, kind: string): string {
  const annual = /^FY(\d{4})$/i.exec(period);
  if (annual) return `${annual[1]} 年年度报告`;
  const part = /^(\d{4})(Q1|Q3|H1)$/i.exec(period);
  if (part) return `${part[1]} 年${QUARTER_NAME[part[2]!.toUpperCase()]}`;
  return [period, kind].filter(Boolean).join(' ') || '未命名资料';
}

/** Older ingests kept a placeholder title ("legacy:…"); show a readable one instead. */
export function documentDisplayTitle(title: string | undefined, period: string | null | undefined, kind: string, company = ''): string {
  const raw = (title || '').trim();
  if (raw && !raw.startsWith('legacy:')) return raw;
  if (!raw) return '来源资料';
  return [company, legacyReportTitle(period || '', kind)].filter(Boolean).join(' ');
}
