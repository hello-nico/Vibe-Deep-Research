import { useEffect, useState } from 'react';
import './research-loading.css';

/** `active`：由调用方给出真实的当前步骤（下标）与说明，不再轮播；省略时按原样轮播。 */
export type ResearchLoadingProps = { title?: string; sections?: readonly string[]; compact?: boolean; active?: { index: number; label: string } };

function useSectionStep(sections: readonly string[], enabled: boolean) {
  const [step, setStep] = useState(0);
  useEffect(() => {
    setStep(0);
    if (!enabled || sections.length < 2 || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const timer = window.setInterval(() => setStep(value => (value + 1) % sections.length), 900);
    return () => window.clearInterval(timer);
  }, [sections, enabled]);
  return sections[step % sections.length] || sections[0] || '研究资料';
}

/** Header chip while a page is rereading or updating; not a completion meter. */
export function ResearchRefreshStatus({ label = '正在刷新…' }: { label?: string }) {
  return <span role="status" aria-live="polite" aria-busy="true" className="research-refresh-status">
    <span className="research-loading-scan" aria-hidden="true" />
    <span className="research-loading-beam" aria-hidden="true" />
    {label}
  </span>;
}

/** Presentation only; the caller owns requests and completion. */
export function ResearchLoading({ title = '正在读取研究资料', sections = ['研究资料'], compact = false, active }: ResearchLoadingProps) {
  const cycling = useSectionStep(sections, !active);
  const current = active ? sections[active.index] ?? '' : cycling;
  if (compact) {
    return <div role="status" aria-live="polite" aria-busy="true" className="research-loading-compact">
      <span className="research-loading-scan" aria-hidden="true" />
      <span className="research-loading-beam" aria-hidden="true" />
      <p className="research-loading-compact-title">{title}</p>
      {sections.length >= 2 && <ol className="research-loading-compact-rail" aria-hidden="true">
        {sections.map(section => <li key={section} className={section === current ? 'is-active' : ''}><i />{section}</li>)}
      </ol>}
    </div>;
  }
  return <div role="status" aria-live="polite" aria-busy="true" className="research-loading">
    <p className="text-sm text-muted-foreground">{title}</p>
    <div className="research-loading-stage" aria-hidden="true">
      <span className="research-loading-scan" />
      <ol className="research-loading-rail">{sections.map(section => <li key={section} className={section === current ? 'is-active' : ''}><i />{section}</li>)}</ol>
      <div className="research-loading-frame">
        <span className="research-loading-beam" />
        <p className="mb-8 font-medium">{active ? active.label : current}</p>
        {[92, 76, 86, 58, 80, 65].map((width, index) => <div key={index} className="research-loading-line" style={{ width: `${width}%` }} />)}
      </div>
    </div>
  </div>;
}
