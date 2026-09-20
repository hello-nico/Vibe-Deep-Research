import type { InputTriggerSource } from '@deepseek-ai/dsh-client-ui-input-trigger/client';
import { researchRead, ResearchError, type ResearchTopicSummary, type WikiItem } from '../lib/research';
import { decodeEvidenceLink } from '../lib/evidence';
import { documentIdFromRef, listLibraryDocuments, parseDocumentRef, documentRef, type LibraryDocument } from '../lib/library';

export function researchTarget(value: string): { kind: 'evidence' | 'wiki' | 'topic' | 'document'; id: string; parse_revision_id?: string; parsed_content_sha256?: string } | null {
  const evidence = decodeEvidenceLink(value);
  if (evidence) return { kind: 'evidence', id: evidence };
  if (/^(claim|evidence|source|provider|lookup):[^\s<>]+$/.test(value)) return { kind: 'evidence', id: value };
  if (/^topic:[a-f0-9]{12}$/.test(value)) return { kind: 'topic', id: value };
  const document = parseDocumentRef(value);
  if (document) return { kind: 'document', id: documentRef(document.document_id, document.parse_revision_id, document.parsed_content_sha256), parse_revision_id: document.parse_revision_id, parsed_content_sha256: document.parsed_content_sha256 };
  if (/^(companies|industries|themes|comparisons)\/[^/\s?#<>]+$/.test(value) && !value.includes('..')) return { kind: 'wiki', id: value };
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
  const listed = await researchRead<{ revisions: { status?: string; parse_revision_id?: string; parsed_content_sha256?: string }[] }>(
    `/documents/${encodeURIComponent(id)}/revisions`, { signal },
  );
  if (parsed?.parse_revision_id && parsed.parsed_content_sha256) {
    const pinned = listed.revisions.find(item => item.parse_revision_id === parsed.parse_revision_id
      && (item.parsed_content_sha256 === parsed.parsed_content_sha256));
    if (!pinned) return `引用资料：${title} \`${ref}\`（发送时绑定的解析版本已不可用，不能按正文引用）`;
    return `引用资料：${title} \`${documentRef(id)}\` parse_revision_id=${pinned.parse_revision_id} parsed_content_sha256=${pinned.parsed_content_sha256}`;
  }
  const active = listed.revisions.find(item => item.status === 'active') || listed.revisions[0];
  if (doc.has_parsed && active?.parse_revision_id && active.parsed_content_sha256) {
    return `引用资料：${title} \`${documentRef(id)}\` parse_revision_id=${active.parse_revision_id} parsed_content_sha256=${active.parsed_content_sha256}`;
  }
  return `引用资料：${title} \`${documentRef(id)}\`（原件已保存，正文尚未解析，不能按正文引用）`;
}

/** Native input extension: references identify research objects, never workspace files. */
export const researchObjectSource: InputTriggerSource = {
  name: '研究对象', trigger: '@', showGroupTitle: false,
  async candidates(_session, { query, signal }) {
    const rows = await Promise.all(categories.map(async ([kind, label]) => {
      const items = kind === 'topics'
        ? (await researchRead<{ items: ResearchTopicSummary[] }>(`/wiki/research-topics?limit=5&query=${encodeURIComponent(query)}`, { signal })).items.map(item => ({ slug: item.topic_id, title: item.title }))
        : (await researchRead<{ items: WikiItem[] }>(`/wiki/pages?kind=${kind}&sort=updated&limit=5&query=${encodeURIComponent(query)}`, { signal })).items;
      return items.slice(0, 5).map(item => ({ name: item.title, section: label, icon: 'file' as const, value: item.slug }));
    }));
    const documents = (await listLibraryDocuments({ limit: 5, query, signal })).items.slice(0, 5).map(item => ({
      name: item.title || '未命名资料',
      section: '资料',
      icon: 'file' as const,
      value: documentRef(item.document_id, item.extra.parse_revision_id, item.extra.parsed_content_sha256),
      hint: documentHint(item),
    }));
    return [...rows.flat(), ...documents];
  },
  onPick({ candidate }) {
    if (!candidate.value || !researchTarget(candidate.value)) return;
    return { insert: { source: '研究对象', ref: candidate.value, label: candidate.name, appearance: 'file', clipboardText: candidate.name } };
  },
  codec: {
    clipboardText: ref => ref,
    async serialize(ref, signal) {
      const target = researchTarget(ref);
      if (target?.kind === 'topic') {
        const topic = await researchRead<ResearchTopicSummary>(`/wiki/research-topics/${encodeURIComponent(ref)}`, { signal });
        return `引用议题：${topic.title} \`${ref}\``;
      }
      if (target?.kind === 'document') return serializeDocument(ref, signal);
      if (target?.kind !== 'wiki') throw new Error('无法读取所选研究对象，请重新选择。');
      const page = await researchRead<{ spec: { title: string } }>(`/wiki/pages/read?slug=${encodeURIComponent(ref)}`, { signal });
      return `引用材料：${page.spec.title} \`${ref}\``;
    },
  },
};
