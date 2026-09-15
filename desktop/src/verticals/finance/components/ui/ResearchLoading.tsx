import { useEffect, useState } from 'react';
import './research-loading.css';

export type ResearchLoadingProps = { title?: string; sections?: readonly string[]; compact?: boolean };

/** Presentation only; the caller owns requests and completion. */
export function ResearchLoading({ title = '正在读取研究资料', sections = ['研究资料'], compact = false }: ResearchLoadingProps) {
  const [step, setStep] = useState(0);
  useEffect(() => {
    setStep(0);
    if (compact || sections.length < 2 || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const timer = window.setInterval(() => setStep(value => (value + 1) % sections.length), 900);
    return () => window.clearInterval(timer);
  }, [sections, compact]);
  const current = sections[step % sections.length] || '研究资料';
  return <div role="status" aria-live="polite" aria-busy="true" className={compact ? 'py-3' : 'research-loading'}>
    <p className="text-sm text-muted-foreground">{title}</p>
    {!compact && <div className="research-loading-stage" aria-hidden="true">
      <span className="research-loading-scan" />
      <ol className="research-loading-rail">{sections.map(section => <li key={section} className={section === current ? 'is-active' : ''}><i />{section}</li>)}</ol>
      <div className="research-loading-frame">
        <span className="research-loading-beam" />
        <p className="mb-8 font-medium">{current}</p>
        {[92, 76, 86, 58, 80, 65].map((width, index) => <div key={index} className="research-loading-line" style={{ width: `${width}%` }} />)}
      </div>
    </div>}
  </div>;
}
