import { researchRead } from './research';
import { providerDisclosure, providerSnapshot } from './wikiFacts';

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
export class PendingEvidenceError extends Error {}
export function evidenceFailure(error: unknown): { message: string; retryable: boolean } {
  if (error instanceof PendingEvidenceError) return { message: error.message, retryable: false };
  if (error instanceof DOMException && ['TimeoutError', 'NetworkError'].includes(error.name)) return { message: '这条依据暂时无法读取，请稍后重试。', retryable: true };
  if (error instanceof TypeError) return { message: '这条依据暂时无法读取，请稍后重试。', retryable: true };
  return { message: error instanceof Error ? error.message : '依据读取失败。', retryable: false };
}
export async function resolveEvidence(ref: string, signal: AbortSignal): Promise<Resolution> {
  const response = await researchRead<{ results: Resolution[] }>('/wiki/refs/resolve', {
    method: 'POST', signal, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ refs: [ref] }),
  });
  const result = response.results.find(item => item.ref === ref);
  if (result?.status === 'pending' && ref.startsWith('lookup:')) throw new PendingEvidenceError('这一项目前是缺口，还没有取到数据，暂无可核对的依据');
  if (!result || result.status !== 'resolved') throw new Error(ref.startsWith('provider:') ? '这条引用未找到唯一对应的历史数据，暂不能核对原数值。' : `这条依据未能解析${result?.status ? `（${result.status}）` : ''}，暂无可核对的来源。`);
  return result;
}
export function pinnedBlockPath(block: Pick<SourceBlock, 'document_id' | 'parse_revision_id' | 'parsed_content_sha256' | 'block_id'>) {
  if (!block.document_id || !block.parse_revision_id || !/^[a-f0-9]{64}$/.test(block.parsed_content_sha256) || !block.block_id) throw new Error('这条来源信息不完整，暂时无法打开原文。');
  return `/wiki/documents/${encodeURIComponent(block.document_id)}/blocks/${encodeURIComponent(block.block_id)}?` + new URLSearchParams({ parse_revision_id: block.parse_revision_id, parsed_content_sha256: block.parsed_content_sha256 });
}
export async function readPinnedBlock(block: Parameters<typeof pinnedBlockPath>[0], signal: AbortSignal) {
  const result = await researchRead<SourceBlock>(pinnedBlockPath(block), { signal });
  if (['document_id', 'parse_revision_id', 'parsed_content_sha256', 'block_id'].some(key => result[key as keyof SourceBlock] !== block[key as keyof typeof block])) throw new Error('原文版本核对失败，暂时无法打开。');
  return result;
}
export interface EvidenceView { title: string; text: string; page?: number; block?: SourceBlock; related: string[]; href?: string }
export async function loadEvidence(ref: string, signal: AbortSignal): Promise<EvidenceView> {
  const { kind, data } = await resolveEvidence(ref, signal);
  if (kind === 'provider') return { title: providerDisclosure(data)?.name || '数据来源', text: providerSnapshot(data), related: [] };
  if (kind === 'source' || kind === 'evidence') {
    const location = data.location as Record<string, unknown> | undefined;
    const block = await readPinnedBlock({ document_id: String(data.document_id ?? ''), parse_revision_id: String(data.parse_revision_id ?? ''), parsed_content_sha256: String(data.parsed_content_sha256 ?? ''), block_id: String(data.block_id ?? location?.block_id ?? '') }, signal);
    const document = await researchRead<{ title?: string }>(`/documents/${encodeURIComponent(block.document_id)}`, { signal });
    return { title: document.title || '来源资料', text: block.text, page: block.page, block, related: [] };
  }
  const groups = Array.isArray(data.support_groups) ? data.support_groups : [];
  const related = [...new Set(groups.flatMap(group => Array.isArray(group.segments) ? group.segments.map((segment: { evidence_id?: string }) => segment.evidence_id).filter((item: unknown): item is string => typeof item === 'string' && item.startsWith('evidence:')) : []))] as string[];
  const text = ['text', 'value', 'unit', 'period', 'as_of'].map(key => data[key]).filter(value => typeof value === 'string' || typeof value === 'number').join(' ');
  return { title: '指标依据', text: text || '请打开下方原文依据核对。', related };
}
