import { useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { researchRead, type WikiPage } from '../lib/research';
import { ResearchSessionContext, type ReportTaskRef } from '../dsh/research-session';
import { reportDesignContract } from './WikiReport';
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

export function reportPrompt(page: WikiPage): string {
  const slug = pageSlug(page);
  return [
    `为 Wiki 页 ${slug} 生成一份交互图文报告。这是一次受限的报告生成任务：只使用本会话可用的四个工具。`,
    reportDesignContract(page.spec.type ?? ''),
    `第一步，用 read_research_method 依次读取 lieflat-skill（报告纪律）与 lieflat-reports（报告模板目录），比较候选模板。`,
    `第二步，用 read_research_method 加载你从 lieflat-r01 至 lieflat-r12 中选定的报告模板，理解其结构如何适用于本页材料。`,
    `第三步，用 wiki_read 读取 ${slug} 的当前接受版本；读取会钉住输入快照，之后发布只认这个快照。`,
    `第四步，按选定模板的骨架组织本页真实材料，输出一个自包含 HTML 片段：只允许内联样式与内联脚本；禁止外部资源、网络请求、iframe、表单与跳转链接。`,
    `字级纪律：标题 28px、章节标题 18px、正文 14px、标签与注释 12px；数字用 tabular-nums；品牌橙最多一个焦点；涨跌红涨绿跌。`,
    `每个引用证据的数字或结论元素带 data-ref；其值必须从 wiki_read 返回的 spec 中 ref/refs 字段逐字复制一个完整引用 ID。一个 data-ref 只放一个 ID，禁止用 | 拼接、增删前缀、URL 编码或自行添加 source:来源名称。多条依据使用多个独立引用元素；保留原 ID 中的 + 等字符。缺数据显示"待补充"，缺失与 0 区分，不补造数值。`,
    `图表只表达真实的趋势、对比、构成或阈值关系：长度编码零基线、同组比较共享刻度、直接标注优先于图例；没有关系可表达就不画图。`,
    `最后调用 wiki_report_publish，参数：slug、html、title、template（选定的 lieflat-rNN 名称）。保存失败说明真实原因，不要把 HTML 粘进正文。`,
  ].join('\n');
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
  const [autoTried, setAutoTried] = useState(false);
  const [taskReady, setTaskReady] = useState(false);
  const [busyOtherVersion, setBusyOtherVersion] = useState(false);
  const frame = useRef<HTMLIFrameElement>(null);
  const seq = useRef(0);
  const checkSeq = useRef(0);
  const wasRunning = useRef(false);
  const primedTask = useRef(false);
  const watchedLive = useRef(false);

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
    const mine = ++seq.current;
    wasRunning.current = false;
    primedTask.current = false;
    watchedLive.current = false;
    setItems(null); setSelected(null); setDetail(null); setError('');
    setTask(null); setTaskReady(false); setStarting(false); setAutoTried(false); setBusyOtherVersion(false);
    void fetchItems(controller.signal)
      .then(list => {
        if (controller.signal.aborted || seq.current !== mine) return;
        setItems(list);
        const current = list.find(item => item.current) ?? list[0];
        if (current) setSelected(current);
      })
      .catch(() => { if (!controller.signal.aborted && seq.current === mine) setError('生成报告列表暂时无法读取，研究页仍可阅读。'); });
    return () => controller.abort();
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
    if (!sessions || !slug) return;
    let cancelled = false;
    primedTask.current = false;
    wasRunning.current = false;
    const check = async () => {
      const mine = ++checkSeq.current;
      const found = await sessions.findReportTask(slug).catch(() => null);
      if (cancelled || mine !== checkSeq.current) return;
      setTask(found);
      setTaskReady(true);
      const running = Boolean(found?.running);
      if (!primedTask.current) {
        primedTask.current = true;
        wasRunning.current = running;
        if (running) watchedLive.current = true;
        return;
      }
      if (running) watchedLive.current = true;
      if (watchedLive.current && wasRunning.current && !running) {
        const list = await fetchItems().catch(() => null);
        if (cancelled || mine !== checkSeq.current) return;
        if (list) setItems(list);
        const current = list?.find(item => item.current);
        if (current) { setSelected(current); setBusyOtherVersion(false); setError(''); }
        else if (found && found.inputHash === inputHash) {
          const state = sessions.sessionState(found.sessionId);
          setError(state?.lastAgentError || state?.promptError
            ? '报告生成失败，研究页仍可阅读；可在生成过程中查看后重试。'
            : '报告生成已结束，但产出尚未确认；可在生成过程中查看。');
        }
      }
      wasRunning.current = running;
    };
    void check();
    const off = sessions.subscribeSessionList(() => { void check(); });
    const timer = setInterval(() => { void check(); }, TASK_POLL_MS);
    return () => { cancelled = true; off(); clearInterval(timer); };
  }, [sessions, slug, inputHash]);

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
    if (!sessions) { setError('研究会话尚未连接，稍后再试。'); return; }
    if (!inputHash) { setError('页面版本信息缺失，无法发起报告生成。'); return; }
    watchedLive.current = true;
    setError(''); setStarting(true);
    void sessions.start(reportPrompt(page), undefined, {
      navigate: false,
      task: { kind: 'report', slug, inputHash, title: `报告生成 · ${slug}` },
    }).then(result => {
      setBusyOtherVersion(result.status === 'busy_other_version');
      if (result.status === 'busy_other_version') setError('');
    }).catch(() => {
      setError('报告生成未能启动，研究页仍可阅读；可重试。');
    }).finally(() => setStarting(false));
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

  const generating = starting || Boolean(task?.running);
  const taskStale = Boolean(task?.running && task.inputHash !== inputHash);
  const stale = Boolean(selected && !selected.current);
  const showGenerated = active && Boolean(detail && selected && detail.reportId === selected.report_id);
  const showChrome = active && (showGenerated || generating || Boolean(error) || busyOtherVersion || items !== null);
  return <>
    {showChrome && <div className={showGenerated ? 'wiki-report-shell' : undefined}>
      <div className="wiki-report-chrome" role="toolbar" aria-label="报告操作">
        {items && items.length > 0 && <select aria-label="报告版本" className="wiki-report-tab" value={selected?.report_id ?? ''} onChange={event => {
          const next = items.find(item => item.report_id === event.target.value);
          if (next) setSelected(next);
        }}>{items.map(item => <option key={item.report_id} value={item.report_id}>{new Date(item.created_at).toLocaleString('zh-CN')}{item.current ? '（当前）' : '（旧版本）'}</option>)}</select>}
        {showGenerated && selected?.current && <span className="sr-only">对应当前 Wiki</span>}
        {showGenerated && stale && <span className="wiki-report-tab">基于旧版 Wiki</span>}
        {items !== null && !generating && <button type="button" className="wiki-report-tab" onClick={generate}>{items.some(item => item.current) ? '重新生成' : '生成报告'}</button>}
        {generating && !taskStale && <span className="wiki-report-tab" role="status">正在生成…</span>}
        {taskStale && <span className="wiki-report-tab" role="status">另一版本仍在生成</span>}
        {task?.sessionId && <button type="button" className="wiki-report-tab" onClick={() => sessions?.openTaskProcess({ sessionId: task.sessionId, title: `报告生成 · ${slug}`, kind: 'report' })}>生成过程</button>}
        {busyOtherVersion && !generating && <span className="wiki-report-tab">可生成当前版本</span>}
        {error && <span role="alert" className="text-destructive">{error}</span>}
      </div>
      {showGenerated && detail && <iframe ref={frame} title={`${page.spec.title} 交互报告`} sandbox="allow-scripts" srcDoc={detail.html} style={{ minHeight: 480 }} />}
    </div>}
    {!showGenerated && fallback}
  </>;
}
