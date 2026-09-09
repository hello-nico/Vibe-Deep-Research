import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { Building2, ChartNoAxesCombined, Landmark, Scale, ScanEye, BookOpen } from 'lucide-react';
import { GlassCard } from './ui/GlassCard';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { researchRead, type WikiPage } from '../lib/research';

export function KnowledgeText({ markdown }: { markdown: string }) {
  // The accepted artifact includes YAML for machines; only its body is reader content.
  const body = markdown.replace(/^\uFEFF?---\r?\n[\s\S]*?\r?\n---(?:\r?\n|$)/, '');
  return <div className="prose prose-sm max-w-none break-words leading-8 prose-headings:tracking-tight prose-h1:text-2xl prose-h2:mt-8 prose-h2:border-b prose-h2:border-border/60 prose-h2:pb-3 prose-table:text-xs dark:prose-invert overflow-x-auto"><ReactMarkdown remarkPlugins={[remarkGfm]}>{body}</ReactMarkdown></div>;
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
    return <GlassCard glow key={index} className="!p-6">
      <header className="mb-4 flex items-center gap-3 border-b border-border/60 pb-4"><span className="rounded-xl bg-primary/10 p-2.5 text-primary"><Icon size={20} /></span><h3 className="text-base font-semibold">{section.title || '研究概览'}</h3></header>
      {section.title === '资料时间线' ? <SourceTimeline content={blocks.find(block => block.kind === 'source_timeline')?.content} /> : content ? <KnowledgeText markdown={content} /> : <p className="py-2 text-sm text-muted-foreground">资料待补充</p>}
    </GlassCard>;
  })}</div>;
}
function SourceTimeline({ content }: { content?: Record<string, unknown> }) {
  const items = Array.isArray(content?.items) ? content.items.filter((item): item is Record<string, unknown> => !!item && typeof item === 'object') : [];
  const labels: Record<string, string> = { annual_report: '年报', quarterly_report: '季报', research_report: '研报', announcement: '公告', news: '新闻', earnings_call: '业绩交流' };
  if (!items.length) return <p className="py-2 text-sm text-muted-foreground">资料待补充</p>;
  return <ul className="divide-y divide-border/50">{items.map((item, index) => {
    const title = typeof item.title === 'string' && item.title.trim() ? item.title : '未命名资料';
    const kind = labels[String(item.document_type)] || '资料';
    const period = typeof item.reporting_period === 'string' ? item.reporting_period : '';
    const id = typeof item.document_id === 'string' && /^[a-f0-9]+$/.test(item.document_id) ? item.document_id : null;
    return <li key={index} className="flex flex-col gap-2 py-3 first:pt-0 sm:flex-row sm:items-baseline sm:gap-4"><span className="shrink-0 text-xs text-muted-foreground sm:w-24">{[period, kind].filter(Boolean).join(' · ')}</span>{id ? <Link className="text-sm font-medium leading-6 hover:text-primary" to={`/my-reports/read/${encodeURIComponent(id)}`}>{title}<span className="ml-2 text-primary" aria-hidden="true">↗</span></Link> : <span className="text-sm font-medium leading-6">{title}</span>}</li>;
  })}</ul>;
}
export function ReferenceButtons({ refs }: { refs: string[] }) {
  const [detail, setDetail] = useState<{ ref: string; status: string; kind?: string; data?: unknown; error?: string } | null>(null);
  const [selected, setSelected] = useState('');
  const request = useRef<AbortController | null>(null);
  const panel = useRef<HTMLDivElement>(null);
  useEffect(() => () => request.current?.abort(), []);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const resolve = async (ref: string) => {
    request.current?.abort();
    const controller = new AbortController(); request.current = controller;
    setSelected(ref); setLoading(true); setError('');
    if (panel.current) panel.current.scrollTop = 0;
    try {
      const result = await researchRead<{ results: NonNullable<typeof detail>[] }>('/wiki/refs/resolve', { method: 'POST', signal: controller.signal, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ refs: [ref] }) });
      if (!controller.signal.aborted) { setDetail(result.results[0] ?? null); if (!result.results.length) setError('未找到这条引用。'); }
    } catch { if (!controller.signal.aborted) setError('引用暂时无法读取，请重新点击重试。'); } finally { if (!controller.signal.aborted) setLoading(false); }
  };
  const kinds: Record<string, string> = { claim: '事实依据', evidence: '原文证据', source: '来源片段', taxonomy: '行业分类', profile: '行业研究', attention: '研究线索', entity: '研究对象', lookup: '待补资料', provider: '数据来源' };
  return <section className="mt-8 border-t border-border pt-5" style={{ overflowAnchor: 'none' }}><h3 className="mb-2 font-semibold">研究依据</h3><p className="mb-4 text-xs text-muted-foreground">选择引用，查看依据与来源。</p>
    <div className="flex flex-wrap gap-2">{[...new Set(refs)].map((ref, index) => <button type="button" key={ref} aria-pressed={selected === ref} onClick={() => void resolve(ref)} className={`rounded-lg border px-3 py-2 text-xs transition-colors ${selected === ref ? 'border-primary/40 bg-primary/10 text-primary' : 'border-border bg-card text-muted-foreground hover:border-primary/40 hover:text-primary'}`}>{index + 1} · {kinds[ref.split(':')[0] ?? ''] || '引用'}</button>)}</div>
    {refs.length === 0 && <p className="text-sm text-muted-foreground">尚无可回读引用。</p>}
    {refs.length > 0 && <div ref={panel} className="mt-4 h-80 overflow-y-auto overscroll-contain rounded-xl border border-border bg-background/60 p-5" style={{ scrollbarGutter: 'stable' }} aria-busy={loading}>
      {loading ? <p role="status" className="text-sm text-muted-foreground">正在读取引用…</p> : error ? <p role="alert" className="text-sm text-muted-foreground">{error}</p> : detail ? <>
        <div className="mb-4 flex items-center gap-3"><h4 className="font-semibold">{kinds[detail.kind || detail.ref.split(':')[0] || ''] || '引用详情'}</h4><span className="rounded-full bg-muted px-2 py-1 text-xs text-muted-foreground">{detail.status === 'resolved' ? '已找到引用' : detail.status === 'pending' ? '资料待补充' : detail.status === 'stale' ? '引用版本已更新' : '暂不可用'}</span></div>
        {detail.status === 'resolved' ? <ReferenceSummary data={detail.data} /> : <p className="text-sm text-muted-foreground">这条引用暂未提供可阅读的内容，请稍后核对。</p>}
        <details className="mt-5 border-t border-border pt-3"><summary className="cursor-pointer text-xs text-muted-foreground">技术详情</summary><pre className="mt-3 whitespace-pre-wrap break-all text-xs text-muted-foreground">{JSON.stringify(detail, null, 2)}</pre></details>
      </> : <p className="flex h-full items-center justify-center text-sm text-muted-foreground">点击上方引用，查看研究依据</p>}
    </div>}
  </section>;
}
function ReferenceSummary({ data }: { data: unknown }) {
  const record = data && typeof data === 'object' ? data as Record<string, unknown> : {};
  const labels: Record<string, string> = { title: '标题', name: '名称', industry_name: '行业', symbol: '公司代码', text: '原文', quote: '原文摘录', preview: '原文片段', predicate: '关系', subject_entity_id: '主体', object_entity_id: '对象', value: '数值', unit: '单位', page: '页码', valid_from: '有效日期', valid_to: '截止日期' };
  const relations: Record<string, string> = { operates_asset: '运营资产', owns: '拥有', subsidiary_of: '隶属于' };
  const fields = Object.entries(labels).filter(([key]) => record[key] !== null && record[key] !== undefined && ['string', 'number'].includes(typeof record[key]));
  const documents = new Set<string>();
  const collect = (value: unknown) => {
    if (!value || typeof value !== 'object') return;
    if (Array.isArray(value)) { value.forEach(collect); return; }
    for (const [key, child] of Object.entries(value)) {
      if (key === 'document_id' && typeof child === 'string' && /^[a-f0-9]+$/.test(child)) documents.add(child);
      else collect(child);
    }
  };
  collect(data);
  return <><dl className="space-y-3 text-sm">{fields.map(([key, label]) => <div key={key} className="grid grid-cols-[5rem_minmax(0,1fr)] gap-3"><dt className="text-muted-foreground">{label}</dt><dd className="whitespace-pre-wrap break-words leading-6">{key === 'predicate' ? relations[String(record[key])] || String(record[key]) : String(record[key])}</dd></div>)}</dl>
    {!fields.length && <p className="text-sm text-muted-foreground">此引用提供结构化研究依据，完整字段可在技术详情中核对。</p>}
    {documents.size > 0 && <div className="mt-4 flex flex-wrap gap-2">{[...documents].map((id, i) => <Link key={id} className="rounded-lg bg-primary/10 px-3 py-2 text-xs text-primary hover:bg-primary/20" to={`/my-reports/read/${encodeURIComponent(id)}`}>阅读来源 {i + 1} →</Link>)}</div>}
  </>;
}
export function WikiReader({ slug, onMarkdown }: { slug: string; onMarkdown?: (markdown: string) => void }) {
  const [page, setPage] = useState<WikiPage | null>(null);
  const [error, setError] = useState('');
  useEffect(() => {
    const controller = new AbortController(); setPage(null); setError('');
    void researchRead<WikiPage>('/wiki/pages/read?slug=' + encodeURIComponent(slug), { signal: controller.signal }).then(setPage).catch(e => { if (!controller.signal.aborted) setError(String(e)); });
    return () => controller.abort();
  }, [slug]);
  useEffect(() => { onMarkdown?.(page?.markdown ?? ''); }, [page, onMarkdown]);
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
      <CompanySections markdown={body} blocks={page.spec.blocks} /><ReferenceButtons key={slug} refs={[...page.spec.blocks, ...(page.spec.research_blocks ?? [])].flatMap(block => block.refs)} />
    </article>;
  }
  return <article className="mx-auto max-w-4xl py-2"><p className="mb-6 inline-flex rounded-full bg-primary/10 px-3 py-1 text-xs text-primary">研究资料 · {page.spec.as_of}</p>
    <KnowledgeText markdown={page.markdown} /><ReferenceButtons key={slug} refs={[...page.spec.blocks, ...(page.spec.research_blocks ?? [])].flatMap(block => block.refs)} /></article>;
}
