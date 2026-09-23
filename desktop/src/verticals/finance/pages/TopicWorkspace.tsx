import { useEffect, useLayoutEffect, useState } from "react";
import { Link, useParams, useSearchParams } from "react-router-dom";
import { Archive, Check, ChevronLeft, FileText, Plus, RefreshCw, RotateCcw } from "lucide-react";
import { ResearchLoading } from "../components/ui/ResearchLoading";
import { GlassCard } from "../components/ui/GlassCard";
import { ResearchResult } from '../components/ResearchResult';
import { Disclaimer } from "../components/ui/Disclaimer";
import { KnowledgeText, ReferenceButtons, WikiReader, WikiViewTabs } from "../components/ResearchKnowledge";
import { ObjectReport } from "../components/ObjectReport";
import { WorkspaceMoreMenu } from "../components/ui/WorkspaceMoreMenu";
import { getNote, type Note } from "../lib/notes";
import {
  publishWikiDraft, researchRead, setTopicPool, topicIdFromHex, topicPath, type ResearchLink,
  type ResearchProposal, type ResearchTopic, type WikiDraft,
} from "../lib/research";
import { useResearchSessions } from "../dsh/research-session";
import { useTopicSessionGate } from "../dsh/topic-session-gate";
import { useAiPage } from "../../../core/ai/pageContext";

function DraftPreview({ draft }: { draft: WikiDraft }) {
  return <div className="space-y-4">
    <p className="text-xs text-muted-foreground">草案 · 请先阅读正文，再确认发布</p>
    {draft.previews?.map(preview => <GlassCard key={preview.slug}>
      <KnowledgeText markdown={preview.markdown} />
    </GlassCard>)}
  </div>;
}

export function TopicWorkspace() {
  const { topicHex = "" } = useParams();
  return <TopicContent key={topicHex} topicHex={topicHex} />;
}

function TopicContent({ topicHex }: { topicHex: string }) {
  const topicId = topicIdFromHex(topicHex);
  const research = useResearchSessions();
  const gate = useTopicSessionGate();
  const [topic, setTopic] = useState<ResearchTopic | null>(null);
  const [report, setReport] = useState(false);
  const [links, setLinks] = useState<ResearchLink[]>([]);
  const [pages, setPages] = useState<ResearchLink[]>([]);
  const [proposals, setProposals] = useState<ResearchProposal[]>([]);
  const [drafts, setDrafts] = useState<{ draft_token: string; titles?: string[]; slugs?: string[]; published?: boolean }[]>([]);
  const [search, setSearch] = useSearchParams();
  const selected = search.get("material") || "";
  const setSelected = (material: string) => setSearch(previous => {
    const next = new URLSearchParams(previous);
    next.delete("reader");
    if (material) next.set("material", material); else next.delete("material");
    return next;
  }, { replace: true });
  const [reviewedToken, setReviewedToken] = useState("");
  const [draftPreview, setDraftPreview] = useState<WikiDraft | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState("");
  const [noteMap, setNoteMap] = useState<Record<string, Note>>({});
  useEffect(() => {
    const ids = [...new Set([
      ...proposals.map(item => item.note_id?.replace(/^note:/, "")),
      ...links.map(item => item.note_id?.replace(/^note:/, "")),
      selected.startsWith("note:") ? selected.slice(5) : "",
    ].filter((id): id is string => Boolean(id)))];
    if (!ids.length) return;
    let active = true;
    void Promise.all(ids.map(async id => {
      try { return [id, await getNote(id)] as const; }
      catch { return [id, null] as const; }
    })).then(entries => {
      if (!active) return;
      setNoteMap(previous => {
        const next = { ...previous };
        for (const [id, note] of entries) if (note) next[id] = note;
        return next;
      });
    });
    return () => { active = false; };
  }, [proposals, links, selected]);
  const load = (signal?: AbortSignal) => {
    setError("");
    return Promise.all([
      researchRead<ResearchTopic>(topicPath(topicId), { signal }).then(setTopic),
      researchRead<{ items: ResearchLink[] }>(`/wiki/research-links?target_id=${encodeURIComponent(topicId)}`, { signal }).then(value => setLinks(value.items)),
      researchRead<{ items: ResearchLink[] }>(`/wiki/research-links?source_id=${encodeURIComponent(topicId)}`, { signal }).then(value => setPages(value.items)),
      researchRead<{ items: ResearchProposal[] }>(`/wiki/research-links/proposals?target_id=${encodeURIComponent(topicId)}`, { signal }).then(value => setProposals(value.items)),
      researchRead<{ items: typeof drafts }>(`/wiki/page-drafts/pending?topic_id=${encodeURIComponent(topicId)}`, { signal }).then(value => setDrafts(value.items)),
    ]);
  };
  useEffect(() => {
    const controller = new AbortController();
    void load(controller.signal).catch(e => { if (!controller.signal.aborted) setError(String(e)); });
    return () => controller.abort();
  }, [topicId]);
  useLayoutEffect(() => {
    let cancelled = false;
    const controller = new AbortController();
    const sync = () => {
      if (research.topicSessionMatches(topicId)) {
        gate.setGate({ blocking: false, message: "" });
        return;
      }
      gate.setGate({ blocking: true, message: "正在打开这个议题的对话…" });
      void research.restoreTopic(topicId, undefined, controller.signal).then(match => {
        if (cancelled) return;
        if (match.matched) gate.setGate({ blocking: false, message: "" });
        else gate.setGate({ blocking: true, message: "这个议题的对话没能打开，请刷新后重试。" });
      }).catch(e => {
        if (!cancelled) gate.setGate({ blocking: true, message: e instanceof Error ? e.message : String(e) });
      });
    };
    sync();
    const unsubscribe = research.subscribeSession(sync);
    return () => {
      cancelled = true;
      controller.abort();
      unsubscribe();
    };
  }, [topicId]);
  // 只写用户能读懂的一句话和议题标签；工作步骤由 Stock 的 my_research 角色提示负责。
  const prompt = (fresh = false) =>
    `${fresh ? "在新对话里继续研究这个议题" : "继续研究这个议题"}：引用议题：${topic?.title || topicId} \`${topicId}\``;
  const start = async (fresh = false) => {
    setBusy(fresh ? "new" : "continue"); setError("");
    try {
      if (topic?.pool_state === "archived") {
        const restored = await setTopicPool(topicId, "restore");
        setTopic(current => current ? { ...current, ...restored, pool_state: "active" } : current);
      }
      await research.startTopic({ topicId, title: topic?.title || topicId, prompt: prompt(fresh), fresh });
    } catch (e) { setError(e instanceof Error ? e.message : String(e)); }
    finally { setBusy(""); }
  };
  const changePool = async (action: "archive" | "restore") => {
    setBusy(action); setError("");
    try {
      const next = await setTopicPool(topicId, action);
      setTopic(current => current ? { ...current, ...next, pool_state: action === "archive" ? "archived" : "active" } : current);
    } catch (e) { setError(e instanceof Error ? e.message : String(e)); }
    finally { setBusy(""); }
  };
  const refresh = async () => {
    setBusy("refresh");
    try { await load(); }
    catch (e) { setError(e instanceof Error ? e.message : String(e)); }
    finally { setBusy(""); }
  };
  const decide = async (proposal: ResearchProposal, action: "confirm" | "reject") => {
    setBusy(proposal.proposal_id); setError("");
    try {
      await researchRead(`/wiki/research-links/${action}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ proposal_id: proposal.proposal_id, source_id: proposal.source_id || proposal.note_id, target_id: proposal.target_id }),
      });
      await load();
    } catch (e) { setError(e instanceof Error ? e.message : String(e)); }
    finally { setBusy(""); }
  };
  const reviewDraft = async (token: string) => {
    setBusy(`review:${token}`); setError("");
    try {
      const draft = await researchRead<WikiDraft>(`/wiki/page-drafts/${encodeURIComponent(token)}`);
      if (!draft.specs?.length || draft.previews?.length !== draft.specs.length) throw new Error("草案正文暂不可读，请重试");
      setDraftPreview(draft);
      setReviewedToken(token);
      setSelected(`draft:${token}`);
    } catch (e) { setError(e instanceof Error ? e.message : String(e)); }
    finally { setBusy(""); }
  };
  const publish = async (token: string) => {
    if (reviewedToken !== token || draftPreview?.draft_token !== token) {
      setError("请先审阅这条草案的正文，再确认发布");
      return;
    }
    setBusy(token); setError("");
    try {
      const result = await publishWikiDraft(token);
      if (!result.published) throw new Error("发布未完成");
      if (result.association_error) throw new Error(result.association_error);
      setDraftPreview(null);
      setReviewedToken("");
      setSelected(draftPreview.specs?.[0]?.slug || "");
      await load();
    } catch (e) { setError(e instanceof Error ? e.message : String(e)); }
    finally { setBusy(""); }
  };
  useAiPage({
    key: `topic:${topicId}`,
    title: topic?.title || "议题工作区",
    context: topic?.markdown || `议题 ${topicId}`,
    suggestions: ["哪些记录与这个议题有关", "能整理成哪些主题研究或对比研究"],
  });
  const wikiPages = pages.filter(item => /^(themes|comparisons|industries|companies)\//.test(item.target_id));
  const selectedNote = selected.startsWith("note:") ? noteMap[selected.slice(5)] : undefined;
  const pendingDrafts = drafts.filter(item => !item.published);
  const reportBody = topic && <ObjectReport title={topic.title} asOf={topic.last_touched_at}>
      {topic.user_claim?.text && <section><h2>研究问题</h2><KnowledgeText markdown={topic.user_claim.text} /></section>}
      <section><h2>当前判断</h2><KnowledgeText markdown={topic.judgment?.text || '尚未形成判断，继续结合材料核实。'} /></section>
      {!!topic.next_questions?.length && <section><h2>继续核实</h2><ul>{topic.next_questions.map(question => <li key={question}>{question}</li>)}</ul></section>}
      {!!topic.observation?.gaps?.length && <section><h2>资料缺口</h2><ul>{topic.observation.gaps.map(gap => <li key={gap}>{gap}</li>)}</ul></section>}
      {[...new Set(links.map(item => item.source_id).filter((id): id is string => !!id?.startsWith('result:')))].map(id => <ResearchResult key={id} resultId={id} presentation="report" />)}
      <ReferenceButtons refs={[...(topic.observation?.source_refs ?? []), ...(topic.observation?.fact_refs ?? [])]} />
    </ObjectReport>;
  return <div className="topic-panel">
    <header className="topic-head">
      <Link className="topic-back" to="/my-research"><ChevronLeft size={14} />全部议题</Link>
      <h1 className="topic-panel-title">{topic?.title || "议题工作区"}</h1>
      {topic?.pool_state === "archived" && <p className="text-xs text-muted-foreground">已归档。恢复后可以继续研究。</p>}
    </header>
    <div className="object-toolbar">
      <div className="object-toolbar-group">{topic && <WikiViewTabs report={report} onChange={setReport} />}</div>
      <div className="object-toolbar-group object-toolbar-actions">
      <button type="button" className="workspace-action workspace-action-primary" disabled={!!busy || gate.blocking} onClick={() => void start(false)}>{busy === "continue" ? "正在接上…" : "继续研究"}</button>
      <WorkspaceMoreMenu actions={[
        { id: 'new', label: busy === 'new' ? '正在新开会话…' : '新会话', icon: <Plus size={14} />, disabled: !!busy || gate.blocking, onSelect: () => void start(true) },
        { id: 'refresh', label: busy === 'refresh' ? '正在刷新材料…' : '刷新材料', icon: <RefreshCw size={14} />, disabled: !!busy, onSelect: () => void refresh() },
        ...(topic ? [{ id: 'pool', label: busy === 'archive' || busy === 'restore' ? '处理中…' : topic.pool_state === 'archived' ? '恢复研究' : '归档议题', icon: topic.pool_state === 'archived' ? <RotateCcw size={14} /> : <Archive size={14} />, disabled: !!busy, onSelect: () => void changePool(topic.pool_state === 'archived' ? 'restore' : 'archive') }] : []),
      ]} />
      </div>
    </div>
    {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
    {!topic && !error && <ResearchLoading title="正在读取议题" sections={["当前判断", "关联材料"]} />}
    {topic && report && reportBody}
    {topic && !report && busy === 'refresh' && <ResearchLoading title="正在刷新材料" sections={["读取已关联材料", "核对研究页", "整理待确认关联"]} />}
    {topic && <div className="space-y-3" hidden={report || busy === 'refresh'}>
      <section className="topic-section">
        <h2>当前判断</h2>
        {topic.judgment?.text ? <KnowledgeText markdown={topic.judgment.text} /> : <p className="text-sm text-muted-foreground">从研究对话开始，逐步形成判断。</p>}
        {!!topic.next_questions?.length && <ul className="mt-4 list-disc space-y-1.5 pl-5 text-sm leading-6 text-muted-foreground">{topic.next_questions.map(question => <li key={question}>{question}</li>)}</ul>}
        <details className="mt-4"><summary className="cursor-pointer text-xs text-muted-foreground">查看研究依据</summary><ReferenceButtons refs={[...(topic.observation?.source_refs ?? []), ...(topic.observation?.fact_refs ?? [])]} /></details>
      </section>
      <section className="topic-section">
        <h2>待确认关联</h2>
        {proposals.length === 0 && <p className="text-sm text-muted-foreground">还没有提议。开始研究后，助手会建议关联相关的记录或研究成果。</p>}
        {proposals.map(item => {
          const note = noteMap[item.note_id?.replace(/^note:/, "") ?? ''];
          return <div key={item.proposal_id} className="topic-material">
            <p className="text-sm font-medium">{note?.title || (item.source_id?.startsWith('result:') ? '研究成果' : '研究记录')}</p>
            {item.source_id?.startsWith('result:') && <ResearchResult resultId={item.source_id} presentation="report" />}
            <p className="mt-1 text-xs text-muted-foreground">{item.reason}</p>
            <div className="mt-2 flex gap-2">
              <button type="button" className="workspace-action workspace-action-compact" disabled={!!busy} onClick={() => void decide(item, "confirm")}><Check className="h-3.5 w-3.5" />确认关联</button>
              <button type="button" className="workspace-action workspace-action-compact" disabled={!!busy} onClick={() => void decide(item, "reject")}>不关联</button>
            </div>
          </div>;
        })}
      </section>
      <section className="topic-section">
        <h2>已关联材料</h2>
        {links.length === 0 && wikiPages.length === 0 && <p className="text-sm text-muted-foreground">确认后会出现在这里，刷新和新会话都能读到。</p>}
        {links.map(item => {
          const noteKey = item.note_id?.replace(/^note:/, "") ?? '';
          const id = item.source_id || item.note_id || item.target_id;
          return <button key={item.link_id} type="button" className="topic-material" aria-current={selected === id || undefined} onClick={() => setSelected(id)}>
            <span className="block truncate text-sm">{noteMap[noteKey]?.title || (item.kind === 'result' ? '研究成果' : '研究材料')}</span>
            <span className="text-xs text-muted-foreground">{item.reason || "已确认关联"}</span>
          </button>;
        })}
        {wikiPages.map(item => <button key={`wiki-${item.link_id}`} type="button" className="topic-material" aria-current={selected === item.target_id || undefined} onClick={() => setSelected(item.target_id)}>
          <span className="block truncate text-sm">{item.title || item.target_id}</span>
          <span className="text-xs text-muted-foreground">已发布研究材料</span>
        </button>)}
      </section>
      <section className="topic-section">
        <h2>待发布草案</h2>
        {pendingDrafts.length === 0 && <p className="text-sm text-muted-foreground">助手整理好的主题研究或对比研究会出现在这里，你确认后才会发布。</p>}
        {pendingDrafts.map(item => <div key={item.draft_token} className="topic-material">
          <p className="text-sm">{item.titles?.join("、") || "未命名草案"}</p>
          <div className="mt-2 flex gap-2">
            <button type="button" className="workspace-action workspace-action-compact" disabled={!!busy} onClick={() => void reviewDraft(item.draft_token)}>
              <FileText className="h-3.5 w-3.5" />{reviewedToken === item.draft_token ? "已审阅" : "审阅草案"}
            </button>
            <button type="button" className="workspace-field-action" disabled={!!busy || reviewedToken !== item.draft_token} onClick={() => void publish(item.draft_token)}>
              {busy === item.draft_token ? "发布中…" : "确认发布"}
            </button>
          </div>
        </div>)}
      </section>
      {selected.startsWith("draft:") && draftPreview && <DraftPreview draft={draftPreview} />}
      {selected.startsWith('result:') && <ResearchResult key={selected} resultId={selected} presentation="report" />}
      {selected && /^(themes|comparisons|industries|companies)\//.test(selected) && <WikiReader slug={selected} />}
      {selected.startsWith("note:") && <section className="topic-section">
        <h2>{selectedNote?.title || "记录"}</h2>
        {selectedNote ? <KnowledgeText markdown={selectedNote.content} /> : <p className="whitespace-pre-wrap text-sm leading-7">这条记录已被删除或移动，可以到「记录」里查找。</p>}
      </section>}
    </div>}
    <Disclaimer compact />
  </div>;
}
