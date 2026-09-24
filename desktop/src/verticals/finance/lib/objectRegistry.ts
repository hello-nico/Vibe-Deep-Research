import { documentReadSearch, listLibraryDocuments, parseDocumentRef } from './library';
import { cachedObjectLabel, rememberObjectLabel } from './objectLabels';
import { researchRead, wikiPages, type ResearchTopicSummary } from './research';
import { companySlug } from './researchSymbol';
import { researchTarget } from './researchTarget';
export { rememberObjectLabel } from './objectLabels';

export type ObjectKind = 'company' | 'industry' | 'document' | 'topic' | 'profile' | 'theme' | 'comparison' | 'url' | 'evidence' | 'market' | 'date';
export type RegisteredObject = { kind: ObjectKind; ref: string; id: string; href?: string; label: string; drawer?: boolean };
type Entry = { kind: ObjectKind; parse(ref: string): string | undefined; href(id: string): string | undefined; label(ref: string): string; resolve(refs: string[]): Promise<void> };

/** Old task targets also contain bare company codes and slugs without an exchange. */
export function normalizeResearchTarget(target: string): string | undefined {
  const text = String(target || '').trim();
  if (!text) return undefined;
  if (text.startsWith('industries/')) return text;
  const full = /^companies\/(\d{6})-(sh|sz|bj)$/i.exec(text);
  if (full?.[1] && full[2]) return `companies/${full[1]}-${full[2].toLowerCase()}`;
  const code = text.replace(/^companies\//, '').replace(/\.(SH|SZ|BJ)$/i, '');
  return companySlug(code) || (text.startsWith('companies/') ? text : undefined);
}

const fiveMinutes = 5 * 60_000;
const batches = new Map<string, { until: number; promise: Promise<void> }>();
function batch(key: string, read: () => Promise<void>): Promise<void> {
  const previous = batches.get(key);
  if (previous && previous.until > Date.now()) return previous.promise;
  const promise = read().catch(() => { batches.delete(key); });
  batches.set(key, { until: Date.now() + fiveMinutes, promise });
  return promise;
}
function wikiEntry(kind: 'company' | 'industry' | 'theme' | 'comparison', prefix: string, backendKind: string, fallback: string, href: (id: string) => string | undefined): Entry {
  return {
    kind,
    parse(ref) {
      const normalized = kind === 'company' || kind === 'industry' ? normalizeResearchTarget(ref) : ref;
      const target = researchTarget(normalized || ref);
      return target?.kind === 'wiki' && target.id.startsWith(prefix) ? target.id : undefined;
    },
    href,
    label: ref => cachedObjectLabel(ref) || fallback,
    resolve: () => batch(`wiki:${backendKind}`, async () => {
      const pages = await wikiPages(backendKind);
      for (const page of pages) rememberObjectLabel(page.slug, page.title);
    }),
  };
}
const entries: Entry[] = [
  wikiEntry('company', 'companies/', 'companies', '公司研究', id => `/research?company=${encodeURIComponent(id)}`),
  wikiEntry('industry', 'industries/', 'industries', '行业研究', id => {
    const key = id.replace(/^industries\/(?:nbs-)?/, '');
    return key ? `/sectors/${encodeURIComponent(key)}` : undefined;
  }),
  {
    kind: 'document', parse: ref => researchTarget(ref)?.kind === 'document' ? ref : undefined,
    href: ref => { const doc = parseDocumentRef(ref); return doc ? `/my-reports/read/${encodeURIComponent(doc.document_id)}?${documentReadSearch(doc)}` : undefined; },
    label: ref => cachedObjectLabel(ref) || '资料',
    resolve: () => batch('documents', async () => {
      for (let offset = 0; ; offset += 100) {
        const page = await listLibraryDocuments({ offset, limit: 100 });
        for (const item of page.items) rememberObjectLabel(`document:${item.document_id}`, item.title || '未命名资料');
        if (offset + 100 >= page.total) return;
      }
    }),
  },
  {
    kind: 'topic', parse: ref => researchTarget(ref)?.kind === 'topic' ? ref : undefined,
    href: id => `/my-research/topics/${id.slice(6)}`,
    label: ref => cachedObjectLabel(ref) || '议题',
    resolve: () => batch('topics', async () => {
      await Promise.all((['active', 'archived'] as const).map(async pool => {
        for (let offset = 0; ; offset += 100) {
          const page = await researchRead<{ items: ResearchTopicSummary[]; total?: number }>(`/wiki/research-topics?pool=${pool}&limit=100&offset=${offset}`);
          for (const item of page.items) rememberObjectLabel(item.topic_id, item.title);
          if (page.items.length < 100 || (page.total != null && offset + 100 >= page.total)) break;
        }
      }));
    }),
  },
  {
    kind: 'profile', parse: ref => researchTarget(ref)?.kind === 'profile' ? ref : undefined,
    href: id => { const code = /^profile:sw2:([^:]+):/.exec(id)?.[1]; return code ? `/sectors/profiles/${encodeURIComponent(code)}` : undefined; },
    label: ref => cachedObjectLabel(ref) || '产业研究', resolve: async () => {},
  },
  wikiEntry('theme', 'themes/', 'themes', '主题研究', () => undefined),
  wikiEntry('comparison', 'comparisons/', 'comparisons', '对比研究', () => undefined),
  ...(['url', 'evidence', 'market', 'date'] as const).map(kind => ({
    kind,
    parse: (ref: string) => researchTarget(ref)?.kind === kind ? ref : undefined,
    href: () => undefined,
    label: (ref: string) => cachedObjectLabel(ref) || ({ url: '网页', evidence: '依据', market: '大盘', date: '日期' }[kind]),
    resolve: async () => {},
  })),
];

export function registeredObject(ref: string): RegisteredObject | undefined {
  for (const entry of entries) {
    const id = entry.parse(ref);
    if (id) return { kind: entry.kind, ref, id, href: entry.href(id), label: entry.label(ref), drawer: entry.kind === 'theme' || entry.kind === 'comparison' };
  }
  return undefined;
}
export const objectHref = (ref: string) => registeredObject(ref)?.href;
export const objectLabel = (ref: string) => registeredObject(ref)?.label || cachedObjectLabel(ref) || '引用';
export async function resolveObjectLabels(refs: readonly string[]): Promise<void> {
  const missing = new Set(refs.filter(ref => !cachedObjectLabel(ref)).map(ref => registeredObject(ref)?.kind).filter(Boolean));
  await Promise.all(entries.filter(entry => missing.has(entry.kind)).map(entry => entry.resolve([...refs])));
}

/**
 * Warm every name source once at startup. DSH resolves chat chips synchronously and
 * does not re-ask after an async lookup, so names must be cached before first render.
 */
export async function hydrateObjectLabels(): Promise<void> {
  await Promise.allSettled(entries.map(entry => entry.resolve([])));
}

/** The DSH host handles in-app navigation; drawers and evidence use their established events. */
export function openRegisteredObject(ref: string): boolean {
  const object = registeredObject(ref);
  if (!object || typeof window === 'undefined') return false;
  if (object.href) window.dispatchEvent(new CustomEvent('finance-object-navigate', { detail: object.href }));
  else if (object.drawer) window.dispatchEvent(new CustomEvent('finance-open-wiki-drawer', { detail: object.id }));
  else if (object.kind === 'url') window.open(researchTarget(ref)?.id, '_blank', 'noopener,noreferrer');
  else if (object.kind === 'evidence') window.dispatchEvent(new CustomEvent('finance-open-evidence', { detail: researchTarget(ref)?.id }));
  else if (object.kind === 'market') window.dispatchEvent(new CustomEvent('finance-object-navigate', { detail: '/' }));
  else return false;
  return true;
}
