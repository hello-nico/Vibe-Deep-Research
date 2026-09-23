import type { InputTriggerSource } from '@deepseek-ai/dsh-client-ui-input-trigger/client';
import { researchRead, ResearchError, type ResearchTopicSummary, type WikiItem } from '../lib/research';
import { decodeEvidenceLink } from '../lib/evidence';
import { documentIdFromRef, listLibraryDocuments, mentionLabel, parseDocumentRef, documentRef, rememberMentionLabel, type LibraryDocument } from '../lib/library';
import { MENTION_NOTES } from '../lib/researchMentions';

const MARKET_INDICES = [
  { id: '000001.SH', name: '上证指数' },
  { id: '000300.SH', name: '沪深300' },
  { id: '399001.SZ', name: '深证成指' },
  { id: '399006.SZ', name: '创业板指' },
] as const;
const DATE_CHIP = /^(\d{4}-\d{2}-\d{2})$/;
const PROFILE_REF = /^profile:sw2:([0-9A-Z.]+):([a-f0-9]{64})$/;

type MentionCandidate = {
  name: string;
  section: string;
  icon: 'file';
  value: string;
  hint?: string;
};

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
    if (!pinned) return citedDocument(title, ref, MENTION_NOTES.documentStale);
    return citedDocument(title, documentRef(id, pinned.parse_revision_id, pinned.parsed_content_sha256));
  }
  const active = listed.revisions.find(item => item.status === 'active') || listed.revisions[0];
  if (doc.has_parsed && active?.parse_revision_id && active.parsed_content_sha256) {
    return citedDocument(title, documentRef(id, active.parse_revision_id, active.parsed_content_sha256));
  }
  return citedDocument(title, documentRef(id), MENTION_NOTES.documentUnparsed);
}

function marketLabel(id: string): string {
  if (id === 'indices') return '宽基指数集合';
  return MARKET_INDICES.find(item => item.id === id)?.name || id;
}

function listedOf<T>(value: { items?: T[] } | null | undefined): T[] {
  return Array.isArray(value?.items) ? value.items : [];
}

/**
 * One @ category: the 5 latest pages when the query is empty, otherwise the
 * Backend's case-insensitive substring match over slug and title (so a name
 * like 神火 or a code like 000933 both hit). A failing category (e.g. a busy
 * Wiki read) yields nothing instead of failing the whole menu.
 */
async function wikiCategory(kind: 'companies' | 'industries', label: string, q: string, signal: AbortSignal): Promise<MentionCandidate[]> {
  try {
    const items = listedOf(await researchRead<{ items: WikiItem[] }>(`/wiki/pages?kind=${kind}&sort=updated&limit=5&query=${encodeURIComponent(q)}`, { signal }));
    return items.slice(0, 5).map(item => ({ name: item.title, section: label, icon: 'file' as const, value: wikiValue(item) }));
  } catch {
    return [];
  }
}

async function documentCategory(q: string, signal: AbortSignal): Promise<MentionCandidate[]> {
  try {
    return listedOf(await listLibraryDocuments({ limit: 5, query: q, signal })).slice(0, 5).map(item => ({
      name: item.title || '未命名资料',
      section: '资料',
      icon: 'file' as const,
      value: documentRef(item.document_id, item.extra.parse_revision_id, item.extra.parsed_content_sha256),
      hint: documentHint(item),
    }));
  } catch {
    return [];
  }
}

/**
 * Native input extension: references identify research objects, never workspace files.
 * The @ menu offers only company pages, industry pages and My Documents (2026-09-23
 * decision); serialize still resolves every reference kind for older messages and
 * product-inserted references.
 */
export const researchObjectSource: InputTriggerSource = {
  name: '研究对象', trigger: '@', showGroupTitle: false,
  async candidates(_session, { query, signal }) {
    const q = (query || '').trim();
    const rows = await Promise.all([
      wikiCategory('companies', '公司', q, signal),
      wikiCategory('industries', '行业', q, signal),
      documentCategory(q, signal),
    ]);
    return rows.flat();
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
        rememberMentionLabel(ref, mentionLabel(ref, target.id));
        return `引用来源：${target.id} \`${ref.startsWith('url:') ? ref : 'url:' + target.id}\`${MENTION_NOTES.url}`;
      }
      if (target?.kind === 'company') {
        rememberMentionLabel(ref, mentionLabel(ref, `${target.id} 行情`));
        return `引用公司行情：${target.id} \`company:${target.id}\`${MENTION_NOTES.company}`;
      }
      if (target?.kind === 'market') {
        rememberMentionLabel(ref, marketLabel(target.id));
        return target.id === 'indices'
          ? `引用宽基指数集合 \`market:indices\`${MENTION_NOTES.indices}`
          : `引用宽基指数：${marketLabel(target.id)} \`market:${target.id}\`${MENTION_NOTES.index(target.id)}`;
      }
      if (target?.kind === 'profile') {
        rememberMentionLabel(ref, mentionLabel(ref, '产业研究'));
        return `引用产业研究 Profile \`${target.id}\`${MENTION_NOTES.profile}`;
      }
      if (target?.kind === 'date') {
        rememberMentionLabel(ref, target.id);
        return `引用日历日 ${target.id} \`date:${target.id}\`${MENTION_NOTES.date}`;
      }
      if (target?.kind !== 'wiki') throw new Error('无法读取所选研究对象，请重新选择。');
      const page = await researchRead<{ spec: { title: string }; input_hash?: string }>(`/wiki/pages/read?slug=${encodeURIComponent(target.id)}`, { signal });
      rememberMentionLabel(ref, page.spec.title);
      const hash = target.input_hash || page.input_hash;
      if (target.input_hash && page.input_hash && target.input_hash !== page.input_hash) {
        return `引用材料：${page.spec.title} \`${target.id}@${target.input_hash}\`${MENTION_NOTES.wikiStale}`;
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
