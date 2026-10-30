import { Fragment, useContext, useEffect, useMemo, useState } from "react";
import { useLocation, useNavigate, useSearchParams } from "react-router-dom";
import { ChartCandlestick, GitBranch, LayoutGrid, List, RefreshCw, TrendingUp, X } from "lucide-react";
import { PageHeader } from "../components/ui/PageHeader";
import { Disclaimer } from "../components/ui/Disclaimer";
import { WorkspaceMoreMenu } from "../components/ui/WorkspaceMoreMenu";
import { WorkspaceSearch } from "../components/ui/WorkspaceSearch";
import { useConfirm } from "../components/ui/ConfirmDialog";
import { WorkspaceTabs } from "../components/ui/WorkspaceTabs";
import { SectionLabel, Sparkline, StatusPill, TableWrap } from "../components/ui/Card";
import { ObjectCard } from "../components/ui/ObjectCard";
import { type StatusTone } from "../components/ui/StatusDot";
import { LoadingCard } from "../components/ui/LoadingCard";
import { ReadFailure } from '../components/ui/ReadFailure';
import { ResultCard } from "../components/ResearchResult";
import { addWatch, loadWatch, removeWatch } from "../lib/watchlist";
import { addToRoster, loadRoster, removeFromRoster, touchRoster } from "../lib/researchRoster";
import { aShareQualified, clipCompanyOneLiner, companyAsOfLabel, companyIndustryLabel, companySlug, wikiPages, type CompanyPageSummary, type WikiItem } from "../lib/research";
import { marketOfSymbol, normalizeMarketSymbol } from "../lib/marketSymbol";
import { hitSymbol, lonelyForeignCode, pastedCodes, searchSecurities, SECURITY_SEARCH_DELAY_MS, type SecurityHit } from "../lib/securitySearch";
import { watchPath } from "../lib/routes";
import { chainCompanyCount, chainPath, chainStages, loadUserChains, type Chain } from "../lib/chainPage";
import { companyPageProgress, companyPageStore, companyPageTaskActive, researchCell, type CompanyPageServices, type CompanyPageState } from "../lib/companyPage";
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
import { FirstOpen } from "./FirstOpen";
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
      if (!response.ok) throw new Error(response.status === 422 ? "无行情" : "读取失败");
      const value = await response.json() as { payload?: MarketPayload };
      if (!Array.isArray(value.payload?.rows)) throw new Error("数据不全");
      if (!controller.signal.aborted) setPayload(value.payload);
    }).catch(reason => { if (!controller.signal.aborted) setError(reason instanceof Error ? reason.message : "读取失败"); });
    return () => controller.abort();
  }, [symbol, retry]);
  if (error) return <p role="alert" className="py-6 text-center text-sm text-[var(--text-3)]">{error}<button type="button" className="btn btn-text btn-sm ml-3" onClick={() => setRetry(n => n + 1)}>重试</button></p>;
  if (!payload) return <LoadingCard />;
  return <ResultCard payload={payload} sourceKey={`watch:${symbol}`} />;
}

type Row = { symbol: string; name: string; quote?: Quote; summary?: CompanyPageSummary; supported: boolean };
type ItemProps = {
  row: Row; view: "grid" | "list"; state?: CompanyPageState; chartOpen: boolean;
  onOpen: () => void; onChart: () => void; onRemove: () => void; onRerun?: () => void;
};

/** One status line per row: a dot (list) or nothing (card); normal state shows nothing. */
function statusOf(state?: CompanyPageState): { tone: StatusTone; label: string } | null {
  const label = state ? companyPageProgress(state) : null;
  if (!label) return null;
  return { tone: companyPageTaskActive(state?.task) ? "run" : "wait", label };
}
const judgmentOf = (state?: CompanyPageState) => clipCompanyOneLiner(state?.research?.thesis);

function ItemView({ row, view, state, chartOpen, onOpen, onChart, onRemove, onRerun }: ItemProps) {
  const status = statusOf(state);
  const cell = state ? researchCell(state) : null;
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
      emptyText={status ? <StatusPill tone={status.tone === "run" ? "run" : "wait"}>{status.label}</StatusPill> : row.supported ? "未研究" : "暂不支持港美股"}
      data={<div className="h-7">{series && <Sparkline values={series} label={`${row.name} 近 60 日走势`} />}</div>}
      foot={[industry, asOf ? `资料截至 ${asOf}` : ""].filter(Boolean).join(" · ")}
      onOpen={row.supported ? onOpen : undefined} openLabel="打开" menu={menu} />;
  }
  return <>
    <tr className={cn("watch-row", row.supported && "cursor-pointer", chartOpen && "is-open")} onClick={event => { if (row.supported && !(event.target as HTMLElement).closest("button, a, [role=menu]")) onOpen(); }}>
      <td>
        <div className="flex items-center gap-2">
          {row.supported ? <button type="button" className="text-left font-medium hover:underline" onClick={onOpen}>{row.name}</button> : <span className="font-medium">{row.name}</span>}
        </div>
        <span className="font-mono text-[11px] text-[var(--text-3)]">{row.symbol}</span>
      </td>
      <td className={cn("col-num", tone(quote?.change_pct))}>{quote?.price != null ? financialNumber(quote.price) : "—"}</td>
      <td className={cn("col-num", tone(quote?.change_pct))}>{pct(quote?.change_pct)}</td>
      <td className="col-num text-[var(--text-2)]">{quote?.pe_ttm != null ? financialNumber(quote.pe_ttm) : "—"}</td>
      <td className="text-[var(--text-2)]">{industry || "—"}</td>
      <td className="max-w-[26rem] text-[var(--text-2)]"><span className="line-clamp-1">{judgment || <span className="text-[var(--text-4)]">—</span>}</span></td>
      <td className="watch-research" data-research-cell={row.symbol}>{row.supported
        ? cell ? <span className="watch-research-line"><span className={cell.progress ? "is-run" : undefined}>{cell.text}</span>
          {cell.progress && <i className="watch-research-bar" role="progressbar" aria-label={cell.text} aria-valuemin={0} aria-valuemax={cell.progress.total} aria-valuenow={cell.progress.done}><u style={{ width: `${cell.progress.done / Math.max(1, cell.progress.total) * 100}%` }} /></i>}
          {cell.rerun && onRerun && <button type="button" className="btn btn-sm" onClick={onRerun}>{cell.action}</button>}</span> : <span className="text-[var(--text-4)]">—</span>
        : <span className="text-[var(--text-3)]">暂不支持</span>}</td>
      <td className="col-num text-[var(--text-3)]">{asOf || "—"}</td>
      <td className="col-action"><div className="row-actions">
        {aShare && <button type="button" className="btn btn-icon" aria-expanded={chartOpen} aria-label={`${chartOpen ? "收起" : "查看"} ${row.name} K 线`} title="K 线" onClick={onChart}><ChartCandlestick /></button>}
        {menu}
      </div></td>
    </tr>
    {chartOpen && aShare && <tr className="watch-chart-row"><td colSpan={9}><WatchMarketPreview symbol={aShare} /></td></tr>}
  </>;
}

function SupportedItem(props: Omit<ItemProps, "state"> & { services: CompanyPageServices }) {
  const { services, ...rest } = props;
  const state = useCompanyPageState(services, rest.row.symbol, rest.row.name);
  const store = useMemo(() => companyPageStore(services, rest.row.symbol, rest.row.name), [services, rest.row.symbol, rest.row.name]);
  return <ItemView {...rest} state={state} onRerun={() => void store.restart()} />;
}
const Item = (props: Omit<ItemProps, "state"> & { services: CompanyPageServices }) => props.row.supported ? <SupportedItem {...props} /> : <ItemView {...props} />;

const KIND_OPTIONS = [{ value: "stocks" as const, label: "个股" }, { value: "chains" as const, label: "产业链" }];
function KindTabs({ value, onChange }: { value: "stocks" | "chains"; onChange: (value: "stocks" | "chains") => void }) {
  return <div className="mb-4"><WorkspaceTabs value={value} onChange={onChange} options={KIND_OPTIONS} aria-label="关注对象" /></div>;
}

/** 关注：自选与研究名单合并后的一张表，加卡片视图；进入即个股页。 */
export function Watch() {
  const sessions = useResearchSessions();
  const supplied = useContext(CompanyPageServicesContext);
  const services = useMemo(() => supplied ?? createCompanyPageServices(sessions), [supplied, sessions]);
  const navigate = useNavigate();
  const location = useLocation();
  const [params, setParams] = useSearchParams();
  const query = params.get("q") || "";
  const kind = params.get("kind") === "chains" ? "chains" : "stocks";
  const setKind = (value: "stocks" | "chains") => {
    const next = new URLSearchParams(params);
    if (value === "chains") next.set("kind", "chains"); else next.delete("kind");
    setParams(next, { replace: true });
  };
  const [revision, setRevision] = useState(0);
  const [pages, setPages] = useState<WikiItem[]>([]);
  const [pagesFailed, setPagesFailed] = useState(false);
  const [chains, setChains] = useState<Chain[] | undefined>(undefined);
  const [chainsFailed, setChainsFailed] = useState(false);
  const [chainsAttempt, setChainsAttempt] = useState(0);
  const [view, setView] = useState<"grid" | "list">(() => prefGet(VIEW_KEY) === "grid" ? "grid" : "list");
  const [live, setLive] = useState(() => prefGet(LIVE_KEY) === "on");
  const [hint, setHint] = useState("");
  // 搜索框里的文字同时找「加入关注」的候选；候选换新结果前保留上一批，避免逐字闪烁。
  const [found, setFound] = useState<{ q: string; items: SecurityHit[]; settled: boolean; ok: boolean }>({ q: "", items: [], settled: true, ok: true });
  const [rowError, setRowError] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const [chartOpen, setChartOpen] = useState<string | null>(null);
  const [confirmElement, ask] = useConfirm();
  const overviewKey = `finance-watch-scroll:${query}`;
  const watched = loadWatch();
  const roster = loadRoster();
  const symbols = useMemo(() => [...new Set([...roster, ...watched])], [revision, roster.join(","), watched.join(",")]); // eslint-disable-line react-hooks/exhaustive-deps
  const { quotes, loading, updatedAt, polling, error, refresh } = useLiveQuotes(symbols, live);
  useEffect(() => {
    const controller = new AbortController();
    setPagesFailed(false);
    void wikiPages("companies", controller.signal).then(value => { if (!controller.signal.aborted) setPages(value); }).catch(() => { if (!controller.signal.aborted) setPagesFailed(true); });
    return () => controller.abort();
  }, [revision]);
  useEffect(() => {
    const controller = new AbortController();
    setChainsFailed(false);
    void loadUserChains(undefined, controller.signal).then(value => { if (!controller.signal.aborted) setChains(value); }).catch(() => { if (!controller.signal.aborted) { setChains([]); setChainsFailed(true); } });
    return () => controller.abort();
  }, [chainsAttempt]);
  useEffect(() => {
    const text = query.trim();
    setHint("");
    if (!text || pastedCodes(text).length) { setFound({ q: text, items: [], settled: true, ok: true }); return; }
    const controller = new AbortController();
    setFound(previous => ({ ...previous, settled: false }));
    const timer = setTimeout(() => {
      void searchSecurities(text, controller.signal)
        .then(items => { if (!controller.signal.aborted) setFound({ q: text, items: items ?? [], settled: true, ok: items !== null }); })
        .catch(() => {});
    }, SECURITY_SEARCH_DELAY_MS);
    return () => { clearTimeout(timer); controller.abort(); };
  }, [query]);
  useEffect(() => {
    const top = Number(sessionStorage.getItem(overviewKey) || 0);
    const timer = requestAnimationFrame(() => document.getElementById("workspace-main")?.scrollTo(0, top));
    return () => cancelAnimationFrame(timer);
  }, [overviewKey]);
  const wikiBySlug = useMemo(() => new Map(pages.map(page => [page.slug, page])), [pages]);
  const rows: Row[] = symbols.map(symbol => {
    const quote = quotes[symbol];
    const page = wikiBySlug.get(companySlug(symbol) || symbol);
    return { symbol, name: quote?.name || symbol, quote, summary: page?.summary, supported: marketOfSymbol(symbol) === "CN" };
  });
  const needle = query.trim().toLowerCase();
  const visible = needle ? rows.filter(row => `${row.symbol} ${row.name}`.toLowerCase().includes(needle)) : rows;
  const text = query.trim();
  const known = new Set(symbols);
  const pasted = pastedCodes(text);
  const pending = pasted.filter(code => !known.has(code) || (marketOfSymbol(code) === "CN" && !roster.includes(code)));
  const hits = text && !pasted.length ? found.items.map(hit => ({ hit, code: hitSymbol(hit) })).filter((entry): entry is { hit: SecurityHit; code: string } => !!entry.code && !known.has(entry.code)) : [];
  const whole = !pasted.length ? normalizeMarketSymbol(text) : null;
  const foreign = lonelyForeignCode(text);
  // 名单没拉到时，输入的整串是一个 A 股代码也能直接加；拉到了就以候选为准。
  const apiDown = found.q === text && found.settled && !found.ok;
  // 纯字母可能是拼音也可能是美股代码：搜到了 A 股候选就按拼音处理，没有候选时才出「加入 AAPL」。
  const settledEmpty = found.q === text && found.settled && hits.length === 0;
  const loneCode = whole && !known.has(whole) && ((foreign === whole && settledEmpty) || (marketOfSymbol(whole) === "CN" && apiDown && !hits.some(entry => entry.code === whole))) ? whole : null;
  const joinRows: { key: string; title: string; sub?: string; codes: string[] }[] = [
    ...(pasted.length && pending.length ? [{ key: "batch", title: `加入这 ${pending.length} 只`, sub: pending.join("、"), codes: pending }] : []),
    ...hits.map(({ hit, code }) => ({ key: code, title: hit.name, sub: `${hit.symbol} · ${hit.exchange}`, codes: [code] })),
    ...(loneCode ? [{ key: loneCode, title: `加入 ${loneCode}`, sub: marketOfSymbol(loneCode) === "CN" ? undefined : "港股或美股只进关注，暂不支持研究", codes: [loneCode] }] : []),
  ];
  const searching = !!text && !(found.q === text && found.settled);
  const setView2 = (next: "grid" | "list") => { setView(next); void prefSet(VIEW_KEY, next); };
  const toggleLive = () => setLive(on => { void prefSet(LIVE_KEY, on ? "off" : "on"); return !on; });
  const open = (row: Row) => {
    sessionStorage.setItem(overviewKey, String(document.getElementById("workspace-main")?.scrollTop || 0));
    void touchRoster(row.symbol).then(() => setRevision(value => value + 1)).catch(() => {});
    navigate(watchPath(row.symbol), { state: { from: `${location.pathname}${location.search}` } });
  };
  /** 加入关注：A 股同时进研究名单，港股和美股只进自选；已在自选但不在研究名单的 A 股补进名单。 */
  const join = async (key: string, codes: string[]) => {
    if (busy) return;
    setBusy(key);
    setRowError(previous => { const { [key]: _gone, ...rest } = previous; return rest; });
    const known = new Set(symbols);
    const fresh = codes.filter(code => !known.has(code));
    const patch = codes.filter(code => known.has(code) && marketOfSymbol(code) === "CN" && !roster.includes(code));
    try {
      for (const code of [...fresh, ...patch]) {
        if (!watched.includes(code)) await addWatch(code);
        if (marketOfSymbol(code) === "CN" && !roster.includes(code)) await addToRoster(code);
      }
      const skipped = fresh.filter(code => marketOfSymbol(code) !== "CN").length;
      setHint(`已关注 ${fresh.length + patch.length} 只${skipped ? `；其中 ${skipped} 只港股或美股暂不支持研究` : ""}`);
    } catch (reason) {
      setRowError(previous => ({ ...previous, [key]: `没保存上：${reason instanceof Error ? reason.message : String(reason)}` }));
    } finally { setBusy(null); setRevision(value => value + 1); }
  };
  const remove = async (row: Row) => {
    const ok = await ask({ title: "移出关注", kicker: "关注", body: <><p>{row.name}（{row.symbol}）将从关注里移出。</p><p className="refresh-dialog-scope">研究和资料会保留。</p></>, confirmLabel: "确认移出" });
    if (!ok) return;
    setChartOpen(current => current === row.symbol ? null : current);
    try { await Promise.all([removeWatch(row.symbol), removeFromRoster(row.symbol)]); } catch { setHint("没成功 · 已刷新列表"); }
    setRevision(value => value + 1);
  };
  const pageKey = "watch:list";
  useAiPage({ key: pageKey, title: "关注", context: buildDirectorySnapshot({ heading: `关注 ${visible.length} 家公司。`, items: visible.map(row => ({ title: row.name, id: companySlug(row.symbol) || row.symbol })), loading }), suggestions: ["关注的公司里哪些最值得先看？"] });
  // 第一次打开：加入关注与研究名单后进入个股页，研究由个股页自己开始。
  const startFirst = async (symbol: string) => {
    await addWatch(symbol); await addToRoster(symbol);
    navigate(watchPath(symbol), { state: { from: `${location.pathname}${location.search}` } });
  };
  if (kind === "chains") {
    return <div>
      <PageHeader title="关注" />
      <KindTabs value="chains" onChange={setKind} />
      {chains === undefined ? <LoadingCard />
        : chainsFailed ? <ReadFailure retry={() => setChainsAttempt(value => value + 1)} />
        : !chains.length ? <p className="text-sm text-[var(--text-2)]" data-chains-empty="">在公司页或对话里新建产业链</p>
        : <div className="object-grid">{chains.map(chain => {
          const n = chainCompanyCount(chain);
          return <ObjectCard key={chain.chain_id} icon={GitBranch} tone="chain" name={chain.name}
            text={chainStages(chain)} foot={`链上已关注 ${n} 家`} to={chainPath(chain.chain_id)} openLabel="打开" />;
        })}</div>}
      <Disclaimer />
    </div>;
  }
  if (!rows.length && !needle) return <div><PageHeader title="关注" /><KindTabs value="stocks" onChange={setKind} /><FirstOpen pages={pages} onStart={startFirst} /><Disclaimer /></div>;
  const stamp = updatedAt ? `行情时点 ${new Date(updatedAt).toLocaleString("zh-CN", { hour12: false })}` : "";
  const liveNote = polling ? "自动刷新" : live && symbols.length ? (isTradingHours(symbols) ? "已暂停" : "休市") : "";
  return <div>
    <PageHeader title="关注"
      search={<WorkspaceSearch aria-label="搜索关注" placeholder="搜索名称或代码" value={query} onChange={value => { const next = new URLSearchParams(params); if (value) next.set("q", value); else next.delete("q"); setParams(next, { replace: true }); }} />}
    />
    <KindTabs value="stocks" onChange={setKind} />
    {hint && <p role="status" className="mb-4 text-xs text-[var(--text-3)]">{hint}</p>}
    {joinRows.length > 0 && <section className="watch-add card mb-6" aria-label="加入关注">
      <p className="watch-add-title">加入关注</p>
      {joinRows.map(row => <div key={row.key} className="watch-add-row" data-join={row.key}>
        <div className="watch-add-main"><span className="font-medium">{row.title}</span>{row.sub && <span className="watch-add-sub">{row.sub}</span>}</div>
        <button type="button" className="btn btn-sm" disabled={!!busy} onClick={() => void join(row.key, row.codes)}>加入关注</button>
        {rowError[row.key] && <p role="status" className="watch-add-error">{rowError[row.key]}</p>}
      </div>)}
    </section>}
    <SectionLabel aside={<span className="watch-toolbar">
      {(stamp || liveNote) && <span className="watch-stamp">{[stamp, liveNote].filter(Boolean).join(" · ")}</span>}
      <button type="button" className={cn("btn btn-text btn-sm", live && "!bg-[var(--fill-2)] !text-foreground")} aria-pressed={live} onClick={toggleLive} title="交易时段每 3 秒刷新">自动刷新</button>
      {(error || pagesFailed) && <ReadFailure retry={() => { refresh(); setRevision(value => value + 1); }} />}
      <button type="button" className="btn btn-icon" disabled={loading} onClick={refresh} aria-label="刷新行情" title="刷新"><RefreshCw className={cn(loading && "animate-spin")} /></button>
      <span role="tablist" aria-label="关注视图" className="segmented">{([["list", List, "表格"], ["grid", LayoutGrid, "卡片"]] as const).map(([id, Icon, label]) => <button key={id} type="button" role="tab" aria-label={label} aria-selected={view === id} onClick={() => setView2(id)}><Icon size={14} /></button>)}</span>
    </span>}>{needle ? `匹配 ${visible.length} / ${rows.length}` : `共 ${rows.length} 家`}</SectionLabel>
    {!visible.length ? (joinRows.length ? null : <div className="card px-6 py-14 text-center">
      <p className="text-sm text-[var(--text-2)]">{searching ? "加载中" : "没找到，试试代码或公司全称"}</p>
    </div>) : view === "grid"
      ? <div className="object-grid">{visible.map(row => <Item key={row.symbol} row={row} view={view} services={services} chartOpen={false} onOpen={() => open(row)} onChart={() => {}} onRemove={() => void remove(row)} />)}</div>
      : <TableWrap><table className="data-table"><thead><tr>
          <th>名称</th><th className="col-num">现价</th><th className="col-num">涨跌%</th><th className="col-num">PE(TTM)</th><th>行业</th><th>研究判断</th><th>研究</th><th className="col-num">资料截至</th><th className="col-action"><span className="sr-only">操作</span></th>
        </tr></thead><tbody>{visible.map(row => <Fragment key={row.symbol}><Item row={row} view={view} services={services} chartOpen={chartOpen === row.symbol} onOpen={() => open(row)} onChart={() => setChartOpen(current => current === row.symbol ? null : row.symbol)} onRemove={() => void remove(row)} /></Fragment>)}</tbody></table></TableWrap>}
    {confirmElement}
    <Disclaimer />
  </div>;
}
