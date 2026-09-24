import { useContext, useEffect, useRef, useState, type FormEvent } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { Archive, BookOpen, Brain, ListTodo, NotebookPen, Plus, RotateCcw } from "lucide-react";
import { ResearchSessionContext } from "../dsh/research-session";
import { PageHeader } from "../components/ui/PageHeader";
import { GlassCard } from "../components/ui/GlassCard";
import { Disclaimer } from "../components/ui/Disclaimer";
import { WorkspaceFilter } from "../components/ui/WorkspaceFilter";
import { WorkspaceSearch } from "../components/ui/WorkspaceSearch";
import { WorkspaceTabs } from "../components/ui/WorkspaceTabs";
import { KnowledgeText } from "../components/ResearchKnowledge";
import { ResearchLoading } from "../components/ui/ResearchLoading";
import { getNote, notesLoadError, searchNotes, type Note } from "../lib/notes";
import {
  ARCHIVED_TOPIC_TEXT_SEARCH,
  canConfirmNewTopic,
  researchRead,
  setTopicPool,
  startResearchTopic,
  topicHex,
  topicRouteRequest,
  topicRouteSuccess,
  type ResearchTopicRouteResult,
  type ResearchTopicSummary,
} from "../lib/research";
import { userFacingRuntimeError } from '../lib/userFacingError';
import { loadReportTasks, researchSkipSummary, researchTaskStatus, type ReportTaskStore } from "../lib/reportTasks";
import { normalizeResearchTarget, openRegisteredObject, registeredObject } from "../lib/objectRegistry";
import { useAiPage } from "../../../core/ai/pageContext";
import { adoptCandidate, CandidateChoiceNeeded, CANDIDATE_CHANGED, disposeCandidate, loadCandidates, loadMemory, saveMemory, type MemoryDoc, type TopicCandidate } from "../lib/memory";

const TASK_STATUS: Record<string, string> = {
  running: "执行中", waiting_ingest: "等待报告入库", interrupted: "已中断", no_increment: "无新增",
  awaiting_authorization: "待审阅", partial: "部分完成", failed: "失败", cancelled: "已取消", recorded: "已记录",
  researching: '研究中', settling: '整理中', completed: '研究已结束', unconfirmed: '结果待确认',
  skipped: '未整理',
};

type TaskRow = { id: string; kind?: string; title?: string; question?: string; status?: string; display_status?: string; started_at?: string; finished_at?: string; summary?: string; parent_session_id?: string; source_session_id?: string; child_session_id?: string; settlement_session_id?: string; targets?: string[]; draft_token?: string; settlement_reason?: string; reason?: string };

const RESEARCH_TABS = [
  { value: "topics", label: "议题", icon: BookOpen },
  { value: "notes", label: "记录", icon: NotebookPen },
  { value: "tasks", label: "任务", icon: ListTodo },
  { value: "memory", label: "记忆", icon: Brain },
] as const;

export function MyResearch() {
  const navigate = useNavigate();
  const researchSessions = useContext(ResearchSessionContext);
  const [params, setParams] = useSearchParams();
  const tab = params.get("tab") === "notes" ? "notes" : params.get("tab") === "tasks" ? "tasks" : params.get("tab") === "memory" ? "memory" : "topics";
  const status = params.get("status") === "archived" ? "archived" : "active";
  const [query, setQuery] = useState("");
  const [topics, setTopics] = useState<ResearchTopicSummary[] | null>(null);
  const [error, setError] = useState("");
  const [offset, setOffset] = useState(0);
  const [nextOffset, setNextOffset] = useState<number | null>(null);
  const [topicsTick, setTopicsTick] = useState(0);
  const [poolBusy, setPoolBusy] = useState("");
  const [notes, setNotes] = useState<Note[] | null>(null);
  const [notesTotal, setNotesTotal] = useState(0);
  const [notesOffset, setNotesOffset] = useState(0);
  const [notesNext, setNotesNext] = useState<number | null>(null);
  const [notesError, setNotesError] = useState(notesLoadError()?.message || "");
  const [notesBusy, setNotesBusy] = useState(false);
  const [notesTick, setNotesTick] = useState(0);
  const [tasks, setTasks] = useState<TaskRow[] | null>(null);
  const [tasksError, setTasksError] = useState("");
  const [topicQuestion, setTopicQuestion] = useState("");
  const [topicRouteResult, setTopicRouteResult] = useState<ResearchTopicRouteResult | null>(null);
  const [topicRouteError, setTopicRouteError] = useState("");
  const [topicRouteStatus, setTopicRouteStatus] = useState("");
  const [topicRouteBusy, setTopicRouteBusy] = useState(false);
  const topicRouteTimer = useRef<number | null>(null);
  const topicRouteController = useRef<AbortController | null>(null);
  const topicRouteAttempt = useRef(0);
  const topicRouteMounted = useRef(false);
  useEffect(() => {
    topicRouteMounted.current = true;
    return () => {
      topicRouteMounted.current = false;
      topicRouteAttempt.current += 1;
      topicRouteController.current?.abort();
      if (topicRouteTimer.current !== null) window.clearTimeout(topicRouteTimer.current);
    };
  }, []);
  useEffect(() => {
    if (tab !== "topics") return;
    const controller = new AbortController();
    setError("");
    setTopics(null);
    void researchRead<{ items: ResearchTopicSummary[]; next_offset: number | null }>(
      `/wiki/research-topics?limit=50&offset=${offset}&query=${encodeURIComponent(query)}&pool=${status}`,
      { signal: controller.signal },
    ).then(value => { setTopics(value.items); setNextOffset(value.next_offset); }).catch(e => { if (!controller.signal.aborted) setError(String(e)); });
    return () => controller.abort();
  }, [tab, query, offset, status, topicsTick]);
  useEffect(() => {
    if (tab !== "notes") return;
    const controller = new AbortController();
    setNotesBusy(true); setNotesError("");
    void searchNotes(query, notesOffset, 40).then(page => {
      if (controller.signal.aborted) return;
      setNotes(page.notes); setNotesTotal(page.total); setNotesNext(page.nextOffset);
    }).catch(e => {
      if (!controller.signal.aborted) { setNotes(null); setNotesError(e instanceof Error ? e.message : String(e)); }
    }).finally(() => { if (!controller.signal.aborted) setNotesBusy(false); });
    return () => controller.abort();
  }, [tab, query, notesOffset, notesTick]);
  useEffect(() => {
    if (tab !== "tasks") return;
    const controller = new AbortController();
    let first = true;
    const load = async () => {
      try {
        const [bgResponse, reports, legacy] = await Promise.all([
          fetch("/finance-background-tasks", { signal: controller.signal }),
          loadReportTasks().catch((): ReportTaskStore => ({ sessions: {}, host_session_id: '' })),
          researchSessions?.legacyCompanyTasks().catch(() => []) || Promise.resolve([]),
        ]);
        if (!bgResponse.ok) throw new Error("任务读取失败");
        const body = await bgResponse.json() as { items?: NonNullable<typeof tasks> };
        if (controller.signal.aborted) return;
        const background = Array.isArray(body.items) ? body.items : [];
        const settlements = new Map(background.filter(item => item.source_session_id).map(item => [item.source_session_id!, item]));
        const reportItems: TaskRow[] = Object.entries(reports.sessions || {}).filter(([id, bind]) => id && id !== reports.host_session_id && (bind.kind || 'report') === 'report').map(([id, bind]) => ({
          id,
          kind: 'report' as const,
          title: `图文报告 · ${bind.slug}`,
          display_status: researchSessions?.taskRunning(id) ? 'running' : bind.run_status === 'completed' ? 'recorded' : bind.run_status || 'recorded',
          started_at: bind.bound_at,
          child_session_id: id,
          targets: [normalizeResearchTarget(bind.slug) || bind.slug],
          summary: bind.slug,
        }));
        const researchItems: TaskRow[] = Object.entries(reports.sessions || {}).filter(([, bind]) => bind.kind === 'research').map(([id, bind]) => {
          const settlement = settlements.get(id);
          const running = researchSessions?.taskRunning(id);
          const status = researchTaskStatus(bind, Boolean(running), settlement);
          const reason = settlement?.settlement_reason || settlement?.reason || bind.settlement_reason;
          const skipSummary = status === 'skipped' ? researchSkipSummary(reason) : '';
          const target = normalizeResearchTarget(bind.slug) || bind.slug;
          return { id, kind: 'research', title: bind.title || `公司研究 · ${bind.symbol || bind.slug.replace(/^companies\//, '')}`,
            display_status: status,
            started_at: bind.bound_at, finished_at: settlement?.finished_at || bind.finished_at,
            parent_session_id: reports.host_session_id, child_session_id: id,
            settlement_session_id: settlement?.child_session_id || settlement?.id,
            targets: [target], settlement_reason: reason, summary: skipSummary || settlement?.summary || '' };
        });
        const legacyItems: TaskRow[] = legacy.map(item => {
          const target = normalizeResearchTarget(`companies/${item.symbol}`) || `companies/${item.symbol}`;
          return { id: item.sessionId, kind: 'research', title: item.title,
            display_status: item.running ? 'researching' : 'recorded', started_at: item.updatedAt,
            child_session_id: item.sessionId, targets: [target] };
        });
        const items = [...reportItems, ...researchItems, ...legacyItems,
          ...background.filter(item => !item.source_session_id || !reports.sessions?.[item.source_session_id]).map(item => ({ ...item, kind: item.kind || 'knowledge' }))];
        items.sort((a, b) => String(b.started_at || '').localeCompare(String(a.started_at || '')));
        setTasksError("");
        setTasks(items);
      } catch (e) {
        if (!controller.signal.aborted && first) setTasksError(e instanceof Error ? e.message : String(e));
      } finally { first = false; }
    };
    setTasksError(""); setTasks(null);
    void load();
    const timer = window.setInterval(() => { void load(); }, 4000);
    return () => { controller.abort(); window.clearInterval(timer); };
  }, [tab]);
  const replaceParams = (mutate: (next: URLSearchParams) => void) => {
    const next = new URLSearchParams(params);
    mutate(next);
    setParams(next, { replace: true });
  };
  const cancelTopicRoute = () => {
    topicRouteAttempt.current += 1;
    topicRouteController.current?.abort();
    topicRouteController.current = null;
    if (topicRouteTimer.current !== null) window.clearTimeout(topicRouteTimer.current);
    topicRouteTimer.current = null;
    setTopicRouteBusy(false);
  };
  const setTab = (value: "topics" | "notes" | "tasks" | "memory") => {
    if (value !== "topics") cancelTopicRoute();
    replaceParams(next => {
      if (value === "notes" || value === "tasks" || value === "memory") next.set("tab", value); else next.delete("tab");
    });
    if (value === "notes") setNotesOffset(0);
  };
  const setStatus = (value: "active" | "archived") => {
    replaceParams(next => {
      if (value === "archived") next.set("status", "archived"); else next.delete("status");
    });
    setOffset(0);
  };
  const changePool = async (item: ResearchTopicSummary, action: "archive" | "restore") => {
    setPoolBusy(item.topic_id); setError("");
    try {
      await setTopicPool(item.topic_id, action);
      setTopicsTick(value => value + 1);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setPoolBusy("");
    }
  };
  const changeTopicQuestion = (value: string) => {
    cancelTopicRoute();
    setTopicQuestion(value);
    setTopicRouteResult(null);
    setTopicRouteError("");
    setTopicRouteStatus("");
  };
  const submitTopicRoute = async (options: { matchedTopicId?: string; confirmNew?: boolean } = {}) => {
    if (topicRouteBusy || topicRouteController.current) return;
    const controller = new AbortController();
    const attempt = topicRouteAttempt.current + 1;
    topicRouteAttempt.current = attempt;
    topicRouteController.current = controller;
    let navigating = false;
    setTopicRouteBusy(true);
    setTopicRouteError("");
    setTopicRouteStatus("");
    try {
      const request = topicRouteRequest(topicQuestion, options);
      const result = await startResearchTopic(request, controller.signal);
      if (!topicRouteMounted.current || attempt !== topicRouteAttempt.current) return;
      const success = topicRouteSuccess(result);
      if (success) {
        navigating = true;
        setTopicRouteResult(null);
        setTopicRouteStatus(success.message);
        topicRouteTimer.current = window.setTimeout(() => {
          if (topicRouteMounted.current && attempt === topicRouteAttempt.current) {
            navigate(`/my-research/topics/${topicHex(success.topicId)}`);
          }
        }, 600);
        return;
      }
      if (result.action === "choose" && result.candidates?.length) {
        setTopicRouteResult(result);
        return;
      }
      setTopicRouteResult(null);
      setTopicRouteError(result.action === "skip"
        ? "这个问题没有形成持续议题，请写清需要继续验证或跟踪的问题。"
        : "议题没有发起成功，请检查问题后重试。");
    } catch (e) {
      if (controller.signal.aborted || !topicRouteMounted.current || attempt !== topicRouteAttempt.current) return;
      setTopicRouteError(e instanceof Error ? e.message : String(e));
    } finally {
      if (!navigating && topicRouteMounted.current && attempt === topicRouteAttempt.current) {
        if (topicRouteController.current === controller) topicRouteController.current = null;
        setTopicRouteBusy(false);
      }
    }
  };
  const startTopic = (event: FormEvent) => {
    event.preventDefault();
    void submitTopicRoute();
  };
  useAiPage({
    key: `my-research:${tab}:${status}`,
    title: "我的研究",
    context: tab === "notes"
      ? (notesError ? "记录读取失败" : (notes?.length ? `独立沉淀记录 ${notesTotal || notes.length} 条` : "还没有独立沉淀记录"))
      : tab === "tasks"
        ? (tasksError ? "任务读取失败" : (tasks?.length ? `知识整理 ${tasks.length} 条` : "还没有任务"))
      : tab === "memory"
        ? "用户画像、近期记忆与 Topic 建议"
      : (topics?.length ? `${status === "archived" ? "已归档" : "研究中"}议题 ${topics.length} 个` : status === "archived" ? "还没有已归档议题" : "还没有研究中的议题"),
    suggestions: ["哪个议题最值得先继续", "这些记录和哪些议题有关"],
  });
  const current = RESEARCH_TABS.find(item => item.value === tab)!;
  return <div>
    <PageHeader title="我的研究" subtitle="继续未完成的议题，或回看已归档的问题和记录。" />
    <div className="mb-4">
      <WorkspaceTabs aria-label="研究类型" value={tab} onChange={setTab} options={RESEARCH_TABS} />
    </div>
    <GlassCard glow>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <current.icon className="h-5 w-5 text-primary" />
          <h3 className="font-semibold">{current.label}</h3>
        </div>
        {tab === "topics" && <WorkspaceFilter aria-label="议题状态" value={status} onChange={setStatus} options={[{ value: "active", label: "研究中" }, { value: "archived", label: "已归档" }]} />}
      </div>
      {tab !== "tasks" && tab !== "memory" && <WorkspaceSearch className="mb-4" placeholder={tab === "notes" ? "搜索记录标题或正文" : "搜索议题"} value={query} onChange={value => { setQuery(value); setOffset(0); setNotesOffset(0); }} />}
      {tab === "memory" ? <MemoryPanel /> : tab === "tasks" ? <BackgroundTaskList tasks={tasks} error={tasksError} onOpenProcess={(id, kind, title, parentId, target, settlementId, taskStatus) => researchSessions?.openTaskProcess({
        sessionId: id, kind, title, parentSessionId: parentId, settlementSessionId: settlementId, status: taskStatus,
        resultRef: target,
      })} onOpenSource={id => { void researchSessions?.openSession(id); }} /> : tab === "topics" ? <>
        <form onSubmit={startTopic} className="border-b border-border/30 pb-4">
          <label className="text-sm font-medium" htmlFor="topic-question">要持续研究的问题</label>
          <div className="mt-2 flex flex-col gap-2 sm:flex-row sm:items-start">
            <textarea
              id="topic-question"
              aria-describedby="topic-question-hint"
              className="workspace-field min-h-20 flex-1 resize-y"
              disabled={topicRouteBusy}
              maxLength={2000}
              placeholder="例如：未来两年容量电价如何影响火电公司的盈利稳定性？"
              value={topicQuestion}
              onChange={event => changeTopicQuestion(event.target.value)}
            />
            <button type="submit" className="workspace-field-action shrink-0" disabled={topicRouteBusy || !topicQuestion.trim()}>
              <Plus className="h-4 w-4" />{topicRouteBusy ? "发起中…" : "发起议题"}
            </button>
          </div>
          <p id="topic-question-hint" className="mt-2 text-xs text-muted-foreground">如果已有相近的议题，会直接接着研究。</p>
        </form>
        {topicRouteError && <p role="alert" className="mt-3 text-sm text-destructive">{topicRouteError}</p>}
        {topicRouteStatus && <p role="status" className="mt-3 text-sm text-primary">{topicRouteStatus}</p>}
        {topicRouteResult?.action === "choose" && <div className="mt-4 border-b border-border/30 pb-4">
          <p className="text-sm font-medium">{topicRouteResult.reason === ARCHIVED_TOPIC_TEXT_SEARCH
            ? "已归档的议题里有相近的问题，可以恢复继续，或修改问题后新建："
            : "找到可能相关的议题，请选择要继续的议题："}</p>
          <div className="mt-2 flex flex-col gap-2">
            {topicRouteResult.candidates?.map(candidate => <button
              type="button"
              key={candidate.topic_id}
              className="workspace-action justify-between text-left"
              disabled={topicRouteBusy}
              onClick={() => void submitTopicRoute({ matchedTopicId: candidate.topic_id })}
            >
              <span>{candidate.title}</span>
              <span className="text-xs text-muted-foreground">{candidate.pool_state === "archived" ? "恢复并继续" : "继续研究"}</span>
            </button>)}
          </div>
          {canConfirmNewTopic(topicRouteResult) && <button
            type="button"
            className="workspace-action mt-3"
            disabled={topicRouteBusy}
            onClick={() => void submitTopicRoute({ confirmNew: true })}
          >仍发起新议题</button>}
        </div>}
        {error && <p role="alert" className="mt-3 text-sm text-destructive">{error}</p>}
        {!topics && !error && <ResearchLoading compact title="正在读取议题" sections={["持续议题", "研究问题"]} />}
        {topics && topics.length === 0 && <p className="py-8 text-center text-sm text-muted-foreground">{status === "archived" ? "还没有已归档的议题。" : "还没有研究中的议题。写下一个需要持续验证或跟踪的问题，发起后会在这里出现。"}</p>}
        {topics && topics.length > 0 && topics.map(item => {
          const archived = (item.pool_state || status) === "archived";
          return <div key={item.topic_id} className="flex flex-wrap items-start justify-between gap-x-6 gap-y-3 border-b border-border/30 py-3 last:border-0">
            <Link to={`/my-research/topics/${topicHex(item.topic_id)}`} className="min-w-0 flex-1">
              <p className="text-xs text-muted-foreground">{archived ? "已归档" : "研究中"}{item.last_touched_at ? ` · ${new Date(item.last_touched_at).toLocaleString("zh-CN")}` : " · 待继续"}</p>
              <h2 className="mt-1 text-base font-semibold hover:text-primary">{item.title}</h2>
              <p className="mt-1 line-clamp-2 text-sm text-muted-foreground">{item.user_claim || item.judgment?.text || "继续研究，逐步形成判断"}</p>
            </Link>
            <button type="button" className="workspace-action workspace-action-compact shrink-0" disabled={poolBusy === item.topic_id} onClick={() => void changePool(item, archived ? "restore" : "archive")}>
              {archived ? <RotateCcw size={14} /> : <Archive size={14} />}
              {poolBusy === item.topic_id ? (archived ? "恢复中…" : "归档中…") : (archived ? "恢复研究" : "归档")}
            </button>
          </div>;
        })}
        {(offset > 0 || nextOffset !== null) && <div className="mt-3 flex gap-2"><button className="workspace-action" disabled={offset === 0} onClick={() => setOffset(Math.max(0, offset - 50))}>上一页</button><button className="workspace-action" disabled={nextOffset === null} onClick={() => nextOffset !== null && setOffset(nextOffset)}>下一页</button></div>}
      </> : <NotesPanel notes={notes} total={notesTotal} busy={notesBusy} error={notesError} offset={notesOffset} nextOffset={notesNext} onPage={setNotesOffset} onRetry={() => setNotesTick(value => value + 1)} />}
    </GlassCard>
    <Disclaimer />
  </div>;
}

function BackgroundTaskList({ tasks, error, onOpenProcess, onOpenSource }: {
  tasks: TaskRow[] | null;
  error: string;
  onOpenProcess?: (sessionId: string, kind: 'report' | 'research' | 'knowledge', title: string, parentSessionId?: string, target?: string, settlementId?: string, status?: string) => void;
  onOpenSource?: (sessionId: string) => void | Promise<void>;
}) {
  if (error) return <p role="alert" className="text-sm text-destructive">{error}</p>;
  if (!tasks) return <ResearchLoading compact title="正在读取任务" sections={["执行状态", "成果摘要"]} />;
  if (!tasks.length) return <div className="flex flex-col items-center gap-2 py-10 text-center text-sm text-muted-foreground"><ListTodo className="h-8 w-8 text-muted-foreground/40" />还没有任务。深度对话需要补读原文时，整理进度会显示在这里；不会自动建立议题。</div>;
  return <>{tasks.map(task => {
    const duration = task.started_at && task.finished_at ? Math.max(0, Math.round((Date.parse(task.finished_at) - Date.parse(task.started_at)) / 1000)) : null;
    const processId = task.child_session_id || task.id;
    const kind = task.kind === 'report' ? 'report' as const : task.kind === 'research' ? 'research' as const : 'knowledge' as const;
    const title = task.title || (kind === 'report' ? '图文报告' : kind === 'research' ? '公司研究' : '知识整理');
    const rawSummary = task.summary || task.question || '';
    // 失败 / 取消 / 中断的摘要可能是运行时英文原文，按类别转成中文。
    const summary = ['failed', 'cancelled', 'interrupted'].includes(task.display_status || '')
      ? userFacingRuntimeError(rawSummary, '这次任务没有完成') : rawSummary;
    const target = task.targets?.join('、') || '';
    const showSummary = Boolean(summary && summary !== title && summary !== target);
    const targetRef = task.targets?.[0] || '';
    const object = registeredObject(targetRef);
    const when = [
      TASK_STATUS[task.display_status || ''] || task.display_status || '未知',
      task.started_at ? new Date(task.started_at).toLocaleString('zh-CN') : '',
      duration != null ? `${duration} 秒` : '',
    ].filter(Boolean).join(' · ');
    return <div key={task.id} className="flex flex-wrap items-start justify-between gap-x-6 gap-y-3 border-b border-border/30 py-3 last:border-0">
      <div className="min-w-0 flex-1">
        <p className="text-xs text-muted-foreground">{when}</p>
        <h2 className="mt-1 text-base font-semibold">{title}</h2>
        {showSummary && <p className="mt-1 line-clamp-2 text-sm text-muted-foreground">{summary}</p>}
        {target && !title.includes(target) && <p className="mt-1 text-xs text-muted-foreground">{target}</p>}
      </div>
      <div className="flex shrink-0 flex-wrap gap-2">
        {processId && <button type="button" className="workspace-action workspace-action-compact" onClick={() => onOpenProcess?.(processId, kind, task.title || '', task.parent_session_id, task.targets?.[0], task.settlement_session_id, task.display_status)}>查看过程</button>}
        {kind === 'knowledge' && task.parent_session_id && <button type="button" className="workspace-action workspace-action-compact" onClick={() => void onOpenSource?.(task.parent_session_id!)}>查看来源对话</button>}
        {(object?.href || object?.drawer) && <button type="button" className="workspace-action workspace-action-compact" onClick={() => openRegisteredObject(targetRef)}>打开研究页</button>}
      </div>
    </div>;
  })}</>;
}

function NotesPanel({ notes, total, busy, error, offset, nextOffset, onPage, onRetry }: {
  notes: Note[] | null; total: number; busy: boolean; error: string; offset: number; nextOffset: number | null;
  onPage: (offset: number) => void; onRetry: () => void;
}) {
  const [openId, setOpenId] = useState<string | null>(null);
  const [full, setFull] = useState<Note | null>(null);
  const [fullError, setFullError] = useState("");
  useEffect(() => {
    if (!openId) { setFull(null); setFullError(""); return; }
    let active = true;
    setFullError("");
    void getNote(openId).then(note => { if (active) setFull(note); }).catch(e => { if (active) setFullError(e instanceof Error ? e.message : String(e)); });
    return () => { active = false; };
  }, [openId]);
  if (error) {
    return <>
      <p role="alert" className="text-sm text-destructive">记录没有加载成功：{error}</p>
      <button type="button" className="workspace-action mt-3" onClick={onRetry}>重新读取</button>
    </>;
  }
  if (busy && !notes) return <ResearchLoading compact title="正在读取记录" sections={["记录标题", "摘要"]} />;
  if (notes && notes.length === 0) {
    return <div className="flex flex-col items-center gap-2 py-10 text-center text-sm text-muted-foreground">
      <NotebookPen className="h-8 w-8 text-muted-foreground/40" />
      你在各页保存的记录会出现在这里。
    </div>;
  }
  return <div className="space-y-2">
    <p className="text-xs text-muted-foreground">记录 · {notes?.length ?? 0}{total ? ` / ${total}` : ''}</p>
    {notes?.map(note => {
      const open = openId === note.id;
      return <div key={note.id} className="border-b border-border/30 py-3 last:border-0">
        <button type="button" className="flex w-full items-center gap-2 text-left" onClick={() => setOpenId(open ? null : note.id)}>
          <BookOpen className="h-4 w-4 text-primary" />
          <span className="text-xs text-muted-foreground">{note.kind}</span>
          <strong className="min-w-0 flex-1 truncate text-sm">{note.title}</strong>
          <span className="text-xs text-muted-foreground">{note.ts ? new Date(note.ts).toLocaleString("zh-CN") : ""}</span>
        </button>
        {!open && <p className="mt-2 line-clamp-2 text-sm text-muted-foreground">{note.excerpt || note.content}</p>}
        {open && <div className="mt-3 border-t border-border/40 pt-3">
          {fullError && <p role="alert" className="text-sm text-destructive">{fullError}<button className="workspace-action ml-2" onClick={() => setOpenId(note.id)}>重新读取</button></p>}
          {full && full.id === note.id ? <KnowledgeText markdown={full.content} /> : !fullError && <p role="status" className="text-sm text-muted-foreground">正在读取全文…</p>}
        </div>}
      </div>;
    })}
    {(offset > 0 || nextOffset !== null) && <div className="mt-4 flex gap-2">
      <button className="workspace-action" disabled={offset === 0} onClick={() => onPage(Math.max(0, offset - 40))}>上一页</button>
      <button className="workspace-action" disabled={nextOffset === null} onClick={() => nextOffset !== null && onPage(nextOffset)}>下一页</button>
    </div>}
  </div>;
}

function MemoryPanel() {
  const [soul, setSoul] = useState<MemoryDoc | null>(null);
  const [recent, setRecent] = useState<MemoryDoc | null>(null);
  const [candidates, setCandidates] = useState<TopicCandidate[] | null>(null);
  const [choices, setChoices] = useState<Record<string, NonNullable<ResearchTopicRouteResult['candidates']>>>({});
  const [error, setError] = useState("");
  const [busy, setBusy] = useState("");
  const [editId, setEditId] = useState("");
  const [editText, setEditText] = useState("");
  const reload = () => {
    setError("");
    void Promise.all([loadMemory("soul"), loadMemory("recent"), loadCandidates()]).then(([nextSoul, nextRecent, listed]) => {
      setSoul(nextSoul); setRecent(nextRecent); setCandidates(listed.items);
    }).catch(err => setError(err instanceof Error ? err.message : "记忆读取失败"));
  };
  useEffect(() => {
    reload();
    const changed = () => { void loadCandidates().then(listed => setCandidates(listed.items)).catch(err => setError(err instanceof Error ? err.message : "候选读取失败")); };
    window.addEventListener(CANDIDATE_CHANGED, changed);
    return () => window.removeEventListener(CANDIDATE_CHANGED, changed);
  }, []);
  const save = async (kind: "soul" | "recent", id: string, version: number, text: string) => {
    setBusy(id);
    try {
      const next = await saveMemory(kind, version, [{ op: "upsert", id, stance: "corrected", text, user_authorized: true }]);
      if (kind === "soul") setSoul(next); else setRecent(next);
      setEditId("");
    } catch (err) { setError(err instanceof Error ? err.message : "纠正失败"); }
    finally { setBusy(""); }
  };
  const remove = async (kind: "soul" | "recent", id: string, version: number) => {
    setBusy(id);
    try {
      const next = await saveMemory(kind, version, [{ op: "delete", id }]);
      if (kind === "soul") setSoul(next); else setRecent(next);
    } catch (err) { setError(err instanceof Error ? err.message : "删除失败"); }
    finally { setBusy(""); }
  };
  const act = async (item: TopicCandidate, action: "adopt" | "ignore", topicId?: string) => {
    setBusy(item.id);
    setError("");
    try {
      const next = action === "adopt" ? await adoptCandidate(item, topicId) : await disposeCandidate(item.id, "ignored");
      setCandidates(list => (list || []).map(row => row.id === item.id ? next : row));
      setChoices(previous => ({ ...previous, [item.id]: [] }));
    } catch (err) {
      if (err instanceof CandidateChoiceNeeded) setChoices(previous => ({ ...previous, [item.id]: err.candidates }));
      else setError(err instanceof Error ? err.message : "候选处理失败");
    }
    finally { setBusy(""); }
  };
  const STANCE: Record<string, string> = { stated: "明确表达", inferred: "推断", corrected: "已纠正" };
  const section = (title: string, doc: MemoryDoc | null, kind: "soul" | "recent") => <section className="mb-4 border-b border-border/30 pb-4">
    <h2 className="text-base font-semibold">{title}</h2>
    {!doc && !error && <p className="mt-2 text-sm text-muted-foreground">正在读取…</p>}
    {doc && doc.entries.length === 0 && <p className="mt-2 text-sm text-muted-foreground">还没有条目。</p>}
    {doc?.entries.map(item => <div key={item.id} className="mt-3 border-t border-border/40 pt-3 text-sm">
      <p><span className="text-xs text-muted-foreground">{STANCE[item.stance] || item.stance}</span> {item.text}</p>
      {item.source_session && <p className="mt-1 text-xs text-muted-foreground">来源会话 {item.source_session}{item.source_turn != null ? ` · 第 ${item.source_turn} 轮` : ""}</p>}
      {editId === item.id && <textarea className="workspace-field mt-2 min-h-16 w-full" value={editText} onChange={event => setEditText(event.target.value)} />}
      <div className="mt-2 flex flex-wrap gap-2">
        {editId === item.id
          ? <button type="button" className="workspace-action workspace-action-compact" disabled={busy === item.id} onClick={() => void save(kind, item.id, doc.version, editText)}>保存纠正</button>
          : <button type="button" className="workspace-action workspace-action-compact" onClick={() => { setEditId(item.id); setEditText(item.text); }}>纠正</button>}
        <button type="button" className="workspace-action workspace-action-compact" disabled={busy === item.id} onClick={() => void remove(kind, item.id, doc.version)}>删除</button>
      </div>
    </div>)}
  </section>;
  return <>
    {error && <p role="alert" className="mb-3 text-sm text-destructive">{error}</p>}
    {section("用户画像", soul, "soul")}
    {section("近期研究记忆", recent, "recent")}
    <section>
      <h2 className="text-base font-semibold">议题建议</h2>
      {candidates && candidates.length === 0 && <p className="mt-2 text-sm text-muted-foreground">还没有待处理建议。</p>}
      {candidates?.map(item => <div key={item.id} className="mt-3 border-t border-border/40 pt-3 text-sm">
        <p className="font-medium">{item.question}</p>
        <p className="mt-1 text-muted-foreground">{item.reason}</p>
        <p className="mt-1 text-xs">{item.status === "open" ? "待处理" : item.status === "adopted" ? "已采用" : "已忽略"}</p>
        {item.status === "open" && choices[item.id]?.map(topic => <button key={topic.topic_id} type="button" className="workspace-action mt-2 mr-2" disabled={busy === item.id} onClick={() => void act(item, "adopt", topic.topic_id)}>继续：{topic.title}</button>)}
        {item.status === "open" && <div className="mt-2 flex gap-2">
          <button type="button" className="workspace-action" disabled={busy === item.id} onClick={() => void act(item, "adopt")}>采用</button>
          <button type="button" className="workspace-action" disabled={busy === item.id} onClick={() => void act(item, "ignore")}>忽略</button>
        </div>}
      </div>)}
    </section>
  </>;
}
