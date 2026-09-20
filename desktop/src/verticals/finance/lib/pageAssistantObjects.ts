import type { PageAssistantObject } from '../../../core/ai/pageContext';

function qualifyAShare(symbol: string): string | null {
  if (/^\d{6}\.(SH|SZ|BJ)$/.test(symbol)) return symbol;
  if (!/^\d{6}$/.test(symbol)) return null;
  const exchange = /^[569]/.test(symbol) ? 'SH' : /^[48]/.test(symbol) ? 'BJ' : 'SZ';
  return `${symbol}.${exchange}`;
}

const HTTP_URL = /^https?:\/\//i;
const MARKET_INDEX_IDS: Record<string, string> = {
  上证指数: '000001.SH',
  沪深300: '000300.SH',
  深证成指: '399001.SZ',
  创业板指: '399006.SZ',
};

export function urlAssistantObject(input: {
  title: string;
  url?: string;
  source?: string;
  time?: string;
  section?: string;
}): PageAssistantObject | null {
  const url = (input.url || '').trim();
  if (!HTTP_URL.test(url)) return null;
  return {
    kind: 'url',
    id: `url:${url}`,
    label: input.title || url,
    url,
    source: input.source,
    time: input.time,
    hint: [input.source, input.time].filter(Boolean).join(' · ') || undefined,
    section: input.section,
    readable: true,
  };
}

export function wikiAssistantObject(input: {
  slug: string;
  title: string;
  inputHash?: string;
  section?: string;
}): PageAssistantObject | null {
  const slug = (input.slug || '').trim();
  if (!slug || slug.includes('..')) return null;
  const id = input.inputHash ? `${slug}@${input.inputHash}` : slug;
  return {
    kind: 'wiki',
    id,
    label: input.title || slug,
    version: input.inputHash,
    section: input.section,
    readable: true,
  };
}

export function marketAssistantObject(input: {
  name: string;
  code?: string;
  asOf?: string;
}): PageAssistantObject | null {
  const id = input.code || MARKET_INDEX_IDS[input.name];
  if (!id || !/^(\d{6}\.(SH|SZ))$/.test(id)) return null;
  return {
    kind: 'market',
    id: `market:${id}`,
    label: input.name || id,
    locator: id,
    hint: input.asOf ? `观察范围 ${input.asOf}` : '宽基指数',
    section: '指数',
    readable: true,
  };
}

export function marketIndicesObject(members: PageAssistantObject[]): PageAssistantObject | null {
  if (!members.length) return null;
  return {
    kind: 'market',
    id: 'market:indices',
    label: '宽基指数集合',
    hint: members.map(item => item.label).join('、'),
    section: '指数',
    readable: true,
  };
}

export function profileAssistantObject(input: {
  code: string;
  name: string;
  profileRef?: string;
  sha256?: string;
}): PageAssistantObject | null {
  const ref = input.profileRef
    || (input.sha256 && /^[a-f0-9]{64}$/.test(input.sha256)
      ? `profile:sw2:${input.code.toUpperCase()}:${input.sha256}`
      : '');
  if (!/^profile:sw2:[0-9A-Z.]+:[a-f0-9]{64}$/.test(ref)) return null;
  return {
    kind: 'profile',
    id: ref,
    label: input.name || input.code,
    version: ref.split(':').pop(),
    section: '产业研究',
    hint: input.code,
    readable: true,
  };
}

export function companyQuoteObject(input: {
  symbol: string;
  name: string;
  asOf?: string;
  section?: string;
}): PageAssistantObject | null {
  const raw = input.symbol.startsWith('company:') ? input.symbol.slice('company:'.length) : input.symbol;
  const symbol = qualifyAShare(raw);
  if (!symbol) return null;
  return {
    kind: 'company',
    id: `company:${symbol}`,
    label: input.name || symbol,
    locator: symbol,
    hint: [symbol, input.asOf ? `观察范围 ${input.asOf}` : ''].filter(Boolean).join(' · '),
    section: input.section || '行情',
    readable: true,
  };
}

export function dailyReviewQuoteObjects(input: {
  asOf?: string;
  lianban?: { code: string; name: string }[];
  turnover?: { code: string; name: string }[];
}): PageAssistantObject[] {
  const seen = new Set<string>();
  const out: PageAssistantObject[] = [];
  for (const item of [
    ...(input.lianban || []).map(row => ({ ...row, section: '连板股' })),
    ...(input.turnover || []).map(row => ({ ...row, section: '成交额' })),
  ]) {
    const object = companyQuoteObject({ symbol: item.code, name: item.name, asOf: input.asOf, section: item.section });
    if (!object || seen.has(object.id)) continue;
    seen.add(object.id);
    out.push(object);
  }
  return out;
}
