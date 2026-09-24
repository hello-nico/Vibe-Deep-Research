import { researchRead, ResearchError } from './research';
import { asResearchErrorMessage, researchUploadSymbol } from './researchSymbol';
import { cachedObjectLabel, rememberObjectLabel } from './objectLabels';

export const LIBRARY_MAX_BYTES = 32 * 1024 * 1024;
export const LIBRARY_BATCH_MAX = 10;
export const LIBRARY_CONCURRENCY = 4;
export const DOCUMENT_REF = /^document:([a-f0-9]{32})(?:\/([^/?#\s]+)\/([a-f0-9]{64}))?$/;
export const LIBRARY_CITE_EVENT = 'finance-cite-library';

export type LibraryKind = 'pdf' | 'text' | 'markdown';
export type LibraryStatus = 'ready' | 'processing' | 'failed';

export interface LibraryDocument {
  document_id: string;
  document_type?: string;
  title?: string | null;
  symbol?: string | null;
  has_raw: boolean;
  has_parsed: boolean;
  created_at?: string;
  extra: {
    content_type?: LibraryKind | string;
    mime_type?: string;
    byte_size?: number;
    parse_error?: string;
    evidence_error?: string;
    process_status?: LibraryStatus | string;
    preview?: string | null;
    parse_revision_id?: string;
    parsed_content_sha256?: string;
    library_hidden?: boolean;
  };
}

export interface LibraryList {
  items: LibraryDocument[];
  total: number;
  offset: number;
  limit: number;
}

export interface LibraryCite {
  document_id: string;
  title: string;
  has_parsed: boolean;
  parse_revision_id?: string;
  parsed_content_sha256?: string;
}

export interface DocumentRef {
  document_id: string;
  parse_revision_id?: string;
  parsed_content_sha256?: string;
}

export type LibraryCiteStatus = 'inserted' | 'queued' | 'failed';
export interface LibraryCiteResult {
  status: LibraryCiteStatus;
  sessionId?: string;
}

export interface PendingLibraryCites {
  items: LibraryCite[];
  sessionId?: string;
}

let pendingCites: PendingLibraryCites[] = [];
let lastCiteResult: LibraryCiteResult = { status: 'queued' };

export function documentRef(id: string, revision?: string, hash?: string): string {
  if (revision && hash) return `document:${id}/${revision}/${hash}`;
  return `document:${id}`;
}

export function parseDocumentRef(value: string): DocumentRef | null {
  const match = DOCUMENT_REF.exec(value);
  if (!match) return null;
  return {
    document_id: match[1]!,
    parse_revision_id: match[2],
    parsed_content_sha256: match[3],
  };
}

export function documentIdFromRef(value: string): string | null {
  return parseDocumentRef(value)?.document_id ?? null;
}

export function rememberMentionLabel(ref: string, label: string) {
  rememberObjectLabel(ref, label);
  const id = documentIdFromRef(ref);
  if (id) rememberObjectLabel(id, label);
}

export function mentionLabel(ref: string, fallback: string) {
  return cachedObjectLabel(ref) || cachedObjectLabel(documentIdFromRef(ref) || '') || fallback;
}

export function documentReadSearch(ref: DocumentRef, from = '/'): string {
  const search = new URLSearchParams({ from });
  if (ref.parse_revision_id) search.set('revision', ref.parse_revision_id);
  if (ref.parsed_content_sha256) search.set('hash', ref.parsed_content_sha256);
  return search.toString();
}

export function parsedBodyPath(id: string, revision?: string, hash?: string): string {
  const search = new URLSearchParams();
  if (revision) search.set('parse_revision_id', revision);
  if (hash) search.set('parsed_content_sha256', hash);
  const query = search.toString();
  return '/finance-research/documents/' + encodeURIComponent(id) + '/parsed' + (query ? `?${query}` : '');
}

export function boundPreviewText(selectedId: string, preview: { documentId: string; text: string } | null): string | null {
  if (!preview || preview.documentId !== selectedId) return null;
  return preview.text;
}

export function resolveLibrarySession(preferred?: string | null, opened?: string | null, current?: string | null): string {
  return preferred || opened || current || '';
}

export function queueLibraryCites(items: LibraryCite[], sessionId?: string): PendingLibraryCites {
  const batch = { items: [...items], sessionId: sessionId || undefined };
  pendingCites.push(batch);
  return batch;
}

export function pendingLibraryCites(): PendingLibraryCites[] {
  return [...pendingCites];
}

export function deliverLibraryCiteBatch(
  batch: PendingLibraryCites,
  fallbackSessionId: string,
  insert: (item: LibraryCite, sessionId: string) => boolean,
): LibraryCiteResult {
  batch.sessionId ||= fallbackSessionId || undefined;
  if (!batch.sessionId) return completeLibraryCite({ status: 'queued' });
  while (batch.items.length) {
    if (!insert(batch.items[0]!, batch.sessionId)) {
      return completeLibraryCite({ status: 'failed', sessionId: batch.sessionId });
    }
    batch.items.shift();
  }
  pendingCites = pendingCites.filter(candidate => candidate !== batch);
  return completeLibraryCite({ status: 'inserted', sessionId: batch.sessionId });
}

export function clearLibraryCites(): void {
  pendingCites = [];
}

export function completeLibraryCite(result: LibraryCiteResult): LibraryCiteResult {
  lastCiteResult = result;
  return result;
}

export function lastLibraryCiteResult(): LibraryCiteResult {
  return lastCiteResult;
}

export function libraryCiteFromItem(item: Pick<LibraryDocument, 'document_id' | 'title' | 'has_parsed' | 'extra'>): LibraryCite {
  return {
    document_id: item.document_id,
    title: item.title || '未命名资料',
    has_parsed: item.has_parsed,
    parse_revision_id: item.extra.parse_revision_id,
    parsed_content_sha256: item.extra.parsed_content_sha256,
  };
}

export function requestLibraryCite(items: LibraryCite[], sessionId?: string): LibraryCiteResult {
  const batch = queueLibraryCites(items, sessionId);
  lastCiteResult = { status: 'queued', sessionId };
  window.dispatchEvent(new CustomEvent<PendingLibraryCites>(LIBRARY_CITE_EVENT, { detail: batch }));
  return lastCiteResult;
}

export function libraryFileKind(file: File): LibraryKind | null {
  const name = file.name.toLowerCase();
  const type = (file.type || '').toLowerCase();
  if (type === 'application/pdf' || name.endsWith('.pdf')) return 'pdf';
  if (type === 'text/markdown' || type === 'text/x-markdown' || name.endsWith('.md')) return 'markdown';
  if (type === 'text/plain' || name.endsWith('.txt')) return 'text';
  return null;
}

export function libraryMime(kind: LibraryKind): string {
  return { pdf: 'application/pdf', text: 'text/plain', markdown: 'text/markdown' }[kind];
}

export function libraryKindLabel(kind?: string | null): string {
  if (kind === 'pdf' || kind === 'application/pdf') return 'PDF';
  if (kind === 'markdown' || kind === 'text/markdown') return 'MD';
  if (kind === 'text' || kind === 'text/plain') return 'TXT';
  return '文件';
}

export function libraryKindFromItem(item: Pick<LibraryDocument, 'title' | 'extra'>): string {
  const extra = item.extra || {};
  const labeled = libraryKindLabel(extra.content_type || extra.mime_type);
  if (labeled !== '文件') return labeled;
  const name = (item.title || '').toLowerCase();
  if (name.endsWith('.pdf')) return 'PDF';
  if (name.endsWith('.md')) return 'MD';
  if (name.endsWith('.txt')) return 'TXT';
  return labeled;
}

export function libraryStatusLabel(item: LibraryDocument): string {
  const status = item.extra.process_status || (item.extra.parse_error ? 'failed' : item.has_parsed ? 'ready' : 'processing');
  if (status === 'failed') return '处理失败';
  if (status === 'ready') return item.extra.evidence_error ? '正文已读取，暂不能引用' : '可引用';
  return '处理中';
}

export function libraryNeedsRetry(item: LibraryDocument): boolean {
  return Boolean(item.extra.parse_error || item.extra.evidence_error || item.extra.process_status === 'failed');
}

export function librarySummary(item: Pick<LibraryDocument, 'has_parsed' | 'extra'>): string {
  const extra = item.extra || {};
  if (extra.parse_error || extra.process_status === 'failed') return '处理失败，可从菜单重试。';
  if (!item.has_parsed || extra.process_status === 'processing') return '原文件已保存，正文还在处理。';
  const cleaned = String(extra.preview || '')
    .replace(/!\[[^\]]*]\([^)]*\)/g, ' ')
    .replace(/\[([^\]]*)]\([^)]*\)/g, '$1')
    .replace(/[#>*_`~]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (!cleaned) return extra.evidence_error ? '正文已读取，暂不能引用，可从菜单重试处理。' : '正文已读取，可引用。';
  return cleaned.length > 42 ? `${cleaned.slice(0, 42)}…` : cleaned;
}

export function librarySizeLabel(bytes?: number): string {
  if (!bytes || bytes <= 0) return '';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(bytes >= 10 * 1024 ? 0 : 1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export async function listLibraryDocuments(params: {
  limit?: number;
  offset?: number;
  query?: string;
  contentType?: string;
  status?: string;
  signal?: AbortSignal;
}): Promise<LibraryList> {
  const search = new URLSearchParams({
    limit: String(params.limit ?? 50),
    offset: String(params.offset ?? 0),
  });
  if (params.query) search.set('query', params.query);
  if (params.contentType && params.contentType !== 'all') search.set('content_type', params.contentType);
  if (params.status && params.status !== 'all') search.set('status', params.status);
  const listed = await researchRead<LibraryList>(`/documents/uploads?${search}`, { signal: params.signal });
  for (const item of listed.items) {
    rememberMentionLabel(documentRef(item.document_id, item.extra.parse_revision_id, item.extra.parsed_content_sha256), item.title || '未命名资料');
  }
  return listed;
}

export async function uploadLibraryFile(file: File, symbol = ''): Promise<LibraryDocument> {
  if (file.size > LIBRARY_MAX_BYTES) throw new ResearchError(413, '文件不能超过 32 MB');
  const kind = libraryFileKind(file);
  if (!kind) throw new ResearchError(415, '仅支持 PDF、TXT 或 Markdown');
  const qualified = symbol.trim() ? researchUploadSymbol(symbol) : null;
  if (symbol.trim() && !qualified) throw new Error('公司代码无法识别，请核对 6 位 A 股代码后重试');
  const query = new URLSearchParams({ title: file.name });
  if (qualified) query.set('symbol', qualified);
  return researchRead<LibraryDocument>(`/documents/uploads?${query}`, {
    method: 'POST',
    headers: { 'Content-Type': libraryMime(kind) },
    body: file,
  });
}

export async function renameLibraryDocument(id: string, title: string): Promise<LibraryDocument> {
  return researchRead<LibraryDocument>(`/documents/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ title }),
  });
}

export async function retryLibraryDocument(id: string): Promise<LibraryDocument> {
  return researchRead<LibraryDocument>(`/documents/${encodeURIComponent(id)}/reparse`, { method: 'POST' });
}

export async function hideLibraryDocument(id: string): Promise<LibraryDocument> {
  return researchRead<LibraryDocument>(`/documents/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ library_hidden: true }),
  });
}

export function libraryUploadError(error: unknown): string {
  return asResearchErrorMessage(error);
}

export async function mapPool<T, R>(items: T[], limit: number, worker: (item: T) => Promise<R>): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let cursor = 0;
  const run = async () => {
    while (cursor < items.length) {
      const index = cursor++;
      results[index] = await worker(items[index]!);
    }
  };
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, () => run()));
  return results;
}
