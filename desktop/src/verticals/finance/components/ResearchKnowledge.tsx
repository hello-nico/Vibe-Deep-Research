import { useEffect, useState } from 'react';
import { Link, useLocation, useSearchParams } from 'react-router-dom';
import { Building2, ChartNoAxesCombined, Landmark, Scale, ScanEye, BookOpen } from 'lucide-react';
import { GlassCard } from './ui/GlassCard';
import ReactMarkdown, { defaultUrlTransform } from 'react-markdown';
import { decodeEvidenceLink } from '../lib/evidence';
import { remarkCitationMarks } from '../lib/citationMarks';
import { EvidenceLink } from './EvidenceCard';
import remarkGfm from 'remark-gfm';
import { researchRead, type WikiPage } from '../lib/research';
import { FACT_SECTIONS, factItems, factLabel, formatFactValue, providerSnapshot } from '../lib/wikiFacts';

export function KnowledgeText({ markdown }: { markdown: string }) {
  // The accepted artifact includes YAML for machines; only its body is reader content.
  const body = markdown.replace(/^\uFEFF?---\r?\n[\s\S]*?\r?\n---(?:\r?\n|$)/, '');
  return <div className="finance-cite-root prose prose-sm max-w-none break-words leading-8 prose-headings:tracking-tight prose-h1:text-2xl prose-h2:mt-8 prose-h2:border-b prose-h2:border-border/60 prose-h2:pb-3 prose-table:text-xs dark:prose-invert overflow-x-auto"><ReactMarkdown remarkPlugins={[remarkGfm, remarkCitationMarks]} urlTransform={url => decodeEvidenceLink(url) ? url : defaultUrlTransform(url)} components={{ a: ({ href, children }) => {
    const reference = decodeEvidenceLink(href || '');
    return reference ? <EvidenceLink reference={reference}>{children}</EvidenceLink> : <a href={href}>{children}</a>;
  } }}>{body}</ReactMarkdown></div>;
}
function CompanySections({ markdown, blocks }: { markdown: string; blocks: WikiPage['spec']['blocks'] }) {
  const sections: { title: string; lines: string[] }[] = [];
  let current = { title: '', lines: [] as string[] };
  let fence = '';
  for (const line of markdown.split('\n')) {
    const marker = line.match(/^\s{0,3}(`{3,}|~{3,})/);
    if (marker?.[1]) {
      if (!fence) fence = marker[1];
      else if (marker[1][0] === fence[0] && marker[1].length >= fence.length) fence = '';
    }
    const heading = fence ? null : line.match(/^##\s+(.+?)\s*$/);
    if (heading?.[1]) {
      if (current.title || current.lines.join('\n').trim()) sections.push(current);
      current = { title: heading[1], lines: [] };
    } else current.lines.push(line);
  }
  if (current.title || current.lines.join('\n').trim()) sections.push(current);
  const icons: Record<string, typeof BookOpen> = { 经营: ChartNoAxesCombined, 财务: Landmark, 估值: Scale, 观察窗口: ScanEye };
  return <div className="space-y-5">{sections.map((section, index) => {
    const Icon = icons[section.title] || BookOpen;
    const content = section.lines.join('\n').trim();
    const facts = factItems(blocks.find(block => block.kind === FACT_SECTIONS[section.title])?.content);
    return <GlassCard glow key={index} className="!p-6">
      <header className="mb-4 flex items-center gap-3 border-b border-border/60 pb-4"><span className="rounded-xl bg-primary/10 p-2.5 text-primary"><Icon size={20} /></span><h3 className="text-base font-semibold">{section.title || '研究概览'}</h3></header>
      {section.title === '资料时间线' ? <SourceTimeline content={blocks.find(block => block.kind === 'source_timeline')?.content} /> : facts.length ? <FactList items={facts} /> : content ? <KnowledgeText markdown={content} /> : <p className="py-2 text-sm text-muted-foreground">资料待补充</p>}
    </GlassCard>;
  })}</div>;
}
function FactList({ items }: { items: Record<string, unknown>[] }) {
  return <div className="finance-cite-root prose prose-sm max-w-none break-words leading-8 dark:prose-invert"><ul>{items.map((item, index) => {
    const ref = typeof item.ref === 'string' ? item.ref.trim() : '';
    const snapshot = providerSnapshot(item);
    const link = /^(claim|evidence|source):/.test(ref) ? <EvidenceLink reference={ref}>查看依据</EvidenceLink>
      : snapshot ? <EvidenceLink reference={ref || `provider:local:${index}`} snapshot={snapshot}>查看依据</EvidenceLink>
      : null;
    return <li key={index}>{factLabel(item)}：<strong>{formatFactValue(item)}</strong>{link && <>（{link}）</>}</li>;
  })}</ul></div>;
}
function SourceTimeline({ content }: { content?: Record<string, unknown> }) {
  const location = useLocation();
  const items = Array.isArray(content?.items) ? content.items.filter((item): item is Record<string, unknown> => !!item && typeof item === 'object') : [];
  const labels: Record<string, string> = { annual_report: '年报', quarterly_report: '季报', research_report: '研报', announcement: '公告', news: '新闻', earnings_call: '业绩交流' };
  if (!items.length) return <p className="py-2 text-sm text-muted-foreground">资料待补充</p>;
  return <ul className="divide-y divide-border/50">{items.map((item, index) => {
    const title = typeof item.title === 'string' && item.title.trim() ? item.title : '未命名资料';
    const kind = labels[String(item.document_type)] || '资料';
    const period = typeof item.reporting_period === 'string' ? item.reporting_period : '';
    const id = typeof item.document_id === 'string' && /^[a-f0-9]+$/.test(item.document_id) ? item.document_id : null;
    return <li key={index} className="flex flex-col gap-2 py-3 first:pt-0 sm:flex-row sm:items-baseline sm:gap-4"><span className="shrink-0 text-xs text-muted-foreground sm:w-24">{[period, kind].filter(Boolean).join(' · ')}</span>{id ? <Link className="text-sm font-medium leading-6 hover:text-primary" to={`/my-reports/read/${encodeURIComponent(id)}?from=${encodeURIComponent(location.pathname + location.search)}`} onClick={() => sessionStorage.setItem(`finance-scroll:${location.pathname}${location.search}`, String(document.getElementById("workspace-main")?.scrollTop ?? 0))}>{title}<span className="ml-2 text-primary" aria-hidden="true">↗</span></Link> : <span className="text-sm font-medium leading-6">{title}</span>}</li>;
  })}</ul>;
}
export function ReferenceButtons({ refs }: { refs: string[] }) {
  const readable = [...new Set(refs)].filter(ref => /^(claim|evidence|source|provider):/.test(ref));
  return <section className="finance-cite-root mt-8 border-t border-border pt-5"><h3 className="mb-4 font-semibold">研究依据</h3>
    <div className="flex flex-wrap gap-3">{readable.map((ref, index) => <EvidenceLink key={ref} reference={ref}>依据 {index + 1}</EvidenceLink>)}</div>
    {!readable.length && <p className="text-sm text-muted-foreground">尚无可回读依据。</p>}
  </section>;
}
export function WikiReader({ slug, onMarkdown, onLoadState }: { slug: string; onMarkdown?: (markdown: string) => void; onLoadState?: (state: 'loading' | 'ready' | 'error') => void }) {
  const [search, setSearch] = useSearchParams();
  const restored = search.get('reader');
  const [trail, setTrail] = useState<string[]>(() => restored && restored !== slug ? [slug, restored] : [slug]);
  const [related, setRelated] = useState<{ slug: string; title: string }[]>([]);
  const [linkError, setLinkError] = useState('');
  useEffect(() => { setTrail(restored && restored !== slug ? [slug, restored] : [slug]); }, [slug]);
  const active = trail[trail.length - 1] || slug;
  useEffect(() => {
    const controller = new AbortController();
    setRelated([]); setLinkError('');
    void researchRead<{ items: typeof related }>(`/wiki/pages/related?slug=${encodeURIComponent(active)}`, { signal: controller.signal })
      .then(value => setRelated(value.items)).catch(() => { if (!controller.signal.aborted) setLinkError('相关材料暂时无法读取'); });
    return () => controller.abort();
  }, [active]);
  const navigate = (next: string[]) => {
    setTrail(next);
    setSearch(previous => {
      const params = new URLSearchParams(previous);
      if (next.length > 1) params.set('reader', next[next.length - 1] || slug); else params.delete('reader');
      return params;
    }, { replace: true });
  };
  const open = (next: string) => {
    const existing = trail.indexOf(next);
    navigate(existing >= 0 ? trail.slice(0, existing + 1) : [...trail.slice(-31), next]);
  };
  return <div>
    {trail.length > 1 && <button className="workspace-action mb-4" onClick={() => navigate(trail.slice(0, -1))}>返回上一份材料</button>}
    <WikiBody key={active} slug={active} onMarkdown={onMarkdown} onLoadState={onLoadState} />
    {!!related.length && <GlassCard className="mt-4"><h3 className="mb-3 text-sm font-semibold">相关研究材料</h3><div className="flex flex-wrap gap-2">{related.map(item => <button key={item.slug} className="workspace-action" onClick={() => open(item.slug)}>{item.title}</button>)}</div></GlassCard>}
    {linkError && <p role="status" className="mt-3 text-sm text-muted-foreground">{linkError}</p>}
  </div>;
}
function WikiBody({ slug, onMarkdown, onLoadState }: { slug: string; onMarkdown?: (markdown: string) => void; onLoadState?: (state: 'loading' | 'ready' | 'error') => void }) {
  const [page, setPage] = useState<WikiPage | null>(null);
  const [error, setError] = useState('');
  useEffect(() => {
    const controller = new AbortController(); setPage(null); setError('');
    void researchRead<WikiPage>('/wiki/pages/read?slug=' + encodeURIComponent(slug), { signal: controller.signal }).then(setPage).catch(e => { if (!controller.signal.aborted) setError(String(e)); });
    return () => controller.abort();
  }, [slug]);
  useEffect(() => { onMarkdown?.(page?.markdown ?? ''); }, [page, onMarkdown]);
  useEffect(() => { onLoadState?.(error ? 'error' : page ? 'ready' : 'loading'); }, [page, error, onLoadState]);
  if (error) return <p role="alert">{error}</p>;
  if (!page) return <p role="status">正在读取 Wiki…</p>;
  const identity = page.spec.blocks.find(block => block.kind === 'identity')?.content;
  if (page.spec.type === 'company' && identity) {
    const fields = [['symbol', '股票代码'], ['industry', '所属行业'], ['parent_industry', '行业大类']] as const;
    // Keep the Backend's reader text and citation links; replace only its company identity projection.
    const body = page.markdown.replace(/^\uFEFF?---\r?\n[\s\S]*?\r?\n---(?:\r?\n|$)/, '').replace(/^\s*# [^\n]+\r?\n/, '').replace(/^## 身份\s*\r?\n[\s\S]*?(?=^## |$(?![\s\S]))/m, '');
    return <article className="mx-auto max-w-4xl py-2">
      <GlassCard glow className="mb-6 !p-6"><div className="flex items-start gap-4"><span className="rounded-2xl bg-primary/10 p-3 text-primary"><Building2 size={24} /></span><div><p className="mb-1 text-xs text-muted-foreground">公司研究 · {page.spec.as_of}</p><h2 className="text-2xl font-semibold tracking-tight">{page.spec.title}</h2></div></div>
        <dl className="mt-6 grid grid-cols-1 gap-4 border-t border-border/60 pt-5 sm:grid-cols-3">{fields.map(([key, label]) => <div key={key}><dt className="text-xs text-muted-foreground">{label}</dt><dd className="mt-2 text-sm font-medium">{typeof identity[key] === 'string' && identity[key] ? String(identity[key]) : '暂无资料'}</dd></div>)}</dl>
      </GlassCard>
      <CompanySections markdown={body} blocks={page.spec.blocks} />
    </article>;
  }
  return <article className="mx-auto max-w-4xl py-2"><p className="mb-6 inline-flex rounded-full bg-primary/10 px-3 py-1 text-xs text-primary">研究资料 · {page.spec.as_of}</p>
    <KnowledgeText markdown={page.markdown} /><ReferenceButtons key={slug} refs={[...page.spec.blocks, ...(page.spec.research_blocks ?? [])].flatMap(block => block.refs)} /></article>;
}
