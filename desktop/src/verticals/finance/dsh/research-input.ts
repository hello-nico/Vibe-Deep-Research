import type { InputTriggerSource } from '@deepseek-ai/dsh-client-ui-input-trigger/client';
import { researchRead, ResearchError, aShareQualified, type ResearchTopicSummary, type WikiItem } from '../lib/research';
import { decodeEvidenceLink } from '../lib/evidence';
import { documentIdFromRef, listLibraryDocuments, mentionLabel, parseDocumentRef, documentRef, rememberMentionLabel, type LibraryDocument } from '../lib/library';
import { api } from '../lib/api';
import { loadWatch } from '../lib/watchlist';
import { loadRoster } from '../lib/researchRoster';

const MARKET_INDICES = [
  { id: '000001.SH', name: '上证指数' },
  { id: '000300.SH', name: '沪深300' },
  { id: '399001.SZ', name: '深证成指' },
  { id: '399006.SZ', name: '创业板指' },
] as const;
const DATE_CHIP = /^(\d{4}-\d{2}-\d{2})$/;
const COMPANY_SLUG = /^companies\/(\d{6})-(sh|sz|bj)$/;
const PROFILE_REF = /^profile:sw2:([0-9A-Z.]+):([a-f0-9]{64})$/;

export function researchTarget(value: string): {
  kind: 'evidence' | 'wiki' | 'topic' | 'document' | 'url' | 'company' | 'market' | 'profile' | 'date';
  id: string;
  parse_revision_id?: string;
  parsed_content_sha256?: string;
  input_hash?: string;
} | null {
  const evidence = decodeEvidenceLink(value);
  if (evidence) return { kind: 'evidence', id: evidence };
  if (/^(claim|evidence|source|provider|lookup):[^\s<>]+$/.test(value)) return { kind: 'evidence', id: value };
  if (/^topic:[a-f0-9]{12}$/.test(value)) return { kind: 'topic', id: value };
  if (/^company:\d{6}\.(SH|SZ|BJ)$/.test(value)) return { kind: 'company', id: value.slice('company:'.length) };
  if (/^market:(indices|\d{6}\.(SH|SZ))$/.test(value)) return { kind: 'market', id: value.slice('market:'.length) };
  if (PROFILE_REF.test(value)) return { kind: 'profile', id: value };
  if (/^date:\d{4}-\d{2}-\d{2}$/.test(value)) return { kind: 'date', id: value.slice(5) };
  if (DATE_CHIP.test(value)) return { kind: 'date', id: value };
  if (value.startsWith('url:') && /^https?:\/\//.test(value.slice(4))) return { kind: 'url', id: value.slice(4) };
  if (/^https?:\/\//.test(value)) return { kind: 'url', id: value };
  const document = parseDocumentRef(value);
  if (document) return { kind: 'document', id: documentRef(document.document_id, document.parse_revision_id, document.parsed_content_sha256), parse_revision_id: document.parse_revision_id, parsed_content_sha256: document.parsed_content_sha256 };
  const wiki = /^(companies|industries|themes|comparisons)\/[^/\s?#<>@]+(?:@([a-f0-9]{64}))?$/.exec(value);
  if (wiki && !value.includes('..')) return { kind: 'wiki', id: value.replace(/@[a-f0-9]{64}$/, ''), ...(wiki[2] ? { input_hash: wiki[2] } : {}) };
  return null;
}

const categories = [
  ['topics', '议题'], ['companies', '公司'], ['industries', '行业'], ['comparisons', '对比'], ['themes', '主题'],
] as const;

function documentHint(item: LibraryDocument): string {
  const kind = item.extra.content_type === 'pdf' ? 'PDF' : item.extra.content_type === 'markdown' ? 'MD' : item.extra.content_type === 'text' ? 'TXT' : '资料';
  const status = item.has_parsed ? '可引用' : item.extra.parse_error ? '处理失败' : '处理中';
  return `${kind} · ${status}`;
}

function citedDocument(title: string, ref: string, suffix = ''): string {
  rememberMentionLabel(ref, title);
  rememberMentionLabel(documentIdFromRef(ref) || ref, title);
  return `引用资料：${title} \`${ref}\`${suffix}`;
}

function wikiValue(item: { slug: string; input_hash?: string }): string {
  return item.input_hash ? `${item.slug}@${item.input_hash}` : item.slug;
}

async function serializeDocument(ref: string, signal: AbortSignal): Promise<string> {
  const parsed = parseDocumentRef(ref);
  const id = parsed?.document_id || documentIdFromRef(ref);
  if (!id) throw new Error('无法读取所选资料，请重新选择。');
  let doc: LibraryDocument;
  try {
    doc = await researchRead<LibraryDocument>(`/documents/${encodeURIComponent(id)}`, { signal });
  } catch (error) {
    if (error instanceof ResearchError && error.status === 404) {
      return `引用资料：该资料已从我的资料移除，无法打开原件 \`${documentRef(id)}\``;
    }
    throw error;
  }
  const title = doc.title || '未命名资料';
  rememberMentionLabel(documentRef(id, parsed?.parse_revision_id, parsed?.parsed_content_sha256), title);
  rememberMentionLabel(id, title);
  const listed = await researchRead<{ revisions: { status?: string; parse_revision_id?: string; parsed_content_sha256?: string }[] }>(
    `/documents/${encodeURIComponent(id)}/revisions`, { signal },
  );
  if (parsed?.parse_revision_id && parsed.parsed_content_sha256) {
    const pinned = listed.revisions.find(item => item.parse_revision_id === parsed.parse_revision_id
      && (item.parsed_content_sha256 === parsed.parsed_content_sha256));
    if (!pinned) return citedDocument(title, ref, '（发送时绑定的解析版本已不可用，不能按正文引用）');
    return citedDocument(title, documentRef(id, pinned.parse_revision_id, pinned.parsed_content_sha256));
  }
  const active = listed.revisions.find(item => item.status === 'active') || listed.revisions[0];
  if (doc.has_parsed && active?.parse_revision_id && active.parsed_content_sha256) {
    return citedDocument(title, documentRef(id, active.parse_revision_id, active.parsed_content_sha256));
  }
  return citedDocument(title, documentRef(id), '（原件已保存，正文尚未解析，不能按正文引用）');
}

function marketLabel(id: string): string {
  if (id === 'indices') return '宽基指数集合';
  return MARKET_INDICES.find(item => item.id === id)?.name || id;
}

function wikiCompanies(items: WikiItem[]): { code: string; name: string; symbol: string }[] {
  return items.flatMap(item => {
    const match = COMPANY_SLUG.exec(item.slug);
    if (!match?.[1] || !match[2]) return [];
    return [{ code: match[1], name: item.title, symbol: `${match[1]}.${match[2].toUpperCase()}` }];
  });
}

async function listedCompanies(signal: AbortSignal): Promise<{ code: string; name: string; symbol: string }[]> {
  const codes = [...new Set([...loadWatch(), ...loadRoster()])];
  if (!codes.length) return [];
  let quotes: Record<string, { name?: string }> = {};
  try { quotes = await api.quote(codes.join(',')); } catch { quotes = {}; }
  if (signal.aborted) return [];
  return codes.flatMap(code => {
    const six = (aShareQualified(code) || code).replace(/\.(SH|SZ|BJ)$/i, '');
    if (!/^\d{6}$/.test(six)) return [];
    const symbol = aShareQualified(six) || `${six}.${/^[569]/.test(six) ? 'SH' : /^[48]/.test(six) ? 'BJ' : 'SZ'}`;
    const name = quotes[code]?.name || quotes[symbol]?.name || quotes[six]?.name || six;
    return [{ code: six, name, symbol }];
  });
}

export function matchCompanies(items: { code: string; name: string; symbol: string }[], query: string) {
  const needle = query.trim().toLowerCase();
  if (!needle) return items;
  return items.filter(item => item.code.includes(needle) || item.name.toLowerCase().includes(needle)
    || item.symbol.toLowerCase().includes(needle) || needle.includes(item.code)
    || needle.includes(item.name.toLowerCase()));
}

function titleNeedle(query: string, companies: { code: string; name: string }[]): string {
  let rest = query.replace(/\d{6}(?:\.(?:SH|SZ|BJ))?/gi, '');
  for (const item of companies) {
    rest = rest.replaceAll(item.name, '').replaceAll(item.code, '');
  }
  return rest.replace(/\d{6}(?:\.(?:SH|SZ|BJ))?/gi, '').replace(/[.\s]+/g, ' ').trim();
}

async function newsCandidates(query: string, companies: { code: string; name: string; symbol: string }[], signal: AbortSignal) {
  const urlMatch = /https?:\/\/[^\s<>]+/.exec(query);
  if (urlMatch && /^https:\/\//.test(urlMatch[0])) {
    return [{ name: urlMatch[0], section: '来源', icon: 'file' as const, value: `url:${urlMatch[0]}`, hint: '网页 / 公告' }];
  }
  const codeFromQuery = /\d{6}/.exec(query)?.[0];
  const known = [...companies];
  if (codeFromQuery && !known.some(item => item.code === codeFromQuery)) {
    const symbol = aShareQualified(codeFromQuery) || codeFromQuery;
    known.unshift({ code: codeFromQuery, name: codeFromQuery, symbol });
  }
  const matched = matchCompanies(known, query);
  const targets = matched.length ? matched : known;
  if (!targets.length) return [];
  const needle = titleNeedle(query, targets);
  const announcements: { name: string; section: string; icon: 'file'; value: string; hint: string }[] = [];
  const news: { name: string; section: string; icon: 'file'; value: string; hint: string }[] = [];
  const seen = new Set<string>();
  for (const company of targets) {
    if (signal.aborted) break;
    let filings: { title: string; url: string }[] = [];
    let rows: { 新闻标题?: string; 新闻链接?: string }[] = [];
    try { filings = await api.announcements(company.code); } catch { filings = []; }
    if (signal.aborted) break;
    try { rows = await api.news(company.code); } catch { rows = []; }
    const hint = company.symbol;
    for (const item of filings) {
      if (!item.url || !/^https:\/\//.test(item.url) || seen.has(item.url)) continue;
      if (needle && !item.title.includes(needle)) continue;
      seen.add(item.url);
      announcements.push({ name: item.title || item.url, section: '公告', icon: 'file', value: `url:${item.url}`, hint });
      if (announcements.length >= 5) break;
    }
    for (const item of rows) {
      const title = item.新闻标题 || '';
      const url = item.新闻链接 || '';
      if (!url || !/^https:\/\//.test(url) || seen.has(url)) continue;
      if (needle && !title.includes(needle)) continue;
      seen.add(url);
      news.push({ name: title || url, section: '新闻', icon: 'file', value: `url:${url}`, hint });
      if (news.length >= 5) break;
    }
    if (announcements.length >= 5 && news.length >= 5) break;
  }
  return [...announcements.slice(0, 5), ...news.slice(0, 5)];
}

/** Native input extension: references identify research objects, never workspace files. */
export const researchObjectSource: InputTriggerSource = {
  name: '研究对象', trigger: '@', showGroupTitle: false,
  async candidates(_session, { query, signal }) {
    const q = (query || '').trim();
    const rows = await Promise.all(categories.map(async ([kind, label]) => {
      const items = kind === 'topics'
        ? (await researchRead<{ items: ResearchTopicSummary[] }>(`/wiki/research-topics?limit=5&query=${encodeURIComponent(q)}`, { signal })).items.map(item => ({ slug: item.topic_id, title: item.title }))
        : (await researchRead<{ items: WikiItem[] }>(`/wiki/pages?kind=${kind}&sort=updated&limit=5&query=${encodeURIComponent(q)}`, { signal })).items;
      const mapped = items.slice(0, 5).map(item => ({
        name: item.title,
        section: label,
        icon: 'file' as const,
        value: kind === 'topics' ? item.slug : wikiValue(item),
      }));
      const quotes = kind === 'companies'
        ? wikiCompanies(items).slice(0, 3).map(item => ({
          name: `${item.name} 行情`, section: '行情', icon: 'file' as const, value: `company:${item.symbol}`,
        }))
        : [];
      return [...mapped, ...quotes];
    }));
    const documents = (await listLibraryDocuments({ limit: 5, query: q, signal })).items.slice(0, 5).map(item => ({
      name: item.title || '未命名资料',
      section: '资料',
      icon: 'file' as const,
      value: documentRef(item.document_id, item.extra.parse_revision_id, item.extra.parsed_content_sha256),
      hint: documentHint(item),
    }));
    const markets = [
      { name: '宽基指数集合', section: '大盘', icon: 'file' as const, value: 'market:indices', hint: '上证 / 沪深300 / 深证 / 创业板' },
      ...MARKET_INDICES.map(item => ({ name: item.name, section: '大盘', icon: 'file' as const, value: `market:${item.id}`, hint: item.id })),
    ].filter(item => !q || item.name.includes(q) || item.value.toLowerCase().includes(q.toLowerCase()) || item.hint?.includes(q));
    let profiles: { name: string; section: string; icon: 'file'; value: string; hint: string }[] = [];
    try {
      const listed = await researchRead<{ items: { industry_code: string; industry_name?: string; status?: string; profile_sha256?: string; profile_ref?: string }[] }>(`/industries/profiles`, { signal });
      profiles = listed.items
        .filter(item => item.status === 'ready' && item.profile_sha256 && /^[a-f0-9]{64}$/.test(item.profile_sha256)
          && (!q || (item.industry_name || '').includes(q) || item.industry_code.includes(q)))
        .slice(0, 5)
        .map(item => ({
          name: item.industry_name || item.industry_code,
          section: '产业研究',
          icon: 'file' as const,
          value: item.profile_ref || `profile:sw2:${item.industry_code}:${item.profile_sha256}`,
          hint: '申万产业研究 Profile',
        }));
    } catch { profiles = []; }
    const dates = DATE_CHIP.test(q) ? [{ name: q, section: '日期', icon: 'file' as const, value: `date:${q}`, hint: '日历日，不是盘中快照' }] : [];
    const listedAll = q ? await listedCompanies(signal).catch(() => []) : [];
    const wikiHits = rows.flat().flatMap(item => {
      if (item.section !== '公司') return [];
      const slug = String(item.value).replace(/@[a-f0-9]{64}$/, '');
      const match = COMPANY_SLUG.exec(slug);
      if (!match?.[1] || !match[2]) return [];
      return [{ code: match[1], name: item.name, symbol: `${match[1]}.${match[2].toUpperCase()}` }];
    });
    const named = [...wikiHits];
    for (const item of matchCompanies(listedAll, q)) {
      if (!named.some(hit => hit.code === item.code)) named.push(item);
    }
    const existingQuotes = new Set(rows.flat().filter(item => item.section === '行情').map(item => item.value));
    const extraQuotes = named.filter(item => !existingQuotes.has(`company:${item.symbol}`)).slice(0, 3).map(item => ({
      name: `${item.name} 行情`, section: '行情', icon: 'file' as const, value: `company:${item.symbol}`,
    }));
    const newsUniverse = named.length ? named : listedAll;
    const news = await newsCandidates(q, newsUniverse, signal).catch(() => []);
    return [...rows.flat(), ...extraQuotes, ...documents, ...markets, ...profiles, ...dates, ...news];
  },
  onPick({ candidate }) {
    if (!candidate.value || !researchTarget(candidate.value)) return;
    rememberMentionLabel(candidate.value, candidate.name);
    return { insert: { source: '研究对象', ref: candidate.value, label: candidate.name, appearance: 'file', clipboardText: candidate.name } };
  },
  codec: {
    clipboardText: ref => mentionLabelForClipboard(ref),
    async serialize(ref, signal) {
      const target = researchTarget(ref);
      if (target?.kind === 'topic') {
        const topic = await researchRead<ResearchTopicSummary>(`/wiki/research-topics/${encodeURIComponent(ref)}`, { signal });
        rememberMentionLabel(ref, topic.title);
        return `引用议题：${topic.title} \`${ref}\``;
      }
      if (target?.kind === 'document') return serializeDocument(ref, signal);
      if (target?.kind === 'url') {
        rememberMentionLabel(ref, target.id);
        return `引用来源：${target.id} \`${ref.startsWith('url:') ? ref : 'url:' + target.id}\`（发送时未读取正文）`;
      }
      if (target?.kind === 'company') {
        rememberMentionLabel(ref, target.id);
        return `引用公司行情：${target.id} \`company:${target.id}\`。用 observe_market 的 symbol 读取交易日收盘，不要把指数代码放进 symbol。`;
      }
      if (target?.kind === 'market') {
        rememberMentionLabel(ref, marketLabel(target.id));
        return target.id === 'indices'
          ? `引用宽基指数集合 \`market:indices\`（上证 000001.SH、沪深300 000300.SH、深证 399001.SZ、创业板 399006.SZ）。读取时对成员逐个 observe_market，必须用 marketBenchmarkId，禁止当 symbol。观察日是工具 asOf 的交易日收盘，不是盘中 tick。`
          : `引用宽基指数：${marketLabel(target.id)} \`market:${target.id}\`。读取 observe_market 必须用 marketBenchmarkId=${target.id}，禁止当 symbol。观察日是工具 asOf 的交易日收盘序列，不是盘中快照。`;
      }
      if (target?.kind === 'profile') {
        rememberMentionLabel(ref, target.id);
        return `引用产业研究 Profile \`${target.id}\`。用 read_industry_profile 核 hash 读取；这不是 Theme Wiki，也不是 41 行业研究页。`;
      }
      if (target?.kind === 'date') {
        rememberMentionLabel(ref, target.id);
        return `引用日历日 ${target.id} \`date:${target.id}\`。这是日历日，不是对象版本，也不是盘中快照。行情观察日请作为 observe_market.asOf。`;
      }
      if (target?.kind !== 'wiki') throw new Error('无法读取所选研究对象，请重新选择。');
      const page = await researchRead<{ spec: { title: string }; input_hash?: string }>(`/wiki/pages/read?slug=${encodeURIComponent(target.id)}`, { signal });
      rememberMentionLabel(ref, page.spec.title);
      const hash = target.input_hash || page.input_hash;
      if (target.input_hash && page.input_hash && target.input_hash !== page.input_hash) {
        return `引用材料：${page.spec.title} \`${target.id}@${target.input_hash}\`（绑定版本与当前页不一致，读取将失败，不会改读最新稿）`;
      }
      const pinned = hash ? `${target.id}@${hash}` : target.id;
      rememberMentionLabel(pinned, page.spec.title);
      return `引用材料：${page.spec.title} \`${pinned}\``;
    },
  },
};

function mentionLabelForClipboard(ref: string) {
  const target = researchTarget(ref);
  if (target?.kind === 'document') return mentionLabel(ref, '资料');
  if (target?.kind === 'topic') return mentionLabel(ref, '议题');
  if (target?.kind === 'wiki') return mentionLabel(ref, '研究材料');
  if (target?.kind === 'market') return mentionLabel(ref, '大盘');
  if (target?.kind === 'profile') return mentionLabel(ref, '产业研究');
  if (target?.kind === 'company') return mentionLabel(ref, '行情');
  if (target?.kind === 'date') return mentionLabel(ref, '日期');
  return mentionLabel(ref, '引用');
}
