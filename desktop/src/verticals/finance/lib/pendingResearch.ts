import { loadRoster } from './researchRoster';
import { companySlug } from './researchSymbol';
import { loadBackgroundTasks, researchRead, wikiPages } from './research';
import { badgeHref, invalidateObjectStatuses, loadObjectStatuses, type StatusRow } from './objectStatus';
import { resolveObjectLabels } from './objectRegistry';

export type ResearchDraft = {
  draft_id: string; slug: string; status: 'pending' | 'published' | 'invalid'; invalid_reason?: string | null;
  source_session_id?: string | null; source_task_id?: string | null; created_at: string; updated_at: string;
};
export type PendingItem = { id: string; slug: string; kind: 'draft' | 'invalid' | 'refresh' | 'maintenance'; label: string; time?: string; href?: string; draft?: ResearchDraft; draftToken?: string };

export const draftInvalidReason = (reason?: string | null) => ({
  expired: '超过 24 小时未确认', base_changed: '研究页已更新', discarded: '已放弃',
} as Record<string, string>)[reason || ''] || '草案已失效';

export async function loadResearchDrafts(slug: string): Promise<ResearchDraft[]> {
  const result = await researchRead<{ drafts: ResearchDraft[] }>(`/wiki/page-drafts?slug=${encodeURIComponent(slug)}`);
  return result.drafts;
}

export async function discardResearchDraft(draft: ResearchDraft): Promise<void> {
  await researchRead(`/wiki/page-drafts/${encodeURIComponent(draft.draft_id)}/discard`, { method: 'POST' });
  invalidateObjectStatuses([draft.slug]);
  invalidatePendingItems();
}

export function pendingItems(rows: readonly StatusRow[], drafts: readonly ResearchDraft[], now = Date.now()): PendingItem[] {
  const items: PendingItem[] = [];
  for (const draft of drafts) {
    if (draft.status === 'pending') items.push({ id: draft.draft_id, slug: draft.slug, kind: 'draft', label: '草案待确认', time: draft.created_at,
      href: `/my-research?tab=tasks&draft=${encodeURIComponent(draft.draft_id)}`, draft });
    if (draft.status === 'invalid' && now - Date.parse(draft.updated_at) <= 7 * 86_400_000)
      items.push({ id: draft.draft_id, slug: draft.slug, kind: 'invalid', label: `草案已失效 · ${draftInvalidReason(draft.invalid_reason)}`, time: draft.updated_at, draft });
  }
  for (const row of rows) {
    if (row.refresh?.state === 'candidate') items.push({ id: `${row.slug}:refresh`, slug: row.slug, kind: 'refresh', label: '有新资料待确认', time: row.refresh.checked_at || undefined, href: badgeHref(row.slug, '有新资料', row) });
    if ((row.maintenance?.pending || 0) > 0) items.push({ id: `${row.slug}:maintenance`, slug: row.slug, kind: 'maintenance', label: '待确认维护', href: badgeHref(row.slug, '待确认维护', row) });
  }
  return items.sort((a, b) => String(b.time || '').localeCompare(String(a.time || '')));
}

export const pendingCount = (items: readonly PendingItem[]) => items.filter(item => item.kind !== 'invalid').length;

let pendingCache: { until: number; promise: Promise<PendingItem[]> } | undefined;
export function invalidatePendingItems() {
  pendingCache = undefined;
  if (typeof window !== 'undefined') window.dispatchEvent(new Event('finance-pending-changed'));
}

/** The roster and published NBS pages define the scope; status is one 50-slug batch per page. */
export function loadPendingItems(): Promise<PendingItem[]> {
  if (pendingCache && pendingCache.until > Date.now()) return pendingCache.promise;
  const promise = (async () => {
    const industries = await wikiPages('industries');
    const slugs = [...new Set([
      ...loadRoster().map(symbol => companySlug(symbol.replace(/\.(SH|SZ|BJ)$/i, ''))).filter((slug): slug is string => !!slug),
      ...industries.map(item => item.slug).filter(slug => slug.startsWith('industries/nbs-')),
    ])];
    if (!slugs.length) return [];
    const statuses = await loadObjectStatuses(slugs);
    await resolveObjectLabels(slugs).catch(() => {});
    if (statuses.size !== slugs.length || [...statuses.values()].some(row => row.drafts === null || row.refresh === null || row.maintenance === null))
      throw new Error('待处理状态暂时无法完整读取');
    const rows = [...statuses.values()];
    const draftSlugs = rows.filter(row => row.drafts?.latest).map(row => row.slug);
    const drafts = (await Promise.all(draftSlugs.map(loadResearchDrafts))).flat();
    const items = pendingItems(rows, drafts);
    if (items.some(item => item.kind === 'draft')) {
      const background = await loadBackgroundTasks().catch(() => []);
      for (const item of items) if (item.kind === 'draft') item.draftToken = background.find(task => task.draft_id === item.id)?.draft_token;
    }
    return items;
  })().catch(error => { pendingCache = undefined; throw error; });
  pendingCache = { until: Date.now() + 30_000, promise };
  return promise;
}
