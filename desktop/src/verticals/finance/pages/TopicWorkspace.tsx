import { useEffect, useLayoutEffect, useMemo, useState } from "react";
import { Link, useParams, useSearchParams } from "react-router-dom";
import { Check, ChevronLeft, FileText, Plus, RefreshCw } from "lucide-react";
import { PageHeader } from "../components/ui/PageHeader";
import { GlassCard } from "../components/ui/GlassCard";
import { Disclaimer } from "../components/ui/Disclaimer";
import { KnowledgeText, ReferenceButtons, WikiReader } from "../components/ResearchKnowledge";
import { loadNotes } from "../lib/notes";
import {
  publishWikiDraft, researchRead, topicIdFromHex, topicPath, type ResearchLink,
  type ResearchProposal, type ResearchTopic, type WikiDraft,
} from "../lib/research";
import { useResearchSessions } from "../dsh/research-session";
import { useTopicSessionGate } from "../dsh/topic-session-gate";
import { useAiPage } from "../../../core/ai/pageContext";

function DraftPreview({ draft }: { draft: WikiDraft }) {
  return <div className="space-y-4">
    <p className="text-xs text-muted-foreground">未发布草案 · 确认发布前必须先审阅这里的正文</p>
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
  const notes = useMemo(() => Object.fromEntries(loadNotes().map(note => [note.id, note])), [topicId, proposals, links]);
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
      gate.setGate({ blocking: true, message: "正在接上该议题的对话，匹配完成前不能输入。" });
      void research.restoreTopic(topicId, undefined, controller.signal).then(match => {
        if (cancelled) return;
        if (match.matched) gate.setGate({ blocking: false, message: "" });
        else gate.setGate({ blocking: true, message: "未能接上该议题的对话，请刷新后重试。" });
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
  const prompt = (fresh = false) => [
    `当前议题：${topic?.title || topicId}（${topicId}）。`,
    "产品已提供可分页的沉淀记录。请用 stock_list_product_notes 翻页，并用 stock_read_product_note 补读正文后再提议相关记录。",
    "用户确认前不要声称已写入关联。Theme / Comparison 用 stock_read_composition_skill 与 stock_validate_page_draft；校验成功不等于已发布。",
    "先读取 stock_list_research_links 的当前议题已有关系；已关联记录不重复提议，不把旧会话中的提案状态当作当前状态。",
    fresh ? "这是同一议题的新会话，读取持久 Topic / Wiki / Link 继续，不要复制旧会话全文。" : "继续当前议题研究。",
  ].join("\n");
  const start = async (fresh = false) => {
    setBusy(fresh ? "new" : "continue"); setError("");
    try {
      await research.startTopic({ topicId, title: topic?.title || topicId, prompt: prompt(fresh), fresh });
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
        body: JSON.stringify({ proposal_id: proposal.proposal_id, note_id: proposal.note_id, target_id: proposal.target_id }),
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
    suggestions: ["哪些沉淀记录与这个电力问题有关", "可以形成哪些 Theme 或 Comparison"],
  });
  const wikiPages = pages.filter(item => /^(themes|comparisons|industries|companies)\//.test(item.target_id));
  return <div>
    <PageHeader title={topic?.title || "议题工作区"} subtitle="围绕问题积累材料，形成判断，继续研究。"
      actions={<Link className="workspace-action" to="/my-research"><ChevronLeft />全部议题</Link>} />
    <div className="mb-4 flex flex-wrap gap-2">
      <button type="button" className="workspace-field-action" disabled={!!busy || gate.blocking} onClick={() => void start(false)}>{busy === "continue" ? "正在接上…" : "继续研究"}</button>
      <button type="button" className="workspace-action" disabled={!!busy || gate.blocking} onClick={() => void start(true)}><Plus className="h-4 w-4" />{busy === "new" ? "正在新开会话…" : "新会话继续"}</button>
      <button type="button" className="workspace-action" disabled={!!busy} onClick={() => void refresh()}><RefreshCw className={`h-4 w-4 ${busy === "refresh" ? "animate-spin" : ""}`} />{busy === "refresh" ? "正在刷新…" : "刷新材料"}</button>
    </div>
    {error && <p role="alert" className="mb-4 text-sm text-destructive">{error}</p>}
    {!topic && !error && <p role="status">正在读取议题…</p>}
    {topic && <div className="grid gap-4 xl:grid-cols-[minmax(0,1.2fr)_minmax(320px,0.8fr)]">
      <div className="space-y-4">
        <GlassCard>
          <h2 className="mb-3 text-base font-semibold">当前判断</h2>
          {topic.judgment?.text ? <KnowledgeText markdown={topic.judgment.text} /> : <p className="text-sm text-muted-foreground">从研究对话开始，逐步形成判断。</p>}
          {!!topic.next_questions?.length && <section className="mt-6 border-t border-border pt-4"><h2 className="mb-3 text-base font-semibold">接下来研究</h2><ul className="list-disc space-y-2 pl-5 text-sm leading-7">{topic.next_questions.map(question => <li key={question}>{question}</li>)}</ul></section>}
          <details className="mt-5"><summary className="cursor-pointer text-sm text-muted-foreground">查看研究依据</summary><ReferenceButtons refs={[...(topic.observation?.source_refs ?? []), ...(topic.observation?.fact_refs ?? [])]} /></details>
        </GlassCard>
        {selected.startsWith("draft:") && draftPreview && <DraftPreview draft={draftPreview} />}
        {selected && /^(themes|comparisons|industries|companies)\//.test(selected) && <WikiReader slug={selected} />}
        {selected.startsWith("note:") && <GlassCard>
          <h2 className="mb-2 text-base font-semibold">{notes[selected.slice(5)]?.title || "记录"}</h2>
          <p className="whitespace-pre-wrap text-sm leading-7">{notes[selected.slice(5)]?.content || "这条记录已不在台账中，关联目标失效，原记录若仍存在请从记录页查看。"}</p>
        </GlassCard>}
      </div>
      <div className="space-y-4">
        <GlassCard>
          <h2 className="mb-3 text-sm font-semibold">待确认关联</h2>
          {proposals.length === 0 && <p className="text-sm text-muted-foreground">还没有提议。开始研究后，助手只会建议相关记录。</p>}
          {proposals.map(item => {
            const note = notes[item.note_id.replace(/^note:/, "")] || notes[item.note_id];
            return <div key={item.proposal_id} className="mb-3 rounded-lg border border-border p-3">
              <p className="text-sm font-medium">{note?.title || item.note_id}</p>
              <p className="mt-1 text-xs text-muted-foreground">{item.reason}</p>
              <div className="mt-2 flex gap-2">
                <button type="button" className="workspace-action workspace-action-compact" disabled={!!busy} onClick={() => void decide(item, "confirm")}><Check className="h-3.5 w-3.5" />确认关联</button>
                <button type="button" className="workspace-action workspace-action-compact" disabled={!!busy} onClick={() => void decide(item, "reject")}>不关联</button>
              </div>
            </div>;
          })}
        </GlassCard>
        <GlassCard>
          <h2 className="mb-3 text-sm font-semibold">已关联材料</h2>
          {links.length === 0 && wikiPages.length === 0 && <p className="text-sm text-muted-foreground">确认后会出现在这里，刷新和新会话都能读到。</p>}
          {links.map(item => {
            const noteKey = item.note_id.replace(/^note:/, "");
            return <button key={item.link_id} type="button" className="mb-2 block w-full rounded-lg border border-border px-3 py-2 text-left text-sm hover:bg-muted" onClick={() => setSelected(item.note_id.startsWith("note:") ? item.note_id : item.target_id)}>
              <span className="block truncate">{notes[noteKey]?.title || item.note_id}</span>
              <span className="text-xs text-muted-foreground">{item.reason || "已确认关联"}</span>
            </button>;
          })}
          {wikiPages.map(item => <button key={`wiki-${item.link_id}`} type="button" className="mb-2 block w-full rounded-lg border border-primary/20 px-3 py-2 text-left text-sm" onClick={() => setSelected(item.target_id)}>
            <span className="block truncate">{item.title || item.target_id}</span>
            <span className="text-xs text-muted-foreground">已发布研究材料</span>
          </button>)}
        </GlassCard>
        <GlassCard>
          <h2 className="mb-3 text-sm font-semibold">待发布草案</h2>
          {drafts.filter(item => !item.published).length === 0 && <p className="text-sm text-muted-foreground">助手校验成功的 Theme / Comparison 会出现在这里，确认后才写入 Wiki。</p>}
          {drafts.filter(item => !item.published).map(item => <div key={item.draft_token} className="mb-3 rounded-lg border border-border p-3">
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
        </GlassCard>
      </div>
    </div>}
    <Disclaimer />
  </div>;
}
