import { useEffect, useState } from 'react';
import { badgeHref, loadObjectStatuses, statusBadges, type StatusRow } from '../../lib/objectStatus';

export function useObjectStatusRows(slugs: readonly string[]): Map<string, StatusRow> {
  const key = slugs.join('\0');
  const [rows, setRows] = useState(() => new Map<string, StatusRow>());
  useEffect(() => {
    if (!key) { setRows(new Map()); return; }
    let active = true;
    void loadObjectStatuses(key.split('\0')).then(next => { if (active) setRows(next); }).catch(() => { if (active) setRows(new Map()); });
    return () => { active = false; };
  }, [key]);
  return rows;
}

export function ObjectStatusBadges({ slug, row, badges = statusBadges(row) }: { slug: string; row?: StatusRow; badges?: string[] }) {
  if (!badges.length) return null;
  return <span className="inline-flex flex-wrap items-center gap-1.5" aria-label={`对象状态：${badges.join('、')}`}>
    {badges.slice(0, 2).map(badge => {
      const href = badgeHref(slug, badge, row);
      const className = 'inline-flex rounded-md bg-primary/10 px-2 py-0.5 text-[11px] font-medium text-primary';
      return href ? <button key={badge} type="button" className={`${className} hover:bg-primary/20`} onClick={() => window.dispatchEvent(new CustomEvent('finance-object-navigate', { detail: href }))}>{badge}</button>
        : <span key={badge} className={className}>{badge}</span>;
    })}
    {badges.length > 2 && <span className="rounded-md bg-muted px-2 py-0.5 text-[11px] text-muted-foreground" title={badges.slice(2).join('、')} aria-label={`还有 ${badges.length - 2} 项：${badges.slice(2).join('、')}`}>+{badges.length - 2}</span>}
  </span>;
}
