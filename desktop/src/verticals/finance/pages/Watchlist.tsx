import { Fragment, useEffect, useRef, useState, type KeyboardEvent } from "react";
import { createPortal } from "react-dom";
import { Link } from "react-router-dom";
import { ChartCandlestick, Plus, RefreshCw, Star, X } from "lucide-react";
import { PageHeader } from "@/components/ui/PageHeader";
import { GlassCard } from "@/components/ui/GlassCard";
import { Disclaimer } from "@/components/ui/Disclaimer";
import "../components/refresh-confirm.css";
import { addCodes, addWatch, loadWatch, removeWatch } from "@/lib/watchlist";
import { addToRoster, loadRoster } from "../lib/researchRoster";
import { aShareQualified, companySlug } from "../lib/research";
import { ResultCard } from "../components/ResearchResult";
import { ResearchLoading } from "../components/ui/ResearchLoading";
import { marketOfSymbol } from "../lib/marketSymbol";
import { prefGet, prefSet } from "@/lib/prefs";
import { useLiveQuotes, isTradingHours } from "@/hooks/useLiveQuotes";
import { cn } from "@/lib/utils";

// A 股红涨绿跌（与整个看板一致）。
const color = (v: number | null | undefined) =>
  v == null ? "text-muted-foreground" : v > 0 ? "text-danger" : v < 0 ? "text-success" : "text-muted-foreground";
const pct = (v: number | null | undefined) => (v == null ? "—" : `${v > 0 ? "+" : ""}${v}%`);

const LIVE_KEY = "vr-watchlist-live";

type MarketPayload = Parameters<typeof ResultCard>[0]["payload"];

/** Read-only K-line for one A-share, same card as the deep conversation; nothing is saved as a research result. */
function WatchMarketPreview({ symbol }: { symbol: string }) {
  const [payload, setPayload] = useState<MarketPayload>();
  const [error, setError] = useState("");
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    setPayload(undefined); setError("");
    void fetch("/finance-research/research-results/market/preview", {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ symbol }), signal: controller.signal,
    }).then(async response => {
      if (!response.ok) throw new Error(response.status === 422 ? "暂时没有这只股票的行情" : "行情暂时无法读取");
      const value = await response.json() as { payload?: MarketPayload };
      if (!Array.isArray(value.payload?.rows)) throw new Error("行情数据不完整");
      if (!controller.signal.aborted) setPayload(value.payload);
    }).catch(reason => { if (!controller.signal.aborted) setError(reason instanceof Error ? reason.message : "行情暂时无法读取"); });
    return () => controller.abort();
  }, [symbol, retry]);
  if (error) return <p role="alert" className="py-6 text-center text-sm text-muted-foreground">{error}<button type="button" className="ml-3 text-primary hover:underline" onClick={() => setRetry(n => n + 1)}>重试</button></p>;
  if (!payload) return <ResearchLoading compact title="正在读取行情" sections={["日线", "均线", "来源"]} />;
  return <ResultCard payload={payload} sourceKey={`watch:${symbol}`} />;
}

function WatchRemoveDialog({ name, symbol, onCancel, onConfirm }: {
  name: string; symbol: string; onCancel: () => void; onConfirm: () => void;
}) {
  const dialogRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const id = window.setTimeout(() => dialogRef.current?.focus(), 0);
    return () => { window.clearTimeout(id); document.body.style.overflow = previousOverflow; };
  }, []);
  const onDialogKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === "Escape") { event.stopPropagation(); onCancel(); return; }
    if (event.key !== "Tab") return;
    const controls = Array.from(dialogRef.current?.querySelectorAll<HTMLElement>("button:not(:disabled), a[href]") || []);
    if (!controls.length) { event.preventDefault(); return; }
    const first = controls[0]!;
    const last = controls[controls.length - 1]!;
    if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
    else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
  };
  return createPortal(
    <div className="refresh-dialog-backdrop" onMouseDown={event => { if (event.target === event.currentTarget) onCancel(); }}>
      <div ref={dialogRef} role="dialog" aria-modal="true" aria-labelledby="watch-remove-title" tabIndex={-1}
        className="refresh-dialog" onKeyDown={onDialogKeyDown}>
        <header className="refresh-dialog-header">
          <div>
            <p className="refresh-dialog-kicker">自选股 · 列表维护</p>
            <h2 id="watch-remove-title">从自选移除</h2>
            <p className="refresh-dialog-subtitle">{name}</p>
          </div>
          <button type="button" className="refresh-dialog-close" aria-label="关闭" onClick={onCancel}><X size={18} /></button>
        </header>
        <div className="refresh-dialog-body">
          <p className="refresh-dialog-lead">将这只股票从自选列表移除。</p>
          <div className="refresh-source-card">
            <span className="refresh-source-label">自选标的</span>
            <strong className="refresh-source-title">{name}</strong>
            <span className="refresh-source-date">{symbol}</span>
          </div>
          <p className="refresh-dialog-scope">只从自选列表去掉，研究名单和已有资料不受影响。</p>
        </div>
        <footer className="refresh-dialog-footer">
          <button type="button" className="workspace-action" onClick={onCancel}>取消</button>
          <button type="button" className="workspace-action workspace-action-primary" onClick={onConfirm}>确认移除</button>
        </footer>
      </div>
    </div>,
    document.body,
  );
}

export function Watchlist() {
  const [codes, setCodes] = useState<string[]>(loadWatch);
  const [input, setInput] = useState("");
  const [hint, setHint] = useState<string | null>(null);
  const [joined, setJoined] = useState<Set<string>>(() => new Set(loadRoster()));
  const [researching, setResearching] = useState<string | null>(null);
  const [marketNotice, setMarketNotice] = useState<{ symbol: string; id: number } | null>(null);
  const marketNoticeTimer = useRef<number | null>(null);
  useEffect(() => () => {
    if (marketNoticeTimer.current) window.clearTimeout(marketNoticeTimer.current);
  }, []);
  const remindUnsupportedMarket = (symbol: string) => {
    if (marketNoticeTimer.current) window.clearTimeout(marketNoticeTimer.current);
    setMarketNotice({ symbol, id: Date.now() });
    marketNoticeTimer.current = window.setTimeout(() => setMarketNotice(null), 2600);
  };
  const joinResearch = async (symbol: string) => {
    if (joined.has(symbol)) return;
    if (marketOfSymbol(symbol) !== "CN") {
      remindUnsupportedMarket(symbol);
      return;
    }
    setResearching(symbol); setHint(null);
    try {
      await addToRoster(symbol);
      setJoined(new Set(loadRoster()));
      setHint("已加入研究名单。可打开个股研究查看资料。");
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
  const [chartOpen, setChartOpen] = useState<string | null>(null);
  const [pendingRemove, setPendingRemove] = useState<{ symbol: string; name: string } | null>(null);
  const removeTriggerRef = useRef<HTMLButtonElement | null>(null);
  const closeRemove = () => {
    setPendingRemove(null);
    removeTriggerRef.current?.focus();
  };
  const confirmRemove = () => {
    const symbol = pendingRemove?.symbol;
    if (!symbol) return;
    setChartOpen(open => open === symbol ? null : open);
    setPendingRemove(null);
    setCodes(codes.filter((x) => x !== symbol));
    void removeWatch(symbol).then(() => setCodes(loadWatch())).catch(() => setCodes(loadWatch()));
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
                    最早数据时间 {new Date(updatedAt).toLocaleString("zh-CN", { hour12: false })}
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
            <table className="watch-table">
              <thead>
                <tr>
                  <th>名称</th>
                  <th>代码</th>
                  <th className="watch-col-num">现价</th>
                  <th className="watch-col-num">涨跌%</th>
                  <th className="watch-col-num">PE(TTM)</th>
                  <th className="watch-col-num">PB</th>
                  <th className="watch-col-num">换手%</th>
                  <th className="watch-col-action">行情</th>
                  <th className="watch-col-action">研究</th>
                  <th className="watch-col-action">操作</th>
                </tr>
              </thead>
              <tbody>
                {codes.map((c) => {
                  const q = quotes[c];
                  const aShare = marketOfSymbol(c) === "CN" ? aShareQualified(c) : null;
                  const open = chartOpen === c;
                  const removing = pendingRemove?.symbol === c;
                  return (
                    <Fragment key={c}>
                    <tr className={cn("watch-row", open && "is-open", removing && "is-pending")}>
                      <td className="font-medium">{q?.name || "—"}</td>
                      <td className="font-mono text-xs text-muted-foreground">
                        {c}
                        {q && <span className="ml-1.5 rounded border border-border px-1 py-0.5 text-[10px]">{q.currency}</span>}
                      </td>
                      <td className={cn("watch-col-num font-mono", color(q?.change_pct))}>{q?.price ?? "—"}</td>
                      <td className={cn("watch-col-num font-mono", color(q?.change_pct))}>{q ? pct(q.change_pct) : "—"}</td>
                      <td className="watch-col-num font-mono text-muted-foreground">{q?.pe_ttm ?? "—"}</td>
                      <td className="watch-col-num font-mono text-muted-foreground">{q?.pb ?? "—"}</td>
                      <td className="watch-col-num font-mono text-muted-foreground">{q?.turnover_pct ?? "—"}</td>
                      <td className="watch-col-action">
                        {aShare
                          ? <button type="button" aria-expanded={open} aria-label={`${open ? "收起" : "查看"} ${q?.name || c} K 线`}
                              onClick={() => setChartOpen(open ? null : c)} className={cn("watch-kline-toggle", open && "is-open")}>
                              <ChartCandlestick />K 线
                            </button>
                          : <span className="px-2 text-muted-foreground/60">—</span>}
                      </td>
                      <td className="watch-col-action">
                        {joined.has(c)
                          ? <Link className="workspace-action workspace-action-compact watch-research-action" to={`/research?company=${encodeURIComponent(companySlug(c) || c)}`}>打开研究</Link>
                          : <button type="button" disabled={researching !== null} onClick={() => void joinResearch(c)} className="workspace-action workspace-action-compact watch-research-action">{researching === c ? "正在加入…" : "加入研究"}</button>}
                        {marketNotice?.symbol === c && (
                          <span key={marketNotice.id} role="status" className="watch-market-notice">暂不支持港美股</span>
                        )}
                      </td>
                      <td className="watch-col-action">
                        <button
                          type="button"
                          onClick={event => {
                            removeTriggerRef.current = event.currentTarget;
                            setPendingRemove({ symbol: c, name: q?.name || c });
                          }}
                          className="workspace-action workspace-action-compact watch-remove-action"
                          aria-label={`从自选移除 ${q?.name || c}`}
                        >
                          移除
                        </button>
                      </td>
                    </tr>
                    {open && aShare && <tr className="watch-chart-row"><td colSpan={10}><WatchMarketPreview symbol={aShare} /></td></tr>}
                    </Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </GlassCard>

      {pendingRemove && <WatchRemoveDialog
        name={pendingRemove.name}
        symbol={pendingRemove.symbol}
        onCancel={closeRemove}
        onConfirm={confirmRemove}
      />}

      <Disclaimer />
    </div>
  );
}
