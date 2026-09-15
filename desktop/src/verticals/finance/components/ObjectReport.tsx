import type { ReactNode } from 'react';
import './research-report.css';

/** R05 single-column story, adapted from Lieflat eace082; no sample metrics. */
export function ObjectReport({ title, asOf, children }: { title: string; asOf?: string; children: ReactNode }) {
  return <article className="research-report">
    <header className="research-report-header">
      <p className="research-report-kicker">VIBE FINANCE / 研究报告</p>
      <h1>{title}</h1>
      {asOf && <p className="research-report-date">资料更新于 {Number.isNaN(Date.parse(asOf)) ? asOf : new Date(asOf).toLocaleDateString('zh-CN')}</p>}
    </header>
    <div className="research-report-story">{children}</div>
    <footer className="research-report-footer">Vibe Finance<span>来源随正文保留 · 点击引用可核对依据</span></footer>
  </article>;
}
