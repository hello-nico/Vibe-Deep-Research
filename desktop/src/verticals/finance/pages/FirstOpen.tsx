import { useState } from "react";
import { firstOpenExamples, resolveFirstOpenInput } from "../lib/firstOpen";
import type { WikiItem } from "../lib/research";

/** 第一次打开：关注为空时的空态。选中公司后由 onStart 加入关注并进入个股页，研究由个股页自己开始。 */
export function FirstOpen({ pages, onStart }: { pages: readonly WikiItem[]; onStart: (symbol: string) => Promise<void> }) {
  const [input, setInput] = useState("");
  const [hint, setHint] = useState("");
  const [busy, setBusy] = useState(false);
  const start = async (text: string) => {
    const pick = resolveFirstOpenInput(text, pages);
    if ("hint" in pick) { setHint(pick.hint); return; }
    setBusy(true); setHint("");
    try { await onStart(pick.symbol); }
    catch (reason) { setHint(`没保存上：${reason instanceof Error ? reason.message : String(reason)}`); setBusy(false); }
  };
  const examples = firstOpenExamples(pages);
  return <section className="mx-auto flex max-w-xl flex-col items-center px-4 py-16 text-center" aria-label="第一次打开">
    <h2 className="workspace-title">你在关注哪些公司？</h2>
    <p className="mt-2 text-sm text-[var(--text-3)]">输入公司名称或代码，我们会自动研究它：靠什么赚钱、哪些价格影响利润、现在的价格在赌什么。</p>
    <form className="mt-6 flex w-full items-center gap-2" onSubmit={event => { event.preventDefault(); void start(input); }}>
      <input value={input} onChange={event => { setInput(event.target.value); setHint(""); }} aria-label="公司名称或代码" placeholder="例如 神火股份 或 000933"
        className="workspace-field workspace-field-single flex-1" autoFocus />
      <button type="submit" className="btn btn-primary" disabled={busy}>开始</button>
    </form>
    <p role="status" className="mt-2 min-h-[1.25rem] text-xs text-[var(--text-3)]">{hint}</p>
    {examples.length > 0 && <div className="mt-2 flex flex-wrap justify-center gap-2" aria-label="示例公司">
      {examples.map(item => <button key={item.symbol} type="button" className="btn btn-sm" disabled={busy} onClick={() => void start(item.name)}>{item.name}</button>)}
    </div>}
  </section>;
}
