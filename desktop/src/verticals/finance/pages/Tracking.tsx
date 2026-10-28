import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { ChevronDown, Plus } from "lucide-react";
import { PageHeader } from "../components/ui/PageHeader";
import { Disclaimer } from "../components/ui/Disclaimer";
import { LoadingCard } from "../components/ui/LoadingCard";
import { SectionLabel } from "../components/ui/Card";
import { StatusDot, type StatusTone } from "../components/ui/StatusDot";
import { useAiPage } from "../../../core/ai/pageContext";
import { orderedCompanies, priceText, sensitivityStep, signedPriceText, variableLine, type TrackedVariable } from "../lib/trackingVariables";
import {
  KIND_LABEL, SIGNAL_KINDS, TIMELINE_H, TIMELINE_W, addPrice, asTrackingVariables, loadCatalog, loadNextReports, loadTrackingItems, nextReportWhen, observationGroups, priceVariable, setMuted, setSignalKind, summaryOf, timelineOf,
  type CatalogPrice, type NextReport, type ObservationItem, type PriceItem, type SignalKind, type TrackingItem, type TrackingList,
} from "../lib/trackingItems";
import { Detail, toneClass } from "./VariableDesk";
import { loadFlipLines, type FlipLine } from "../lib/flipCards";
import { TREND_H, TREND_W, trendOf } from "../lib/trendChart";
import { storageGet, storageSet } from "../lib/storage";
import "./tracking.css";

/** 跟踪：「正在盯的」是研究带出的、你自己加的价格，和对话里「开始观察」的判断。默认折叠一行一项，走势与信号在展开里。研究进度在关注页的「研究」列。 */
export function Tracking() {
  useAiPage({ key: "tracking", title: "跟踪", context: "跟踪页：正在盯的价格、观察中的判断和它们的走势", suggestions: ["最近哪些价格动得最大？"] });
  return <div>
    <PageHeader title="跟踪" />
    <div className="tracking"><Watching><NextReports /></Watching></div>
    <Disclaimer />
  </div>;
}

const VISIBLE = 6;
function Note({ children }: { children: ReactNode }) { return <p className="tracking-note">{children}</p>; }
function Retry({ onClick }: { onClick: () => void }) { return <button type="button" className="btn btn-text btn-sm" onClick={onClick}>重试</button>; }

const OPEN_KEY = "finance.trackingOpen";
const readOpen = (): Set<string> => {
  try { const raw = JSON.parse(storageGet(OPEN_KEY) ?? "[]"); return new Set(Array.isArray(raw) ? raw.filter((item): item is string => typeof item === "string") : []); } catch { return new Set(); }
};
const mmdd = (date: string) => date.slice(5);

function Watching({ children }: { children?: ReactNode }) {
  const [list, setList] = useState<TrackingList | undefined>(undefined);
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [open, setOpen] = useState<Set<string>>(readOpen);
  const [all, setAll] = useState(false);
  const [lines, setLines] = useState<FlipLine[]>([]);
  const [notice, setNotice] = useState("");
  const [adding, setAdding] = useState(false);
  const [showMuted, setShowMuted] = useState(false);
  const reload = useCallback((signal?: AbortSignal) => loadTrackingItems(signal).then(value => { if (!signal?.aborted) { setList(value); setFailed(false); } }), []);
  useEffect(() => {
    const controller = new AbortController();
    setList(undefined); setFailed(false);
    reload(controller.signal).catch(error => {
      if (controller.signal.aborted) return;
      console.warn("[finance/tracking] items unavailable", error);
      setFailed(true);
    });
    return () => controller.abort();
  }, [attempt, reload]);
  useEffect(() => {
    const controller = new AbortController();
    setLines([]);
    if (list) loadFlipLines(asTrackingVariables(list), controller.signal).then(items => { if (!controller.signal.aborted) setLines(items); }, () => {});
    return () => controller.abort();
  }, [list]);
  const toggle = (id: string) => setOpen(current => {
    const next = new Set(current);
    if (!next.delete(id)) next.add(id);
    storageSet(OPEN_KEY, JSON.stringify([...next]));
    return next;
  });
  /** 一次只做一件事；失败写一句话，成功后重新读清单。 */
  const act = async (work: () => Promise<unknown>, failure: string) => {
    setNotice("");
    try { await work(); await reload(); } catch (error) { console.warn("[finance/tracking] change failed", error); setNotice(failure); }
  };
  const mute = (item: TrackingItem, muted: boolean) => act(() => setMuted(item.id, muted), "没成功");
  const add = (varId: string) => act(async () => { await addPrice(varId); setAdding(false); }, "没成功");
  const changeKind = (item: ObservationItem, signalId: string, kind: SignalKind) => act(() => setSignalKind(item.id, signalId, kind), "没成功");

  const taken = useMemo(() => new Set([...(list?.items ?? []), ...(list?.muted ?? [])].flatMap(item => item.kind === "price" ? [item.var_id] : [])), [list]);
  let body;
  if (failed) body = <Note>读取失败 <Retry onClick={() => setAttempt(value => value + 1)} /></Note>;
  else if (list === undefined) body = <LoadingCard />;
  else {
    const prices = list.items.filter((item): item is PriceItem => item.kind === "price");
    // 有提醒的价格排前，其余保持原顺序；观察项排在价格后面。
    const alerted = (item: PriceItem) => item.cards.length > 0;
    const rows: TrackingItem[] = [...prices.filter(alerted), ...prices.filter(item => !alerted(item)), ...list.items.filter(item => item.kind === "observation")];
    const shown = all ? rows : rows.slice(0, VISIBLE);
    body = <>
      {rows.length ? <div className="card tracking-card">{shown.filter((item): item is PriceItem => item.kind === "price").map(item =>
        <PriceRow key={item.id} item={item} line={lines.find(entry => entry.varId === item.var_id)} expanded={open.has(item.id)} onToggle={() => toggle(item.id)} onMute={() => void mute(item, true)} />)}
      {observationGroups(shown.filter((item): item is ObservationItem => item.kind === "observation")).map(group => <section key={group.topicId} data-observation-group={group.topicId}>
        <p className="tracking-observation-title">{group.title}</p>
        {group.items.map(item => <ObservationRow key={item.id} item={item} expanded={open.has(item.id)} onToggle={() => toggle(item.id)} onMute={() => void mute(item, true)} onKind={(signalId, kind) => void changeKind(item, signalId, kind)} />)}
      </section>)}
      {rows.length > shown.length && <button type="button" className="tracking-more" onClick={() => setAll(true)}>另外 {rows.length - shown.length} 项</button>}</div>
        : <Note>研究过的公司会带出价格，也可以自己添加。</Note>}
      {notice && <p role="alert" className="tracking-foot">{notice}</p>}
      {children}
      {list.muted.length > 0 && <div className="tracking-muted" data-tracking-muted="">
        <button type="button" className="tracking-more" aria-expanded={showMuted} onClick={() => setShowMuted(value => !value)}>已移出 {list.muted.length} 项</button>
        {showMuted && list.muted.map(item => <div key={item.id} className="tracking-muted-row" data-muted-row={item.id}><span>{item.name}</span>
          <button type="button" className="btn btn-sm" onClick={() => void mute(item, false)}>恢复</button></div>)}
      </div>}
    </>;
  }
  const head = <div className="tracking-head"><SectionLabel>价格</SectionLabel>
    <button type="button" className="btn btn-primary btn-sm" aria-expanded={adding} onClick={() => setAdding(value => !value)}><Plus size={14} aria-hidden="true" />添加</button></div>;
  return <section data-tracking="watching">{head}
    {adding && <AddPanel taken={taken} onAdd={id => void add(id)} />}
    {body}</section>;
}

function AddPanel({ taken, onAdd }: { taken: ReadonlySet<string>; onAdd: (varId: string) => void }) {
  const [query, setQuery] = useState("");
  const [catalog, setCatalog] = useState<CatalogPrice[] | undefined | null>(undefined);
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    setCatalog(undefined);
    loadCatalog(controller.signal).then(setCatalog, () => { if (!controller.signal.aborted) setCatalog(null); });
    return () => controller.abort();
  }, [attempt]);
  const needle = query.trim().toLowerCase();
  const options = (catalog ?? []).filter(({ id, name }) => !taken.has(id) && (!needle || `${name}${id}`.toLowerCase().includes(needle)));
  return <div className="card tracking-add" data-tracking-add="">
    <label htmlFor="tracking-add-q">搜价格</label>
    <input id="tracking-add-q" className="tracking-add-input" value={query} onChange={event => setQuery(event.target.value)} placeholder="焦煤、沪铜、美元指数…" />
    <div className="tracking-add-options">{catalog === null ? <span className="tracking-foot">读取失败 <Retry onClick={() => setAttempt(value => value + 1)} /></span>
      : catalog === undefined ? <span className="tracking-foot">加载中</span>
      : options.length
        ? options.map(({ id, name, unit }) => <button key={id} type="button" className="btn btn-sm" title={unit} onClick={() => onAdd(id)}><Plus size={12} aria-hidden="true" />{name}</button>)
        : <span className="tracking-foot">没有匹配的价格</span>}</div>
  </div>;
}

/** 下次报告要验什么：每家已研究公司一行，不折叠、没有按钮；没有、读不到时整组不出现。 */
function NextReports() {
  const [rows, setRows] = useState<NextReport[]>([]);
  useEffect(() => {
    const controller = new AbortController();
    loadNextReports(controller.signal).then(value => { if (!controller.signal.aborted) setRows(value); }, () => {});
    return () => controller.abort();
  }, []);
  if (!rows.length) return null;
  return <section className="tracking-reports" data-tracking="next-reports">
    <SectionLabel>{`下次财报 · ${rows.length} 家`}</SectionLabel>
    <div className="card tracking-card">{rows.map(row => <div key={row.symbol} className="tracking-item tracking-report" data-report-row={row.symbol}>
      <span className="tracking-text"><b>{row.name}</b>{row.checks.length > 0 && <span>{row.checks.join("、")}</span>}</span>
      <time>{nextReportWhen(row)}</time>
    </div>)}</div>
  </section>;
}

function Trend({ item, variable, line }: { item: PriceItem; variable: TrackedVariable; line?: FlipLine }) {
  const trend = trendOf(item.series ?? [], { line: line?.value, alertDates: item.cards.map(card => card.date), startedAt: item.started_at });
  if (!trend) return null;
  const first = item.series![0]![0]!, last = item.series![item.series!.length - 1]![0]!;
  return <div className="tracking-trend" data-trend={item.var_id}>
    <svg width={TREND_W} height={TREND_H} viewBox={`0 0 ${TREND_W} ${TREND_H}`} role="img" aria-label={`${item.name} ${first} 至 ${last} 收盘走势，最新 ${priceText(variable.latest)}`}>
      {trend.startX != null && <line className="tracking-trend-start" x1={trend.startX} x2={trend.startX} y1={0} y2={TREND_H} />}
      {trend.lineY != null && <line className="tracking-trend-flip" x1={0} x2={TREND_W} y1={trend.lineY} y2={trend.lineY} />}
      <polyline className="tracking-trend-line" points={trend.points} />
      {trend.alerts.map(dot => <circle key={dot.date} className="tracking-trend-alert" cx={dot.x} cy={dot.y} r={3.5} />)}
      <circle className="tracking-trend-now" cx={trend.end.x} cy={trend.end.y} r={3.5} />
    </svg>
    <span className="tracking-trend-text">{mmdd(first)} 至 {mmdd(last)}{item.started_at > first && item.started_at <= last ? ` · ${mmdd(item.started_at)} 加入` : ""}{line && <b data-flip-line="">{line.text}</b>}</span>
  </div>;
}

function MuteButton({ name, onMute }: { name: string; onMute: () => void }) {
  return <button type="button" className="btn btn-sm tracking-mute" aria-label={`移出 ${name}`} onClick={onMute}>移出</button>;
}
const Tag = ({ item }: { item: TrackingItem }) => item.source === "user" ? <i className="tracking-tag">我添加的</i> : null;

function PriceRow({ item, line, expanded, onToggle, onMute }: { item: PriceItem; line?: FlipLine; expanded: boolean; onToggle: () => void; onMute: () => void }) {
  const variable = useMemo(() => priceVariable(item), [item]);
  const [allCompanies, setAllCompanies] = useState(false);
  const companies = useMemo(() => orderedCompanies(item.companies), [item.companies]);
  const step = sensitivityStep(variable);
  const plain = item.status !== "ok" || !item.series?.length;
  const alerted = !plain && item.cards.length > 0;
  const tone: StatusTone = alerted ? "info" : item.status === "gap" ? "wait" : "off";
  return <div className="tracking-item" data-variable-row={item.var_id} data-item-id={item.id}>
    <div className="tracking-line">
      <button type="button" className="tracking-row" aria-expanded={expanded} onClick={onToggle}>
        <StatusDot tone={tone} label={alerted ? "大波动" : item.status === "gap" ? "无行情" : "平稳"} />
        <span className="tracking-text">
          <span className="tracking-name"><b>{item.name}</b><Tag item={item} /></span>
          <span>{[variableLine(variable, item.cards), companies.length ? `${companies.slice(0, 3).map(company => company.name).join("、")}${companies.length > 3 ? `等 ${companies.length} 家` : ""}` : ""].filter(Boolean).join(" · ")}</span>
        </span>
        {!plain && <span className="tracking-price"><b>{priceText(variable.latest)}</b><span className={toneClass(variable.change_1d)}>{signedPriceText(variable.change_1d)}</span></span>}
        <ChevronDown className="tracking-chevron" size={16} aria-hidden="true" />
      </button>
    </div>
    {expanded && <div className="tracking-detail">{plain
      ? <p>{item.reason ?? "无行情"}</p>
      : <><Trend item={item} variable={variable} line={line} />{(allCompanies ? companies : companies.slice(0, 3)).map(company => <Detail key={company.symbol} variable={variable} company={company} step={step} />)}
        {companies.length > 3 && <button type="button" className="tracking-more" aria-expanded={allCompanies} onClick={() => setAllCompanies(value => !value)}>{allCompanies ? "收起其他公司" : `另外 ${companies.length - 3} 家`}</button>}</>}
      <MuteButton name={item.name} onMute={onMute} /></div>}
  </div>;
}

const KIND_CLASS: Record<SignalKind, string> = { 加强: "is-strong", 削弱: "is-weak", 无关: "is-none", 待定: "is-pending" };
function Timeline({ item }: { item: ObservationItem }) {
  const dots = timelineOf(item.signals), y = TIMELINE_H / 2;
  return <svg className="tracking-timeline" width={TIMELINE_W} height={TIMELINE_H} viewBox={`0 0 ${TIMELINE_W} ${TIMELINE_H}`} role="img" aria-label={`${item.name}：${summaryOf(item.signals)}`}>
    <line className="tracking-timeline-axis" x1={10} x2={TIMELINE_W - 10} y1={y} y2={y} />
    {dots.map(dot => dot.kind === "加强" ? <polygon key={dot.id} className={KIND_CLASS[dot.kind]} points={`${dot.x},${y - 7} ${dot.x - 8},${y + 7} ${dot.x + 8},${y + 7}`} />
      : dot.kind === "削弱" ? <polygon key={dot.id} className={KIND_CLASS[dot.kind]} points={`${dot.x},${y + 7} ${dot.x - 8},${y - 7} ${dot.x + 8},${y - 7}`} />
      : <circle key={dot.id} className={KIND_CLASS[dot.kind]} cx={dot.x} cy={y} r={6} />)}
  </svg>;
}

function ObservationRow({ item, expanded, onToggle, onMute, onKind }: { item: ObservationItem; expanded: boolean; onToggle: () => void; onMute: () => void; onKind: (signalId: string, kind: SignalKind) => void }) {
  const summary = summaryOf(item.signals);
  return <div className="tracking-item" data-observing-row={item.id} data-item-id={item.id}>
    <div className="tracking-line">
      <button type="button" className="tracking-row" aria-expanded={expanded} onClick={onToggle}>
        <span className="tracking-text">
          <span className="tracking-name"><b>{item.name}</b><Tag item={item} /></span>
          {item.hypothesis && item.hypothesis !== item.name && <span>{item.hypothesis}</span>}
        </span>
        <span className="tracking-tilt" data-summary="">{summary}</span>
        <ChevronDown className="tracking-chevron" size={16} aria-hidden="true" />
      </button>
    </div>
    {expanded && <div className="tracking-detail">
      {item.signals.length > 0 && <>
        <Timeline item={item} />
        <p className="tracking-legend">▲ 支持　▼ 不利　○ 无关</p>
        <ul className="tracking-signals">{item.signals.map(signal => <li key={signal.id} data-signal={signal.id}>
          <time>{mmdd(signal.date)}</time>
          <select className="tracking-signal-kind" aria-label={`改类型：${signal.text}`} value={signal.kind} onChange={event => onKind(signal.id, event.target.value as SignalKind)}>
            {SIGNAL_KINDS.map(kind => <option key={kind} value={kind}>{KIND_LABEL[kind]}</option>)}</select>
          <span>{signal.text}</span>
        </li>)}</ul></>}
      <MuteButton name={item.name} onMute={onMute} />
    </div>}
  </div>;
}
