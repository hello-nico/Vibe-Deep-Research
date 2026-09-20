import { useState } from "react";
import { Link } from "react-router-dom";
import { Plus, X, RefreshCw, Star } from "lucide-react";
import { PageHeader } from "@/components/ui/PageHeader";
import { GlassCard } from "@/components/ui/GlassCard";
import { Disclaimer } from "@/components/ui/Disclaimer";
import { addCodes, addWatch, loadWatch, removeWatch } from "@/lib/watchlist";
import { addToRoster, loadRoster } from "../lib/researchRoster";
import { companySlug } from "../lib/research";
import { prefGet, prefSet } from "@/lib/prefs";
import { useLiveQuotes, isTradingHours } from "@/hooks/useLiveQuotes";
import { cn } from "@/lib/utils";

// A 股红涨绿跌（与整个看板一致）。
const color = (v: number | null | undefined) =>
  v == null ? "text-muted-foreground" : v > 0 ? "text-danger" : v < 0 ? "text-success" : "text-muted-foreground";
const pct = (v: number | null | undefined) => (v == null ? "—" : `${v > 0 ? "+" : ""}${v}%`);

const LIVE_KEY = "vr-watchlist-live";

export function Watchlist() {
  const [codes, setCodes] = useState<string[]>(loadWatch);
  const [input, setInput] = useState("");
  const [hint, setHint] = useState<string | null>(null);
  const [joined, setJoined] = useState<Set<string>>(() => new Set(loadRoster()));
  const [researching, setResearching] = useState<string | null>(null);
  const joinResearch = async (symbol: string) => {
    if (joined.has(symbol)) return;
    setResearching(symbol); setHint(null);
    try {
      await addToRoster(symbol);
      setJoined(new Set(loadRoster()));
      setHint(/^\d{6}$/.test(symbol) ? `已加入研究名单。可打开个股研究查看资料。` : `已加入研究名单。港股 / 美股目前没有公司资料页，名单会保留。`);
    } catch (e) { setHint(String(e)); } finally { setResearching(null); }
  };
  const [live, setLive] = useState(() => prefGet(LIVE_KEY) === "on");

  const { quotes, loading, updatedAt, polling, error, refresh } = useLiveQuotes(codes, live);

  const toggleLive = () => {
    setLive((on) => {
      const next = !on;
      void prefSet(LIVE_KEY, next ? "on" : "off");
      return next;
    });
  };

  const add = () => {
    const { next, added } = addCodes(codes, input);
    if (added === 0) {
      setHint(input.trim() ? "没识别到新的 A 股、港股或美股代码（可能已在自选里）" : null);
      setInput("");
      return;
    }
    const incoming = next.filter((c) => !codes.includes(c));
    setCodes(next); setInput(""); setHint(`已添加 ${added} 只`);
    void Promise.all(incoming.map((c) => addWatch(c))).then(() => setCodes(loadWatch())).catch((e) => {
      setCodes(loadWatch());
      setHint(`没保存上：${e instanceof Error ? e.message : String(e)}`);
    });
  };
  const remove = (c: string) => {
    setCodes(codes.filter((x) => x !== c));
    void removeWatch(c).then(() => setCodes(loadWatch())).catch(() => setCodes(loadWatch()));
  };

  return (
    <div>
      <PageHeader
        title="自选股"
        subtitle="批量添加、一屏总览你关注的标的。"
        actions={
          <div className="flex items-center gap-2">
            <button
              onClick={toggleLive}
              title={live ? "关闭自动刷新" : "开启自动刷新（交易时段每次请求结束后等 3 秒；上游可能延迟）"}
              className={cn(
                "inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs transition-colors",
                live
                  ? "border-primary/50 bg-primary/10 text-primary"
                  : "border-border/60 text-muted-foreground hover:text-foreground",
              )}
            >
              <span className="relative flex h-2 w-2">
                {polling && (
                  <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-primary/70" />
                )}
                <span
                  className={cn(
                    "relative inline-flex h-2 w-2 rounded-full",
                    live ? "bg-primary" : "bg-muted-foreground/40",
                  )}
                />
              </span>
              自动刷新
            </button>
          </div>
        }
      />

      <GlassCard className="mb-4">
        <div className="flex items-center gap-2">
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                add();
              }
            }}
            rows={1}
            aria-label="批量添加自选股"
            placeholder="600519  AAPL  00700.HK"
            className="workspace-field workspace-field-single flex-1"
          />
          <button
            onClick={add}
            className="workspace-field-action"
          >
            <Plus className="h-4 w-4" /> 添加
          </button>
        </div>
        <p className="mt-2 text-xs text-muted-foreground">A 股 / 港股 / 美股，逗号、空格或换行均可。Enter 添加。</p>
        {hint && <p className="mt-1 text-xs text-muted-foreground/70">{hint}</p>}
      </GlassCard>

      <GlassCard glow>
        <div className="mb-2 flex items-center justify-between">
          <h3 className="flex items-center gap-1.5 font-semibold">
            <Star className="h-4 w-4 text-primary" /> 自选总览
            <span className="text-xs font-normal text-muted-foreground">（{codes.length}）</span>
          </h3>
          <div className="flex items-center gap-2 text-[11px] text-muted-foreground/70">
            {error ? (
              <span className="text-warning">{error}</span>
            ) : (
              <>
                {/* 把「开着却没在刷」的原因说清楚，否则用户会以为坏了 */}
                {live && !polling && codes.length > 0 && (
                  <span>{isTradingHours(codes) ? "已暂停（页面未激活）" : "当前关注市场均为非交易时段"}</span>
                )}
                {polling && <span className="text-primary/80">自动刷新 · 间隔 3 秒</span>}
                {updatedAt && (
                  <span className="font-mono" title="所显示价格中最早的数据时间；不是成交时间，上游可能延迟">
                    最早快照 {new Date(updatedAt).toLocaleString("zh-CN", { hour12: false })}
                  </span>
                )}
              </>
            )}
            <button
              onClick={refresh}
              disabled={loading}
              className="workspace-action workspace-action-compact"
              aria-label="立即刷新自选行情"
              title="立即刷新"
            >
              <RefreshCw className={cn("h-3.5 w-3.5", loading && "animate-spin")} />
            </button>
          </div>
        </div>
        {codes.length === 0 ? (
          <p className="py-8 text-center text-sm text-muted-foreground/60">
            还没有自选股，用上面的框粘贴一串代码批量添加。
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border/50 text-left text-xs text-muted-foreground">
                  {["名称", "代码", "现价", "涨跌%", "PE(TTM)", "PB", "换手%", ""].map((h) => (
                    <th key={h} className="whitespace-nowrap px-2 py-2 font-medium">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {codes.map((c) => {
                  const q = quotes[c];
                  return (
                    <tr key={c} className="border-b border-border/30">
                      <td className="px-2 py-2.5 font-medium">{q?.name || "—"}</td>
                      <td className="px-2 py-2.5 font-mono text-xs text-muted-foreground">
                        {c}
                        {q && <span className="ml-1.5 rounded border border-border px-1 py-0.5 text-[10px]">{q.currency}</span>}
                      </td>
                      <td className={cn("px-2 py-2.5 font-mono", color(q?.change_pct))}>{q?.price ?? "—"}</td>
                      <td className={cn("px-2 py-2.5 font-mono", color(q?.change_pct))}>{q ? pct(q.change_pct) : "—"}</td>
                      <td className="px-2 py-2.5 font-mono text-muted-foreground">{q?.pe_ttm ?? "—"}</td>
                      <td className="px-2 py-2.5 font-mono text-muted-foreground">{q?.pb ?? "—"}</td>
                      <td className="px-2 py-2.5 font-mono text-muted-foreground">{q?.turnover_pct ?? "—"}</td>
                      <td className="px-2 py-2.5">
                        <button
                          onClick={() => remove(c)}
                          className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground hover:bg-destructive/10 hover:text-destructive focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary"
                          aria-label={`移除 ${q?.name || c}`}
                          title="移除"
                        >
                          <X className="h-3.5 w-3.5" />
                        </button>
                        <button disabled={researching !== null || joined.has(c)} onClick={() => void joinResearch(c)} className="workspace-action workspace-action-compact ml-3">{researching === c ? '正在加入…' : joined.has(c) ? '已加入研究' : '加入研究'}</button>
                        {joined.has(c) && <Link className="workspace-action workspace-action-compact ml-2" to={`/research?company=${encodeURIComponent(companySlug(c) || c)}`}>打开研究</Link>}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </GlassCard>

      <Disclaimer />
    </div>
  );
}
