import { researchRead } from './research';

export function decodeEvidenceLink(href: string): string | null {
  const match = /^stock-ref:\/\/(claim|evidence|source|provider|lookup)\/([^?#]+)$/.exec(href);
  if (!match) return null;
  try {
    const value = decodeURIComponent(match[2]!);
    return value && !/[\u0000-\u001f]/.test(value) ? `${match[1]}:${value}` : null;
  } catch { return null; }
}
export interface SourceBlock {
  document_id: string; parse_revision_id: string; parsed_content_sha256: string;
  block_id: string; page: number; text: string; truncated?: boolean;
}
interface Resolution { ref: string; status: string; kind: string; data: Record<string, unknown> }
export async function resolveEvidence(ref: string, signal: AbortSignal): Promise<Resolution> {
  const response = await researchRead<{ results: Resolution[] }>('/wiki/refs/resolve', {
    method: 'POST', signal, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ refs: [ref] }),
  });
  const result = response.results.find(item => item.ref === ref);
  if (!result || result.status !== 'resolved') throw new Error('这条依据暂时无法读取，请稍后重试。');
  return result;
}
export function pinnedBlockPath(block: Pick<SourceBlock, 'document_id' | 'parse_revision_id' | 'parsed_content_sha256' | 'block_id'>) {
  if (!block.document_id || !block.parse_revision_id || !/^[a-f0-9]{64}$/.test(block.parsed_content_sha256) || !block.block_id) throw new Error('来源定位不完整，无法读取原文。');
  return `/wiki/documents/${encodeURIComponent(block.document_id)}/blocks/${encodeURIComponent(block.block_id)}?` + new URLSearchParams({ parse_revision_id: block.parse_revision_id, parsed_content_sha256: block.parsed_content_sha256 });
}
export async function readPinnedBlock(block: Parameters<typeof pinnedBlockPath>[0], signal: AbortSignal) {
  const result = await researchRead<SourceBlock>(pinnedBlockPath(block), { signal });
  if (['document_id', 'parse_revision_id', 'parsed_content_sha256', 'block_id'].some(key => result[key as keyof SourceBlock] !== block[key as keyof typeof block])) throw new Error('来源定位校验失败。');
  return result;
}
export interface EvidenceView { title: string; text: string; page?: number; block?: SourceBlock; related: string[] }
export async function loadEvidence(ref: string, signal: AbortSignal): Promise<EvidenceView> {
  const { kind, data } = await resolveEvidence(ref, signal);
  if (kind === 'source' || kind === 'evidence') {
    const location = data.location as Record<string, unknown> | undefined;
    const block = await readPinnedBlock({ document_id: String(data.document_id ?? ''), parse_revision_id: String(data.parse_revision_id ?? ''), parsed_content_sha256: String(data.parsed_content_sha256 ?? ''), block_id: String(data.block_id ?? location?.block_id ?? '') }, signal);
    const document = await researchRead<{ title?: string }>(`/documents/${encodeURIComponent(block.document_id)}`, { signal });
    return { title: document.title || '来源资料', text: block.text, page: block.page, block, related: [] };
  }
  const groups = Array.isArray(data.support_groups) ? data.support_groups : [];
  const related = [...new Set(groups.flatMap(group => Array.isArray(group.segments) ? group.segments.map((segment: { evidence_id?: string }) => segment.evidence_id).filter((item: unknown): item is string => typeof item === 'string' && item.startsWith('evidence:')) : []))] as string[];
  const text = ['text', 'value', 'unit', 'period', 'as_of'].map(key => data[key]).filter(value => typeof value === 'string' || typeof value === 'number').join(' ');
  return { title: kind === 'provider' ? '数据来源' : '指标依据', text: text || (kind === 'provider' ? '当前来源未返回可回读的数据快照，暂不能核对具体数值。' : '请打开下方原文依据核对。'), related };
}
