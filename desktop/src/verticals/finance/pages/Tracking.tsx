import { useCallback, useEffect, useState, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { PageHeader } from "../components/ui/PageHeader";
import { Disclaimer } from "../components/ui/Disclaimer";
import { SectionLabel } from "../components/ui/Card";
import { StatusDot, type StatusTone } from "../components/ui/StatusDot";
import { useAiPage } from "../../../core/ai/pageContext";
import { watchPath } from "../lib/routes";
import { api } from "../lib/api";
import {
  loadTrackingVariables, orderWatching, shortName, variableLine, type TrackedVariable, type TrackingVariables,
} from "../lib/trackingVariables";
import {
  companyNameOf, latestPerCompany, loadResearchTasks, readValuationGrade, researchActive, researchLine, researchStepRows, stepProgress,
  type ResearchRecord, type ResearchStepStatus,
} from "../lib/researchTasks";
import { Detail, useFlipCards } from "./VariableDesk";
import { loadObserving, type ObservingItem } from "../lib/observing";
import { loadDriverSet, type DriverSet } from "../lib/templateDrivers";
import "./tracking.css";

/** 跟踪：交出去的事情的回执。「正在盯的」是研究里自动产生的关键变量，「研究」是每家公司研究到哪一步、结果如何。 */
export function Tracking() {
  useAiPage({ key: "tracking", title: "跟踪", context: "跟踪页：正在盯的价格，和关注公司的研究进度与结果", suggestions: ["最近哪些价格动得最大？"] });
  return <div>
    <PageHeader title="跟踪" />
    <div className="tracking">
      <Watching />
      <Observing />
      <Research />
    </div>
    <Disclaimer />
  </div>;
}

const VISIBLE = 6;
const codeOf = (symbol: string) => symbol.split(".")[0]!;
const when = (iso?: string | null) => {
  const date = new Date(iso || "");
  if (Number.isNaN(date.getTime())) return "";
  const now = new Date();
  if (date.toDateString() === now.toDateString()) return date.toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit", hour12: false });
  return `${date.getMonth() + 1} 月 ${date.getDate()} 日`;
};

function Note({ children }: { children: ReactNode }) { return <p className="tracking-note">{children}</p>; }
function Retry({ onClick }: { onClick: () => void }) { return <button type="button" className="btn btn-text btn-sm" onClick={onClick}>重试</button>; }
function Skeleton() { return <div className="card tracking-card" aria-busy="true" aria-label="正在加载"><div className="tracking-skeleton" /></div>; }

function Watching() {
  const [data, setData] = useState<TrackingVariables | null | undefined>(undefined);
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [open, setOpen] = useState<string | null>(null);
  const [all, setAll] = useState(false);
  useEffect(() => {
    const controller = new AbortController();
    setData(undefined); setFailed(false);
    loadTrackingVariables(controller.signal).then(setData, error => {
      if (controller.signal.aborted) return;
      console.warn("[finance/tracking] variables unavailable", error);
      setFailed(true);
    });
    return () => controller.abort();
  }, [attempt]);
  // 没研究的公司不在变量列表里，接口只给代码；用行情接口里的名字显示简称，取不到才显示代码。
  const [quoteNames, setQuoteNames] = useState<Record<string, string>>({});
  const missing = data?.coverage.unresearched.map(codeOf).join(",") ?? "";
  useEffect(() => {
    if (!missing) return;
    let alive = true;
    void api.quote(missing).then(quotes => {
      if (alive) setQuoteNames(Object.fromEntries(Object.entries(quotes).filter(([, quote]) => quote.name).map(([code, quote]) => [code, shortName(quote.name)])));
    }).catch(() => {});
    return () => { alive = false; };
  }, [missing]);
  const aside = "研究里自动产生的价格和指标，有大的变动会在动态里提醒你";
  let body;
  if (failed) body = <Note>正在盯的价格暂时读取不到。<Retry onClick={() => setAttempt(value => value + 1)} /></Note>;
  else if (data === undefined) body = <Skeleton />;
  else if (data === null || !data.variables.length) body = <Note>关注并研究公司后，研究里影响利润的价格会出现在这里。<Link className="btn btn-primary btn-sm" to="/watch">去关注</Link></Note>;
  else {
    const rows = orderWatching(data.variables, data.cards);
    const shown = all ? rows : rows.slice(0, VISIBLE);
    const names = new Map(data.variables.flatMap(item => item.companies.map(company => [company.symbol, company.name] as const)));
    body = <>
      <div className="card tracking-card">{shown.map(variable => <WatchRow key={variable.var_id} variable={variable} data={data}
        expanded={open === variable.var_id} onToggle={() => setOpen(value => value === variable.var_id ? null : variable.var_id)} />)}
      {rows.length > shown.length && <button type="button" className="tracking-more" onClick={() => setAll(true)}>显示另外 {rows.length - shown.length} 项</button>}</div>
      {data.coverage.unresearched.length > 0 && <p className="tracking-foot">还有 {data.coverage.unresearched.map(symbol => (names.has(symbol) ? shortName(names.get(symbol)!) : quoteNames[codeOf(symbol)]) ?? codeOf(symbol)).join("、")} 没有研究，研究后这里才会出现它们影响利润的价格。<Link to={data.coverage.unresearched.length === 1 ? watchPath(codeOf(data.coverage.unresearched[0]!)) : "/watch"}>去研究</Link></p>}
    </>;
  }
  return <section data-tracking="watching"><SectionLabel aside={aside}>正在盯的</SectionLabel>{body}</section>;
}

function WatchRow({ variable, data, expanded, onToggle }: { variable: TrackedVariable; data: TrackingVariables; expanded: boolean; onToggle: () => void }) {
  const plain = variable.status !== "ok";
  const alerted = !plain && data.cards.some(card => card.var_id === variable.var_id);
  const tone: StatusTone = alerted ? "info" : variable.status === "gap" ? "wait" : "off";
  return <div className="tracking-item" data-variable-row={variable.var_id}>
    <button type="button" className="tracking-row" aria-expanded={expanded} onClick={onToggle}>
      <StatusDot tone={tone} label={alerted ? "最近有大的波动" : variable.status === "gap" ? "暂时取不到行情" : "平稳"} />
      <span className="tracking-text">
        <b>{variable.name}</b>
        <span>{variableLine(variable, data.cards)}{variable.companies.length ? ` · ${variable.companies.map(company => shortName(company.name)).join("、")}` : ""}</span>
      </span>
      <time>{plain ? "" : variable.last_date ?? ""}</time>
    </button>
    {expanded && <div className="tracking-detail">{plain
      ? <p>{variable.reason ?? "暂时没有这个价格的行情"}</p>
      : variable.companies.map(company => <Detail key={company.symbol} variable={variable} company={company} />)}</div>}
  </div>;
}

/** 正在观察：对话里点了「开始观察」建成的指标，一行一项。没有、或读取失败时整组不出现。 */
function Observing() {
  const [items, setItems] = useState<ObservingItem[]>([]);
  useEffect(() => {
    const controller = new AbortController();
    loadObserving(controller.signal).then(setItems, () => {});
    return () => controller.abort();
  }, []);
  if (!items.length) return null;
  return <section data-tracking="observing"><SectionLabel aside="对话里点了「开始观察」的指标">正在观察</SectionLabel>
    <div className="card tracking-card">{items.map(item => <div key={`${item.topicId}:${item.key}`} className="tracking-item" data-observing-row={item.key}>
      <div className="tracking-row"><span className="tracking-text">
        <b>{item.metric}</b>
        <span>{item.why}{item.source ? ` · 下一个来源：${item.source}` : ""}</span>
      </span></div>
    </div>)}</div>
  </section>;
}

const STEP_TONE: Record<ResearchStepStatus, StatusTone> = { pending: "off", running: "run", done: "ok", skipped: "off", failed: "bad" };
const recordTone = (record: ResearchRecord): StatusTone => researchActive(record) ? "run" : record.status === "completed" ? "ok" : record.status === "failed" ? "bad" : "off";
const recordLabel = (record: ResearchRecord) => researchActive(record) ? "研究中" : record.status === "completed" ? "已完成" : record.status === "failed" ? "没有完成" : "已中止";

function Research() {
  // 跳档提醒：与动态「行情」同一份数据与同一句话，按公司挂在对应那行。
  const [variables, setVariables] = useState<TrackingVariables | null | undefined>(undefined);
  useEffect(() => {
    const controller = new AbortController();
    loadTrackingVariables(controller.signal).then(setVariables, () => {});
    return () => controller.abort();
  }, []);
  const flips = useFlipCards(variables);
  // 没有价格模型的公司：那一行写所属行业估值框架的驱动（最多三个），代替“只有下一次报告”。
  const [driverSets, setDriverSets] = useState<Record<string, DriverSet | null>>({});
  const priced = new Set(variables?.variables.flatMap(item => item.companies.map(company => company.symbol)) ?? []);
  const [records, setRecords] = useState<ResearchRecord[] | undefined>(undefined);
  const [grades, setGrades] = useState<Record<string, string | null>>({});
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [open, setOpen] = useState<string | null>(null);
  const read = useCallback(async (signal: AbortSignal) => {
    const items = latestPerCompany(await loadResearchTasks({ limit: 50 }, signal));
    if (signal.aborted) return;
    setRecords(items); setFailed(false);
    const done = items.filter(item => item.status === "completed");
    const entries = await Promise.all(done.map(async item => [item.symbol, await readValuationGrade(item.symbol, signal)] as const));
    if (!signal.aborted) setGrades(Object.fromEntries(entries));
  }, []);
  const active = !!records?.some(researchActive);
  const doneKey = variables === undefined ? "" : (records ?? []).filter(item => item.status === "completed" && !priced.has(item.symbol)).map(item => codeOf(item.symbol)).sort().join(",");
  useEffect(() => {
    let alive = true;
    for (const code of doneKey.split(",").filter(Boolean)) {
      void loadDriverSet(code).then(set => { if (alive && set) setDriverSets(previous => previous[code] === set ? previous : { ...previous, [code]: set }); });
    }
    return () => { alive = false; };
  }, [doneKey]);
  useEffect(() => {
    const controller = new AbortController();
    read(controller.signal).catch(error => {
      if (controller.signal.aborted) return;
      console.warn("[finance/tracking] research unavailable", error);
      setFailed(true);
    });
    const timer = active ? window.setInterval(() => { read(controller.signal).catch(() => {}); }, 5000) : undefined;
    return () => { controller.abort(); if (timer) window.clearInterval(timer); };
  }, [read, attempt, active]);
  let body;
  if (failed && !records) body = <Note>研究进度暂时读取不到。<Retry onClick={() => setAttempt(value => value + 1)} /></Note>;
  else if (!records) body = <Skeleton />;
  else if (!records.length) body = <Note>关注公司后，研究进度和结果会出现在这里。<Link className="btn btn-primary btn-sm" to="/watch">去关注</Link></Note>;
  else body = <div className="card tracking-card">{records.map(record => {
    const expanded = open === record.task_id;
    const running = record.status === "running";
    return <div key={record.task_id} className="tracking-item" data-research-row={record.symbol}>
      <button type="button" className="tracking-row" aria-expanded={expanded} onClick={() => setOpen(value => value === record.task_id ? null : record.task_id)}>
        <StatusDot tone={recordTone(record)} label={recordLabel(record)} />
        <span className="tracking-text">
          <b>{companyNameOf(record)}</b>
          <span>{researchLine(record, grades[record.symbol])}</span>
          {variables !== undefined && !priced.has(record.symbol) && driverSets[codeOf(record.symbol)] && <span className="tracking-drivers" data-driver-line="">盯：{driverSets[codeOf(record.symbol)]!.drivers.slice(0, 3).map(driver => driver.name).join("、")}</span>}
          {flips.filter(flip => flip.symbol === record.symbol).map(flip => <span key={flip.kind} className="tracking-flip" data-flip-line={flip.kind}>{flip.text}</span>)}
          {running && <i className="tracking-bar" role="progressbar" aria-label={stepProgress(record)} aria-valuemin={0} aria-valuemax={record.steps.length} aria-valuenow={record.current_step - 1}><u style={{ width: `${Math.max(0, record.current_step - 1) / Math.max(1, record.steps.length) * 100}%` }} /></i>}
        </span>
        <time>{when(record.updated_at)}</time>
      </button>
      {expanded && <div className="tracking-detail">
        <ol className="tracking-steps">{researchStepRows(record).map(step => <li key={step.key} data-step={step.key} data-status={step.status}>
          <StatusDot tone={STEP_TONE[step.status]} label={step.state} />
          <span className="tracking-step-name">{step.label}{step.note && <small>{step.note}</small>}</span>
          <em>{step.state}</em>
        </li>)}</ol>
        <Link className="btn btn-sm" to={watchPath(codeOf(record.symbol))}>去个股页</Link>
      </div>}
    </div>;
  })}</div>;
  return <section data-tracking="research"><SectionLabel aside="关注公司的研究做到哪一步、结果如何">研究</SectionLabel>{body}</section>;
}
