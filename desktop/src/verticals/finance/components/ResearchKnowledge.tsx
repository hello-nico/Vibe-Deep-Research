import { useEffect, useState, type ReactNode } from 'react';
import { Building2, ChartNoAxesCombined, Landmark, Scale, ScanEye, BookOpen } from 'lucide-react';
import { GlassCard } from './ui/GlassCard';
import { EvidenceLink } from './EvidenceCard';
import { researchRead, ResearchError, type WikiPage } from '../lib/research';
import { FACT_SECTIONS, factItems, factLabel, formatFactValue, providerSnapshot } from '../lib/wikiFacts';
import { WikiLoading } from './WikiLoading';
import { ObjectReport } from './ObjectReport';
import { KnowledgeText, SourceTimeline } from './WikiReport';
import { WikiReportPane } from './WikiReportPane';
import { cn } from '@/lib/utils';
import { loadReadyIndustryProfiles, objectLabel, openRegisteredObject, readableRelatedWikiRefs, registeredObject } from '../lib/objectRegistry';

export { WikiLoading, wikiLoadingSections } from './WikiLoading';
export { KnowledgeText } from './WikiReport';

export function WikiViewTabs({ report, onChange }: { report: boolean; onChange: (report: boolean) => void }) {
  return <div role="tablist" aria-label="资料视图" className="flex h-10 w-fit shrink-0 items-stretch gap-0.5 rounded-xl border border-border p-[3px]">
    {([[false, '研究页'], [true, '图文报告']] as const).map(([id, label]) => (
      <button key={label} type="button" role="tab" aria-label={label} aria-selected={report === id}
        className={cn('rounded-[9px] px-3.5 text-[13px] transition-colors', report === id ? 'bg-muted font-medium text-foreground' : 'text-muted-foreground hover:text-foreground')}
        onClick={() => onChange(id)}>
        {label}
      </button>
    ))}
  </div>;
}

const blockDict = (content: unknown): Record<string, unknown> | undefined =>
  content && typeof content === 'object' && !Array.isArray(content) ? content as Record<string, unknown> : undefined;

function WikiSections({ markdown, blocks, company = false, report = false }: { markdown: string; blocks: WikiPage['spec']['blocks']; company?: boolean; report?: boolean }) {
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
  return <div className={report ? 'research-report-story' : 'space-y-5'}>{sections.map((section, index) => {
    const Icon = icons[section.title] || BookOpen;
    const content = section.lines.join('\n').trim();
    const facts = factItems(blockDict(blocks.find(block => block.kind === FACT_SECTIONS[section.title])?.content));
    if (report) return <section key={index}><h2>{section.title || '研究概览'}</h2>{company && section.title === '资料时间线' ? <SourceTimeline content={blockDict(blocks.find(block => block.kind === 'source_timeline')?.content)} /> : facts.length ? <FactList items={facts} /> : content ? <KnowledgeText markdown={content} /> : <p className="text-sm text-muted-foreground">资料待补充</p>}</section>;
    return <GlassCard glow key={index} className="!p-6">
      <header className="mb-4 flex items-center gap-3 border-b border-border/60 pb-4"><span className="rounded-xl bg-primary/10 p-2.5 text-primary"><Icon size={20} /></span><h3 className="text-base font-semibold">{section.title || '研究概览'}</h3></header>
      {company && section.title === '资料时间线' ? <SourceTimeline content={blockDict(blocks.find(block => block.kind === 'source_timeline')?.content)} /> : facts.length ? <FactList items={facts} /> : content ? <KnowledgeText markdown={content} /> : <p className="py-2 text-sm text-muted-foreground">资料待补充</p>}
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
export function ReferenceButtons({ refs }: { refs: string[] }) {
  const readable = [...new Set(refs)].filter(ref => /^(claim|evidence|source|provider):/.test(ref));
  return <section className="finance-cite-root mt-8 border-t border-border pt-5"><h3 className="mb-4 font-semibold">研究依据</h3>
    <div className="flex flex-wrap gap-3">{readable.map((ref, index) => <EvidenceLink key={ref} reference={ref}>依据 {index + 1}</EvidenceLink>)}</div>
    {!readable.length && <p className="text-sm text-muted-foreground">尚无可回读依据。</p>}
  </section>;
}
export function WikiReader({ slug, onMarkdown, onPage, onLoadState, revision = 0, renderLoading = value => <WikiLoading slug={value} />, report: reportProp, onReportChange, hideToggle = false, reportActionSlot = null }: {
  slug: string;
  onMarkdown?: (markdown: string) => void;
  onPage?: (page: WikiPage | null) => void;
  onLoadState?: (state: 'loading' | 'ready' | 'error') => void;
  revision?: number;
  renderLoading?: (slug: string) => ReactNode;
  report?: boolean;
  onReportChange?: (report: boolean) => void;
  hideToggle?: boolean;
  /** Page toolbar action group that receives the report's regenerate action. */
  reportActionSlot?: HTMLElement | null;
}) {
  const [internalReport, setInternalReport] = useState(false);
  const report = reportProp ?? internalReport;
  const setReport = onReportChange ?? setInternalReport;
  const [related, setRelated] = useState<{ slug: string; title: string }[]>([]);
  const [linkError, setLinkError] = useState('');
  const [, setProfileVersion] = useState(0);
  useEffect(() => {
    let active = true;
    void loadReadyIndustryProfiles().then(() => { if (active) setProfileVersion(value => value + 1); }).catch(() => {});
    return () => { active = false; };
  }, [slug]);
  useEffect(() => {
    const controller = new AbortController();
    setRelated([]); setLinkError('');
    void researchRead<{ items: typeof related }>(`/wiki/pages/related?slug=${encodeURIComponent(slug)}`, { signal: controller.signal })
      .then(async value => {
        const readable = await readableRelatedWikiRefs(value.items.map(item => item.slug));
        if (!controller.signal.aborted) setRelated(value.items.filter(item => readable.has(item.slug)));
      }).catch(e => { if (!controller.signal.aborted) setLinkError(e instanceof ResearchError ? e.message : '相关材料暂时无法核对'); });
    return () => controller.abort();
  }, [slug]);
  return <div>
    {!hideToggle && <div className="mb-4"><WikiViewTabs report={report} onChange={setReport} /></div>}
    <WikiBody key={slug} slug={slug} report={report} revision={revision} renderLoading={renderLoading} onMarkdown={onMarkdown} onPage={onPage} onLoadState={onLoadState} reportActionSlot={reportActionSlot} />
    {!report && !!related.length && <GlassCard className="mx-auto mt-4 max-w-4xl"><h3 className="mb-3 text-sm font-semibold">相关研究材料</h3><div className="finance-cite-root flex flex-wrap gap-2">{related.map(item => {
      const object = registeredObject(item.slug);
      const label = objectLabel(item.slug);
      return object?.href || object?.drawer
        ? <button key={item.slug} type="button" className="finance-citation" onClick={() => openRegisteredObject(item.slug)}>{label}</button>
        : <span key={item.slug} className="finance-citation !cursor-default">{label}</span>;
    })}</div></GlassCard>}
    {linkError && <p role="status" className="mt-3 text-sm text-muted-foreground">{linkError}</p>}
  </div>;
}

function WikiBody({ slug, report, onMarkdown, onPage, onLoadState, revision, renderLoading, reportActionSlot }: { slug: string; report: boolean; onMarkdown?: (markdown: string) => void; onPage?: (page: WikiPage | null) => void; onLoadState?: (state: 'loading' | 'ready' | 'error') => void; revision: number; renderLoading: (slug: string) => ReactNode; reportActionSlot: HTMLElement | null }) {
  const [page, setPage] = useState<WikiPage | null>(null);
  const [error, setError] = useState('');
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    const controller = new AbortController(); setError('');
    void researchRead<WikiPage>('/wiki/pages/read?slug=' + encodeURIComponent(slug), { signal: controller.signal }).then(setPage).catch(e => { if (!controller.signal.aborted) setError(e instanceof ResearchError ? e.message : String(e)); });
    return () => controller.abort();
  }, [slug, revision, retry]);
  useEffect(() => { onMarkdown?.(page?.markdown ?? ''); }, [page, onMarkdown]);
  useEffect(() => { onPage?.(page); }, [page, onPage]);
  useEffect(() => { onLoadState?.(error ? 'error' : page ? 'ready' : 'loading'); }, [page, error, onLoadState]);
  const failure = error ? <p role="alert" className="mb-4 text-sm">{page ? `资料读取失败，仍显示已有内容：${error}` : error}<button className="workspace-action ml-2" onClick={() => setRetry(value => value + 1)}>重试</button></p> : null;
  if (!page) return failure || renderLoading(slug);
  const identity = blockDict(page.spec.blocks.find(block => block.kind === 'identity')?.content);
  const dashboard = (() => {
    if (page.spec.type === 'company' && identity) {
      const fields = [['symbol', '股票代码'], ['industry', '所属行业'], ['parent_industry', '行业大类']] as const;
      const body = page.markdown.replace(/^\uFEFF?---\r?\n[\s\S]*?\r?\n---(?:\r?\n|$)/, '').replace(/^\s*# [^\n]+\r?\n/, '').replace(/^## 身份\s*\r?\n[\s\S]*?(?=^## |$(?![\s\S]))/m, '');
      return <article className="mx-auto max-w-4xl py-2">{failure}
        <GlassCard glow className="mb-6 !p-6"><div className="flex items-start gap-4"><span className="rounded-2xl bg-primary/10 p-3 text-primary"><Building2 size={24} /></span><div><p className="mb-1 text-xs text-muted-foreground">公司研究 · {page.spec.as_of}</p><h2 className="text-2xl font-semibold tracking-tight">{page.spec.title}</h2></div></div>
          <dl className="mt-6 grid grid-cols-1 gap-4 border-t border-border/60 pt-5 sm:grid-cols-3">{fields.map(([key, label]) => <div key={key}><dt className="text-xs text-muted-foreground">{label}</dt><dd className="mt-2 text-sm font-medium">{typeof identity[key] === 'string' && identity[key] ? String(identity[key]) : '暂无资料'}</dd></div>)}</dl>
        </GlassCard>
        <WikiSections markdown={body} blocks={page.spec.blocks} company />
      </article>;
    }
    if (page.spec.type === 'industry') {
      const body = page.markdown.replace(/^\uFEFF?---\r?\n[\s\S]*?\r?\n---(?:\r?\n|$)/, '').replace(/^\s*# [^\n]+\r?\n/, '').replace(`主体标识：\`${page.spec.subject_id}\`。`, '');
      return <article className="mx-auto max-w-4xl py-2">{failure}
        <header className="mb-6"><p className="mb-2 text-xs text-muted-foreground">行业研究 · 内容更新于 {page.spec.as_of}</p><h2 className="text-2xl font-semibold tracking-tight">{page.spec.title}</h2></header>
        <WikiSections markdown={body} blocks={page.spec.blocks} />
      </article>;
    }
    return <article className="mx-auto max-w-4xl py-2">{failure}<p className="mb-6 inline-flex rounded-full bg-primary/10 px-3 py-1 text-xs text-primary">研究资料 · {page.spec.as_of}</p>
      <KnowledgeText markdown={page.markdown} /><ReferenceButtons key={slug} refs={[...page.spec.blocks, ...(page.spec.research_blocks ?? [])].flatMap(block => block.refs)} /></article>;
  })();
  if (['company', 'industry', 'theme', 'comparison'].includes(page.spec.type ?? '')) {
    return <WikiReportPane page={page} active={report} fallback={dashboard} actionSlot={reportActionSlot} />;
  }
  if (report) {
    const body = page.markdown.replace(/^\uFEFF?---\r?\n[\s\S]*?\r?\n---(?:\r?\n|$)/, '').replace(/^\s*# [^\n]+\r?\n/, '').replace(`主体标识：\`${page.spec.subject_id}\`。`, '');
    return <>{failure}<ObjectReport title={page.spec.title} asOf={page.spec.as_of}><WikiSections markdown={body} blocks={page.spec.blocks} company={page.spec.type === 'company'} report /></ObjectReport></>;
  }
  return dashboard;
}
