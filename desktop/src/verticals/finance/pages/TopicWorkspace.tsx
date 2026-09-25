import { useEffect, useRef, useState } from "react";
import { Link, useParams, useSearchParams } from "react-router-dom";
import { Archive, Check, ChevronLeft, FileText, Plus, RefreshCw, RotateCcw, X } from "lucide-react";
import { ResearchLoading } from "../components/ui/ResearchLoading";
import { GlassCard } from "../components/ui/GlassCard";
import { ResearchResult } from '../components/ResearchResult';
import { Disclaimer } from "../components/ui/Disclaimer";
import { KnowledgeText, ReferenceButtons, WikiReader } from "../components/ResearchKnowledge";
import { WikiReportPane } from "../components/WikiReportPane";
import { TopicWall } from '../components/topic-wall/TopicWall';
import { BasisChanges } from '../components/topic-wall/BasisChanges';
import { objectLabel, resolveObjectLabels } from '../lib/objectRegistry';
import { BookOpen, Building2, Factory, Layers3 } from 'lucide-react';
import { WorkspaceMoreMenu } from "../components/ui/WorkspaceMoreMenu";
import { getNote, type Note } from "../lib/notes";
import {
  publishWikiDraft, researchRead, setTopicPool, topicBasisChanges, topicIdFromHex, topicPath, topicWall, type ResearchLink,
  type ResearchProposal, type ResearchTopic, type TopicBasisChanges, type TopicWall as TopicWallData, type WikiDraft,
} from "../lib/research";
import { useResearchSessions } from "../dsh/research-session";
import { topicOpeningQuestions } from "../dsh/side-panel";
import { useAiPage } from "../../../core/ai/pageContext";
import "./my-research.css";

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
  const [topic, setTopic] = useState<ResearchTopic | null>(null);
  const [reportHash, setReportHash] = useState('');
  const [wall, setWall] = useState<TopicWallData | null>(null);
  const [basis, setBasis] = useState<TopicBasisChanges | null>(null);
  const [wallError, setWallError] = useState('');
  const [links, setLinks] = useState<ResearchLink[]>([]);
  const [pages, setPages] = useState<ResearchLink[]>([]);
  const [proposals, setProposals] = useState<ResearchProposal[]>([]);
  const [drafts, setDrafts] = useState<{ draft_token: string; titles?: string[]; slugs?: string[]; published?: boolean }[]>([]);
  const [search, setSearch] = useSearchParams();
  const view = search.get('view') === 'wall' ? 'wall' : search.get('view') === 'report' ? 'report' : 'research';
  const setView = (nextView: 'research' | 'wall' | 'report') => setSearch(previous => {
    const next = new URLSearchParams(previous);
    if (nextView === 'research') next.delete('view'); else next.set('view', nextView);
    return next;
  }, { replace: true });
  const selected = search.get("material") || "";
  const setSelected = (material: string) => setSearch(previous => {
    const next = new URLSearchParams(previous);
    next.delete("reader");
    if (material) next.set("material", material); else next.delete("material");
    return next;
  }, { replace: true });
  const readerRef = useRef<HTMLElement>(null);
  // The reader sits below the material lists; bring it into view whenever a material is opened.
  useEffect(() => {
    if (selected) requestAnimationFrame(() => readerRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }));
  }, [selected]);
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
      researchRead<{ items: ResearchProposal[] }>(`/wiki/research-links/proposals?topic_id=${encodeURIComponent(topicId)}`, { signal }).then(value => setProposals(value.items)),
      researchRead<{ items: typeof drafts }>(`/wiki/page-drafts/pending?topic_id=${encodeURIComponent(topicId)}`, { signal }).then(value => setDrafts(value.items)),
    ]);
  };
  const loadWall = async (signal?: AbortSignal) => {
    setWallError('');
    const [nextWall, nextBasis] = await Promise.allSettled([topicWall(topicId, signal), topicBasisChanges(topicId, signal)]);
    if (signal?.aborted) return;
    if (nextWall.status === 'fulfilled') setWall(nextWall.value);
    else { setWall(null); setWallError(String(nextWall.reason)); }
    setBasis(nextBasis.status === 'fulfilled' ? nextBasis.value : null);
  };
  useEffect(() => {
    const controller = new AbortController();
    void load(controller.signal).catch(e => { if (!controller.signal.aborted) setError(String(e)); });
    void loadWall(controller.signal);
    return () => controller.abort();
  }, [topicId]);
  useEffect(() => {
    if (view !== 'report') return;
    const controller = new AbortController();
    setReportHash('');
    void researchRead<{ topic: ResearchTopic; input_hash: string }>(`${topicPath(topicId)}/snapshot`, { signal: controller.signal })
      .then(snapshot => { if (!controller.signal.aborted) { setTopic(snapshot.topic); setReportHash(snapshot.input_hash); } })
      .catch(e => { if (!controller.signal.aborted) setError(String(e)); });
    return () => controller.abort();
  }, [topicId, view]);
  // 只写用户能读懂的一句话和议题标签；工作步骤由 Stock 的 my_research 角色提示负责。
  const prompt = () => `继续研究这个议题：引用议题：${topic?.title || topicId} \`${topicId}\``;
  const start = async (fresh = false) => {
    setBusy(fresh ? "new" : "continue"); setError("");
    try {
      if (topic?.pool_state === "archived") {
        const restored = await setTopicPool(topicId, "restore");
        setTopic(current => current ? { ...current, ...restored, pool_state: "active" } : current);
      }
      await research.startTopic({ topicId, title: topic?.title || topicId, ...(fresh ? {} : { prompt: prompt() }), fresh,
        onSessionReady: sessionId => research.openTopicPanel({ kind: 'topic', sessionId, topicId, title: topic?.title || topicId,
          judgment: topic?.judgment?.text || '尚未形成判断', questions: topicOpeningQuestions(topic?.next_questions), fresh }) });
    } catch (e) { setError(e instanceof Error ? e.message : String(e)); }
    finally { setBusy(""); }
  };
  const continueWith = async (text: string) => {
    setBusy('continue'); setError('');
    try {
      if (topic?.pool_state === 'archived') {
        const restored = await setTopicPool(topicId, 'restore');
        setTopic(current => current ? { ...current, ...restored, pool_state: 'active' } : current);
      }
      await research.startTopic({ topicId, title: topic?.title || topicId, prompt: `${text}\n引用议题：${topic?.title || topicId} \`${topicId}\``,
        onSessionReady: sessionId => research.openTopicPanel({ kind: 'topic', sessionId, topicId, title: topic?.title || topicId,
          judgment: topic?.judgment?.text || '尚未形成判断', questions: topicOpeningQuestions(topic?.next_questions), fresh: false }) });
    } catch (cause) { setError(String(cause)); } finally { setBusy(''); }
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
    try { await Promise.all([load(), loadWall()]); }
    catch (e) { setError(e instanceof Error ? e.message : String(e)); }
    finally { setBusy(""); }
  };
  const decide = async (proposal: ResearchProposal, action: "confirm" | "reject"): Promise<boolean> => {
    setBusy(proposal.proposal_id); setError("");
    try {
      await researchRead(`/wiki/research-links/${action}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ proposal_id: proposal.proposal_id, source_id: proposal.source_id || proposal.note_id, target_id: proposal.target_id }),
      });
      await Promise.all([load(), loadWall()]);
      return true;
    } catch (e) { setError(e instanceof Error ? e.message : String(e)); return false; }
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
  const selectedLink = links.find(item => (item.source_id || item.note_id || item.target_id) === selected);
  const selectedTitle = selectedNote?.title
    || (selectedLink && (noteMap[selectedLink.note_id?.replace(/^note:/, "") ?? ""]?.title || (selectedLink.kind === "result" ? "研究成果" : "研究材料")))
    || pages.find(item => item.target_id === selected)?.title
    || (selected.startsWith("draft:") ? "待发布草案" : "研究材料");
  const pendingDrafts = drafts.filter(item => !item.published);
  const wallCount = wall?.edges.length || 0;
  const changedSlugs = new Set((basis?.pages || []).filter(page => page.status === 'changed' && page.slug).map(page => page.slug!));
  const reportPage = topic && reportHash ? { input_hash: reportHash, markdown: topic.markdown || '', published: true,
    spec: { slug: topicId, title: topic.title, type: 'topic', as_of: topic.last_touched_at || '', blocks: [] } } : null;
  return <div className="topic-panel">
    <header className="topic-head">
      <Link className="topic-back" to="/my-research"><ChevronLeft size={14} />全部议题</Link>
      <h1 className="topic-panel-title">{topic?.title || "议题工作区"}</h1>
      {topic?.pool_state === "archived" && <p className="text-xs text-muted-foreground">已归档。恢复后可以继续研究。</p>}
    </header>
    <div className="object-toolbar">
      <div className="object-toolbar-group">{topic && <div role="tablist" aria-label="议题视图" className="flex h-10 items-stretch gap-0.5 rounded-xl border border-border p-[3px]">{([['research', '研究页'], ['wall', '证据墙'], ['report', '图文报告']] as const).map(([id, label]) => <button key={id} type="button" role="tab" aria-selected={view === id} className={`rounded-[9px] px-3.5 text-[13px] ${view === id ? 'bg-muted font-medium' : 'text-muted-foreground hover:text-foreground'}`} onClick={() => setView(id)}>{label}</button>)}</div>}</div>
      <div className="object-toolbar-group object-toolbar-actions">
      <button type="button" className="workspace-action workspace-action-primary" disabled={!!busy} onClick={() => void start(false)}>{busy === "continue" ? "正在接上…" : "继续研究"}</button>
      <WorkspaceMoreMenu actions={[
        { id: 'new', label: busy === 'new' ? '正在新开会话…' : '新会话', icon: <Plus size={14} />, disabled: !!busy, onSelect: () => void start(true) },
        { id: 'refresh', label: busy === 'refresh' ? '正在刷新材料…' : '刷新材料', icon: <RefreshCw size={14} />, disabled: !!busy, onSelect: () => void refresh() },
        ...(topic ? [{ id: 'pool', label: busy === 'archive' || busy === 'restore' ? '处理中…' : topic.pool_state === 'archived' ? '恢复研究' : '归档议题', icon: topic.pool_state === 'archived' ? <RotateCcw size={14} /> : <Archive size={14} />, disabled: !!busy, onSelect: () => void changePool(topic.pool_state === 'archived' ? 'restore' : 'archive') }] : []),
      ]} />
      </div>
    </div>
    {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
    {!topic && !error && <ResearchLoading title="正在读取议题" sections={["当前判断", "关联材料"]} />}
    {view === 'report' && reportPage && <WikiReportPane page={reportPage} active />}
    {topic && view === 'wall' && (wall ? <TopicWall topic={topic} wall={wall} basis={basis} proposals={proposals} refresh={async () => { await Promise.all([load(), loadWall()]); }} continueResearch={continueWith} openChanges={slug => setSearch(previous => { const next = new URLSearchParams(previous); next.delete('view'); next.set('basis', slug); return next; })} decide={decide} /> : wallError ? <p role="alert" className="text-sm text-destructive">证据墙暂时无法读取：{wallError}</p> : <ResearchLoading title="正在读取证据墙" sections={['对象', '关系']} />)}
    {topic && view === 'research' && busy === 'refresh' && <ResearchLoading title="正在刷新材料" sections={["读取已关联材料", "核对研究页", "整理待确认关联"]} />}
    {topic && <div className="topic-research-grid" hidden={view !== 'research' || busy === 'refresh'}>
      <section className="topic-section">
        <h2>当前判断</h2>
        {topic.judgment?.text ? <KnowledgeText markdown={topic.judgment.text} /> : <p className="text-sm text-muted-foreground">从研究对话开始，逐步形成判断。</p>}
        {!!topic.next_questions?.length && <ul className="mt-4 list-disc space-y-1.5 pl-5 text-sm leading-6 text-muted-foreground">{topic.next_questions.map(question => <li key={question}>{question}</li>)}</ul>}
        <details className="mt-4"><summary className="cursor-pointer text-xs text-muted-foreground">查看研究依据</summary><ReferenceButtons refs={[...(topic.observation?.source_refs ?? []), ...(topic.observation?.fact_refs ?? [])]} /></details>
      </section>
      <BasisChanges basis={basis} selectedSlug={search.get('basis') || ''} continueResearch={() => void continueWith('继续研究这个议题，先看判断之后依据的变化。')} />
      {wall && <section className="topic-section topic-wall-object-card">
        <div className="topic-card-head"><h2>墙上对象</h2><button type="button" onClick={() => setView('wall')}>打开证据墙</button></div>
        {wall.nodes.length ? <div className="topic-object-list">{wall.nodes.slice(0, 10).map(node => <WallObjectRow key={node.ref} node={node} changed={changedSlugs.has(node.ref)} onOpen={() => setView('wall')} />)}</div>
          : <p className="topic-section-empty">继续研究后，议题涉及的对象会出现在这里。</p>}
        {wall.nodes.length > 10 && <p className="topic-section-empty mt-2">还有 {wall.nodes.length - 10} 个，在证据墙查看。</p>}
        <p className="topic-object-stats">{wall.nodes.length} 个对象 · {wallCount} 条连线</p>
      </section>}
      <section className="topic-section">
        <h2>待确认关联</h2>
        {proposals.filter(item => !item.hypothesis_id).length === 0 && <p className="text-sm text-muted-foreground">还没有提议。开始研究后，助手会建议关联相关的记录或研究成果。</p>}
        {proposals.filter(item => !item.hypothesis_id).map(item => {
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
      {selected && <section ref={readerRef} className="topic-section topic-reader" aria-label="正在阅读">
        <div className="topic-card-head"><h2>正在阅读 · {selectedTitle}</h2><button type="button" className="rl-icon-action" onClick={() => setSelected("")}><X size={13} />收起</button></div>
        {selected.startsWith("draft:") && draftPreview && <DraftPreview draft={draftPreview} />}
        {selected.startsWith('result:') && <ResearchResult key={selected} resultId={selected} presentation="report" />}
        {/^(themes|comparisons|industries|companies)\//.test(selected) && <WikiReader slug={selected} />}
        {selected.startsWith("note:") && (selectedNote ? <KnowledgeText markdown={selectedNote.content} /> : <p className="whitespace-pre-wrap text-sm leading-7">这条记录已被删除或移动，可以到「记录」里查找。</p>)}
      </section>}
    </div>}
    {view !== 'wall' && <Disclaimer compact />}
  </div>;
}

const WALL_ICON = { company: Building2, industry: Factory, document: FileText, note: BookOpen } as Record<string, typeof BookOpen>;
function WallObjectRow({ node, changed, onOpen }: { node: TopicWallData['nodes'][number]; changed: boolean; onOpen: () => void }) {
  const [, refresh] = useState(0);
  useEffect(() => { let active = true; void resolveObjectLabels([node.ref]).then(() => { if (active) refresh(value => value + 1); }).catch(() => {}); return () => { active = false; }; }, [node.ref]);
  const Icon = WALL_ICON[node.kind] || Layers3;
  return <button type="button" data-object-ref={node.ref} className={`topic-object-row kind-${node.kind}`} onClick={onOpen}>
    <span className="topic-wall-node-icon"><Icon size={14} /></span><strong>{objectLabel(node.ref)}</strong>{changed && <em>有更新</em>}
  </button>;
}
