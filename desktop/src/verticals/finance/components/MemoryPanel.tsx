import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Check, ChevronDown, ChevronUp, Pencil, Trash2, X } from "lucide-react";
import "../pages/my-research.css";
import { objectLabel, resolveObjectLabels } from "../lib/objectRegistry";
import type { ResearchTopicRouteResult } from "../lib/research";
import { adoptCandidate, CandidateChoiceNeeded, CANDIDATE_CHANGED, disposeCandidate, loadCandidates, loadMemory, saveMemory, type MemoryDoc, type TopicCandidate } from "../lib/memory";
import { shortTime } from "./ListPager";

const TOPIC_REF = /topic:[0-9a-f]{12}/g;

/** Model-written memory and suggestion text may carry topic IDs; show them as linked topic titles. */
function TopicRefText({ text }: { text: string }) {
  const refs = [...new Set(text.match(TOPIC_REF) || [])];
  const [, refresh] = useState(0);
  useEffect(() => {
    if (!refs.length) return;
    let active = true;
    void resolveObjectLabels(refs).then(() => { if (active) refresh(value => value + 1); }).catch(() => {});
    return () => { active = false; };
  }, [refs.join(" ")]);
  if (!refs.length) return <>{text}</>;
  return <>{text.split(/(topic:[0-9a-f]{12})/).map((part, index) => /^topic:[0-9a-f]{12}$/.test(part)
    ? <Link key={index} className="rl-topic-ref" title={objectLabel(part)} to={`/insights/topics/${part.slice(6)}`}>「{topicShortTitle(part)}」</Link>
    : part)}</>;
}

function topicShortTitle(ref: string): string {
  const title = objectLabel(ref);
  if (title === ref) return "议题";
  return title.length > 18 ? `${title.slice(0, 18)}…` : title;
}

const STANCE: Record<string, string> = { stated: "你说过", inferred: "推断", corrected: "已纠正" };

export function MemoryPanel({ onOpenSource }: { onOpenSource: (sessionId: string) => void }) {
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
  const [showDone, setShowDone] = useState(false);
  const group = (title: string, description: string, doc: MemoryDoc | null, kind: "soul" | "recent", empty: string) => <section>
    <div className="rl-group-head"><h2>{title}</h2>{doc && doc.entries.length > 0 && <span>{doc.entries.length} 条</span>}</div>
    <p className="rl-group-desc">{description}</p>
    {!doc && !error && <p className="rl-group-empty">正在读取…</p>}
    {doc && doc.entries.length === 0 && <p className="rl-group-empty">{empty}</p>}
    {doc && doc.entries.length > 0 && <div className="rl-items">{doc.entries.map(item => <div key={item.id} className="rl-item">
      <p className="rl-item-text"><span className={`rl-chip${item.stance === "corrected" ? " is-primary" : ""}`}>{STANCE[item.stance] || item.stance}</span><TopicRefText text={item.text} /></p>
      {editId === item.id && <textarea className="workspace-field" aria-label="纠正这条记忆" value={editText} onChange={event => setEditText(event.target.value)} />}
      <div className="rl-item-foot">
        {item.source_session ? <button type="button" className="rl-item-source" onClick={() => onOpenSource(item.source_session!)}>来自对话{item.updated_at ? ` · ${shortTime(item.updated_at)}` : ""}</button>
          : <span className="rl-item-source">{item.updated_at ? shortTime(item.updated_at) : ""}</span>}
        <div className="rl-item-actions">
          {editId === item.id ? <>
            <button type="button" className="rl-icon-action" onClick={() => setEditId("")}><X size={13} />取消</button>
            <button type="button" className="rl-icon-action" disabled={busy === item.id || !editText.trim()} onClick={() => void save(kind, item.id, doc.version, editText)}><Check size={13} />保存纠正</button>
          </> : <>
            <button type="button" className="rl-icon-action" onClick={() => { setEditId(item.id); setEditText(item.text); }}><Pencil size={13} />纠正</button>
            <button type="button" className="rl-icon-action is-danger" disabled={busy === item.id} onClick={() => void remove(kind, item.id, doc.version)}><Trash2 size={13} />删除</button>
          </>}
        </div>
      </div>
    </div>)}</div>}
  </section>;
  const open = candidates?.filter(item => item.status === "open") ?? [];
  const done = candidates?.filter(item => item.status !== "open") ?? [];
  const candidateCard = (item: TopicCandidate) => <div key={item.id} className="rl-item">
    <p className="rl-candidate-title"><TopicRefText text={item.question} /></p>
    {item.reason && <p className="rl-candidate-reason"><TopicRefText text={item.reason} /></p>}
    {item.status === "open" ? <div className="rl-candidate-actions">
      {choices[item.id]?.map(topic => <button key={topic.topic_id} type="button" className="workspace-action workspace-action-compact" disabled={busy === item.id} onClick={() => void act(item, "adopt", topic.topic_id)}>继续：{topic.title}</button>)}
      <button type="button" className="workspace-action workspace-action-compact workspace-action-primary" disabled={busy === item.id} onClick={() => void act(item, "adopt")}><Check size={14} />采用</button>
      <button type="button" className="workspace-action workspace-action-compact" disabled={busy === item.id} onClick={() => void act(item, "ignore")}><X size={14} />忽略</button>
    </div> : <div className="rl-item-foot"><span className="rl-chip is-done">{item.status === "adopted" ? "已采用" : "已忽略"}</span></div>}
  </div>;
  return <div className="rl-memory">
    <p className="rl-memory-intro">助手回答时会参考这里的内容。说错了可以纠正，不需要的可以删除。</p>
    {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
    {group("用户画像", "你的表达偏好与习惯，例如金额单位、回答详略。", soul, "soul", "还没有条目。在对话里说“记住：金额默认用亿元”这类话，会记在这里。")}
    {group("近期研究记忆", "你最近持续关心的问题和做过的纠正。", recent, "recent", "还没有条目。")}
    <section>
      <div className="rl-group-head"><h2>议题建议</h2>{open.length > 0 && <span>{open.length} 条待处理</span>}</div>
      <p className="rl-group-desc">知识整理发现值得持续研究的问题时，会在这里建议。采用后成为议题。</p>
      {!candidates && !error && <p className="rl-group-empty">正在读取…</p>}
      {candidates && open.length === 0 && <p className="rl-group-empty">没有待处理的建议。</p>}
      {open.length > 0 && <div className="rl-items">{open.map(candidateCard)}</div>}
      {done.length > 0 && <>
        <button type="button" className="rl-disclosure mt-3 inline-flex items-center gap-1" aria-expanded={showDone} onClick={() => setShowDone(value => !value)}>
          {showDone ? <ChevronUp size={13} /> : <ChevronDown size={13} />}已处理 {done.length} 条
        </button>
        {showDone && <div className="rl-items mt-2">{done.map(candidateCard)}</div>}
      </>}
    </section>
  </div>;
}
