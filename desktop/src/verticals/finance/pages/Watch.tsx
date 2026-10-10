import { Fragment, useContext, useEffect, useMemo, useState } from "react";
import { Link, useLocation, useNavigate, useSearchParams } from "react-router-dom";
import { ChartCandlestick, LayoutGrid, List, Plus, RefreshCw, TrendingUp, X } from "lucide-react";
import { PageHeader } from "../components/ui/PageHeader";
import { Disclaimer } from "../components/ui/Disclaimer";
import { WorkspaceMoreMenu } from "../components/ui/WorkspaceMoreMenu";
import { WorkspaceSearch } from "../components/ui/WorkspaceSearch";
import { useConfirm } from "../components/ui/ConfirmDialog";
import { SectionLabel, Sparkline, StatusPill, TableWrap } from "../components/ui/Card";
import { ObjectCard } from "../components/ui/ObjectCard";
import { StatusDot, type StatusTone } from "../components/ui/StatusDot";
import { ResearchLoading } from "../components/ui/ResearchLoading";
import { ResultCard } from "../components/ResearchResult";
import { addCodes, addWatch, loadWatch, removeWatch } from "../lib/watchlist";
import { addToRoster, loadRoster, removeFromRoster, touchRoster } from "../lib/researchRoster";
import { aShareQualified, clipCompanyOneLiner, companyAsOfLabel, companyIndustryLabel, companySlug, researchRead, wikiPages, type CompanyPageSummary, type WikiItem } from "../lib/research";
import { marketOfSymbol } from "../lib/marketSymbol";
import { watchPath } from "../lib/routes";
import { companyPageProgress, companyPageTaskActive, type CompanyPageServices, type CompanyPageState } from "../lib/companyPage";
import { createCompanyPageServices } from "../lib/companyPageServices";
import { useCloseSeries } from "../lib/closeSeries";
import { useLiveQuotes, isTradingHours } from "../hooks/useLiveQuotes";
import { useResearchSessions } from "../dsh/research-session";
import { useAiPage } from "../../../core/ai/pageContext";
import { buildDirectorySnapshot } from "../assistant/snapshot";
import { prefGet, prefSet } from "../lib/prefs";
import { financialNumber } from "../lib/financialDisplay";
import type { Quote } from "../lib/api";
import { cn } from "@/lib/utils";
import { CompanyPageServicesContext, useCompanyPageState } from "./CompanyPage";
import "./company-page.css";

const VIEW_KEY = "vr-company-roster-view";
const LIVE_KEY = "vr-watchlist-live";
// A 股红涨绿跌。
const tone = (v: number | null | undefined) => v == null || v === 0 ? "" : v > 0 ? "text-up" : "text-down";
const pct = (v: number | null | undefined) => v == null ? "—" : `${v > 0 ? "+" : ""}${financialNumber(v)}%`;
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
  if (error) return <p role="alert" className="py-6 text-center text-sm text-[var(--text-3)]">{error}<button type="button" className="btn btn-text btn-sm ml-3" onClick={() => setRetry(n => n + 1)}>重试</button></p>;
  if (!payload) return <ResearchLoading compact title="正在读取行情" sections={["日线", "均线", "来源"]} />;
  return <ResultCard payload={payload} sourceKey={`watch:${symbol}`} />;
}

type Row = { symbol: string; name: string; quote?: Quote; summary?: CompanyPageSummary; supported: boolean; industryReady: boolean };
type ItemProps = {
  row: Row; view: "grid" | "list"; state?: CompanyPageState; chartOpen: boolean;
  onOpen: () => void; onChart: () => void; onRemove: () => void;
};

/** One status line per row: a dot (list) or nothing (card); normal state shows nothing. */
function statusOf(state?: CompanyPageState): { tone: StatusTone; label: string } | null {
  const label = state ? companyPageProgress(state) : null;
  if (!label) return null;
  return { tone: companyPageTaskActive(state?.task) ? "run" : "wait", label };
}
const judgmentOf = (state?: CompanyPageState) => clipCompanyOneLiner(state?.research?.sections.find(section => section.id === 0)?.summary);

function ItemView({ row, view, state, chartOpen, onOpen, onChart, onRemove }: ItemProps) {
  const status = statusOf(state);
  const judgment = judgmentOf(state);
  const industry = companyIndustryLabel(row.summary);
  const asOf = companyAsOfLabel(row.summary?.as_of);
  const quote = row.quote;
  const aShare = row.supported ? aShareQualified(row.symbol) : null;
  const series = useCloseSeries(row.symbol, view === "grid" && row.supported);
  const menu = <WorkspaceMoreMenu actions={[{ id: "remove", label: "移出关注", icon: <X size={14} />, onSelect: onRemove }]} />;
  if (view === "grid") {
    return <ObjectCard icon={TrendingUp} tone="stock" name={row.name} code={row.symbol}
      keyValue={quote?.price != null ? <><div className="font-semibold">{financialNumber(quote.price)}</div><div className={cn("text-xs", tone(quote.change_pct))}>{pct(quote.change_pct)}</div></> : <span className="text-[var(--text-4)]">—</span>}
      text={judgment}
      emptyText={status ? <StatusPill tone={status.tone === "run" ? "run" : "wait"}>{status.label}</StatusPill> : row.supported ? "首次打开个股页时开始研究" : "港股、美股暂不支持个股页"}
      data={<div className="h-7">{series && <Sparkline values={series} label={`${row.name} 近 60 日走势`} />}</div>}
      foot={[industry, asOf ? `资料截至 ${asOf}` : ""].filter(Boolean).join(" · ")}
      onOpen={row.supported ? onOpen : undefined} openLabel="打开个股页" menu={menu} />;
  }
  return <>
    <tr className={cn("watch-row", row.supported && "cursor-pointer", chartOpen && "is-open")} onClick={event => { if (row.supported && !(event.target as HTMLElement).closest("button, a, [role=menu]")) onOpen(); }}>
      <td>
        <div className="flex items-center gap-2">
          {row.supported ? <button type="button" className="text-left font-medium hover:underline" onClick={onOpen}>{row.name}</button> : <span className="font-medium">{row.name}</span>}
          {status && <StatusDot tone={status.tone} label={status.label} />}
        </div>
        <span className="font-mono text-[11px] text-[var(--text-3)]">{row.symbol}</span>
      </td>
      <td className={cn("col-num", tone(quote?.change_pct))}>{quote?.price != null ? financialNumber(quote.price) : "—"}</td>
      <td className={cn("col-num", tone(quote?.change_pct))}>{pct(quote?.change_pct)}</td>
      <td className="col-num text-[var(--text-2)]">{quote?.pe_ttm != null ? financialNumber(quote.pe_ttm) : "—"}</td>
      <td className="text-[var(--text-2)]">{industry && row.industryReady && row.summary?.industry_code
        ? <Link className="hover:underline" to={`/sectors/profiles/${encodeURIComponent(row.summary.industry_code.trim())}`}>{industry}</Link> : industry || "—"}</td>
      <td className="max-w-[26rem] text-[var(--text-2)]"><span className="line-clamp-1">{judgment || <span className="text-[var(--text-4)]">—</span>}</span></td>
      <td className="col-num text-[var(--text-3)]">{asOf || "—"}</td>
      <td className="col-action"><div className="row-actions">
        {aShare && <button type="button" className="btn btn-icon" aria-expanded={chartOpen} aria-label={`${chartOpen ? "收起" : "查看"} ${row.name} K 线`} title="K 线" onClick={onChart}><ChartCandlestick /></button>}
        {menu}
      </div></td>
    </tr>
    {chartOpen && aShare && <tr className="watch-chart-row"><td colSpan={8}><WatchMarketPreview symbol={aShare} /></td></tr>}
  </>;
}

function SupportedItem(props: Omit<ItemProps, "state"> & { services: CompanyPageServices }) {
  const { services, ...rest } = props;
  const state = useCompanyPageState(services, rest.row.symbol, rest.row.name);
  return <ItemView {...rest} state={state} />;
}
const Item = (props: Omit<ItemProps, "state"> & { services: CompanyPageServices }) => props.row.supported ? <SupportedItem {...props} /> : <ItemView {...props} />;

/** 关注：自选与研究名单合并后的一张表，加卡片视图；进入即个股页。 */
export function Watch() {
  const sessions = useResearchSessions();
  const supplied = useContext(CompanyPageServicesContext);
  const services = useMemo(() => supplied ?? createCompanyPageServices(sessions), [supplied, sessions]);
  const navigate = useNavigate();
  const location = useLocation();
  const [params, setParams] = useSearchParams();
  const query = params.get("q") || "";
  const [revision, setRevision] = useState(0);
  const [pages, setPages] = useState<WikiItem[]>([]);
  const [view, setView] = useState<"grid" | "list">(() => prefGet(VIEW_KEY) === "grid" ? "grid" : "list");
  const [live, setLive] = useState(() => prefGet(LIVE_KEY) === "on");
  const [adding, setAdding] = useState(false);
  const [input, setInput] = useState("");
  const [hint, setHint] = useState("");
  const [chartOpen, setChartOpen] = useState<string | null>(null);
  const [readyProfiles, setReadyProfiles] = useState(new Set<string>());
  const [confirmElement, ask] = useConfirm();
  const overviewKey = `finance-watch-scroll:${query}`;
  const watched = loadWatch();
  const roster = loadRoster();
  const symbols = useMemo(() => [...new Set([...roster, ...watched])], [revision, roster.join(","), watched.join(",")]); // eslint-disable-line react-hooks/exhaustive-deps
  const { quotes, loading, updatedAt, polling, error, refresh } = useLiveQuotes(symbols, live);
  useEffect(() => {
    const controller = new AbortController();
    void wikiPages("companies", controller.signal).then(value => { if (!controller.signal.aborted) setPages(value); }).catch(() => {});
    void researchRead<{ items: { code?: string; industry_code?: string; status: string }[] }>("/industries/profiles", { signal: controller.signal })
      .then(result => { if (!controller.signal.aborted) setReadyProfiles(new Set(result.items.filter(item => item.status === "ready").map(item => (item.industry_code || item.code || "").toUpperCase()))); }).catch(() => {});
    return () => controller.abort();
  }, [revision]);
  useEffect(() => {
    const top = Number(sessionStorage.getItem(overviewKey) || 0);
    const timer = requestAnimationFrame(() => document.getElementById("workspace-main")?.scrollTo(0, top));
    return () => cancelAnimationFrame(timer);
  }, [overviewKey]);
  const wikiBySlug = useMemo(() => new Map(pages.map(page => [page.slug, page])), [pages]);
  const rows: Row[] = symbols.map(symbol => {
    const quote = quotes[symbol];
    const page = wikiBySlug.get(companySlug(symbol) || symbol);
    return { symbol, name: quote?.name || page?.title || symbol, quote, summary: page?.summary, supported: marketOfSymbol(symbol) === "CN", industryReady: readyProfiles.has((page?.summary?.industry_code || "").toUpperCase()) };
  });
  const needle = query.trim().toLowerCase();
  const visible = needle ? rows.filter(row => `${row.symbol} ${row.name}`.toLowerCase().includes(needle)) : rows;
  const setView2 = (next: "grid" | "list") => { setView(next); void prefSet(VIEW_KEY, next); };
  const toggleLive = () => setLive(on => { void prefSet(LIVE_KEY, on ? "off" : "on"); return !on; });
  const open = (row: Row) => {
    sessionStorage.setItem(overviewKey, String(document.getElementById("workspace-main")?.scrollTop || 0));
    void touchRoster(row.symbol).then(() => setRevision(value => value + 1)).catch(() => {});
    navigate(watchPath(row.symbol), { state: { from: `${location.pathname}${location.search}` } });
  };
  const add = async () => {
    const known = new Set(symbols);
    const parsed = addCodes([], input).next;
    if (!parsed.length) { setHint(input.trim() ? "没识别到 A 股、港股或美股代码" : ""); return; }
    // 已在自选但尚未进研究名单的 A 股也补进名单，保持两边一致。
    const fresh = parsed.filter(code => !known.has(code));
    const patch = parsed.filter(code => known.has(code) && marketOfSymbol(code) === "CN" && !roster.includes(code));
    if (!fresh.length && !patch.length) { setHint("这些代码已在关注里"); setInput(""); return; }
    try {
      for (const code of [...fresh, ...patch]) {
        if (!watched.includes(code)) await addWatch(code);
        if (marketOfSymbol(code) === "CN" && !roster.includes(code)) await addToRoster(code);
      }
      const skipped = fresh.filter(code => marketOfSymbol(code) !== "CN").length;
      setHint(`已关注 ${fresh.length + patch.length} 只${skipped ? `；其中 ${skipped} 只港股或美股暂不支持个股页` : ""}`);
      setInput(""); setRevision(value => value + 1);
    } catch (reason) { setHint(`没保存上：${reason instanceof Error ? reason.message : String(reason)}`); setRevision(value => value + 1); }
  };
  const remove = async (row: Row) => {
    const ok = await ask({ title: "移出关注", kicker: "关注", body: <><p>{row.name}（{row.symbol}）将从关注里移出。</p><p className="refresh-dialog-scope">只移出关注，已有研究和资料不受影响。</p></>, confirmLabel: "确认移出" });
    if (!ok) return;
    setChartOpen(current => current === row.symbol ? null : current);
    try { await Promise.all([removeWatch(row.symbol), removeFromRoster(row.symbol)]); } catch { setHint("移出关注暂时未能完成，列表已按当前状态刷新"); }
    setRevision(value => value + 1);
  };
  const pageKey = "watch:list";
  useAiPage({ key: pageKey, title: "关注", context: buildDirectorySnapshot({ heading: `关注 ${visible.length} 家公司。`, items: visible.map(row => ({ title: row.name, id: companySlug(row.symbol) || row.symbol })), loading }), suggestions: ["关注的公司里哪些最值得先看？"] });
  const stamp = updatedAt ? `行情时点 ${new Date(updatedAt).toLocaleString("zh-CN", { hour12: false })}` : "";
  const liveNote = error ? error : polling ? "自动刷新 · 间隔 3 秒" : live && symbols.length ? (isTradingHours(symbols) ? "已暂停（页面未激活）" : "当前关注市场均为非交易时段") : "";
  return <div>
    <PageHeader title="关注"
      search={<WorkspaceSearch aria-label="搜索关注" placeholder="搜索名称或代码" value={query} onChange={value => { const next = new URLSearchParams(params); if (value) next.set("q", value); else next.delete("q"); setParams(next, { replace: true }); }} />}
      actions={<button type="button" className="btn btn-primary" aria-expanded={adding} onClick={() => setAdding(value => !value)}><Plus />添加关注</button>} />
    {adding && <div className="card mb-6 p-4">
      <div className="flex items-center gap-2">
        <textarea value={input} onChange={event => setInput(event.target.value)} rows={1} aria-label="添加关注" placeholder="600519  AAPL  00700.HK"
          onKeyDown={event => { if (event.key === "Enter" && !event.shiftKey) { event.preventDefault(); void add(); } }}
          className="workspace-field workspace-field-single flex-1" />
        <button type="button" className="btn" onClick={() => void add()}>添加</button>
      </div>
      <p className="mt-2 text-xs text-[var(--text-3)]">A 股 / 港股 / 美股，逗号、空格或换行均可；添加后同时进入自选与研究名单。{hint && <span className="ml-2 text-[var(--text-2)]">{hint}</span>}</p>
    </div>}
    {!adding && hint && <p role="status" className="mb-4 text-xs text-[var(--text-3)]">{hint}</p>}
    <SectionLabel aside={<span className="inline-flex items-center gap-1">
      {[stamp, liveNote].filter(Boolean).join(" · ")}
      <button type="button" className={cn("btn btn-text btn-sm", live && "!bg-[var(--fill-2)] !text-foreground")} aria-pressed={live} onClick={toggleLive} title="开启自动刷新（交易时段每次请求结束后等 3 秒；上游可能延迟）">自动刷新</button>
      <button type="button" className="btn btn-icon" disabled={loading} onClick={refresh} aria-label="立即刷新行情" title="立即刷新"><RefreshCw className={cn(loading && "animate-spin")} /></button>
      <span role="tablist" aria-label="关注视图" className="segmented">{([["list", List, "表格"], ["grid", LayoutGrid, "卡片"]] as const).map(([id, Icon, label]) => <button key={id} type="button" role="tab" aria-label={label} aria-selected={view === id} onClick={() => setView2(id)}><Icon size={14} /></button>)}</span>
    </span>}>{needle ? `匹配 ${visible.length} / ${rows.length}` : `共 ${rows.length} 家`}</SectionLabel>
    {!visible.length ? <div className="card px-6 py-14 text-center">
      <p className="text-sm text-[var(--text-2)]">{rows.length ? "没有匹配的公司" : "还没有关注的公司。添加后会出现在这里，进入个股页即可开始研究。"}</p>
      {!rows.length && <button type="button" className="btn btn-primary mt-4" onClick={() => setAdding(true)}><Plus />添加关注</button>}
    </div> : view === "grid"
      ? <div className="object-grid">{visible.map(row => <Item key={row.symbol} row={row} view={view} services={services} chartOpen={false} onOpen={() => open(row)} onChart={() => {}} onRemove={() => void remove(row)} />)}</div>
      : <TableWrap><table className="data-table"><thead><tr>
          <th>名称</th><th className="col-num">现价</th><th className="col-num">涨跌%</th><th className="col-num">PE(TTM)</th><th>行业</th><th>研究判断</th><th className="col-num">资料截至</th><th className="col-action"><span className="sr-only">操作</span></th>
        </tr></thead><tbody>{visible.map(row => <Fragment key={row.symbol}><Item row={row} view={view} services={services} chartOpen={chartOpen === row.symbol} onOpen={() => open(row)} onChart={() => setChartOpen(current => current === row.symbol ? null : row.symbol)} onRemove={() => void remove(row)} /></Fragment>)}</tbody></table></TableWrap>}
    {confirmElement}
    <Disclaimer />
  </div>;
}
