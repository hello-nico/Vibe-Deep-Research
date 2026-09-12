import { useEffect, useMemo, useState, type FormEvent } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { BookOpen, NotebookPen, Plus, Search } from "lucide-react";
import { PageHeader } from "../components/ui/PageHeader";
import { GlassCard } from "../components/ui/GlassCard";
import { Disclaimer } from "../components/ui/Disclaimer";
import { loadNotes, type Note } from "../lib/notes";
import { researchRead, topicHex, type ResearchTopicSummary } from "../lib/research";
import { useAiPage } from "../../../core/ai/pageContext";

export function MyResearch() {
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const tab = params.get("tab") === "notes" ? "notes" : "topics";
  const [query, setQuery] = useState("");
  const [topics, setTopics] = useState<ResearchTopicSummary[] | null>(null);
  const [error, setError] = useState("");
  const [title, setTitle] = useState("");
  const [question, setQuestion] = useState("");
  const [creating, setCreating] = useState(false);
  const [offset, setOffset] = useState(0);
  const [nextOffset, setNextOffset] = useState<number | null>(null);
  const notes = useMemo(() => loadNotes(), [tab]);
  useEffect(() => {
    const controller = new AbortController();
    setError("");
    void researchRead<{ items: ResearchTopicSummary[]; next_offset: number | null }>(
      `/wiki/research-topics?limit=50&offset=${offset}&query=${encodeURIComponent(query)}`,
      { signal: controller.signal },
    ).then(value => { setTopics(value.items); setNextOffset(value.next_offset); }).catch(e => { if (!controller.signal.aborted) setError(String(e)); });
    return () => controller.abort();
  }, [query, offset]);
  const setTab = (value: "topics" | "notes") => {
    const next = new URLSearchParams(params);
    if (value === "notes") next.set("tab", "notes"); else next.delete("tab");
    setParams(next, { replace: true });
  };
  const create = async (event: FormEvent) => {
    event.preventDefault();
    if (creating) return;
    setCreating(true); setError("");
    try {
      const result = await researchRead<{ action: string; topic?: { topic_id: string } }>("/wiki/research-topics/route", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          question: question.trim() || title.trim(),
          title: title.trim() || question.trim(),
          research_intent: true,
          confirm_new: true,
        }),
      });
      const id = result.topic?.topic_id;
      if (!id) throw new Error(result.action === "skip" ? "这个问题还不够形成持续议题，请写清要跟踪的行业问题。" : "议题没有创建成功");
      navigate(`/my-research/topics/${topicHex(id)}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally { setCreating(false); }
  };
  useAiPage({
    key: `my-research:${tab}`,
    title: "我的研究",
    context: tab === "notes"
      ? (notes.length ? `独立沉淀记录 ${notes.length} 条` : "还没有独立沉淀记录")
      : (topics?.length ? `持续议题 ${topics.length} 个` : "还没有持续议题"),
    suggestions: ["帮我找出现在最该继续的电力议题", "这些记录里哪些和行业议题有关"],
  });
  return <div>
    <PageHeader title="我的研究" subtitle="留下值得继续的问题，让记录和研究材料逐步积累。" />
    <div className="mb-5 flex flex-wrap gap-2">
      <button type="button" className={`rounded-lg border px-3 py-2 text-sm ${tab === "topics" ? "border-primary text-primary" : "border-border"}`} onClick={() => setTab("topics")}>议题</button>
      <button type="button" className={`rounded-lg border px-3 py-2 text-sm ${tab === "notes" ? "border-primary text-primary" : "border-border"}`} onClick={() => setTab("notes")}>记录</button>
      <label className="relative min-w-56 flex-1">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <input className="workspace-input w-full pl-9" placeholder={tab === "notes" ? "搜索记录标题" : "搜索议题"} value={query} onChange={e => { setQuery(e.target.value); setOffset(0); }} />
      </label>
    </div>
    {error && <p role="alert" className="mb-4 text-sm text-destructive">{error}</p>}
    {tab === "topics" ? <>
      <GlassCard className="mb-5">
        <form className="grid gap-3 md:grid-cols-[1fr_1fr_auto]" onSubmit={event => void create(event)}>
          <input className="workspace-input" placeholder="议题标题，例如电力容量电价" value={title} onChange={e => setTitle(e.target.value)} />
          <input className="workspace-input" required placeholder="要持续跟踪的问题" value={question} onChange={e => setQuestion(e.target.value)} />
          <button className="workspace-field-action" disabled={creating}><Plus className="h-4 w-4" />{creating ? "创建中…" : "创建议题"}</button>
        </form>
      </GlassCard>
      {!topics && !error && <p role="status">正在读取议题…</p>}
      {topics && topics.length === 0 && <GlassCard><p className="text-sm text-muted-foreground">还没有持续议题。从一个电力或行业问题开始即可，不必先分类记录。</p></GlassCard>}
      {topics && topics.length > 0 && <div className="grid gap-4 md:grid-cols-2">{topics.filter(item => !query || `${item.title}${item.topic_id}`.includes(query)).map(item => (
        <Link key={item.topic_id} to={`/my-research/topics/${topicHex(item.topic_id)}`} className="group">
          <GlassCard glow className="flex h-full min-h-36 flex-col justify-between">
            <div>
              <p className="mb-2 text-xs text-muted-foreground">议题 · {item.judgment?.state || "收集中"}</p>
              <h2 className="text-base font-semibold">{item.title}</h2>
              <p className="mt-2 line-clamp-2 text-sm text-muted-foreground">{item.judgment?.text || "继续研究，逐步形成判断"}</p>
            </div>
            <p className="mt-4 text-xs text-muted-foreground">{item.last_touched_at ? new Date(item.last_touched_at).toLocaleString("zh-CN") : "待继续"}</p>
          </GlassCard>
        </Link>
      ))}</div>}
      {(offset > 0 || nextOffset !== null) && <div className="mt-4 flex gap-2"><button className="workspace-action" disabled={offset === 0} onClick={() => setOffset(Math.max(0, offset - 50))}>上一页</button><button className="workspace-action" disabled={nextOffset === null} onClick={() => nextOffset !== null && setOffset(nextOffset)}>下一页</button></div>}
    </> : <NotesPanel notes={notes.filter(note => !query || `${note.title}${note.kind}`.includes(query))} />}
    <Disclaimer />
  </div>;
}

function NotesPanel({ notes }: { notes: Note[] }) {
  if (!notes.length) {
    return <GlassCard>
      <div className="flex flex-col items-center gap-2 py-10 text-center text-sm text-muted-foreground">
        <NotebookPen className="h-8 w-8 text-muted-foreground/40" />
        独立记录会留在这里。保存大盘问答不会强行创建议题。
      </div>
    </GlassCard>;
  }
  return <div className="space-y-2">{notes.map(note => (
    <GlassCard key={note.id} className="!p-4">
      <div className="flex items-center gap-2">
        <BookOpen className="h-4 w-4 text-primary" />
        <span className="text-xs text-muted-foreground">{note.kind}</span>
        <strong className="min-w-0 flex-1 truncate text-sm">{note.title}</strong>
        <span className="text-xs text-muted-foreground">{new Date(note.ts).toLocaleString("zh-CN")}</span>
      </div>
      <p className="mt-2 line-clamp-4 whitespace-pre-wrap text-sm text-muted-foreground">{note.content}</p>
    </GlassCard>
  ))}</div>;
}
