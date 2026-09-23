import { useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { researchRead, type WikiPage } from '../lib/research';
import { ResearchSessionContext, type ReportTaskRef } from '../dsh/research-session';
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

function pageSlug(page: WikiPage): string {
  return page.spec.slug || '';
}

// 报告步骤、样式与页面类型契约由 Stock 的 wiki_report 角色提示按绑定页面注入；这里只写用户能读懂的一句话。
export function reportPrompt(page: WikiPage): string {
  return `为《${page.spec.title || pageSlug(page)}》生成一份图文报告。`;
}

export function WikiReportPane({ page, fallback = null, active = true }: { page: WikiPage; fallback?: ReactNode; active?: boolean }) {
  const slug = pageSlug(page);
  const inputHash = page.input_hash ?? '';
  const sessions = useContext(ResearchSessionContext);
  const [items, setItems] = useState<ReportMeta[] | null>(null);
  const [selected, setSelected] = useState<ReportMeta | null>(null);
  const [detail, setDetail] = useState<{ reportId: string; html: string; allowed: Set<string> } | null>(null);
  const [error, setError] = useState('');
  const [task, setTask] = useState<ReportTaskRef | null>(null);
  const [starting, setStarting] = useState(false);
  const [pendingRun, setPendingRun] = useState(false);
  const [autoTried, setAutoTried] = useState(false);
  const [taskReady, setTaskReady] = useState(false);
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
    setTask(null); setTaskReady(false); setStarting(false); setPendingRun(false); setAutoTried(false); setBusyOtherVersion(false);
    startedSession.current = '';
    void fetchItems(controller.signal)
      .then(list => {
        if (controller.signal.aborted || seq.current !== mine) return;
        const current = list.find(item => item.current);
        existingCurrent.current = current?.report_id ?? null;
        setItems(list);
        if (current) setSelected(current);
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
        setDetail({ reportId: result.report_id, html: result.html, allowed: allowedRefSet(result) });
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
          setError('暂时无法确认报告任务状态，请查看生成过程后再试。');
          startedSession.current = '';
        }
        setTaskReady(true);
        if (!found) return;
      }
      setTask(found ? { ...found, running } : previous => previous ? { ...previous, running } : previous);
      setTaskReady(true);
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
            ? '报告生成失败，研究页仍可阅读；可在生成过程中查看后重试。'
            : '报告生成已结束，但产出尚未确认；可在生成过程中查看。');
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
    const epoch = pageEpoch.current;
    watchedLive.current = true;
    awaitingArtifact.current = true;
    baselineReport.current = selected?.report_id ?? null;
    requestedAt.current = Date.now();
    setError(''); setStarting(true); setPendingRun(true);
    void sessions.start(reportPrompt(page), undefined, {
      navigate: false,
      task: { kind: 'report', slug, inputHash, title: `报告生成 · ${page.spec.title || slug}` },
    }).then(result => {
      if (epoch !== pageEpoch.current) return;
      setBusyOtherVersion(result.status === 'busy_other_version');
      if (result.status === 'busy_other_version') {
        setError('');
        setPendingRun(false);
        startedSession.current = '';
        return;
      }
      if (result.sessionId) {
        startedSession.current = result.sessionId;
        setTask({ sessionId: result.sessionId, slug, inputHash, running: true });
      }
    }).catch(() => {
      if (epoch !== pageEpoch.current) return;
      setPendingRun(false);
      startedSession.current = '';
      setError('报告生成未能启动，研究页仍可阅读；可重试。');
    }).finally(() => { if (epoch === pageEpoch.current) setStarting(false); });
  };

  // First open of a version with no artifact and no prior task starts one
  // generation. A finished binding is a previous attempt — retry is explicit.
  useEffect(() => {
    if (!active || autoTried || items === null || !taskReady || starting || task?.running) return;
    if (items.some(item => item.current)) return;
    setAutoTried(true);
    if (task) return;
    generate();
  }, [active, autoTried, items, taskReady, starting, task, task?.running]);

  const generating = starting || pendingRun || Boolean(task?.running);
  const taskStale = Boolean(task?.running && task.inputHash !== inputHash);
  const showGenerated = active && Boolean(detail && selected && detail.reportId === selected.report_id);
  const loadingList = active && items === null && !error;
  const loadingDetail = active && Boolean(selected) && !detail && !error;
  const waiting = active && !showGenerated && !loadingList && !loadingDetail;
  const canGenerate = items !== null && !generating;
  const openProcess = () => sessions?.openTaskProcess({ sessionId: task?.sessionId || '', title: `报告生成 · ${page.spec.title || slug}`, kind: 'report' });
  const processButton = task?.sessionId ? <button type="button" className={showGenerated ? 'wiki-report-tab' : 'workspace-action'} onClick={openProcess}>生成过程</button> : null;
  return <>
    {showGenerated && detail && <div className="wiki-report-shell">
      <div className="wiki-report-chrome" role="toolbar" aria-label="报告操作">
        {selected?.current && <span className="sr-only">对应当前研究页</span>}
        {canGenerate && <button type="button" className="wiki-report-tab" onClick={generate}>重新生成</button>}
        {processButton}
        {error && <span role="alert" className="text-destructive">{error}</span>}
      </div>
      <iframe ref={frame} title={`${page.spec.title} 交互报告`} sandbox="allow-scripts" srcDoc={detail.html} style={{ minHeight: 480 }} />
    </div>}
    {active && (loadingList || loadingDetail) && <p role="status" className="py-12 text-center text-sm text-muted-foreground">{loadingDetail ? '正在打开报告…' : '正在查看是否已有报告…'}</p>}
    {waiting && <div className="wiki-report-empty">
      {error && <p role="alert" className="mb-3 text-sm text-destructive">{error}</p>}
      {busyOtherVersion && !generating && <p className="mb-3 text-sm text-muted-foreground">可生成当前版本。</p>}
      {generating ? <>
        <p className="font-medium">{taskStale ? '另一版本仍在生成' : '正在生成图文报告'}</p>
        <p className="mt-2 text-sm text-muted-foreground">进度在生成过程里。研究页原文可随时切回去看。</p>
      </> : canGenerate ? (
        <button type="button" className="wiki-report-empty-hit" aria-label={items?.some(item => item.current) ? '重新生成图文报告' : '生成图文报告'} onClick={generate}>
          <p className="font-medium">{items?.some(item => item.current) ? '报告暂时无法打开' : '还没有图文报告'}</p>
          <p className="mt-2 text-sm text-muted-foreground">按当前研究页生成。原文还在「研究页」里。</p>
          <span className="workspace-action workspace-action-primary mt-4">{items?.some(item => item.current) ? '重新生成' : '生成报告'}</span>
        </button>
      ) : <>
        <p className="font-medium">{items?.some(item => item.current) ? '报告暂时无法打开' : '还没有图文报告'}</p>
        <p className="mt-2 text-sm text-muted-foreground">按当前研究页生成。原文还在「研究页」里。</p>
      </>}
      {processButton && <div className="mt-4 flex flex-wrap justify-center gap-2">{processButton}</div>}
    </div>}
    {!active && fallback}
  </>;
}
