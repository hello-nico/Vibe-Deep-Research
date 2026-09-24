import { researchRead } from './research';

// Backend owns object status (T4-a); UI reads the same rows in batches.
export type StatusRow = {
  slug: string;
  errors?: string[];
  existence?: 'missing' | 'building' | 'published';
  refresh?: { state?: 'none' | 'checking' | 'candidate'; checked_at?: string | null } | null;
  maintenance?: { pending?: number } | null;
  drafts?: { pending?: number; latest?: { draft_id: string; status: 'pending' | 'published' | 'invalid'; reason?: string | null; created_at: string } | null } | null;
  report?: { exists?: boolean; stale?: boolean } | null;
};

const TTL_MS = 60_000;
const cache = new Map<string, { until: number; row: Promise<StatusRow | undefined> }>();
const validSlug = (slug: string) => /^(companies|industries)\//.test(slug);

/** Reuses in-flight rows and limits every Backend request to 50 objects. */
export async function loadObjectStatuses(slugs: readonly string[]): Promise<Map<string, StatusRow>> {
  const unique = [...new Set(slugs.filter(validSlug))];
  const missing = unique.filter(slug => !cache.has(slug) || cache.get(slug)!.until <= Date.now());
  for (let index = 0; index < missing.length; index += 50) {
    const batch = missing.slice(index, index + 50);
    const request = researchRead<{ objects: StatusRow[] }>('/wiki/objects/status', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ slugs: batch }),
    });
    for (const slug of batch) {
      const row = request.then(result => result.objects.find(item => item.slug === slug));
      cache.set(slug, { until: Date.now() + TTL_MS, row });
      void row.catch(() => cache.delete(slug));
    }
  }
  const rows = await Promise.all(unique.map(async slug => [slug, await cache.get(slug)!.row] as const));
  return new Map(rows.filter((item): item is readonly [string, StatusRow] => !!item[1]));
}

export function invalidateObjectStatuses(slugs: readonly string[]) {
  for (const slug of slugs) cache.delete(slug);
}

/** Plain-language status badges, most actionable first; empty when nothing needs attention. */
export function statusBadges(row: StatusRow | undefined): string[] {
  if (!row) return [];
  const badges: string[] = [];
  if (row.existence === 'missing') badges.push('尚未建立');
  if (row.existence === 'building') badges.push('建立中');
  if ((row.drafts?.pending || 0) > 0) badges.push('草案待确认');
  if ((row.maintenance?.pending || 0) > 0) badges.push('待确认维护');
  if (row.refresh?.state === 'candidate') badges.push('有新资料');
  if (row.refresh?.state === 'checking') badges.push('检查资料中');
  if (row.report?.exists && row.report.stale) badges.push('报告已过期');
  return badges;
}

export function loadObjectBadges(slug: string): Promise<string[]> {
  return loadObjectStatuses([slug]).then(rows => statusBadges(rows.get(slug))).catch(() => []);
}

export function badgeHref(slug: string, badge: string, row?: StatusRow): string | undefined {
  const base = slug.startsWith('companies/') ? `/research?company=${encodeURIComponent(slug)}`
    : slug.startsWith('industries/nbs-') ? `/sectors/${encodeURIComponent(slug.slice('industries/nbs-'.length))}` : undefined;
  if (!base) return undefined;
  if (badge === '有新资料') return `${base}${base.includes('?') ? '&' : '?'}refresh=confirm`;
  if (badge === '草案待确认') return row?.drafts?.latest?.status === 'pending'
    ? `/my-research?tab=tasks&draft=${encodeURIComponent(row.drafts.latest.draft_id)}` : '/my-research?tab=pending';
  if (badge === '报告已过期') return `${base}${base.includes('?') ? '&' : '?'}view=report`;
  if (badge === '建立中' || badge === '待确认维护') return base;
  return undefined;
}
