import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";
import { addWatch, hydrateWatch, loadWatch } from "../lib/watchlist";
import { addToRoster, hydrateRoster, loadRoster } from "../lib/researchRoster";
import { aShareQualified } from "../lib/research";
import { peekRows, peekSource, type CompanyPeekSnapshot } from "../lib/companyPeek";

async function loadProviderSnapshot(code: string, signal: AbortSignal): Promise<CompanyPeekSnapshot> {
  const qualified = aShareQualified(code);
  if (!qualified) throw new Error("暂只支持 A 股代码");
  const response = await fetch(`/finance-research/wiki/companies/${qualified}/provider-snapshot`, { signal });
  const value = await response.json().catch(() => null);
  if (!response.ok) throw new Error("基本面暂不可用");
  return value as CompanyPeekSnapshot;
}

export function CompanyNamePeek({ code, name }: { code: string; name: string }) {
  const trigger = useRef<HTMLButtonElement>(null);
  const panel = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [snapshot, setSnapshot] = useState<CompanyPeekSnapshot | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState("");
  const [watched, setWatched] = useState(() => loadWatch().includes(code));
  const [joined, setJoined] = useState(() => loadRoster().includes(code));

  useEffect(() => {
    if (!open) return;
    const controller = new AbortController();
    setSnapshot(null); setError("");
    void Promise.all([hydrateWatch().catch(() => undefined), hydrateRoster().catch(() => undefined)]).then(() => {
      if (!controller.signal.aborted) {
        setWatched(loadWatch().includes(code));
        setJoined(loadRoster().includes(code));
      }
    });
    void loadProviderSnapshot(code, controller.signal)
      .then(value => { if (!controller.signal.aborted) setSnapshot(value); })
      .catch(err => { if (!controller.signal.aborted) setError(err instanceof Error ? err.message : "基本面暂不可用"); });
    const onKey = (event: KeyboardEvent) => { if (event.key === "Escape") setOpen(false); };
    const onClick = (event: MouseEvent) => {
      const target = event.target instanceof Node ? event.target : null;
      if (target && (trigger.current?.contains(target) || panel.current?.contains(target))) return;
      setOpen(false);
    };
    document.addEventListener("keydown", onKey);
    document.addEventListener("mousedown", onClick);
    return () => { controller.abort(); document.removeEventListener("keydown", onKey); document.removeEventListener("mousedown", onClick); };
  }, [open, code]);

  const add = async (kind: "watch" | "research") => {
    if (busy) return;
    setBusy(kind);
    try {
      if (kind === "watch") { await addWatch(code); setWatched(true); }
      else { await addToRoster(code); setJoined(true); }
    } catch (err) {
      setError(err instanceof Error ? err.message : "操作失败");
    } finally { setBusy(""); }
  };

  const rows = snapshot ? peekRows(snapshot) : [];
  const period = rows.find(row => row.period)?.period;
  const rect = open ? trigger.current?.getBoundingClientRect() : null;
  const width = Math.min(300, window.innerWidth - 24);
  const top = rect ? (rect.bottom + 320 < window.innerHeight ? rect.bottom + 8 : Math.max(12, rect.top - 310)) : 0;
  const left = rect ? Math.max(12, Math.min(rect.left, window.innerWidth - width - 12)) : 0;

  return <>
    <button ref={trigger} type="button" className="text-left" aria-expanded={open} aria-haspopup="dialog" onClick={() => setOpen(value => !value)}>
      <span className="font-medium">{name}</span>{" "}
      <span className="text-xs text-muted-foreground/50">{code}</span>
    </button>
    {open && rect && createPortal(
      <div ref={panel} role="dialog" aria-label={`${name} 基本面`} className="finance-company-peek glass" style={{ width, left, top }}>
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="truncate font-medium">{name}</p>
            <p className="mt-0.5 text-[11px] text-muted-foreground">{[code, period, snapshot ? peekSource(snapshot) : ""].filter(Boolean).join(" · ")}</p>
          </div>
          <button type="button" className="-mr-1 -mt-0.5 shrink-0 rounded-md p-1 text-muted-foreground hover:bg-muted hover:text-foreground" aria-label="关闭" onClick={() => setOpen(false)}>
            <X size={16} />
          </button>
        </div>
        <div className="mt-3">
          {error && <p role="alert" className="text-xs text-destructive">{error}</p>}
          {!error && !snapshot && <p className="text-xs text-muted-foreground">正在读取基本面…</p>}
          {snapshot && rows.length === 0 && <p className="text-xs text-muted-foreground">基本面暂不可用</p>}
          {rows.length > 0 && <div className="grid grid-cols-2 gap-2">
            {rows.map(row => (
              <div key={row.key} className="rounded-lg bg-muted/25 px-2.5 py-2">
                <p className="text-[11px] text-muted-foreground">{row.label}</p>
                <p className="mt-0.5 font-mono text-sm font-semibold tabular-nums">{row.value}</p>
              </div>
            ))}
          </div>}
        </div>
        <div className="mt-3 flex gap-2">
          <button type="button" className="workspace-action workspace-action-compact flex-1" disabled={watched || busy === "watch"} onClick={() => void add("watch")}>
            {busy === "watch" ? "加入中…" : watched ? "已自选" : "加入自选"}
          </button>
          <button type="button" className="workspace-action workspace-action-primary workspace-action-compact flex-1" disabled={joined || busy === "research"} onClick={() => void add("research")}>
            {busy === "research" ? "加入中…" : joined ? "已加入研究" : "加入研究"}
          </button>
        </div>
      </div>,
      document.body,
    )}
  </>;
}
