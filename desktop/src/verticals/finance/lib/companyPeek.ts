import { financialNumber } from "./financialDisplay";
import { providerName, truncateDecimal } from "./wikiFacts";

const PEEK_METRICS = ["pe_ttm", "pb", "ps_ttm", "pcf_ttm", "revenue", "net_profit_attributable", "net_profit", "roe"] as const;
export const PEEK_LABELS: Record<string, string> = {
  pe_ttm: "市盈率 TTM",
  pb: "市净率",
  ps_ttm: "市销率 TTM",
  pcf_ttm: "市现率 TTM",
  revenue: "营业收入",
  net_profit_attributable: "归母净利润",
  net_profit: "净利润",
  roe: "净资产收益率",
};

export type CompanyPeekSnapshot = {
  symbol: string;
  as_of: string;
  sections: Record<string, { status: string; data?: Record<string, unknown> | null; error?: string }>;
};

export type CompanyPeekRow = { key: string; label: string; value: string; period?: string };

export function peekNumber(raw: unknown, unit: string): string {
  const numeric = typeof raw === "number" ? raw : Number(String(raw ?? "").trim());
  if (!Number.isFinite(numeric)) return "未获取";
  if (unit === "元") return `${financialNumber(truncateDecimal(numeric / 100_000_000))} 亿`;
  if (unit === "%" || unit === "百分比") return `${financialNumber(truncateDecimal(numeric))}%`;
  return financialNumber(truncateDecimal(numeric));
}

export function periodHint(period: unknown): string {
  const text = String(period || "").replace(/\s*年初至今\s*/g, "").trim();
  return /^\d{4}-\d{2}-\d{2}/.test(text) ? text.slice(0, 10) : text;
}

export function peekAsOf(snapshot: CompanyPeekSnapshot): string {
  return periodHint(snapshot.as_of);
}

export function peekReportPeriod(snapshot: CompanyPeekSnapshot): string {
  return peekRows(snapshot).find(row => row.period)?.period || "";
}

export function peekIdentityLine(code: string, snapshot: CompanyPeekSnapshot | null): string {
  return [code, snapshot ? peekSource(snapshot) : ""].filter(Boolean).join(" · ");
}

export function peekTimeLine(snapshot: CompanyPeekSnapshot | null): string {
  if (!snapshot) return "";
  const asOf = peekAsOf(snapshot);
  const reportPeriod = peekReportPeriod(snapshot);
  return [
    asOf ? `截至 ${asOf}` : "",
    reportPeriod && reportPeriod !== asOf ? `报告期 ${reportPeriod}` : "",
  ].filter(Boolean).join(" · ");
}

export function peekRows(snapshot: CompanyPeekSnapshot): CompanyPeekRow[] {
  const valuation = snapshot.sections.valuation?.data;
  const values = valuation?.values && typeof valuation.values === "object" ? valuation.values as Record<string, unknown> : {};
  const statements = Array.isArray(snapshot.sections.financials?.data?.items)
    ? snapshot.sections.financials!.data!.items.filter((item): item is Record<string, unknown> => !!item && typeof item === "object")
    : [];
  const rows: CompanyPeekRow[] = [];
  for (const metric of PEEK_METRICS) {
    if (metric in values) {
      rows.push({ key: metric, label: PEEK_LABELS[metric]!, value: peekNumber(values[metric], "倍") });
      continue;
    }
    const item = statements.find(row => row.metric === metric);
    if (!item || (metric === "net_profit" && statements.some(row => row.metric === "net_profit_attributable"))) continue;
    rows.push({
      key: metric,
      label: PEEK_LABELS[metric]!,
      value: peekNumber(item.value, String(item.unit || "元")),
      period: periodHint(item.period),
    });
  }
  return rows;
}

const AGGREGATORS = new Set(["composite", "company_financials", "company_market"]);

function collectProviders(snapshot: CompanyPeekSnapshot): string[] {
  const ids: string[] = [];
  const valuation = snapshot.sections.valuation?.data;
  if (valuation?.source) ids.push(String(valuation.source));
  const fields = valuation?.fields && typeof valuation.fields === "object" ? Object.values(valuation.fields) : [];
  for (const field of fields) {
    if (field && typeof field === "object" && field.source) ids.push(String(field.source));
  }
  const items = Array.isArray(snapshot.sections.financials?.data?.items) ? snapshot.sections.financials!.data!.items : [];
  for (const item of items) {
    if (item && typeof item === "object" && item.provider) ids.push(String(item.provider));
  }
  const fallback = snapshot.sections.financials?.data?.provider;
  if (fallback) ids.push(String(fallback));
  return [...new Set(ids.map(id => id.trim()).filter(id => id && !AGGREGATORS.has(id)))];
}

export function peekSource(snapshot: CompanyPeekSnapshot): string {
  return collectProviders(snapshot).map(providerName).filter(Boolean).join(" / ");
}
