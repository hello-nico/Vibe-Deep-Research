import { useEffect, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { PageHeader } from '../components/ui/PageHeader';
import { GlassCard } from '../components/ui/GlassCard';
import { DashboardCard } from '../components/IndustryDashboardCard';
import { Disclaimer } from '../components/ui/Disclaimer';
import { WikiLoading, WikiReader, WikiViewTabs } from '../components/ResearchKnowledge';
import { ResearchLoading, ResearchRefreshStatus } from '../components/ui/ResearchLoading';
import { aShareQualified, backgroundTaskForSession, companySlug, loadBackgroundTasks, researchRead, symbolFromCompanySlug, wikiPages, type WikiItem, type WikiPage } from '../lib/research';
import { addWatch, loadWatch, removeWatch } from '../lib/watchlist';
import { loadRoster, removeFromRoster, touchRoster } from '../lib/researchRoster';
import { api } from '../lib/api';
import { prefGet, prefSet } from '../lib/prefs';
import { cn } from '@/lib/utils';
import { useResearchSessions } from '../dsh/research-session';
import { buildDirectorySnapshot, buildWikiPageSnapshot } from '../assistant/snapshot.ts';
import { wikiAssistantObject, companyQuoteObject } from '../lib/pageAssistantObjects';
import { useAiPage, useAiPageObjects } from '../../../core/ai/pageContext';
import { WorkspaceSelect } from '../components/ui/WorkspaceSelect';
import { ArrowLeft, ArrowRight, Building2, LayoutGrid, List, RefreshCw, Star, X } from 'lucide-react';
import { WikiDraftPublish } from '../components/WikiDraftPublish';
import { CompanyRefreshConfirm } from '../components/CompanyRefreshConfirm';

const VIEW_KEY = 'vr-company-roster-view';
const RECENT_LIMIT = 9;

export function CompanyWiki() {
  const sessions = useResearchSessions();
  const [pages, setPages] = useState<WikiItem[] | null>(null);
  const [params, setParams] = useSearchParams();
  const slug = params.get('company') || '';
  const query = params.get('q') || '';
  const [rosterRev, setRosterRev] = useState(0);
  const [report, setReport] = useState(false);
  const overviewKey = `finance-company-overview:${query}`;
  const setSlug = (value: string) => {
    if (!slug) sessionStorage.setItem(overviewKey, String(document.getElementById('workspace-main')?.scrollTop || 0));
    const next = new URLSearchParams(params);
    next.delete('reader');
    if (value) next.set('company', value); else next.delete('company');
    setParams(next);
    document.getElementById('workspace-main')?.scrollTo(0, 0);
    const symbol = symbolFromCompanySlug(value) || value;
    if (symbol) void touchRoster(symbol).then(() => setRosterRev(x => x + 1)).catch(() => undefined);
  };
  const updateFilter = (key: string, value: string) => {
    const next = new URLSearchParams(params);
    if (value) next.set(key, value); else next.delete(key);
    setParams(next, { replace: true });
  };
  const [loaded, setLoaded] = useState({ slug: '', markdown: '' });
  const [wikiPage, setWikiPage] = useState<WikiPage | null>(null);
  const markdown = loaded.slug === slug ? loaded.markdown : '';
  useEffect(() => { setWikiPage(null); }, [slug]);
  const [error, setError] = useState('');
  const [wikiError, setWikiError] = useState('');
  const [revision, refresh] = useState(0);
  const [listLoading, setListLoading] = useState(true);
  const [readerState, setReaderState] = useState<'loading' | 'ready' | 'error'>('loading');
  const [notice, setNotice] = useState({ slug: '', text: '' });
  // Generation tracking for a missing/young Company Wiki. Phases separate the
  // model turn (researching), Backend settlement (settling) and confirmed
  // outcomes (done / failed / unconfirmed) — a finished session alone never
  // means the Wiki absorbed new content. Sessions are re-discovered by title
  // after reload so an in-flight run survives navigation.
  const [gen, setGen] = useState<{
    slug: string;
    phase: 'ensuring' | 'researching' | 'settling' | 'partial' | 'review' | 'done' | 'unconfirmed' | 'failed';
    sessionId?: string;
    message?: string;
    pageReady?: boolean;
    baselineHash?: string;
    settleAt?: number;
    draftToken?: string;
  } | null>(null);
  const genRef = useRef(gen);
  genRef.current = gen;
  const [sessionsRev, setSessionsRev] = useState(0);
  useEffect(() => { setReport(false); }, [slug]);
  useEffect(() => sessions.subscribeSessionList(() => setSessionsRev(x => x + 1)), [sessions]);
  const [quoteNames, setQuoteNames] = useState<Record<string, string>>({});
  const [view, setView] = useState<'grid' | 'list'>(() => prefGet(VIEW_KEY) === 'list' ? 'list' : 'grid');
  const changeView = (next: 'grid' | 'list') => { setView(next); void prefSet(VIEW_KEY, next); };
  const activeSlug = useRef(slug);
  activeSlug.current = slug;
  const roster = loadRoster();
  const watched = new Set(loadWatch());
  const refreshData = async () => {
    if (refreshing || slug) return;
    setListLoading(true); refresh(x => x + 1); setNotice({ slug: '', text: '已重新读取公司列表' });
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
  const searching = query.trim();
  useEffect(() => {
    const codes = searching ? loadRoster() : loadRoster().slice(0, RECENT_LIMIT);
    if (!codes.length) return;
    const controller = new AbortController();
    void api.quote(codes.join(',')).then(quotes => {
      if (controller.signal.aborted) return;
      setQuoteNames(previous => {
        const names = { ...previous };
        for (const [code, quote] of Object.entries(quotes)) if (quote.name) names[code] = quote.name;
        return names;
      });
    }).catch(() => {});
    return () => controller.abort();
  }, [rosterRev, revision, searching]);
  const wikiBySlug = new Map((pages ?? []).map(page => [page.slug, page]));
  const rows = roster.map(symbol => {
    const company = companySlug(symbol);
    const wiki = company ? wikiBySlug.get(company) : undefined;
    return { symbol, slug: company || symbol, title: wiki?.title || quoteNames[symbol] || symbol, hasWiki: Boolean(wiki), aShare: Boolean(company) };
  });
  const matches = (title: string, code: string, text: string) => `${title} ${code}`.toLowerCase().includes(text.trim().toLowerCase());
  const matched = searching ? rows.filter(row => matches(row.title, row.symbol, searching)) : rows;
  const visible = searching ? matched : matched.slice(0, RECENT_LIMIT);
  const current = rows.find(row => row.slug === slug) || (slug ? { symbol: symbolFromCompanySlug(slug) || slug, slug, title: wikiBySlug.get(slug)?.title || slug, hasWiki: wikiBySlug.has(slug), aShare: Boolean(symbolFromCompanySlug(slug)) } : undefined);
  const switchOptions = rows.map(row => ({ value: row.slug, label: row.title, detail: row.symbol }));
  if (current && !switchOptions.some(option => option.value === current.slug)) switchOptions.unshift({ value: current.slug, label: current.title, detail: current.symbol });
  const pagesReady = pages !== null;
  const refreshing = listLoading || (!!slug && Boolean(current?.hasWiki) && readerState === 'loading');
  const leave = async (symbol: string) => {
    try {
      await removeFromRoster(symbol);
      setRosterRev(x => x + 1);
      if (companySlug(symbol) === slug || symbol === slug) setSlug('');
    } catch (e) { setError(e instanceof Error ? e.message : String(e)); }
  };
  // Recover an in-flight company session after navigation or reload; do not
  // resurrect finished states. Polling the page while tracked surfaces the
  // Backend refresh that lands after a session settles.
  useEffect(() => {
    if (!current?.aShare) return;
    const tracked = genRef.current;
    if (tracked && tracked.slug === current.slug) return;
    let alive = true;
    void sessions.findCompanySession(current.symbol).then(ref => {
      if (!alive || !ref?.running) return;
      setGen(prev => prev?.slug === current.slug ? prev
        : { slug: current.slug, phase: 'researching', sessionId: ref.sessionId });
    }).catch(() => {});
    return () => { alive = false; };
  }, [slug, current?.symbol, current?.aShare, sessionsRev]);
  useEffect(() => {
    const g = gen;
    if (!g || g.slug !== slug || !['ensuring', 'researching', 'settling'].includes(g.phase)) return;
    let alive = true;
    let timer = 0;
    const tick = async () => {
      const tracked = genRef.current;
      if (!alive || !tracked || tracked.slug !== slug) return;
      if (tracked.phase === 'researching' && tracked.sessionId) {
        const state = sessions.sessionState(tracked.sessionId);
        const running = state ? state.running
          : (await sessions.findCompanySession(symbolFromCompanySlug(tracked.slug) || '').catch(() => null))?.running ?? true;
        if (!alive) return;
        if (state?.failed || state?.lastAgentError || state?.promptError) {
          // Raw agent errors stay in the execution conversation; the page shows a generic failure.
          setGen(prev => prev && prev.sessionId === tracked.sessionId
            ? { ...prev, phase: 'failed', message: '本轮研究未成功完成，可在执行对话中查看过程后重试。' } : prev);
          return;
        }
        if (!running) {
          setGen(prev => prev && prev.sessionId === tracked.sessionId && prev.phase === 'researching'
            ? { ...prev, phase: 'settling', settleAt: Date.now(), message: undefined } : prev);
        }
      } else if (tracked.phase === 'settling') {
        // Settlement truth comes from the background task record for this session.
        const tasks = await loadBackgroundTasks().catch(() => null);
        if (!alive) return;
        const record = tasks ? backgroundTaskForSession(tasks, tracked.sessionId) : null;
        const display = record?.display_status || record?.status || '';
        if (record && !['running', 'waiting_ingest'].includes(display)) {
          refresh(x => x + 1);
          if (display === 'awaiting_authorization' || display === 'partial') {
            setGen(prev => prev && prev.sessionId === tracked.sessionId
              ? { ...prev, phase: display === 'partial' ? 'partial' : 'review', draftToken: record.draft_token, message: display === 'partial'
                ? '后台整理部分完成，请查看任务记录中的成果与未完成事项；不代表本页已更新。'
                : '研究草案已生成，待审阅；尚未发布到本页。' } : prev);
          } else if (['ready', 'done', 'completed'].includes(display)) {
            setGen(prev => prev && prev.sessionId === tracked.sessionId
              ? { ...prev, phase: 'done', message: '后台任务已完成，页面显示当前已发布内容；具体成果见任务记录。' } : prev);
          } else if (display === 'no_increment') {
            setGen(prev => prev && prev.sessionId === tracked.sessionId
              ? { ...prev, phase: 'done', message: '本轮研究结束，没有产生新增内容。' } : prev);
          } else {
            setGen(prev => prev && prev.sessionId === tracked.sessionId
              ? { ...prev, phase: 'failed', message: '后台整理未成功完成，可在任务记录中查看详情。' } : prev);
          }
          return;
        }
        // No definitive record yet: a changed page hash proves the Wiki moved on
        // (weaker signal — a task record takes precedence when it exists).
        try {
          const page = await researchRead<WikiPage>('/wiki/pages/read?slug=' + encodeURIComponent(tracked.slug));
          if (!alive) return;
          if (!record && tracked.baselineHash && page.input_hash && page.input_hash !== tracked.baselineHash) {
            refresh(x => x + 1);
            setGen(prev => prev && prev.sessionId === tracked.sessionId
              ? { ...prev, phase: 'done', message: '页面已更新，显示当前已发布内容。' } : prev);
            return;
          }
          if (!tracked.baselineHash && page.input_hash) {
            setGen(prev => prev && prev.sessionId === tracked.sessionId ? { ...prev, baselineHash: page.input_hash } : prev);
          }
        } catch { /* page may still be missing; retry next tick */ }
        if (Date.now() - (tracked.settleAt ?? Date.now()) > 180_000) {
          setGen(prev => prev && prev.sessionId === tracked.sessionId
            ? { ...prev, phase: 'unconfirmed', message: '本轮研究已结束，后台沉淀结果尚未确认，可在任务记录中查看进度。' } : prev);
          return;
        }
      }
      // While the page may not exist yet, keep one light refresh channel open.
      if (tracked.phase === 'researching' || tracked.phase === 'ensuring') {
        try {
          const page = await researchRead<WikiPage>('/wiki/pages/read?slug=' + encodeURIComponent(tracked.slug));
          if (alive && !tracked.baselineHash && page.input_hash) {
            setGen(prev => prev && prev.sessionId === tracked.sessionId || prev?.slug === tracked.slug ? { ...prev!, baselineHash: page.input_hash } : prev);
          }
        } catch { /* next tick retries */ }
      }
      if (alive) timer = window.setTimeout(() => void tick(), 6000);
    };
    timer = window.setTimeout(() => void tick(), 1500);
    return () => { alive = false; window.clearTimeout(timer); };
  }, [gen?.slug, gen?.phase, gen?.sessionId, slug, sessionsRev]);
  const startCompanyResearch = async () => {
    if (!current || !current.aShare || gen?.phase === 'ensuring' || gen?.phase === 'researching') return;
    setError('');
    const target = current;
    setGen({ slug: target.slug, phase: 'ensuring' });
    let ensured: { slug: string; action: string };
    try {
      ensured = await researchRead<{ slug: string; action: string }>('/wiki/pages/ensure', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ slug: target.slug }),
      });
    } catch (e) {
      if (activeSlug.current === target.slug) setGen({ slug: target.slug, phase: 'failed', message: e instanceof Error ? e.message : String(e) });
      return;
    }
    if (activeSlug.current !== target.slug) return;
    refresh(x => x + 1);
    try {
      const prompt = ensured.action === 'exists'
        ? `请继续研究 ${target.title}（${target.symbol}）。先读取公司 Wiki（${target.slug}）现有内容、缺口与资料时间线，再按缺口补充年报、公告与行情证据。不要重复创建页面；研究结束后由系统按既有流程沉淀与刷新页面。`
        : `请研究 ${target.title}（${target.symbol}）。公司已建立基础资料页 ${target.slug}，请读取该 Wiki 的缺口与资料时间线，按缺口补取年报、公告与行情证据。不要重复创建页面；研究结束后由系统按既有流程沉淀与刷新页面。`;
      const { sessionId } = await sessions.start(prompt, { symbol: target.symbol, name: target.title }, { navigate: false });
      if (activeSlug.current !== target.slug) return;
      const baseline = await researchRead<WikiPage>('/wiki/pages/read?slug=' + encodeURIComponent(target.slug)).catch(() => null);
      setGen({ slug: target.slug, phase: 'researching', sessionId, pageReady: true, baselineHash: baseline?.input_hash });
    } catch (e) {
      if (activeSlug.current === target.slug) setGen({ slug: target.slug, phase: 'failed', message: `资料页已生成，研究会话启动失败：${e instanceof Error ? e.message : String(e)}`, pageReady: true });
    }
  };
  const openCompanySession = async () => {
    if (!gen?.sessionId) return;
    try { await sessions.openSession(gen.sessionId); }
    catch (e) { setError(e instanceof Error ? e.message : String(e)); }
  };
  // HK/US and other unsupported markets keep the plain conversation path; the
  // Wiki entry is never presented as if it could produce a page.
  const startPlainResearch = async () => {
    if (!current) return;
    setError('');
    try {
      await sessions.start(
        `请基于已有公开资料研究 ${current.title}（${current.symbol}）。该公司目前不在公司资料页覆盖范围，研究结论以对话为准，不要把加入研究名单当成资料已发布。`,
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
  const pageKey = slug ? `company-wiki:${slug}` : 'company-wiki:list';
  const genHere = gen && gen.slug === slug ? gen : null;
  const wikiWait = Boolean(genHere && !current?.hasWiki && (genHere.phase === 'ensuring' || genHere.phase === 'researching' || genHere.phase === 'settling'));
  const wikiLoadState = wikiWait
    ? 'loading'
    : !current?.hasWiki
      ? 'missing'
      : (readerState === 'error' || wikiError)
        ? 'error'
        : (readerState === 'loading' || (!wikiPage && !markdown))
          ? 'loading'
          : 'ready';
  useAiPage({
    key: pageKey,
    title: current ? `个股研究 · ${current.title}` : '个股研究',
    context: slug && current
      ? buildWikiPageSnapshot({
        kind: 'company',
        title: current.title,
        slug,
        symbol: current.symbol,
        loadState: wikiLoadState,
        page: wikiPage,
        markdown,
      })
      : buildDirectorySnapshot({
        heading: `研究名单 ${visible.length} 家。`,
        items: visible.map(row => ({ title: row.title, id: row.slug })),
        loading: listLoading && !pages,
      }),
    suggestions: slug ? ['研究这家公司需要核对哪些证据？'] : ['当前名单里哪些公司最值得先看？'],
  });
  const companyObjects = slug && current
    ? [
      wikiAssistantObject({ slug: current.slug, title: current.title, inputHash: wikiPage?.input_hash, section: '个股研究' }),
      current.aShare ? companyQuoteObject({ symbol: aShareQualified(current.symbol) || current.symbol, name: current.title }) : null,
    ].flatMap(item => item ? [item] : [])
    : visible.flatMap(row => {
      const wiki = wikiAssistantObject({ slug: row.slug, title: row.title, inputHash: wikiBySlug.get(row.slug)?.input_hash, section: '个股研究' });
      return wiki ? [wiki] : [];
    });
  useAiPageObjects(pageKey, companyObjects);
  const wikiWaitTitle = genHere?.phase === 'ensuring' ? '正在创建公司资料页'
    : genHere?.phase === 'settling' ? '本轮研究已结束，后台正在整理研究成果…'
    : `${genHere?.pageReady ? '资料页已生成，' : ''}研究进行中，结果会逐步沉淀到本页。`;
  const genActions = genHere ? <div className="mt-3 flex flex-wrap gap-2">
    {genHere.sessionId && <button type="button" className="workspace-action workspace-action-compact" onClick={() => void openCompanySession()}>查看执行对话</button>}
    {genHere.phase !== 'ensuring' && <Link className="workspace-action workspace-action-compact" to="/my-research?tab=tasks">查看任务记录</Link>}
    {genHere.phase === 'failed' && current?.aShare && <button type="button" className="workspace-action workspace-action-compact" onClick={() => void startCompanyResearch()}>重试</button>}
    {['done', 'partial', 'review', 'failed', 'unconfirmed'].includes(genHere.phase) && <button type="button" className="workspace-action workspace-action-compact" onClick={() => setGen(null)}>收起</button>}
  </div> : null;
  return <div><PageHeader title="个股研究" subtitle="只显示已加入研究的公司。自选与研究名单分开。" actions={<div className="flex flex-col items-end gap-2">{slug ? <CompanyRefreshConfirm key={slug} slug={slug} version={wikiPage?.input_hash} title={current?.title || '公司资料'} onUpdated={() => refresh(x => x + 1)} /> : refreshing ? <ResearchRefreshStatus /> : <button className="workspace-action" onClick={() => void refreshData()}><RefreshCw size={14} />刷新列表</button>}{notice.slug === slug && notice.text && !refreshing && <span role="status" className="text-xs text-muted-foreground">{notice.text}</span>}</div>} />
    {error && <p role="alert" className="mb-4">{error}</p>}
    {wikiError && <p role="alert" className="mb-4">公司资料暂时读不到：{wikiError}<button className="workspace-action ml-2" onClick={() => refresh(x => x + 1)}>重试</button></p>}
    {!slug && listLoading && <ResearchLoading title="正在读取公司资料" sections={['研究名单', '公司资料']} />}
    {slug && <div className="workspace-toolbar flex flex-wrap items-center gap-3">
      <button className="workspace-action" onClick={() => setSlug('')}><ArrowLeft size={14} />研究名单</button>
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
      {current?.hasWiki && <WikiViewTabs report={report} onChange={setReport} />}
    </div>}
    {slug ? <GlassCard className="min-h-[440px] !p-4 sm:!p-7">
      {current && pagesReady && !current.hasWiki && !wikiWait && <div className="mb-4 space-y-3">
        <h2 className="text-base font-semibold">{current.title}<span className="ml-2 font-mono text-xs font-normal text-muted-foreground">{current.symbol}</span></h2>
        <p className="text-sm text-muted-foreground">{current.aShare
          ? '已加入研究，公司资料尚未生成。开始研究会先建立资料页，再围绕缺口补充证据。'
          : '已加入研究。港股 / 美股目前没有公司资料页，可用深度对话继续研究。'}</p>
        <div className="flex flex-wrap gap-2">
          {current.aShare
            ? <button type="button" className="workspace-action workspace-action-primary" disabled={!!gen && gen.slug === slug && (gen.phase === 'ensuring' || gen.phase === 'researching' || gen.phase === 'settling')} onClick={() => void startCompanyResearch()}>{gen?.slug === slug && gen.phase === 'failed' ? '重试研究' : '开始研究'}</button>
            : <button type="button" className="workspace-action" onClick={() => void startPlainResearch()}>在深度对话中研究</button>}
          <Link className="workspace-action" to="/my-reports">上传研报补充</Link>
        </div>
      </div>}
      {wikiWait && genHere && <><WikiLoading slug={slug} title={wikiWaitTitle} />{genHere.phase !== 'ensuring' && genActions}</>}
      {genHere && !wikiWait && <div className="mb-4 rounded-xl border border-border p-4" role="status">
        {genHere.phase === 'researching' && <p className="text-sm">{genHere.pageReady ? '资料页已生成，' : ''}研究进行中，结果会逐步沉淀到本页。</p>}
        {genHere.phase === 'settling' && <p className="text-sm">本轮研究已结束，后台正在整理研究成果…</p>}
        {genHere.phase === 'done' && <p className="text-sm">{genHere.message || '本轮研究已结束，页面显示当前已发布内容。'}</p>}
        {(genHere.phase === 'partial' || genHere.phase === 'review') && <p className="text-sm">{genHere.message}</p>}
        {genHere.phase === 'review' && genHere.draftToken && <WikiDraftPublish draftToken={genHere.draftToken} onPublished={() => { refresh(x => x + 1); setGen(prev => prev && prev.slug === slug ? { ...prev, phase: 'done', message: 'Wiki 已更新，可回读新版本。' } : prev); }} />}
        {genHere.phase === 'unconfirmed' && <p className="text-sm">{genHere.message || '本轮研究已结束，后台沉淀结果尚未确认。'}</p>}
        {genHere.phase === 'failed' && <p role="alert" className="text-sm">{genHere.message || '研究未完成，可重试。'}</p>}
        {genActions}
      </div>}
      {current?.hasWiki ? <WikiReader key={slug} slug={slug} revision={revision} hideToggle report={report} onReportChange={setReport} onLoadState={setReaderState} onPage={setWikiPage} onMarkdown={value => setLoaded(previous => previous.slug === slug && previous.markdown === value ? previous : { slug, markdown: value })} /> : null}
    </GlassCard>
    : !listLoading ? <>
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <input aria-label="搜索研究名单" placeholder="搜索名称或代码" className="workspace-field min-w-0 flex-1" value={query} onChange={event => updateFilter('q', event.target.value)} />
        <div role="tablist" aria-label="名单视图" className="flex shrink-0 rounded-full border border-border p-0.5">
          {([['grid', LayoutGrid, '卡片'], ['list', List, '列表']] as const).map(([id, Icon, label]) => (
            <button key={id} type="button" role="tab" aria-label={label} aria-selected={view === id} className={cn('rounded-full p-2 text-muted-foreground', view === id && 'bg-muted text-foreground')} onClick={() => changeView(id)}>
              <Icon size={16} />
            </button>
          ))}
        </div>
        <Link className="workspace-action workspace-action-compact" to="/watchlist">去自选股</Link>
      </div>
      <p className="mb-3 text-[11px] text-muted-foreground">{searching ? `匹配 ${visible.length} / ${rows.length}` : `最近 ${visible.length} 家${rows.length > RECENT_LIMIT ? ` · 共 ${rows.length} 家，输入关键字搜索` : ''}`}</p>
      {visible.length === 0 ? <GlassCard><p className="py-12 text-center text-sm text-muted-foreground">{rows.length === 0 ? '还没有加入研究的公司。到自选股把公司加进名单。' : '没有匹配的公司，请调整搜索。'}</p></GlassCard>
      : view === 'grid' ? <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">{visible.map(row => (
        <DashboardCard
          key={row.symbol}
          title={row.title}
          description={`${row.symbol}${row.hasWiki ? '' : ' · 资料待生成'}`}
          footer={row.hasWiki ? '打开资料' : '资料待生成'}
          icon={Building2}
          onClick={() => setSlug(row.slug)}
        />
      ))}</div>
      : <GlassCard className="!p-2 sm:!p-3">
        <div className="space-y-1">
          {visible.map(row => <div key={row.symbol} className="flex items-center gap-2 rounded-xl px-2 py-2 hover:bg-muted/40">
            <button type="button" onClick={() => setSlug(row.slug)} className="flex min-w-0 flex-1 items-center gap-3 rounded-lg px-1 py-1 text-left">
              <span className="min-w-0 flex-1">
                <span className="block truncate font-medium">{row.title}</span>
                <span className="mt-0.5 block font-mono text-[11px] text-muted-foreground">{row.symbol}{!row.hasWiki ? ' · 资料待生成' : ''}</span>
              </span>
              <ArrowRight size={14} className="shrink-0 text-muted-foreground/60" />
            </button>
            <button type="button" className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground hover:bg-muted" onClick={() => void toggleWatch(row.symbol)} aria-label={watched.has(row.symbol) ? '移出自选' : '加入自选'}>
              <Star size={14} className={watched.has(row.symbol) ? 'fill-current text-primary' : ''} />
            </button>
            <button type="button" className="workspace-action workspace-action-compact" onClick={() => void leave(row.symbol)}>移除</button>
          </div>)}
        </div>
      </GlassCard>}
    </> : null}
    <Disclaimer /></div>;
}
