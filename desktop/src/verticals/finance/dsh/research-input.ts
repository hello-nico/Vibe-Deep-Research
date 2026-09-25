import type { InputTriggerSource } from '@deepseek-ai/dsh-client-ui-input-trigger/client';
import { documentDisplayTitle } from '../lib/documentTitle';
import { researchRead, ResearchError, type ResearchTopicSummary, type WikiItem } from '../lib/research';
import { documentIdFromRef, listLibraryDocuments, mentionLabel, parseDocumentRef, documentRef, rememberMentionLabel, type LibraryDocument } from '../lib/library';
import { MENTION_NOTES } from '../lib/researchMentions';
import { researchTarget } from '../lib/researchTarget';
import { objectLabel, openRegisteredObject } from '../lib/objectRegistry';
export { researchTarget } from '../lib/researchTarget';

const MARKET_INDICES = [
  { id: '000001.SH', name: '上证指数' },
  { id: '000300.SH', name: '沪深300' },
  { id: '399001.SZ', name: '深证成指' },
  { id: '399006.SZ', name: '创业板指' },
] as const;

type MentionCandidate = {
  name: string;
  section: string;
  icon: 'file';
  value: string;
  hint?: string;
};

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

const DOCUMENT_KIND: Record<string, string> = { annual_report: '年报', semi_annual_report: '半年报', interim_report: '半年报', quarterly_report: '季报', announcement: '公告', research_report: '研报' };

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
  const companySlug = doc.symbol ? `companies/${doc.symbol.toLowerCase().replace('.', '-')}` : '';
  const company = companySlug && objectLabel(companySlug) !== companySlug ? objectLabel(companySlug) : doc.symbol || '';
  const title = doc.title ? documentDisplayTitle(doc.title, (doc as LibraryDocument & { reporting_period?: string | null }).reporting_period, DOCUMENT_KIND[doc.document_type || ''] || '资料', company) : '未命名资料';
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
  openReference(_session, reference) {
    return openRegisteredObject(reference.ref);
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
  return objectLabel(ref);
}
