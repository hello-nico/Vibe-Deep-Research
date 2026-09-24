import { useEffect, useRef, useState } from 'react';
import { BookOpen, Building2, Factory, FileText, Layers, type LucideIcon } from 'lucide-react';
import { objectFacts, openRegisteredObject, registeredObject, type ObjectKind } from '../lib/objectRegistry';
import { loadObjectStatuses, type StatusRow } from '../lib/objectStatus';
import { ObjectStatusBadges } from './ui/ObjectStatusBadges';
import './object-preview.css';

// Hover preview for object tags (design v1 §4.4): reads only cached knowledge and Backend
// status, never fetches external data. Tags opt in with data-ref (research mentions today).
const TAG = '[data-research-mention][data-ref], [data-object-ref]';
const SHOW_DELAY_MS = 350;
const HIDE_DELAY_MS = 180;
const CARD_WIDTH = 320;
const PREVIEWABLE = new Set<ObjectKind>(['company', 'industry', 'document', 'topic', 'theme', 'comparison']);
const ICONS: Partial<Record<ObjectKind, LucideIcon>> = {
  company: Building2, industry: Factory, document: FileText, topic: BookOpen, theme: Layers, comparison: Layers,
};
const KIND_LABEL: Partial<Record<ObjectKind, string>> = {
  company: '公司', industry: '行业', document: '资料', topic: '议题', theme: '主题研究', comparison: '对比研究',
};
const EMPTY_SUMMARY: Partial<Record<ObjectKind, string>> = { company: '资料待补充', industry: '资料待补充' };

type Anchor = { ref: string; rect: DOMRect };

function refOf(node: Element): string {
  return (node as HTMLElement).dataset.objectRef || (node as HTMLElement).dataset.ref || '';
}

function place(rect: DOMRect, height: number) {
  const gap = 8;
  const left = Math.max(12, Math.min(rect.left, window.innerWidth - CARD_WIDTH - 12));
  const below = rect.bottom + gap;
  const top = below + height > window.innerHeight - 12 ? Math.max(12, rect.top - gap - height) : below;
  return { left, top };
}

export function ObjectPreviewLayer() {
  const [anchor, setAnchor] = useState<Anchor | null>(null);
  const [status, setStatus] = useState<StatusRow>();
  const [height, setHeight] = useState(160);
  const card = useRef<HTMLDivElement>(null);
  const timers = useRef<{ show?: number; hide?: number }>({});

  useEffect(() => {
    const clear = () => { window.clearTimeout(timers.current.show); window.clearTimeout(timers.current.hide); };
    const open = (tag: Element) => {
      const ref = refOf(tag);
      const object = registeredObject(ref);
      if (!object || !PREVIEWABLE.has(object.kind)) return;
      clear();
      timers.current.show = window.setTimeout(() => setAnchor({ ref, rect: tag.getBoundingClientRect() }), SHOW_DELAY_MS);
    };
    const close = () => {
      window.clearTimeout(timers.current.show);
      timers.current.hide = window.setTimeout(() => setAnchor(null), HIDE_DELAY_MS);
    };
    const over = (event: Event) => {
      const target = event.target instanceof Element ? event.target : null;
      if (target?.closest('.finance-object-preview')) { window.clearTimeout(timers.current.hide); return; }
      const tag = target?.closest(TAG);
      if (tag) open(tag);
    };
    const out = (event: Event) => {
      const target = event.target instanceof Element ? event.target : null;
      const next = (event as PointerEvent).relatedTarget instanceof Element ? (event as PointerEvent).relatedTarget as Element : null;
      if (!target?.closest(`${TAG}, .finance-object-preview`)) return;
      if (next?.closest(`${TAG}, .finance-object-preview`)) return;
      close();
    };
    const hideNow = () => { clear(); setAnchor(null); };
    const onKey = (event: KeyboardEvent) => { if (event.key === 'Escape') hideNow(); };
    document.addEventListener('pointerover', over);
    document.addEventListener('pointerout', out);
    document.addEventListener('focusin', over);
    document.addEventListener('focusout', out);
    window.addEventListener('scroll', hideNow, true);
    window.addEventListener('keydown', onKey);
    return () => {
      clear();
      document.removeEventListener('pointerover', over);
      document.removeEventListener('pointerout', out);
      document.removeEventListener('focusin', over);
      document.removeEventListener('focusout', out);
      window.removeEventListener('scroll', hideNow, true);
      window.removeEventListener('keydown', onKey);
    };
  }, []);

  useEffect(() => {
    setStatus(undefined);
    if (!anchor) return;
    const object = registeredObject(anchor.ref);
    let alive = true;
    if (object && (object.kind === 'company' || object.kind === 'industry')) {
      void loadObjectStatuses([object.id]).then(rows => { if (alive) setStatus(rows.get(object.id)); }).catch(() => {});
    }
    return () => { alive = false; };
  }, [anchor]);

  useEffect(() => {
    if (card.current) setHeight(card.current.offsetHeight);
  }, [anchor, status]);

  if (!anchor) return null;
  const object = registeredObject(anchor.ref);
  if (!object) return null;
  const facts = objectFacts(anchor.ref);
  const Icon = ICONS[object.kind] || FileText;
  const summary = facts?.summary || EMPTY_SUMMARY[object.kind];
  const { left, top } = place(anchor.rect, height);
  return <div ref={card} role="dialog" aria-label={`${object.label} 预览`} className="finance-object-preview" style={{ left, top, width: CARD_WIDTH }}>
    <div className="finance-object-preview-head">
      <span className="finance-object-preview-icon" aria-hidden="true"><Icon size={16} /></span>
      <div className="min-w-0">
        <div className="finance-object-preview-title">{object.label}</div>
        <div className="finance-object-preview-meta">{[KIND_LABEL[object.kind], facts?.meta].filter(Boolean).join(' · ')}</div>
      </div>
    </div>
    {summary && <p className="finance-object-preview-summary">{summary}</p>}
    {status && <div className="finance-object-preview-badges"><ObjectStatusBadges slug={object.id} row={status} /></div>}
    <div className="finance-object-preview-foot">
      <span>{facts?.asOf ? `资料截至 ${facts.asOf}` : ''}</span>
      <button type="button" className="workspace-action workspace-action-compact" onClick={() => { setAnchor(null); openRegisteredObject(anchor.ref); }}>打开</button>
    </div>
  </div>;
}
