import { useEffect, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { PageHeader } from '../components/ui/PageHeader';
import { GlassCard } from '../components/ui/GlassCard';
import { Disclaimer } from '../components/ui/Disclaimer';
import { WikiReader } from '../components/ResearchKnowledge';
import { ResearchLoading } from '../components/ui/ResearchLoading';
import { companySlug, researchRead, symbolFromCompanySlug, wikiPages, type WikiItem } from '../lib/research';
import { addWatch, loadWatch, removeWatch } from '../lib/watchlist';
import { addToRoster, loadRoster, removeFromRoster } from '../lib/researchRoster';
import { useResearchSessions } from '../dsh/research-session';
import { useAiPage } from '../../../core/ai/pageContext';
import { ArrowLeft, ArrowRight, Plus, RefreshCw, Star, X } from 'lucide-react';
import { WorkspaceSelect } from '../components/ui/WorkspaceSelect';

export function CompanyWiki() {
  const sessions = useResearchSessions();
  const [pages, setPages] = useState<WikiItem[] | null>(null);
  const [params, setParams] = useSearchParams();
  const slug = params.get('company') || '';
  const query = params.get('q') || '';
  const [joinQuery, setJoinQuery] = useState('');
  const [joinOpen, setJoinOpen] = useState(false);
  const [rosterRev, setRosterRev] = useState(0);
  const overviewKey = `finance-company-overview:${query}`;
  const setSlug = (value: string) => {
    if (!slug) sessionStorage.setItem(overviewKey, String(document.getElementById('workspace-main')?.scrollTop || 0));
    const next = new URLSearchParams(params);
    next.delete('reader');
    if (value) next.set('company', value); else next.delete('company');
    setParams(next);
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
  const [wikiError, setWikiError] = useState('');
  const [revision, refresh] = useState(0);
  const [listLoading, setListLoading] = useState(true);
  const [readerState, setReaderState] = useState<'loading' | 'ready' | 'error'>('loading');
  const [apiBusy, setApiBusy] = useState('');
  const [notice, setNotice] = useState({ slug: '', text: '' });
  const activeSlug = useRef(slug);
  activeSlug.current = slug;
  const roster = loadRoster();
  const watched = new Set(loadWatch());
  const refreshData = async () => {
    if (refreshing || apiBusy) return;
    if (!slug) { setListLoading(true); refresh(x => x + 1); setNotice({ slug: '', text: '已重新读取公司列表' }); return; }
    const target = slug;
    setApiBusy(target); setNotice({ slug: target, text: '' });
    try {
      const result = await researchRead<{ status: 'updated' | 'partial' | 'unavailable'; updated_fields: number }>('/wiki/pages/refresh-api', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ slug: target }),
      });
      if (activeSlug.current !== target) return;
      setNotice({ slug: target, text: result.status === 'unavailable' ? '本次未获取新数据，已有数据和原日期保留' : `${result.status === 'partial' ? '部分更新' : '已更新'} ${result.updated_fields} 项接口数据${result.status === 'partial' ? '，其余数据保留或待补充' : ''}` });
      if (result.status !== 'unavailable') refresh(x => x + 1);
    } catch {
      if (activeSlug.current === target) setNotice({ slug: target, text: '本次更新失败，已有资料保留。请检查研究服务后重试。' });
    } finally { setApiBusy(''); }
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
    const controller = new AbortController(); setError(''); setWikiError(''); setListLoading(true);
    void wikiPages('companies', controller.signal).then(setPages).catch(e => { if (!controller.signal.aborted) setWikiError(String(e)); }).finally(() => { if (!controller.signal.aborted) setListLoading(false); });
    return () => controller.abort();
  }, [revision]);
  const wikiBySlug = new Map((pages ?? []).map(page => [page.slug, page]));
  const rows = roster.map(symbol => {
    const company = companySlug(symbol);
    const wiki = company ? wikiBySlug.get(company) : undefined;
    return { symbol, slug: company || symbol, title: wiki?.title || symbol, hasWiki: Boolean(wiki), aShare: Boolean(company) };
  });
  const matches = (title: string, code: string, text: string) => `${title} ${code}`.toLowerCase().includes(text.trim().toLowerCase());
  const visible = rows.filter(row => matches(row.title, row.symbol, query));
  const current = rows.find(row => row.slug === slug) || (slug ? { symbol: symbolFromCompanySlug(slug) || slug, slug, title: wikiBySlug.get(slug)?.title || slug, hasWiki: wikiBySlug.has(slug), aShare: Boolean(symbolFromCompanySlug(slug)) } : undefined);
  const switchOptions = rows.map(row => ({ value: row.slug, label: row.title, detail: row.symbol }));
  if (current && !switchOptions.some(option => option.value === current.slug)) switchOptions.unshift({ value: current.slug, label: current.title, detail: current.symbol });
  const pagesReady = pages !== null;
  const refreshing = listLoading || (!!slug && apiBusy === slug) || (!!slug && Boolean(current?.hasWiki) && readerState === 'loading');
  const joinCandidates = (pages ?? []).filter(page => {
    const symbol = symbolFromCompanySlug(page.slug);
    return symbol && !roster.includes(symbol) && matches(page.title, symbol, joinQuery);
  }).slice(0, 20);
  const join = async (symbol: string) => {
    try {
      await addToRoster(symbol);
      setRosterRev(x => x + 1);
      setJoinQuery('');
      setJoinOpen(false);
      const next = companySlug(symbol);
      if (next) setSlug(next);
    } catch (e) { setError(e instanceof Error ? e.message : String(e)); }
  };
  const leave = async (symbol: string) => {
    try {
      await removeFromRoster(symbol);
      setRosterRev(x => x + 1);
      if (companySlug(symbol) === slug || symbol === slug) setSlug('');
    } catch (e) { setError(e instanceof Error ? e.message : String(e)); }
  };
  const startCompanyResearch = async () => {
    if (!current) return;
    setError('');
    try {
      await sessions.start(
        `请基于已有公开资料研究 ${current.title}（${current.symbol}）。现有公司 Wiki 尚未生成，不要把加入研究名单当成资料已发布。`,
        { symbol: current.symbol, name: current.title },
      );
    } catch (e) { setError(e instanceof Error ? e.message : String(e)); }
  };
  const toggleWatch = async (symbol: string) => {
    try {
      if (watched.has(symbol)) await removeWatch(symbol); else await addWatch(symbol);
      setRosterRev(x => x + 1);
    } catch (e) { setError(e instanceof Error ? e.message : String(e)); }
  };
  useAiPage({ key: `company-wiki:${slug}:${rosterRev}`, title: current ? `个股研究 · ${current.title}` : '个股研究', context: slug ? `当前公司 Wiki：${slug}\n${markdown || '正文尚未加载。'}` : '当前研究名单：' + visible.map(row => row.title).join('、'), suggestions: slug ? ['研究这家公司需要核对哪些证据？'] : ['当前名单里哪些公司最值得先看？'] });
  return <div><PageHeader title="个股研究" subtitle="只显示已加入研究的公司。自选与研究名单分开。" actions={<div className="flex flex-col items-end gap-2"><button className="workspace-action" disabled={refreshing || !!apiBusy} onClick={() => void refreshData()}><RefreshCw size={14} className={refreshing ? 'animate-spin' : ''} />{refreshing ? '正在刷新…' : slug ? '刷新资料' : '刷新列表'}</button>{notice.slug === slug && notice.text && !refreshing && <span role="status" className="text-xs text-muted-foreground">{notice.text}</span>}</div>} />
    {error && <p role="alert" className="mb-4">{error}</p>}
    {wikiError && <p role="alert" className="mb-4">公司资料暂时读不到：{wikiError}<button className="workspace-action ml-2" onClick={() => refresh(x => x + 1)}>重试</button></p>}
    {!slug && listLoading && <ResearchLoading title="正在读取公司资料" sections={['研究名单', '公司资料']} />}
    <div className="workspace-toolbar flex flex-wrap items-center gap-3">
      {slug && <><button className="workspace-action" onClick={() => setSlug('')}><ArrowLeft size={14} />研究名单</button>
        <WorkspaceSelect
          aria-label="切换公司"
          className="max-w-full"
          value={current?.slug || slug}
          onChange={setSlug}
          searchPlaceholder="搜索已加入的公司"
          emptyText="名单里没有匹配的公司"
          options={switchOptions}
        />
        {current && <button className="workspace-action" onClick={() => void leave(current.symbol)}><X size={14} />移出研究</button>}
        {current && <button className="workspace-action" onClick={() => void toggleWatch(current.symbol)}><Star size={14} className={watched.has(current.symbol) ? 'text-primary' : ''} />{watched.has(current.symbol) ? '已自选' : '加入自选'}</button>}
      </>}
      {!slug && <button type="button" className="workspace-action" onClick={() => setJoinOpen(value => !value)}><Plus size={14} />加入研究</button>}
    </div>
    {joinOpen && !slug && <GlassCard className="mb-4 !p-4">
      <p className="mb-2 text-sm text-muted-foreground">搜索公司并加入研究名单。</p>
      <input aria-label="搜索可加入的公司" placeholder="公司名称 / 代码" className="workspace-field w-full" value={joinQuery} onChange={event => setJoinQuery(event.target.value)} />
      <div className="mt-2 max-h-64 overflow-auto">
        {joinCandidates.map(page => {
          const symbol = symbolFromCompanySlug(page.slug)!;
          return <button key={page.slug} className="flex w-full items-center justify-between gap-3 rounded-lg px-3 py-2 text-left text-sm hover:bg-muted" onClick={() => void join(symbol)}><span>{page.title}</span><span className="text-xs text-muted-foreground">{symbol}</span></button>;
        })}
        {joinQuery.trim() && joinCandidates.length === 0 && <p className="p-3 text-sm text-muted-foreground">{wikiError ? '资料目录暂不可用，仍可从自选股加入已有代码。' : '没有匹配的公司资料。港股 / 美股可从自选股加入研究。'}</p>}
      </div>
    </GlassCard>}
    {slug ? <GlassCard className="min-h-[440px] !p-4 sm:!p-7">
      {current && pagesReady && !current.hasWiki && <div className="mb-4 space-y-3">
        <p className="text-sm text-muted-foreground">{current.aShare ? '已加入研究，公司资料尚未生成。' : '已加入研究。港股 / 美股目前没有公司资料页，可用深度对话继续研究。'}</p>
        <div className="flex flex-wrap gap-2">
          <button type="button" className="workspace-action" onClick={() => void startCompanyResearch()}>在深度对话中研究</button>
          <Link className="workspace-action" to="/my-reports">上传研报补充</Link>
        </div>
      </div>}
      {apiBusy === slug && <ResearchLoading compact title={`正在更新${current?.title || '该公司'}的财务与估值数据`} />}
      {current?.hasWiki ? <WikiReader key={slug} slug={slug} revision={revision} onLoadState={setReaderState} onMarkdown={value => setLoaded(previous => previous.slug === slug && previous.markdown === value ? previous : { slug, markdown: value })} /> : null}
    </GlassCard>
    : !listLoading ? <GlassCard className="!p-4 sm:!p-6">
      <div className="mb-5 flex flex-wrap items-center gap-3">
        <input aria-label="搜索研究名单" placeholder="搜索已加入的公司" className="workspace-field min-w-0 flex-1" value={query} onChange={event => updateFilter('q', event.target.value)} />
        <Link className="workspace-action" to="/watchlist">去自选股</Link>
      </div>
      <p className="mb-3 text-xs text-muted-foreground">研究名单 · {visible.length}{visible.length !== rows.length ? ` / ${rows.length}` : ''}</p>
      <div className="divide-y divide-border">
        {visible.map(row => <div key={row.symbol} className="flex w-full items-center gap-3 px-2 py-4 text-sm">
          <button onClick={() => setSlug(row.hasWiki ? row.slug : row.slug)} className="flex min-w-0 flex-1 items-center gap-3 rounded text-left hover:bg-muted focus-visible:outline-primary">
            <span className="min-w-0 flex-1 font-medium">{row.title}</span>
            {!row.hasWiki && <span className="text-xs text-muted-foreground">资料待生成</span>}
            <span className="text-xs text-muted-foreground">{row.symbol}</span>
            <ArrowRight size={14} className="shrink-0 text-muted-foreground" />
          </button>
          <button className="workspace-action workspace-action-compact" onClick={() => void toggleWatch(row.symbol)} aria-label={watched.has(row.symbol) ? '移出自选' : '加入自选'}><Star size={13} className={watched.has(row.symbol) ? 'text-primary' : ''} /></button>
          <button className="workspace-action workspace-action-compact" onClick={() => void leave(row.symbol)}>移除</button>
        </div>)}
      </div>
      {visible.length === 0 && <p className="py-12 text-center text-sm text-muted-foreground">{rows.length === 0 ? '还没有加入研究的公司。用「加入研究」或到自选股把公司加进名单。' : '没有匹配的公司，请调整搜索。'}</p>}
    </GlassCard> : null}
    <Disclaimer /></div>;
}
