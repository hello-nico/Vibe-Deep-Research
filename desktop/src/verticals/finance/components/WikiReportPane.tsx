import { useContext, useEffect, useMemo, useRef, useState, useSyncExternalStore, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { RotateCw } from 'lucide-react';
import { researchRead, type WikiPage } from '../lib/research';
import { ResearchSessionContext, type ReportTaskRef } from '../dsh/research-session';
import { useSlugTaskActivity } from '../dsh/task-activity';
import { activeTaskKind, loadReportTasks } from '../lib/reportTasks';
import { ResearchLoading } from './ui/ResearchLoading';
import { reportProgress, REPORT_STEPS } from '../lib/reportProgress';
import { objectPathFromLocation, trackTask } from '../lib/taskNotices';
import './wiki-report.css';

interface ReportMeta {
  report_id: string;
  title: string;
  created_at: string;
  input_hash: string;
  current: boolean;
  template?: string;
  session_id?: string;
}

interface ReportDetail extends ReportMeta {
  html: string;
  refs?: string[];
  allowed_refs?: string[];
  unverified_refs?: string[];
  quality_warnings?: unknown[];
  semantic_checks?: SemanticCheck[];
}

interface SemanticCheck {
  ref?: string;
  status?: string;
  probabilities?: { support?: number };
}

export function semanticUnverifiedRefs(checks: readonly SemanticCheck[] = []): string[] {
  return [...new Set(checks.filter(check => check.status === 'completed' && typeof check.ref === 'string'
    && typeof check.probabilities?.support === 'number' && check.probabilities.support < 0.7)
    .map(check => check.ref!))];
}

/** The report to show: the one for the current page version, else the newest older one (shown with a stale notice). */
function shownReport(list: readonly ReportMeta[] | null | undefined): ReportMeta | undefined {
  if (!list?.length) return undefined;
  return list.find(item => item.current) ?? [...list].sort((a, b) => b.created_at.localeCompare(a.created_at))[0];
}

const REPORT_REF = /^(claim|evidence|source|provider|lookup):[^\s"'<>&]{1,400}$/;
const TASK_POLL_MS = 4_000;

/** Strict validation of iframe→host messages; anything else is ignored. */
export function reportMessage(data: unknown): { kind: 'cite'; ref: string } | { kind: 'resize'; height: number } | null {
  const message = data && typeof data === 'object' ? data as Record<string, unknown> : null;
  if (message?.source !== 'vibe-wiki-report') return null;
  if (message.type === 'cite' && typeof message.ref === 'string' && REPORT_REF.test(message.ref)) {
    return { kind: 'cite', ref: message.ref };
  }
  if (message.type === 'resize' && typeof message.height === 'number' && Number.isFinite(message.height)) {
    return { kind: 'resize', height: message.height };
  }
  return null;
}

/** Clicks are only honoured when the ref is part of the loaded artifact's allowed set —
 * inline scripts can inject data-ref at runtime, so save-time validation alone is insufficient. */
export function citeAllowed(message: { kind: 'cite'; ref: string } | null, allowed: ReadonlySet<string> | null): string | null {
  if (message?.kind !== 'cite' || !allowed) return null;
  return allowed.has(message.ref) ? message.ref : null;
}

/** The ref set trusted for one loaded artifact: the page-snapshot membership
 * when the record carries it, else the artifact's own saved refs. */
export function allowedRefSet(detail: Pick<ReportDetail, 'refs' | 'allowed_refs'>): Set<string> {
  return new Set(detail.allowed_refs?.length ? detail.allowed_refs : detail.refs ?? []);
}

const NARROW_REPORT_STYLE = `<style data-product-report-layout>
@media (max-width: 760px) {
  .lf-sheet { grid-template-columns: minmax(0, 1fr) !important; }
  .lf-spine { display: none !important; }
  .lf-mast h1 { writing-mode: horizontal-tb !important; overflow-wrap: break-word; }
}
</style>`;

export function reportWithNarrowLayout(html: string, unverifiedRefs: readonly string[] = [], semanticChecks: readonly SemanticCheck[] = []): string {
  const semanticRefs = semanticUnverifiedRefs(semanticChecks);
  const reasons = Object.fromEntries([...new Set([...unverifiedRefs, ...semanticRefs])].map(ref => [ref,
    [unverifiedRefs.includes(ref) ? '数字对不上：这条引用的原文里没有找到对应数字' : '',
      semanticRefs.includes(ref) ? '语义可能不一致：原文对这条结论的支持不足' : ''].filter(Boolean).join('；')]));
  const refs = JSON.stringify(reasons).replace(/</g, '\\u003c');
  const marks = Object.keys(reasons).length ? `<script data-product-report-verification>
    (function(){var reasons=${refs};document.querySelectorAll('[data-ref]').forEach(function(el){
      var reason=reasons[el.getAttribute('data-ref')];if(typeof reason!=='string')return;
      var mark=document.createElement('small');mark.textContent='待核';
      mark.title=reason;
      mark.style.cssText='margin-left:4px;color:#888;font-size:11px';el.after(mark);
    });})();</script>` : '';
  const closing = /<\/(?:body|html)\s*>/i.exec(html);
  return closing
    ? html.slice(0, closing.index) + NARROW_REPORT_STYLE + marks + html.slice(closing.index)
    : html + NARROW_REPORT_STYLE + marks;
}

function pageSlug(page: WikiPage): string {
  return page.spec.slug || '';
}

// 报告步骤、样式与页面类型契约由 Stock 的 wiki_report 角色提示按绑定页面注入；这里只写用户能读懂的一句话。
export function reportPrompt(page: WikiPage): string {
  return `为《${page.spec.title || pageSlug(page)}》生成一份图文报告。`;
}

/** `actionSlot`: the page toolbar's action group; when given, regenerate lives there instead of above the report. */
export function WikiReportPane({ page, fallback = null, active = true, actionSlot = null }: { page: WikiPage; fallback?: ReactNode; active?: boolean; actionSlot?: HTMLElement | null }) {
  const slug = pageSlug(page);
  const inputHash = page.input_hash ?? '';
  const sessions = useContext(ResearchSessionContext);
  const taskActivity = useSlugTaskActivity(slug, sessions, false);
  const topicReport = page.spec.type === 'topic';
  const blockedReason = !taskActivity.ready ? '正在核对任务状态，请稍后重试。'
    : !topicReport && taskActivity.kind === 'research' ? '公司研究进行中，完成后可生成图文报告。' : '';
  const [items, setItems] = useState<ReportMeta[] | null>(null);
  const [selected, setSelected] = useState<ReportMeta | null>(null);
  const [detail, setDetail] = useState<{ reportId: string; html: string; allowed: Set<string>; unverifiedRefs: string[]; qualityWarnings: unknown[]; semanticChecks: SemanticCheck[] } | null>(null);
  const [error, setError] = useState('');
  const [task, setTask] = useState<ReportTaskRef | null>(null);
  const [starting, setStarting] = useState(false);
  const [pendingRun, setPendingRun] = useState(false);
  const [busyOtherVersion, setBusyOtherVersion] = useState(false);
  useEffect(() => {
    if (!sessions || !task?.sessionId) return;
    return sessions.trajectory(task.sessionId)?.subscribe(() => {});
  }, [sessions, task?.sessionId]);
  const frame = useRef<HTMLIFrameElement>(null);
  const seq = useRef(0);
  const checkSeq = useRef(0);
  const wasRunning = useRef(false);
  const primedTask = useRef(false);
  const watchedLive = useRef(false);
  const startedSession = useRef('');
  const requestedAt = useRef(0);
  const pageEpoch = useRef(0);
  const baselineReport = useRef<string | null>(null);
  const existingCurrent = useRef<string | null>(null);
  const [listSeed, setListSeed] = useState(0);
  const awaitingArtifact = useRef(false);

  // Pure fetch — callers commit setItems only after their staleness guards pass,
  // so a late response from a previous page version can never write state.
  const fetchItems = async (signal?: AbortSignal) => {
    const result = await researchRead<{ items: ReportMeta[] }>('/wiki/reports?slug=' + encodeURIComponent(slug), { signal });
    return result.items;
  };

  // Page/version switch: reset every piece of stale state and bump the request
  // sequence so late responses cannot overwrite the new page.
  useEffect(() => {
    const controller = new AbortController();
    ++pageEpoch.current;
    const mine = ++seq.current;
    wasRunning.current = false;
    primedTask.current = false;
    watchedLive.current = false;
    baselineReport.current = null;
    existingCurrent.current = null;
    awaitingArtifact.current = false;
    setListSeed(0);
    setItems(null); setSelected(null); setDetail(null); setError('');
    setTask(null); setStarting(false); setPendingRun(false); setBusyOtherVersion(false);
    startedSession.current = '';
    void fetchItems(controller.signal)
      .then(list => {
        if (controller.signal.aborted || seq.current !== mine) return;
        const current = list.find(item => item.current);
        existingCurrent.current = current?.report_id ?? null;
        setItems(list);
        const shown = shownReport(list);
        if (shown) setSelected(shown);
        setListSeed(value => value + 1);
      })
      .catch(() => {
        if (controller.signal.aborted || seq.current !== mine) return;
        existingCurrent.current = null;
        setError('生成报告列表暂时无法读取，研究页仍可阅读。');
        setListSeed(value => value + 1);
      });
    return () => { ++pageEpoch.current; controller.abort(); };
  }, [slug, inputHash]);

  // Load the selected artifact; its identity + ref whitelist ride together so a
  // failed load never leaves a mismatched title/body pair on screen.
  useEffect(() => {
    if (!selected) { setDetail(null); return; }
    const controller = new AbortController();
    const mine = ++seq.current;
    setDetail(null);
    void researchRead<ReportDetail>('/wiki/reports/' + encodeURIComponent(selected.report_id), { signal: controller.signal })
      .then(result => {
        if (controller.signal.aborted || seq.current !== mine) return;
        if (result.report_id !== selected.report_id) throw new Error('报告身份不匹配');
        setDetail({ reportId: result.report_id, html: result.html, allowed: allowedRefSet(result), unverifiedRefs: result.unverified_refs ?? [], qualityWarnings: result.quality_warnings ?? [], semanticChecks: result.semantic_checks ?? [] });
      })
      .catch(() => {
        if (controller.signal.aborted || seq.current !== mine) return;
        setDetail(null);
        setError('该版本报告读取失败，已回到研究页。');
      });
    return () => controller.abort();
  }, [selected?.report_id]);

  // Track the bound report task: execution state comes from DSH, artifact state
  // from Backend. A session existing ≠ a report existing. A finished binding is
  // not a falling edge — only a live run this pane actually watched.
  useEffect(() => {
    if (!sessions || !slug || listSeed === 0) return;
    let cancelled = false;
    primedTask.current = false;
    wasRunning.current = false;
    const check = async () => {
      const mine = ++checkSeq.current;
      const found = await sessions.findReportTask(slug).catch(() => null);
      if (cancelled || mine !== checkSeq.current) return;
      const state = found ? sessions.sessionState(found.sessionId) : null;
      const startedId = startedSession.current;
      const live = Boolean(found?.sessionId && found.sessionId === startedId);
      const startedState = startedId ? sessions.sessionState(startedId) : null;
      const running = startedState ? Boolean(startedState.running) : Boolean(found?.running || state?.running);
      if (running) {
        watchedLive.current = true;
        awaitingArtifact.current = true;
        if (baselineReport.current === null) baselineReport.current = existingCurrent.current;
      }
      if (awaitingArtifact.current) {
        const list = await fetchItems().catch(() => null);
        if (cancelled || mine !== checkSeq.current) return;
        if (list) {
          setItems(list);
          const current = list.find(item => item.current);
          if (current && (!baselineReport.current || current.report_id !== baselineReport.current)) {
            setSelected(current);
            setBusyOtherVersion(false);
            setError('');
            setPendingRun(false);
            awaitingArtifact.current = false;
            startedSession.current = '';
          }
        }
      }
      if (startedId && (!found || !live)) {
        if (Date.now() - requestedAt.current > 15_000 && awaitingArtifact.current) {
          setPendingRun(false);
          setTask(previous => previous ? { ...previous, running: false } : previous);
          setError('暂时无法确认报告任务状态，可在「我的研究 · 任务」查看过程后重试。');
          startedSession.current = '';
        }
        if (!found) return;
      }
      setTask(found ? { ...found, running } : previous => previous ? { ...previous, running } : previous);
      if (!primedTask.current) {
        primedTask.current = true;
        wasRunning.current = running;
        if (!live || running) return;
      }
      if (watchedLive.current && (wasRunning.current || live) && !running) {
        setPendingRun(false);
        if (live) startedSession.current = '';
        if (awaitingArtifact.current && found && found.inputHash === inputHash) {
          const ended = sessions.sessionState(found.sessionId);
          setError(ended?.failed || ended?.lastAgentError || ended?.promptError
            ? '报告生成失败，研究页仍可阅读；可在「我的研究 · 任务」查看过程后重试。'
            : '报告生成已结束，但产出尚未确认；可在「我的研究 · 任务」查看过程后重试。');
        }
      }
      wasRunning.current = running;
    };
    void check();
    const timer = setInterval(() => { void check(); }, TASK_POLL_MS);
    return () => { cancelled = true; clearInterval(timer); };
  }, [sessions, slug, inputHash, listSeed]);

  // Citation bridge: verify the message really came from our iframe and the ref
  // belongs to the currently loaded artifact's allowed set.
  useEffect(() => {
    const onMessage = (event: MessageEvent) => {
      if (event.source !== frame.current?.contentWindow) return;
      const message = reportMessage(event.data);
      if (message?.kind === 'cite') {
        const ref = citeAllowed(message, detail && detail.reportId === selected?.report_id ? detail.allowed : null);
        if (ref) window.dispatchEvent(new CustomEvent('finance-open-evidence', { detail: ref }));
      } else if (message?.kind === 'resize' && frame.current) {
        frame.current.style.height = `${Math.min(Math.max(message.height + 24, 240), 20_000)}px`;
      }
    };
    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
  }, [detail, selected?.report_id]);

  const generate = () => {
    if (!sessions) { setError('研究服务正在连接，请稍后再试。'); return; }
    if (!inputHash) { setError('页面版本信息缺失，无法发起报告生成。'); return; }
    if (blockedReason) { setError(blockedReason); return; }
    const epoch = pageEpoch.current;
    watchedLive.current = true;
    awaitingArtifact.current = true;
    baselineReport.current = selected?.report_id ?? null;
    requestedAt.current = Date.now();
    setError(''); setStarting(true); setPendingRun(true);
    setSelected(null); setDetail(null);
    void (async () => {
      const bindings = await loadReportTasks();
      if (!topicReport && activeTaskKind(bindings, slug, id => sessions.taskRunning(id)) === 'research')
        throw new Error('公司研究进行中，完成后可生成图文报告。');
      return sessions.start(reportPrompt(page), undefined, {
        navigate: false,
        task: { kind: 'report', slug, inputHash, title: `报告生成 · ${page.spec.title || slug}` },
      });
    })().then(result => {
      if (epoch !== pageEpoch.current) return;
      setBusyOtherVersion(result.status === 'busy_other_version');
      if (result.status === 'busy_other_version') {
        setError('');
        setPendingRun(false);
        startedSession.current = '';
        const current = items?.find(item => item.current);
        if (current) setSelected(current);
        return;
      }
      if (result.sessionId) {
        startedSession.current = result.sessionId;
        setTask({ sessionId: result.sessionId, slug, inputHash, running: true });
        trackTask({
          kind: 'report',
          object: {
            slug, title: page.spec.title || slug,
            kind: page.spec.type === 'topic' ? 'topic' : page.spec.type === 'industry' ? 'industry' : 'company',
            path: objectPathFromLocation(),
          },
          ref: result.sessionId,
          baseline: baselineReport.current ?? undefined,
        });
      }
    }).catch(e => {
      if (epoch !== pageEpoch.current) return;
      setPendingRun(false);
      startedSession.current = '';
      setError(e instanceof Error ? e.message : '报告生成未能启动，研究页仍可阅读；可重试。');
      const shown = shownReport(items);
      if (shown) setSelected(shown);
    }).finally(() => { if (epoch === pageEpoch.current) setStarting(false); });
  };

  const generating = starting || pendingRun || Boolean(task?.running);
  const taskStale = Boolean(task?.running && task.inputHash !== inputHash);
  const showGenerated = active && Boolean(detail && selected && detail.reportId === selected.report_id);
  const loadingList = active && items === null && !error;
  const loadingDetail = active && Boolean(selected) && !detail && !error;
  const waiting = active && !showGenerated && !loadingList && !loadingDetail;
  const canGenerate = items !== null && !generating && !blockedReason;
  return <>
    {actionSlot && generating && createPortal(
      <button type="button" className="workspace-action" disabled aria-busy="true">正在生成…</button>, actionSlot)}
    {actionSlot && !generating && blockedReason && createPortal(<button type="button" className="workspace-action" disabled title={blockedReason}>生成图文报告</button>, actionSlot)}
    {active && taskActivity.kind === 'research' && <p role="status" className="mb-3 text-sm text-muted-foreground">{blockedReason}</p>}
    {showGenerated && canGenerate && actionSlot && createPortal(
      <button type="button" className="workspace-action" onClick={generate}><RotateCw />重新生成</button>, actionSlot)}
    {showGenerated && detail && <div className="wiki-report-shell">
      {new Set([...detail.unverifiedRefs, ...semanticUnverifiedRefs(detail.semanticChecks)]).size > 0 && <p role="status" className="text-sm text-muted-foreground">有 {new Set([...detail.unverifiedRefs, ...semanticUnverifiedRefs(detail.semanticChecks)]).size} 处引用待核</p>}
      {(() => {
        // “未做排版检查”是检查工具自身不可用，不算排版问题，单独说明。
        const unchecked = detail.qualityWarnings.some(item => (item as { check?: string })?.check === 'quality_unavailable');
        const issues = detail.qualityWarnings.filter(item => (item as { check?: string })?.check !== 'quality_unavailable').length;
        return <>
          {issues > 0 && <p role="status" className="text-sm text-muted-foreground">这份报告有 {issues} 处排版待核，可重新生成</p>}
          {unchecked && <p role="status" className="text-sm text-muted-foreground">这份报告保存时未做排版检查</p>}
        </>;
      })()}
      {selected && !selected.current && <p role="status" className="wiki-report-stale">{topicReport ? '报告对应旧版本，议题已有更新。' : '研究页在这份报告生成后有更新，报告可能不含最新内容。'}{canGenerate ? '可点「重新生成」按当前内容再出一份。' : ''}</p>}
      {((canGenerate && !actionSlot) || error) && <div className="wiki-report-chrome" role="toolbar" aria-label="报告操作">
        {selected?.current && <span className="sr-only">对应当前研究页</span>}
        {canGenerate && !actionSlot && <button type="button" className="wiki-report-tab" onClick={generate}>重新生成</button>}
        {error && <span role="alert" className="text-destructive">{error}</span>}
      </div>}
      <iframe ref={frame} title={`${page.spec.title} 交互报告`} sandbox="allow-scripts" srcDoc={reportWithNarrowLayout(detail.html, detail.unverifiedRefs, detail.semanticChecks)} style={{ minHeight: 480 }} />
    </div>}
    {active && (loadingList || loadingDetail) && <p role="status" className="py-12 text-center text-sm text-muted-foreground">{loadingDetail ? '正在打开报告…' : '正在查看是否已有报告…'}</p>}
    {waiting && <div className="wiki-report-empty">
      {error && <p role="alert" className="mb-3 text-sm text-destructive">{error}</p>}
      {busyOtherVersion && !generating && <p className="mb-3 text-sm text-muted-foreground">可生成当前版本。</p>}
      {generating ? (taskStale || !task?.sessionId
        ? <ResearchLoading title={taskStale ? '另一版本仍在生成' : '正在生成图文报告'} sections={REPORT_STEPS} />
        : <ReportProgress sessionId={task.sessionId} />) : <>
        <p className="font-medium">{items?.some(item => item.current) ? '报告暂时无法打开' : '还没有图文报告'}</p>
        <p className="mt-2 text-sm text-muted-foreground">按当前研究页生成。原文还在「研究页」里。</p>
        {canGenerate && <button type="button" className="workspace-action workspace-action-primary mt-4" onClick={generate}>{items?.some(item => item.current) ? '重新生成' : '生成报告'}</button>}
      </>}
    </div>}
    {!active && fallback}
  </>;
}

const noopSubscribe = () => () => {};
const noProgress = () => null;

/** 生成中的真实步骤：由报告会话最近一次工具调用推断；读不到过程时退回轮播。 */
function ReportProgress({ sessionId }: { sessionId: string }) {
  const sessions = useContext(ResearchSessionContext);
  const trajectory = useMemo(() => {
    try { return sessions?.trajectory(sessionId) ?? null; } catch { return null; }
  }, [sessions, sessionId]);
  const read = useMemo(() => trajectory ? () => {
    const progress = reportProgress(trajectory.getSnapshot());
    return `${progress.step}|${progress.label}`;
  } : noProgress, [trajectory]);
  const value = useSyncExternalStore(trajectory?.subscribe ?? noopSubscribe, read, noProgress);
  if (!value) return <ResearchLoading title="正在生成图文报告" sections={REPORT_STEPS} />;
  const [stepText, label = ''] = value.split('|');
  // 沿用已验收的完整加载效果，只把轮播换成真实的当前步骤。
  return <ResearchLoading title="正在生成图文报告" sections={REPORT_STEPS} active={{ index: Number(stepText), label }} />;
}
