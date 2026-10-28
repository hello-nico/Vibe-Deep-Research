import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { objectLabel, resolveObjectLabels } from "../lib/objectRegistry";
import { loadMemory, saveMemory, type MemoryDoc } from "../lib/memory";
import { aboutMeDate, aboutMeItems, aboutMeSource, forgetOps, rememberOps, type AboutMeItem } from "../lib/aboutMe";
import { GroupCard, GroupRow } from "./ui/Card";
import { LoadingCard } from "./ui/LoadingCard";

const TOPIC_REF = /topic:[0-9a-f]{12}/g;

/** Model-written memory text may carry topic IDs; show them as linked topic titles. */
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
    ? <Link key={index} to={`/insights/topics/${part.slice(6)}`} className="underline">「{objectLabel(part) === part ? "议题" : objectLabel(part)}」</Link>
    : part)}</>;
}

/** 设置 · 关于我：助手记得的关于用户的事，一张列表；顶部补充，逐条可删。 */
export function AboutMe({ onOpenSource }: { onOpenSource: (sessionId: string) => void }) {
  const [soul, setSoul] = useState<MemoryDoc | null>(null);
  const [recent, setRecent] = useState<MemoryDoc | null>(null);
  const [input, setInput] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const reload = () => Promise.all([loadMemory("soul"), loadMemory("recent")]).then(([nextSoul, nextRecent]) => { setSoul(nextSoul); setRecent(nextRecent); setError(""); })
    .catch(reason => setError(reason instanceof Error ? reason.message : "读取失败"));
  useEffect(() => { void reload(); }, []);
  const apply = async (kind: "soul" | "recent", operations: object[], failure: string) => {
    const doc = kind === "soul" ? soul : recent;
    if (!doc || busy) return;
    setBusy(true); setError("");
    try {
      const next = await saveMemory(kind, doc.version, operations);
      if (kind === "soul") setSoul(next); else setRecent(next);
      return true;
    } catch (reason) { setError(`${failure}：${reason instanceof Error ? reason.message : String(reason)}`); void reload(); }
    finally { setBusy(false); }
  };
  const remember = async () => {
    if (!input.trim()) return;
    if (await apply("soul", rememberOps(input), "没记上")) setInput("");
  };
  const items = aboutMeItems(soul, recent);
  const source = (item: AboutMeItem) => {
    const label = aboutMeSource(item);
    const date = aboutMeDate(item.updated_at);
    return <>
      {item.source_session ? <button type="button" className="underline-offset-2 hover:underline" onClick={() => onOpenSource(item.source_session!)}>{label}</button> : label}
      {date && ` · ${date}`}
    </>;
  };
  return <div className="grid max-w-3xl gap-3">
    <form className="flex items-center gap-2" onSubmit={event => { event.preventDefault(); void remember(); }}>
      <input value={input} onChange={event => setInput(event.target.value)} aria-label="补充关于我" placeholder="补充一句，比如：我持有神火，偏中长线，回答先给结论"
        className="workspace-field workspace-field-single flex-1" />
      <button type="submit" className="btn" disabled={busy || !soul}>记下</button>
    </form>
    {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
    {!soul && !recent && !error && <LoadingCard />}
    {(soul || recent) && (items.length === 0
      ? <p className="text-sm text-[var(--text-3)]">补充一句，或在对话里说“记住：回答先给结论”</p>
      : <GroupCard>{items.map(item => <GroupRow key={`${item.kind}:${item.id}`} title={<TopicRefText text={item.text} />} description={source(item)}>
          <button type="button" className="btn btn-text btn-sm" disabled={busy} onClick={() => void apply(item.kind, forgetOps(item.id), "没删掉")}>删除</button>
        </GroupRow>)}</GroupCard>)}
    <p className="text-xs text-[var(--text-3)]">不对的直接删掉，助手以后不再按它来。</p>
  </div>;
}
