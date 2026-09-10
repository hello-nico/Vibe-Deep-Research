import { useEffect, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { PageHeader } from '../components/ui/PageHeader';
import { GlassCard } from '../components/ui/GlassCard';
import { Disclaimer } from '../components/ui/Disclaimer';
import { WikiReader } from '../components/ResearchKnowledge';
import { companySlug, researchRead, wikiPages, type WikiItem } from '../lib/research';
import { loadWatch } from '../lib/watchlist';
import { useAiPage } from '../../../core/ai/pageContext';
import { ArrowLeft, ArrowRight, ArrowUpRight, ChevronDown, RefreshCw, Star } from 'lucide-react';

export function CompanyWiki() {
  const [pages, setPages] = useState<WikiItem[] | null>(null);
  const [params, setParams] = useSearchParams();
  const slug = params.get('company') || '';
  const query = params.get('q') || '';
  const onlyWatched = params.get('filter') === 'watch';
  const [switchQuery, setSwitchQuery] = useState('');
  const switcher = useRef<HTMLDetailsElement>(null);
  const overviewKey = `finance-company-overview:${query}:${onlyWatched}`;
  const setSlug = (value: string) => {
    if (!slug) sessionStorage.setItem(overviewKey, String(document.getElementById('workspace-main')?.scrollTop || 0));
    const next = new URLSearchParams(params);
    if (value) next.set('company', value); else next.delete('company');
    setParams(next);
    if (switcher.current) switcher.current.open = false;
    setSwitchQuery('');
    document.getElementById('workspace-main')?.scrollTo(0, 0);
  };
  const updateFilter = (key: string, value: string) => {
    const next = new URLSearchParams(params);
    if (value) next.set(key, value); else next.delete(key);
    setParams(next, { replace: true });
  };
  const [loaded, setLoaded] = useState({ slug: '', markdown: '' });
  const markdown = loaded.slug === slug ? loaded.markdown : '';
  const [error, setError] = useState('');
  const [revision, refresh] = useState(0);
  const [listLoading, setListLoading] = useState(true);
  const [readerState, setReaderState] = useState<'loading' | 'ready' | 'error'>('loading');
  const [apiBusy, setApiBusy] = useState(false);
  const [notice, setNotice] = useState({ slug: '', text: '' });
  const activeSlug = useRef(slug);
  activeSlug.current = slug;
  const refreshing = apiBusy || listLoading || (!!slug && readerState === 'loading');
  const refreshData = async () => {
    if (refreshing) return;
    if (!slug) { setListLoading(true); refresh(x => x + 1); setNotice({ slug: '', text: '已重新读取公司列表' }); return; }
    const target = slug;
    setApiBusy(true); setNotice({ slug: target, text: '' });
    try {
      const result = await researchRead<{ status: 'updated' | 'partial' | 'unavailable'; updated_fields: number }>('/wiki/pages/refresh-api', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ slug: target }),
      });
      if (activeSlug.current !== target) return;
      setNotice({ slug: target, text: result.status === 'unavailable' ? '本次未获取新数据，已有数据和原日期保留' : `${result.status === 'partial' ? '部分更新' : '已更新'} ${result.updated_fields} 项接口数据${result.status === 'partial' ? '，其余数据保留或待补充' : ''}` });
      setReaderState('loading'); refresh(x => x + 1);
    } catch {
      if (activeSlug.current === target) setNotice({ slug: target, text: '本次更新失败，已有资料保留。请检查研究服务后重试。' });
    } finally { setApiBusy(false); }
  };
  useEffect(() => {
    if (slug || !pages) return;
    const frame = requestAnimationFrame(() => document.getElementById('workspace-main')?.scrollTo(0, Number(sessionStorage.getItem(overviewKey)) || 0));
    return () => cancelAnimationFrame(frame);
  }, [slug, pages, overviewKey]);
  useEffect(() => {
    if (!markdown || !slug) return;
    const key = `finance-scroll:/research?${params}`;
    const saved = sessionStorage.getItem(key);
    if (saved !== null) {
      requestAnimationFrame(() => { document.getElementById('workspace-main')?.scrollTo(0, Number(saved) || 0); });
      sessionStorage.removeItem(key);
    }
  }, [markdown, slug, params]);
  useEffect(() => {
    const controller = new AbortController(); setError(''); setListLoading(true);
    void wikiPages('companies', controller.signal).then(setPages).catch(e => { if (!controller.signal.aborted) setError(String(e)); }).finally(() => { if (!controller.signal.aborted) setListLoading(false); });
    return () => controller.abort();
  }, [revision]);
  const watched = loadWatch();
  const favorites = new Set(watched.map(companySlug).filter(Boolean));
  const ordered = [...(pages ?? [])].sort((a, b) => Number(favorites.has(b.slug)) - Number(favorites.has(a.slug)));
  const matches = (page: WikiItem, text: string) => `${page.title} ${page.slug}`.toLowerCase().includes(text.trim().toLowerCase());
  const visible = ordered.filter(page => matches(page, query) && (!onlyWatched || favorites.has(page.slug)));
  const current = pages?.find(page => page.slug === slug);
  useAiPage({ key: `company-wiki:${slug}`, title: current ? `个股研究 · ${current.title}` : '个股研究', context: slug ? `当前公司 Wiki：${slug}\n${markdown || '正文尚未加载。'}` : '当前公司资料列表：' + visible.map(page => page.title).join('、'), suggestions: slug ? ['研究这家公司需要核对哪些证据？'] : ['当前有哪些公司的研究资料？'] });
  return <div><PageHeader title="个股研究" subtitle="从关注的公司出发，读懂经营变化与研究依据" actions={<div className="flex flex-col items-end gap-2"><button className="workspace-action" disabled={refreshing} onClick={() => void refreshData()}><RefreshCw size={14} className={refreshing ? 'animate-spin' : ''} />{refreshing ? '正在刷新…' : slug ? '刷新资料' : '刷新列表'}</button>{notice.slug === slug && notice.text && !refreshing && <span role="status" className="text-xs text-muted-foreground">{notice.text}</span>}</div>} />
    {error && <p role="alert" className="mb-4">{error}</p>}
    {!pages && !error && <p role="status">正在读取公司 Wiki…</p>}
    <div className="workspace-toolbar flex flex-wrap items-center gap-3">
      {pages && slug && <><button className="workspace-action" onClick={() => setSlug('')}><ArrowLeft size={14} />全部公司</button>
        <details ref={switcher} className="relative min-w-0" onKeyDown={event => { if (event.key === 'Escape' && switcher.current) { switcher.current.open = false; switcher.current.querySelector('summary')?.focus(); } }}>
          <summary className="workspace-action cursor-pointer list-none" aria-label="切换公司">{current?.title || '切换公司'} <span className="text-muted-foreground">{slug.split('/')[1]?.toUpperCase()}</span><ChevronDown size={14} /></summary>
          <div className="absolute left-0 top-full z-30 mt-2 w-[min(360px,75vw)] rounded-xl border border-border bg-background p-3 shadow-lg">
            <input aria-label="搜索切换公司" placeholder="搜索公司名称 / 代码" className="workspace-field w-full" value={switchQuery} onChange={event => setSwitchQuery(event.target.value)} />
            <div className="mt-2 max-h-64 overflow-auto">
              {ordered.filter(page => matches(page, switchQuery)).map(page => <button key={page.slug} aria-current={page.slug === slug ? 'true' : undefined} onClick={() => setSlug(page.slug)} className="flex w-full items-center justify-between gap-3 rounded-lg px-3 py-2 text-left text-sm hover:bg-muted aria-[current=true]:bg-primary/10"><span>{page.title}</span><span className="text-xs text-muted-foreground">{page.slug.split('/')[1]?.toUpperCase()}</span></button>)}
              {!ordered.some(page => matches(page, switchQuery)) && <p className="p-3 text-sm text-muted-foreground">没有匹配的公司资料</p>}
            </div>
          </div>
        </details></>}
      {!slug && <Link className="workspace-action" to="/watchlist"><Star />从自选开始</Link>}<Link className="workspace-action" to="/research/legacy"><ArrowUpRight />专题研究</Link>
    </div>
    {pages && (slug ? <GlassCard className="min-h-[440px] !p-4 sm:!p-7"><WikiReader key={`${slug}:${revision}`} slug={slug} onLoadState={setReaderState} onMarkdown={value => setLoaded(previous => previous.slug === slug && previous.markdown === value ? previous : { slug, markdown: value })} /></GlassCard>
    : <GlassCard className="!p-4 sm:!p-6">
      <div className="mb-5 flex flex-wrap items-center gap-3">
        <input aria-label="搜索公司资料" placeholder="搜索公司名称 / 代码" className="workspace-field min-w-0 flex-1" value={query} onChange={event => updateFilter('q', event.target.value)} />
        <select aria-label="公司资料范围" className="workspace-select" value={onlyWatched ? 'watch' : ''} onChange={event => updateFilter('filter', event.target.value)}><option value="">全部公司</option><option value="watch">自选公司</option></select>
      </div>
      <p className="mb-3 text-xs text-muted-foreground">公司资料 · {visible.length}{visible.length !== ordered.length ? ` / ${ordered.length}` : ''}</p>
      <div className="divide-y divide-border">
        {visible.map(page => <button key={page.slug} onClick={() => setSlug(page.slug)} className="flex w-full items-center gap-3 rounded px-2 py-4 text-left text-sm hover:bg-muted focus-visible:outline-primary"><span className="min-w-0 flex-1 font-medium">{page.title}</span>{favorites.has(page.slug) && <Star size={13} aria-label="自选公司" className="shrink-0 text-primary" />}<span className="text-xs text-muted-foreground">{page.slug.split('/')[1]?.toUpperCase()}</span><ArrowRight size={14} className="shrink-0 text-muted-foreground" /></button>)}
      </div>
      {visible.length === 0 && <p className="py-12 text-center text-sm text-muted-foreground">{ordered.length === 0 ? '还没有公司资料，从自选股发起第一次研究。' : '没有匹配的公司资料，请调整搜索或筛选。'}</p>}
    </GlassCard>)}
    <Disclaimer /></div>;
}
