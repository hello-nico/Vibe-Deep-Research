import { useEffect, useState } from "react";
import { ChevronUp, NotebookPen } from "lucide-react";
import "../pages/my-research.css";
import { KnowledgeText } from "./ResearchKnowledge";
import { ResearchLoading } from "./ui/ResearchLoading";
import { WorkspaceSearch } from "./ui/WorkspaceSearch";
import { getNote, notesLoadError, searchNotes, type Note } from "../lib/notes";
import { LIST_PAGE_SIZE, ListPager, shortTime } from "./ListPager";

/** 资料页「记录」：你在各页保存的记录，可搜索、翻页、点开看全文。 */
export function NotesView() {
  const [query, setQuery] = useState("");
  const [notes, setNotes] = useState<Note[] | null>(null);
  const [total, setTotal] = useState(0);
  const [offset, setOffset] = useState(0);
  const [next, setNext] = useState<number | null>(null);
  const [error, setError] = useState(notesLoadError()?.message || "");
  const [busy, setBusy] = useState(false);
  const [tick, setTick] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    setBusy(true); setError("");
    void searchNotes(query, offset, LIST_PAGE_SIZE).then(page => {
      if (controller.signal.aborted) return;
      setNotes(page.notes); setTotal(page.total); setNext(page.nextOffset);
    }).catch(e => {
      if (!controller.signal.aborted) { setNotes(null); setError(e instanceof Error ? e.message : String(e)); }
    }).finally(() => { if (!controller.signal.aborted) setBusy(false); });
    return () => controller.abort();
  }, [query, offset, tick]);
  return <div>
    <WorkspaceSearch className="mb-4" placeholder="搜索记录标题或正文" value={query} onChange={value => { setQuery(value); setOffset(0); }} />
    <NotesPanel notes={notes} total={total} busy={busy} error={error} offset={offset} nextOffset={next} onPage={setOffset} onRetry={() => setTick(value => value + 1)} />
  </div>;
}

/** Saved assistant answers are stored as "## 问题 … ## 回答 …"; show them as a question and an answer, not as a report. */
function splitQuestionAnswer(markdown: string): { question: string; answer: string; source: string } | null {
  const match = /^\s*##\s*问题\s*\n([\s\S]*?)\n##\s*回答\s*\n([\s\S]*)$/.exec(markdown.replace(/^\uFEFF?---\r?\n[\s\S]*?\r?\n---(?:\r?\n|$)/, ""));
  if (!match) return null;
  const footer = /\n-{3,}\s*\n来源：([^\n]*)\s*$/.exec(match[2]!);
  return { question: match[1]!.trim(), answer: (footer ? match[2]!.slice(0, footer.index) : match[2]!).trim(), source: footer?.[1]?.trim() || "" };
}

/** One-paragraph preview: the answer (not the repeated question), without markdown syntax. */
function plainExcerpt(note: Note): string {
  const raw = note.excerpt || note.content || "";
  const body = splitQuestionAnswer(raw)?.answer ?? raw.replace(/^\s*##\s*问题\s*\n[\s\S]*?\n##\s*回答\s*\n/, "").replace(/^\s*##\s*问题\s+[^#]*##\s*回答\s*/, "");
  return body
    .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/^#{1,6}\s+/gm, "")
    .replace(/\s#{1,6}\s+/g, " ")
    .replace(/(\*\*|__|`)/g, "")
    .replace(/^\s*(?:[-*>]|\d+\.)\s+/gm, "")
    .replace(/\s+/g, " ")
    .trim();
}

function NoteBody({ note }: { note: Note }) {
  const qa = splitQuestionAnswer(note.content);
  if (!qa) return <KnowledgeText markdown={note.content} />;
  return <>
    <p className="rl-note-label">问题</p>
    <div className="rl-note-question">{qa.question}</div>
    <p className="rl-note-label">回答</p>
    <KnowledgeText markdown={qa.answer} />
    {qa.source && <p className="rl-meta mt-4">来源：{qa.source}</p>}
  </>;
}

export function NotesPanel({ notes, total, busy, error, offset, nextOffset, onPage, onRetry }: {
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
  return <div>
    <div className="rl-notes">
      {notes?.map(note => {
        const open = openId === note.id;
        // Titles are saved as "问助手 · 问题"; the kind already shows as a chip.
        const title = note.title.startsWith(`${note.kind} · `) ? note.title.slice(note.kind.length + 3) : note.title;
        return <article key={note.id} className={`rl-note${open ? " is-open" : ""}`}>
          <button type="button" className="rl-note-head" aria-expanded={open} onClick={() => setOpenId(open ? null : note.id)}>
            <span className="rl-chip is-primary">{note.kind}</span>
            <span className="rl-note-title">{title}</span>
            <span className="rl-chip">{shortTime(note.ts)}</span>
          </button>
          {!open && <div className="rl-note-excerpt-wrap" onClick={() => setOpenId(note.id)}><p className="rl-note-excerpt">{plainExcerpt(note)}</p></div>}
          {open && <div className="rl-note-body">
            {fullError && <p role="alert" className="text-sm text-destructive">{fullError}<button type="button" className="workspace-action ml-2" onClick={() => { setOpenId(null); setTimeout(() => setOpenId(note.id)); }}>重新读取</button></p>}
            {full && full.id === note.id ? <NoteBody note={full} /> : !fullError && <p role="status" className="text-sm text-muted-foreground">正在读取全文…</p>}
            <div className="rl-note-foot"><button type="button" className="rl-icon-action" onClick={() => setOpenId(null)}><ChevronUp size={14} />收起</button></div>
          </div>}
        </article>;
      })}
    </div>
    <ListPager page={Math.floor(offset / LIST_PAGE_SIZE)} hasNext={nextOffset !== null} total={total} unit="条记录"
      onPage={page => onPage(page * LIST_PAGE_SIZE)} />
  </div>;
}
