import { decodeEvidenceLink } from './evidence';
import { documentRef, parseDocumentRef } from './library';

export type ResearchTarget = {
  kind: 'evidence' | 'wiki' | 'topic' | 'document' | 'url' | 'company' | 'market' | 'profile' | 'date';
  id: string;
  parse_revision_id?: string;
  parsed_content_sha256?: string;
  input_hash?: string;
};

export function researchTarget(value: string): ResearchTarget | null {
  const evidence = decodeEvidenceLink(value);
  if (evidence) return { kind: 'evidence', id: evidence };
  if (/^(claim|evidence|source|provider|lookup):[^\s<>]+$/.test(value)) return { kind: 'evidence', id: value };
  if (/^topic:[a-f0-9]{12}$/.test(value)) return { kind: 'topic', id: value };
  if (/^company:\d{6}\.(SH|SZ|BJ)$/.test(value)) return { kind: 'company', id: value.slice(8) };
  if (/^market:(indices|\d{6}\.(SH|SZ))$/.test(value)) return { kind: 'market', id: value.slice(7) };
  if (/^profile:sw2:[0-9A-Z.]+:[a-f0-9]{64}$/.test(value)) return { kind: 'profile', id: value };
  if (/^date:\d{4}-\d{2}-\d{2}$/.test(value)) return { kind: 'date', id: value.slice(5) };
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return { kind: 'date', id: value };
  if (value.startsWith('url:') && /^https?:\/\//.test(value.slice(4))) return { kind: 'url', id: value.slice(4) };
  if (/^https?:\/\//.test(value)) return { kind: 'url', id: value };
  const document = parseDocumentRef(value);
  if (document) return { kind: 'document', id: documentRef(document.document_id, document.parse_revision_id, document.parsed_content_sha256), parse_revision_id: document.parse_revision_id, parsed_content_sha256: document.parsed_content_sha256 };
  const wiki = /^(companies|industries|themes|comparisons)\/[^/\s?#<>@]+(?:@([a-f0-9]{64}))?$/.exec(value);
  if (wiki && !value.includes('..')) return { kind: 'wiki', id: value.replace(/@[a-f0-9]{64}$/, ''), ...(wiki[2] ? { input_hash: wiki[2] } : {}) };
  return null;
}
