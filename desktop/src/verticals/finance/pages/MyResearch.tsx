import { useEffect, useRef, useState, type FormEvent } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { Archive, BookOpen, NotebookPen, Plus, RotateCcw } from "lucide-react";
import { PageHeader } from "../components/ui/PageHeader";
import { GlassCard } from "../components/ui/GlassCard";
import { Disclaimer } from "../components/ui/Disclaimer";
import { WorkspaceFilter } from "../components/ui/WorkspaceFilter";
import { WorkspaceSearch } from "../components/ui/WorkspaceSearch";
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
import { useAiPage } from "../../../core/ai/pageContext";

export function MyResearch() {
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const tab = params.get("tab") === "notes" ? "notes" : "topics";
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
  const setTab = (value: "topics" | "notes") => {
    if (value === "notes") cancelTopicRoute();
    replaceParams(next => {
      if (value === "notes") next.set("tab", "notes"); else next.delete("tab");
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
      : (topics?.length ? `${status === "archived" ? "已归档" : "研究中"}议题 ${topics.length} 个` : status === "archived" ? "还没有已归档议题" : "还没有研究中的议题"),
    suggestions: ["帮我找出现在最该继续的电力议题", "这些记录里哪些和行业议题有关"],
  });
  return <div>
    <PageHeader title="我的研究" subtitle="继续未完成的议题，或回看已归档的问题和记录。" />
    <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
      <WorkspaceFilter aria-label="研究类型" value={tab} onChange={setTab} options={[{ value: "topics", label: "议题" }, { value: "notes", label: "记录" }]} />
      {tab === "topics" && <WorkspaceFilter aria-label="议题状态" value={status} onChange={setStatus} options={[{ value: "active", label: "研究中" }, { value: "archived", label: "已归档" }]} />}
    </div>
    <WorkspaceSearch placeholder={tab === "notes" ? "搜索记录标题或正文" : "搜索议题"} value={query} onChange={value => { setQuery(value); setOffset(0); setNotesOffset(0); }} />
    {error && <p role="alert" className="mb-4 text-sm text-destructive">{error}</p>}
    {tab === "topics" ? <>
      <GlassCard className="mb-5">
        <form onSubmit={startTopic}>
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
          <p id="topic-question-hint" className="mt-2 text-xs text-muted-foreground">系统会先查找已有议题；匹配时继续原议题，否则建立新的持续研究问题。</p>
        </form>
        {topicRouteError && <p role="alert" className="mt-3 text-sm text-destructive">{topicRouteError}</p>}
        {topicRouteStatus && <p role="status" className="mt-3 text-sm text-primary">{topicRouteStatus}</p>}
        {topicRouteResult?.action === "choose" && <div className="mt-4 border-t border-border/50 pt-4">
          <p className="text-sm font-medium">{topicRouteResult.reason === ARCHIVED_TOPIC_TEXT_SEARCH
            ? "归档议题中找到文本匹配项，请选择要恢复的议题，或修改问题后再发起："
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
      </GlassCard>
      {!topics && !error && <ResearchLoading title="正在读取议题" sections={["持续议题", "研究问题"]} />}
      {topics && topics.length === 0 && <GlassCard><p className="text-sm text-muted-foreground">{status === "archived" ? "还没有已归档的议题。" : "还没有研究中的议题。写下一个需要持续验证或跟踪的问题，发起后会在这里出现。"}</p></GlassCard>}
      {topics && topics.length > 0 && <div className="space-y-2">{topics.map(item => {
        const archived = (item.pool_state || status) === "archived";
        return <GlassCard key={item.topic_id} className="!p-4">
          <div className="flex items-start justify-between gap-3">
            <p className="text-xs text-muted-foreground">{archived ? "已归档" : "研究中"}</p>
            <button type="button" className="workspace-action workspace-action-compact" disabled={poolBusy === item.topic_id} onClick={() => void changePool(item, archived ? "restore" : "archive")}>
              {archived ? <RotateCcw size={14} /> : <Archive size={14} />}
              {poolBusy === item.topic_id ? (archived ? "恢复中…" : "归档中…") : (archived ? "恢复研究" : "归档")}
            </button>
          </div>
          <Link to={`/my-research/topics/${topicHex(item.topic_id)}`} className="mt-2 block">
            <h2 className="text-base font-semibold hover:text-primary">{item.title}</h2>
            <p className="mt-2 line-clamp-2 text-sm text-muted-foreground">{item.user_claim || item.judgment?.text || "继续研究，逐步形成判断"}</p>
            <p className="mt-4 text-xs text-muted-foreground">{item.last_touched_at ? new Date(item.last_touched_at).toLocaleString("zh-CN") : "待继续"}</p>
          </Link>
        </GlassCard>;
      })}</div>}
      {(offset > 0 || nextOffset !== null) && <div className="mt-4 flex gap-2"><button className="workspace-action" disabled={offset === 0} onClick={() => setOffset(Math.max(0, offset - 50))}>上一页</button><button className="workspace-action" disabled={nextOffset === null} onClick={() => nextOffset !== null && setOffset(nextOffset)}>下一页</button></div>}
    </> : <NotesPanel notes={notes} total={notesTotal} busy={notesBusy} error={notesError} offset={notesOffset} nextOffset={notesNext} onPage={setNotesOffset} onRetry={() => setNotesTick(value => value + 1)} />}
    <Disclaimer />
  </div>;
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
    return <GlassCard>
      <p role="alert" className="text-sm text-destructive">记录没有加载成功：{error}</p>
      <button type="button" className="workspace-action mt-3" onClick={onRetry}>重新读取</button>
    </GlassCard>;
  }
  if (busy && !notes) return <ResearchLoading title="正在读取记录" sections={["记录标题", "摘要"]} />;
  if (notes && notes.length === 0) {
    return <GlassCard>
      <div className="flex flex-col items-center gap-2 py-10 text-center text-sm text-muted-foreground">
        <NotebookPen className="h-8 w-8 text-muted-foreground/40" />
        独立记录会留在这里。保存大盘问答不会自动变成议题。
      </div>
    </GlassCard>;
  }
  return <div className="space-y-2">
    <p className="text-xs text-muted-foreground">记录 · {notes?.length ?? 0}{total ? ` / ${total}` : ''}</p>
    {notes?.map(note => {
      const open = openId === note.id;
      return <GlassCard key={note.id} className="!p-4">
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
      </GlassCard>;
    })}
    {(offset > 0 || nextOffset !== null) && <div className="mt-4 flex gap-2">
      <button className="workspace-action" disabled={offset === 0} onClick={() => onPage(Math.max(0, offset - 40))}>上一页</button>
      <button className="workspace-action" disabled={nextOffset === null} onClick={() => nextOffset !== null && onPage(nextOffset)}>下一页</button>
    </div>}
  </div>;
}
