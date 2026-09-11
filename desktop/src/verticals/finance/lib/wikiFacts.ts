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

const FINANCIAL_PATHS: Record<string, string> = {
  revenue: '/api/a-share/financials/income-statements',
  net_profit_attributable: '/api/a-share/financials/income-statements',
  operating_cash_flow: '/api/a-share/financials/cash-flow-statements',
  total_assets: '/api/a-share/financials/balance-sheets',
  total_liabilities: '/api/a-share/financials/balance-sheets',
};

const HITHINK_VALUATION = new Set(['pe_ttm', 'pe_mrq', 'pb', 'ps_ttm', 'pcf_ttm']);

type ProviderProfile = { name: string; summary: string };
type ProviderInterface = { method: string; url: string; docs?: string; note?: string };

const PROVIDERS: Record<string, ProviderProfile> = {
  hithink: {
    name: '扶摇',
    summary: '同花顺扶摇金融数据 REST，由本机研究服务读取。',
  },
  tencent: {
    name: '腾讯财经',
    summary: '腾讯公开行情快照，用于估值倍数补缺。',
  },
  sina: {
    name: '新浪财经',
    summary: '新浪公开合并报表接口，用于三表补缺；字段按报表项目标题对齐。',
  },
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

export interface ProviderDisclosure {
  name: string;
  summary: string;
  method?: string;
  endpoint?: string;
  docs?: string;
  note?: string;
  symbol?: string;
  label: string;
  basis?: string;
  observed?: string;
  stale: boolean;
}

export function providerDisclosure(item: Record<string, unknown>): ProviderDisclosure | null {
  if (item.source !== 'provider') return null;
  const id = String(item.provider || '').trim();
  const profile = PROVIDERS[id];
  const iface = resolveInterface(item, id);
  const period = String(item.period || '').trim();
  const unit = String(item.unit || '').trim();
  const observed = String(item.observed_at || '').replace('T', ' ').slice(0, 19);
  return {
    name: textField(item.provider_name) || profile?.name || id || '数据服务',
    summary: textField(item.provider_summary) || profile?.summary || '当前未登记该数据服务的公开接口与说明。后续 Provider 按同一套字段披露。',
    method: iface?.method,
    endpoint: publicUrl(item.endpoint) || iface?.url,
    docs: publicUrl(item.docs_url) || iface?.docs,
    note: textField(item.endpoint_note) || iface?.note,
    symbol: factSymbol(item),
    label: factLabel(item),
    basis: [period, unit].filter(Boolean).join(' · ') || undefined,
    observed: observed || undefined,
    stale: Boolean(item.stale),
  };
}

export function providerSnapshot(item: Record<string, unknown>): string {
  const disclosure = providerDisclosure(item);
  if (!disclosure) return '';
  const lines = [`**${disclosure.name}**`, '', disclosure.summary, ''];
  const fields: [string, string][] = [];
  if (disclosure.endpoint) fields.push(['接口', `${disclosure.method || 'GET'} ${disclosure.endpoint}`]);
  if (disclosure.note) fields.push(['接口说明', disclosure.note]);
  if (disclosure.symbol) fields.push(['标的', disclosure.symbol]);
  fields.push(['指标', disclosure.label]);
  if (disclosure.basis) fields.push(['口径', disclosure.basis]);
  if (disclosure.observed) fields.push(['数据截至', disclosure.observed]);
  if (disclosure.docs) fields.push(['公开说明', disclosure.docs]);
  if (disclosure.stale) fields.push(['状态', '本次未更新，保留原值']);
  lines.push(...fields.map(([key, value]) => `- ${key}：${key === '接口' ? `\`${value}\`` : value}`));
  return lines.join('\n');
}

export function factItems(content?: Record<string, unknown>): Record<string, unknown>[] {
  return Array.isArray(content?.items) ? content.items.filter((item): item is Record<string, unknown> => !!item && typeof item === 'object') : [];
}

function resolveInterface(item: Record<string, unknown>, id: string): ProviderInterface | undefined {
  const metric = String(item.metric || '');
  const symbol = factSymbol(item);
  if (id === 'hithink') {
    if (HITHINK_VALUATION.has(metric)) {
      const query = symbol ? `?thscodes=${encodeURIComponent(symbol)}` : '';
      return {
        method: 'GET',
        url: `https://fuyao.aicubes.cn/api/a-share/valuations/snapshot${query}`,
        docs: 'https://fuyao.aicubes.cn/docs/api-reference/valuations/',
        note: 'A 股估值快照',
      };
    }
    const path = FINANCIAL_PATHS[metric];
    if (path) {
      const query = symbol ? `?thscode=${encodeURIComponent(symbol)}` : '';
      return {
        method: 'GET',
        url: `https://fuyao.aicubes.cn${path}${query}`,
        docs: 'https://fuyao.aicubes.cn/docs/api-reference/financials/',
        note: 'A 股财务报表',
      };
    }
  }
  if (id === 'tencent') {
    const query = symbol ? tencentQuery(symbol) : '{市场}{代码}';
    return { method: 'GET', url: `https://qt.gtimg.cn/q=${query}`, note: '腾讯行情快照' };
  }
  if (id === 'sina') {
    return {
      method: 'GET',
      url: 'https://quotes.sina.cn/cn/api/openapi.php/CompanyFinanceService.getFinanceReport2022',
      note: '新浪合并报表',
    };
  }
  return undefined;
}

function factSymbol(item: Record<string, unknown>): string | undefined {
  const match = /^provider:[^:]+:(\d{6}\.(?:SH|SZ|BJ)):/.exec(String(item.ref || ''));
  return match?.[1];
}

function tencentQuery(symbol: string): string {
  const [code, market] = symbol.split('.');
  return `${(market || '').toLowerCase()}${code || ''}`;
}

function textField(value: unknown): string | undefined {
  const text = typeof value === 'string' ? value.trim() : '';
  return text || undefined;
}

function publicUrl(value: unknown): string | undefined {
  const text = String(value || '').trim();
  if (/^https:\/\//i.test(text) || /^http:\/\//i.test(text)) return text;
  if (text.startsWith('/') && !text.startsWith('//')) return text;
  return undefined;
}
