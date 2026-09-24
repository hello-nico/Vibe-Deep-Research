import { researchRead } from './research';

// Backend owns object status (T4-a); the preview card only reads and labels it.
type StatusRow = {
  slug: string;
  existence?: 'missing' | 'building' | 'published';
  refresh?: { state?: 'none' | 'checking' | 'candidate' } | null;
  maintenance?: { pending?: number } | null;
  drafts?: { pending?: number } | null;
  report?: { exists?: boolean; stale?: boolean } | null;
};

const TTL_MS = 60_000;
const cache = new Map<string, { at: number; badges: Promise<string[]> }>();

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
  if (!/^(companies|industries)\//.test(slug)) return Promise.resolve([]);
  const hit = cache.get(slug);
  if (hit && Date.now() - hit.at < TTL_MS) return hit.badges;
  const badges = researchRead<{ objects?: StatusRow[] }>('/wiki/objects/status', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ slugs: [slug] }),
  }).then(result => statusBadges(result.objects?.find(item => item.slug === slug))).catch(() => {
    cache.delete(slug);
    return [];
  });
  cache.set(slug, { at: Date.now(), badges });
  return badges;
}
