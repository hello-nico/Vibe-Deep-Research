import { useEffect, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { PageHeader } from '../components/ui/PageHeader';
import { GlassCard } from '../components/ui/GlassCard';
import { Disclaimer } from '../components/ui/Disclaimer';
import { WikiLoading, WikiReader, WikiViewTabs } from '../components/ResearchKnowledge';
import { ResearchLoading, ResearchRefreshStatus } from '../components/ui/ResearchLoading';
import { aShareQualified, backgroundTaskForSession, clipCompanyOneLiner, companyAsOfLabel, companyIndustryLabel, companySlug, loadBackgroundTasks, researchRead, symbolFromCompanySlug, wikiPages, type CompanyPageSummary, type WikiItem, type WikiPage } from '../lib/research';
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
import { CompanyRefreshConfirm, type RefreshViewState } from '../components/CompanyRefreshConfirm';
import { WorkspaceMoreMenu } from '../components/ui/WorkspaceMoreMenu';

const VIEW_KEY = 'vr-company-roster-view';
const RECENT_LIMIT = 9;

export function CompanyWiki() {
  const sessions = useResearchSessions();
  const [pages, setPages] = useState<WikiItem[] | null>(null);
  const [params, setParams] = useSearchParams();
  const slug = params.get('company') || '';
  const query = params.get('q') || '';
  const [rosterRev, setRosterRev] = useState(0);
  const report = params.get('view') === 'report';
  const setReport = (value: boolean) => {
    const next = new URLSearchParams(params);
    if (value) next.set('view', 'report'); else next.delete('view');
    setParams(next, { replace: true });
  };
  const [reportSlot, setReportSlot] = useState<HTMLElement | null>(null);
  const [refreshView, setRefreshView] = useState<RefreshViewState>('idle');
  const overviewKey = `finance-company-overview:${query}`;
  const setSlug = (value: string) => {
    if (!slug) sessionStorage.setItem(overviewKey, String(document.getElementById('workspace-main')?.scrollTop || 0));
    const next = new URLSearchParams(params);
    next.delete('reader');
    next.delete('view');
    next.delete('refresh');
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
  useEffect(() => sessions.subscribeSessionList(() => setSessionsRev(x => x + 1)), [sessions]);
  const [quoteNames, setQuoteNames] = useState<Record<string, string>>({});
  const [view, setView] = useState<'grid' | 'list'>(() => prefGet(VIEW_KEY) === 'list' ? 'list' : 'grid');
  const [readyProfiles, setReadyProfiles] = useState<Set<string>>(() => new Set());
  const [runningSymbols, setRunningSymbols] = useState<Set<string>>(() => new Set());
  const [reportFlags, setReportFlags] = useState<Record<string, true>>({});
  const reportAsked = useRef(new Set<string>());
  const rosterNodes = useRef(new Map<string, Element>());
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
  useEffect(() => {
    if (slug) return;
    const controller = new AbortController();
    void researchRead<{ items?: { industry_code?: string; status?: string }[] }>('/industries/profiles', { signal: controller.signal })
      .then(value => {
        const ready = new Set<string>();
        for (const item of value.items || []) {
          if (item.status === 'ready' && item.industry_code) ready.add(item.industry_code.toUpperCase());
        }
        setReadyProfiles(ready);
      })
      .catch(() => {});
    return () => controller.abort();
  }, [slug, revision]);
  useEffect(() => {
    if (slug) return;
    let cancelled = false;
    void sessions.listRunningCompanySymbols().then(symbols => {
      if (!cancelled) setRunningSymbols(new Set(symbols));
    }).catch(() => {});
    return () => { cancelled = true; };
  }, [sessions, sessionsRev, slug]);
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
  const toRow = (symbol: string, company: string | null, wiki?: WikiItem) => ({
    symbol,
    slug: company || symbol,
    title: wiki?.title || quoteNames[symbol] || symbol,
    hasWiki: Boolean(wiki),
    aShare: Boolean(company),
    summary: wiki?.summary,
  });
  const rows = roster.map(symbol => {
    const company = companySlug(symbol);
    return toRow(symbol, company, company ? wikiBySlug.get(company) : undefined);
  });
  const matches = (title: string, code: string, text: string) => `${title} ${code}`.toLowerCase().includes(text.trim().toLowerCase());
  const matched = searching ? rows.filter(row => matches(row.title, row.symbol, searching)) : rows;
  const visible = searching ? matched : matched.slice(0, RECENT_LIMIT);
  const current = rows.find(row => row.slug === slug) || (slug ? toRow(symbolFromCompanySlug(slug) || slug, symbolFromCompanySlug(slug) ? slug : null, wikiBySlug.get(slug)) : undefined);
  const visibleSlugs = visible.filter(row => row.hasWiki).map(row => row.slug).join('\0');
  const attachRoster = (rowSlug: string) => (el: HTMLElement | null) => {
    if (el) rosterNodes.current.set(rowSlug, el);
    else rosterNodes.current.delete(rowSlug);
  };
  useEffect(() => {
    if (slug || !visibleSlugs || typeof IntersectionObserver === 'undefined') return;
    const root = document.getElementById('workspace-main');
    const io = new IntersectionObserver(entries => {
      for (const entry of entries) {
        if (!entry.isIntersecting) continue;
        const targetSlug = (entry.target as HTMLElement).dataset.rosterSlug;
        if (!targetSlug || reportAsked.current.has(targetSlug)) continue;
        reportAsked.current.add(targetSlug);
        void researchRead<{ items?: unknown[] }>('/wiki/reports?slug=' + encodeURIComponent(targetSlug))
          .then(result => {
            if (Array.isArray(result.items) && result.items.length) {
              setReportFlags(prev => prev[targetSlug] ? prev : { ...prev, [targetSlug]: true });
            }
          })
          .catch(() => {});
      }
    }, { root: root || null, rootMargin: '80px' });
    const frame = requestAnimationFrame(() => {
      for (const el of rosterNodes.current.values()) io.observe(el);
    });
    return () => { cancelAnimationFrame(frame); io.disconnect(); };
  }, [slug, visibleSlugs]);
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
            ? { ...prev, phase: 'failed', message: '这次研究没有完成，可以查看执行对话后重试。' } : prev);
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
                ? '部分内容已整理，本页暂未更新。详情见任务记录。'
                : '草案已生成，你确认后才会显示在本页。' } : prev);
          } else if (['ready', 'done', 'completed'].includes(display)) {
            setGen(prev => prev && prev.sessionId === tracked.sessionId
              ? { ...prev, phase: 'done', message: '研究已完成。详情见任务记录。' } : prev);
          } else if (display === 'no_increment') {
            setGen(prev => prev && prev.sessionId === tracked.sessionId
              ? { ...prev, phase: 'done', message: '研究已结束，这次没有新增内容。' } : prev);
          } else {
            setGen(prev => prev && prev.sessionId === tracked.sessionId
              ? { ...prev, phase: 'failed', message: '结果整理没有完成，详情见任务记录。' } : prev);
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
              ? { ...prev, phase: 'done', message: '本页已更新。' } : prev);
            return;
          }
          if (!tracked.baselineHash && page.input_hash) {
            setGen(prev => prev && prev.sessionId === tracked.sessionId ? { ...prev, baselineHash: page.input_hash } : prev);
          }
        } catch { /* page may still be missing; retry next tick */ }
        if (Date.now() - (tracked.settleAt ?? Date.now()) > 180_000) {
          setGen(prev => prev && prev.sessionId === tracked.sessionId
            ? { ...prev, phase: 'unconfirmed', message: '研究已结束，结果还在整理，完成后本页会更新。' } : prev);
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
      const prompt = `${ensured.action === 'exists' ? '继续研究' : '研究'} ${target.title}（${target.symbol}）：先看已有研究页的内容、缺口和资料时间线，再按缺口补充年报、公告和行情。研究页已经建好，不用再建；研究结束后页面会自动更新。\n引用材料：${target.title} \`${target.slug}\``;
      const { sessionId } = await sessions.start(prompt, { symbol: target.symbol, name: target.title }, { navigate: false });
      if (activeSlug.current !== target.slug) return;
      const baseline = await researchRead<WikiPage>('/wiki/pages/read?slug=' + encodeURIComponent(target.slug)).catch(() => null);
      setGen({ slug: target.slug, phase: 'researching', sessionId, pageReady: true, baselineHash: baseline?.input_hash });
    } catch (e) {
      if (activeSlug.current === target.slug) setGen({ slug: target.slug, phase: 'failed', message: `研究页已建立，但研究没能开始：${e instanceof Error ? e.message : String(e)}`, pageReady: true });
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
        `基于公开资料研究 ${current.title}（${current.symbol}）。这家公司暂时没有研究页，结论只保留在这次对话里。`,
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
  const wikiWaitTitle = genHere?.phase === 'ensuring' ? '正在建立研究页'
    : genHere?.phase === 'settling' ? '研究已结束，正在整理结果…'
    : `${genHere?.pageReady ? '研究页已建立，' : ''}研究进行中，结果会陆续更新到本页。`;
  const genActions = genHere ? <div className="mt-3 flex flex-wrap gap-2">
    {genHere.sessionId && <button type="button" className="workspace-action workspace-action-compact" onClick={() => void openCompanySession()}>查看执行对话</button>}
    {genHere.phase !== 'ensuring' && <Link className="workspace-action workspace-action-compact" to="/my-research?tab=tasks">查看任务记录</Link>}
    {genHere.phase === 'failed' && current?.aShare && <button type="button" className="workspace-action workspace-action-compact" onClick={() => void startCompanyResearch()}>重试</button>}
    {['done', 'partial', 'review', 'failed', 'unconfirmed'].includes(genHere.phase) && <button type="button" className="workspace-action workspace-action-compact" onClick={() => setGen(null)}>收起</button>}
  </div> : null;
  return <div><PageHeader title="个股研究" subtitle="只显示已加入研究的公司。自选与研究名单分开。" actions={!slug ? <div className="flex flex-col items-end gap-2">{refreshing ? <ResearchRefreshStatus /> : <button className="workspace-action" onClick={() => void refreshData()}><RefreshCw size={14} />刷新列表</button>}{notice.slug === slug && notice.text && !refreshing && <span role="status" className="text-xs text-muted-foreground">{notice.text}</span>}</div> : undefined} />
    {error && <p role="alert" className="mb-4">{error}</p>}
    {wikiError && <p role="alert" className="mb-4">公司资料暂时读不到：{wikiError}<button className="workspace-action ml-2" onClick={() => refresh(x => x + 1)}>重试</button></p>}
    {!slug && listLoading && <ResearchLoading title="正在读取公司资料" sections={['研究名单', '公司资料']} />}
    {slug && <div className="object-toolbar">
      <div className="object-toolbar-group">
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
        {current?.hasWiki && <WikiViewTabs report={report} onChange={setReport} />}
      </div>
      <div className="object-toolbar-group object-toolbar-actions">
        {current && <button className="workspace-action" onClick={() => void toggleWatch(current.symbol)}><Star size={14} className={watched.has(current.symbol) ? 'fill-primary text-primary' : ''} />{watched.has(current.symbol) ? '已自选' : '加入自选'}</button>}
        {/* 研究页的动作是刷新资料；图文报告的动作（重新生成）由报告组件投送到下面的槽位。刷新组件只隐藏不卸载，避免中断进行中的检查。 */}
        {current?.hasWiki && <span className={report ? 'hidden' : 'contents'}><CompanyRefreshConfirm key={slug} slug={slug} version={wikiPage?.input_hash} title={current.title} onUpdated={() => refresh(x => x + 1)} onStateChange={setRefreshView} /></span>}
        {current?.hasWiki && report && <span ref={setReportSlot} className="contents" />}
        {current && <WorkspaceMoreMenu actions={[{ id: 'leave', label: '移出研究', icon: <X size={14} />, onSelect: () => void leave(current.symbol) }]} />}
      </div>
      {notice.slug === slug && notice.text && !refreshing && <span role="status" className="object-toolbar-notice">{notice.text}</span>}
    </div>}
    {slug ? <GlassCard className="min-h-[440px] !p-4 sm:!p-7">
      {current && pagesReady && !current.hasWiki && !wikiWait && <div className="mb-4 space-y-3">
        <h2 className="text-base font-semibold">{current.title}<span className="ml-2 font-mono text-xs font-normal text-muted-foreground">{current.symbol}</span></h2>
        <p className="text-sm text-muted-foreground">{current.aShare
          ? '已加入研究，还没有研究页。开始研究后会先建立研究页，再补充资料。'
          : '已加入研究。港股 / 美股暂时没有研究页，可以在深度对话中研究。'}</p>
        <div className="flex flex-wrap gap-2">
          {current.aShare
            ? <button type="button" className="workspace-action workspace-action-primary" disabled={!!gen && gen.slug === slug && (gen.phase === 'ensuring' || gen.phase === 'researching' || gen.phase === 'settling')} onClick={() => void startCompanyResearch()}>{gen?.slug === slug && gen.phase === 'failed' ? '重试研究' : '开始研究'}</button>
            : <button type="button" className="workspace-action" onClick={() => void startPlainResearch()}>在深度对话中研究</button>}
          <Link className="workspace-action" to="/my-reports">上传研报补充</Link>
        </div>
      </div>}
      {wikiWait && genHere && <><WikiLoading slug={slug} title={wikiWaitTitle} />{genHere.phase !== 'ensuring' && genActions}</>}
      {genHere && !wikiWait && <div className="mb-4 rounded-xl border border-border p-4" role="status">
        {genHere.phase === 'researching' && <p className="text-sm">{genHere.pageReady ? '研究页已建立，' : ''}研究进行中，结果会陆续更新到本页。</p>}
        {genHere.phase === 'settling' && <p className="text-sm">研究已结束，正在整理结果…</p>}
        {genHere.phase === 'done' && <p className="text-sm">{genHere.message || '研究已结束。'}</p>}
        {(genHere.phase === 'partial' || genHere.phase === 'review') && <p className="text-sm">{genHere.message}</p>}
        {genHere.phase === 'review' && genHere.draftToken && <WikiDraftPublish draftToken={genHere.draftToken} onPublished={() => { refresh(x => x + 1); setGen(prev => prev && prev.slug === slug ? { ...prev, phase: 'done', message: '本页已更新。' } : prev); }} />}
        {genHere.phase === 'unconfirmed' && <p className="text-sm">{genHere.message || '研究已结束，结果还在整理。'}</p>}
        {genHere.phase === 'failed' && <p role="alert" className="text-sm">{genHere.message || '研究没有完成，可以重试。'}</p>}
        {genActions}
      </div>}
      {current?.hasWiki && !report && refreshView !== 'idle' && <WikiLoading slug={slug} title={refreshView === 'checking' ? '正在检查资料' : '正在更新资料'} />}
      {current?.hasWiki ? <div hidden={!report && refreshView !== 'idle'}><WikiReader key={slug} slug={slug} revision={revision} hideToggle report={report} reportActionSlot={reportSlot} onReportChange={setReport} onLoadState={setReaderState} onPage={setWikiPage} onMarkdown={value => setLoaded(previous => previous.slug === slug && previous.markdown === value ? previous : { slug, markdown: value })} /></div> : null}
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
        <CompanyRosterCard
          key={row.symbol}
          row={row}
          industryReady={readyProfiles.has((row.summary?.industry_code || '').toUpperCase())}
          researching={runningSymbols.has(row.symbol)}
          hasReport={Boolean(reportFlags[row.slug])}
          onOpen={() => setSlug(row.slug)}
          attach={attachRoster(row.slug)}
        />
      ))}</div>
      : <GlassCard className="!p-2 sm:!p-3">
        <div className="divide-y divide-border/60">
          {visible.map(row => <CompanyRosterRow
            key={row.symbol}
            row={row}
            industryReady={readyProfiles.has((row.summary?.industry_code || '').toUpperCase())}
            researching={runningSymbols.has(row.symbol)}
            hasReport={Boolean(reportFlags[row.slug])}
            watched={watched.has(row.symbol)}
            onOpen={() => setSlug(row.slug)}
            onWatch={() => void toggleWatch(row.symbol)}
            onLeave={() => void leave(row.symbol)}
            attach={attachRoster(row.slug)}
          />)}
        </div>
      </GlassCard>}
    </> : null}
    <Disclaimer /></div>;
}

type RosterRow = {
  symbol: string;
  slug: string;
  title: string;
  hasWiki: boolean;
  aShare: boolean;
  summary?: CompanyPageSummary;
};

function RosterIndustryTag({ summary, ready }: { summary?: CompanyPageSummary; ready: boolean }) {
  const name = companyIndustryLabel(summary);
  if (!name) return null;
  const cls = 'inline-flex h-[22px] shrink-0 items-center rounded-[6px] border border-border bg-transparent px-1.5 text-xs leading-none';
  const code = summary?.industry_code?.trim();
  if (ready && code) {
    return <Link to={`/sectors/profiles/${encodeURIComponent(code)}`} onClick={event => event.stopPropagation()} className={cn(cls, 'hover:border-primary')}>{name}</Link>;
  }
  return <span className={cls}>{name}</span>;
}

function RosterStatusTags({ slug, researching, hasReport }: { slug: string; researching: boolean; hasReport: boolean }) {
  const tag = 'inline-flex h-[22px] shrink-0 items-center rounded-[6px] px-1.5 text-xs leading-none';
  return <>
    {researching && <span className={cn(tag, 'bg-primary/10 text-primary')}>研究中</span>}
    {hasReport && <Link to={`/research?company=${encodeURIComponent(slug)}&view=report`} onClick={event => event.stopPropagation()} className={cn(tag, 'border border-border hover:border-primary')}>图文报告</Link>}
  </>;
}

function RosterOneLiner({ text, lines }: { text?: string | null; lines: 1 | 2 }) {
  const clipped = clipCompanyOneLiner(text);
  if (!clipped) return <p className={cn('text-[13px] text-muted-foreground/50', lines === 1 ? 'truncate' : 'line-clamp-2')}>资料待补充</p>;
  return <p className={cn('text-[13px] text-muted-foreground', lines === 1 ? 'truncate' : 'line-clamp-2')}>{clipped}</p>;
}

function CompanyRosterRow({
  row, industryReady, researching, hasReport, watched, onOpen, onWatch, onLeave, attach,
}: {
  row: RosterRow;
  industryReady: boolean;
  researching: boolean;
  hasReport: boolean;
  watched: boolean;
  onOpen: () => void;
  onWatch: () => void;
  onLeave: () => void;
  attach: (el: HTMLElement | null) => void;
}) {
  const asOf = companyAsOfLabel(row.summary?.as_of);
  return <div ref={attach} data-roster-slug={row.slug} className="flex min-w-0 items-center gap-2 px-2 py-4 hover:bg-muted/40">
    <button type="button" onClick={onOpen} className="flex min-w-0 flex-1 items-center gap-2 overflow-hidden text-left">
      <span className="truncate font-medium">{row.title}</span>
      <span className="shrink-0 font-mono text-[11px] text-muted-foreground">{row.symbol}{!row.hasWiki ? ' · 资料待生成' : ''}</span>
    </button>
    <RosterIndustryTag summary={row.summary} ready={industryReady} />
    <RosterStatusTags slug={row.slug} researching={researching} hasReport={hasReport} />
    <div className="ml-auto flex shrink-0 items-center gap-2">
      {asOf && <span className="text-xs text-muted-foreground">资料截至 {asOf}</span>}
      <ArrowRight size={14} className="text-muted-foreground/60" />
      <button type="button" className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground hover:bg-muted" onClick={onWatch} aria-label={watched ? '移出自选' : '加入自选'}>
        <Star size={14} className={watched ? 'fill-current text-primary' : ''} />
      </button>
      <button type="button" className="workspace-action workspace-action-compact" onClick={onLeave}>移除</button>
    </div>
  </div>;
}

function CompanyRosterCard({
  row, industryReady, researching, hasReport, onOpen, attach,
}: {
  row: RosterRow;
  industryReady: boolean;
  researching: boolean;
  hasReport: boolean;
  onOpen: () => void;
  attach: (el: HTMLElement | null) => void;
}) {
  const asOf = companyAsOfLabel(row.summary?.as_of);
  return <div ref={attach} data-roster-slug={row.slug} className="min-w-0">
    <GlassCard glow className="flex h-full min-h-44 flex-col justify-between">
      <div className="min-w-0">
        <Building2 size={20} className="mb-4 text-primary" />
        <button type="button" onClick={onOpen} className="block min-w-0 text-left">
          <h2 className="truncate text-base font-bold">{row.title}</h2>
          <p className="mt-1 font-mono text-[11px] text-muted-foreground">{row.symbol}{!row.hasWiki ? ' · 资料待生成' : ''}</p>
        </button>
        <div className="mt-2 flex min-w-0 flex-wrap items-center gap-1.5">
          <RosterIndustryTag summary={row.summary} ready={industryReady} />
          <RosterStatusTags slug={row.slug} researching={researching} hasReport={hasReport} />
        </div>
        <button type="button" onClick={onOpen} className="mt-2 block w-full min-w-0 text-left">
          <RosterOneLiner text={row.summary?.one_liner} lines={2} />
        </button>
      </div>
      <div className="mt-5 flex items-center justify-between gap-2 border-t border-border/50 pt-3 text-xs">
        <span className="min-w-0 truncate text-muted-foreground">{asOf ? `资料截至 ${asOf}` : row.hasWiki ? '打开资料' : '资料待生成'}</span>
        <button type="button" onClick={onOpen} className="inline-flex shrink-0 items-center gap-1 text-primary">
          {row.hasWiki ? '打开资料' : '资料待生成'}<ArrowRight size={16} />
        </button>
      </div>
    </GlassCard>
  </div>;
}
