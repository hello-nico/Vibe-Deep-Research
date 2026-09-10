const METRIC_LABELS: Record<string, string> = {
  revenue: '营业收入',
  net_profit: '净利润',
  net_profit_attributable: '归母净利润',
  profit_before_tax: '利润总额',
  operating_cash_flow: '经营活动现金流',
  total_assets: '总资产',
  total_liabilities: '总负债',
  cash_dividend: '现金分红',
  dividend_per_share: '每股股息',
  eps: '每股收益',
  roe: '净资产收益率',
  pe_ttm: '市盈率（TTM）',
  pe_mrq: '市盈率（MRQ）',
  ps_ttm: '市销率（TTM）',
  pcf_ttm: '市现率（TTM）',
  pb: '市净率',
  market_cap: '总市值',
  dividend_yield: '股息率',
};

const PROVIDER_LABELS: Record<string, string> = {
  hithink: '扶摇',
  tencent: '腾讯财经',
  sina: '新浪财经',
};

export const FACT_SECTIONS: Record<string, string> = {
  财务: 'financial_facts',
  估值: 'valuation_facts',
};

export function truncateDecimal(value: string | number, places = 2): string {
  const text = typeof value === 'number' && Number.isFinite(value) ? String(value) : String(value).trim();
  if (!/^-?(?:\d+)(?:\.\d+)?$/.test(text)) return text;
  const negative = text.startsWith('-');
  const unsigned = negative ? text.slice(1) : text;
  const [whole, fraction = ''] = unsigned.split('.');
  return `${negative ? '-' : ''}${whole}.${fraction.slice(0, places).padEnd(places, '0')}`;
}

export function formatFactValue(item: Record<string, unknown>): string {
  const unit = String(item.unit ?? '').trim();
  const raw = item.value;
  const numeric = typeof raw === 'number' ? raw : Number(String(raw ?? '').trim());
  if (!Number.isFinite(numeric)) return [raw == null ? '' : String(raw), unit].filter(Boolean).join(' ');
  if (unit === '元' && Math.abs(numeric) >= 100_000_000) return `${truncateDecimal(numeric / 100_000_000)} 亿元`;
  return `${truncateDecimal(numeric)} ${unit}`.trim();
}

export function factLabel(item: Record<string, unknown>): string {
  const metric = String(item.metric || '未命名指标');
  const label = METRIC_LABELS[metric] || metric;
  const period = String(item.period || '').trim();
  return period ? `${period} ${label}` : label;
}

export function providerSnapshot(item: Record<string, unknown>): string {
  if (item.source !== 'provider') return '';
  const source = PROVIDER_LABELS[String(item.provider || '')] || '数据服务';
  const observed = String(item.observed_at || '').replace('T', ' ').slice(0, 19);
  const lines = [`来源：${source}`];
  if (observed) lines.push(`数据截至：${observed}`);
  if (item.stale) lines.push('本次未更新，保留原值');
  return lines.join('\n');
}

export function factItems(content?: Record<string, unknown>): Record<string, unknown>[] {
  return Array.isArray(content?.items) ? content.items.filter((item): item is Record<string, unknown> => !!item && typeof item === 'object') : [];
}
