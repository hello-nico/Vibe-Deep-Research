import { useEffect, useRef, useState } from 'react';
import { X } from 'lucide-react';
import { objectLabel, resolveObjectLabels } from '../lib/objectRegistry';
import { WikiReader } from './ResearchKnowledge';
import { SidePanelResizeHandle } from './layout/SidePanelResize';

export function WikiDrawer() {
  const [slug, setSlug] = useState('');
  const [revision, setRevision] = useState(0);
  const closeButton = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    const open = (event: Event) => {
      const next = (event as CustomEvent<string>).detail;
      if (!/^(themes|comparisons)\//.test(next || '')) return;
      setSlug(next);
      void resolveObjectLabels([next]).then(() => setRevision(value => value + 1));
    };
    window.addEventListener('finance-open-wiki-drawer', open);
    return () => window.removeEventListener('finance-open-wiki-drawer', open);
  }, []);
  useEffect(() => { if (slug) closeButton.current?.focus(); }, [slug]);
  if (!slug) return null;
  return <aside role="dialog" aria-label={objectLabel(slug)} className="finance-side-panel finance-wiki-drawer flex-col rounded-2xl border border-border bg-card shadow-xl"
    onKeyDown={event => { if (event.key === 'Escape') { event.stopPropagation(); setSlug(''); } }}>
    <SidePanelResizeHandle />
    <header className="flex shrink-0 items-center justify-between border-b p-5"><h2 className="font-semibold">{objectLabel(slug)}</h2>
      <button ref={closeButton} type="button" aria-label="关闭研究材料" onClick={() => setSlug('')}><X size={18} /></button>
    </header>
    <div className="min-h-0 flex-1 overflow-auto p-5"><WikiReader key={slug} slug={slug} revision={revision} hideToggle standalone /></div>
  </aside>;
}
