import type { PageAssistantObject } from '../../../core/ai/pageContext';

function qualifyAShare(symbol: string): string | null {
  if (/^\d{6}\.(SH|SZ|BJ)$/.test(symbol)) return symbol;
  if (!/^\d{6}$/.test(symbol)) return null;
  const exchange = /^[569]/.test(symbol) ? 'SH' : /^[48]/.test(symbol) ? 'BJ' : 'SZ';
  return `${symbol}.${exchange}`;
}

const HTTP_URL = /^https?:\/\//i;
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
