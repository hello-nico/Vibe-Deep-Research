import { Fragment, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { Card, Metric } from "../components/ui/Card";
import { LoadingCard } from "../components/ui/LoadingCard";
import { useAiPage, useAiQuestion } from "../../../core/ai/pageContext";
import { watchPath } from "../lib/routes";
import {
  impactText, loadTrackingVariables, percentText, priceText,
  profitAtStep, sensitivityImpactText, tone, withUnit, yuanPerShareText,
  type TrackedVariable, type TrackingVariables, type VariableCompany,
} from "../lib/trackingVariables";
import { loadFlipCards, type FlipCard } from "../lib/flipCards";
import { loadReconCards, type ReconCard } from "../lib/quarterRecon";
import { loadReconResults, reconResultKey } from "../lib/reconResult";
import { loadResearchEvents, revertWriteback } from "../lib/researchEvents";
import { ResearchSessionContext } from "../dsh/research-session";
import { createCompanyPageServices } from "../lib/companyPageServices";
import { companyPageStore } from "../lib/companyPage";
import { filingStreams, flipStream, writebackStream, loadFilingRows, priceStream, reconStream, streamDayText, streamOf, type FilingRow, type StreamCard, type StreamFilter } from "../lib/feedStream";
import { ProfitBridge } from "../components/ProfitBridge";
import "./variable-desk.css";

type Loader = (signal?: AbortSignal) => Promise<TrackingVariables | null>;
export const toneClass = (value: string | null | undefined) => { const t = tone(value); return t ? `is-${t}` : undefined; };
const toneSpans = (pieces: { text: string; tone?: 'up' | 'down' }[]) => pieces.map((piece, i) => piece.tone ? <span key={i} className={`is-${piece.tone}`}>{piece.text}</span> : <Fragment key={i}>{piece.text}</Fragment>);
const codeOf = (symbol: string) => symbol.split(".")[0]!;

/** 动态页「关键变量」：价格动了，对你关注的公司意味着什么。每张卡一件事，金额点「展开」才看。变量总表在「跟踪」页。 */
/** 取得关注公司的跳档提醒；失败当没有，不影响其余卡片。 */
export function useFlipCards(data: TrackingVariables | null | undefined, loadFlips: typeof loadFlipCards = loadFlipCards): FlipCard[] {
  const [flips, setFlips] = useState<FlipCard[]>([]);
  useEffect(() => {
    const controller = new AbortController();
    setFlips([]);
    if (data) loadFlips(data, controller.signal).then(cards => { if (!controller.signal.aborted) setFlips(cards); }, error => { if (!controller.signal.aborted) console.warn("[finance/flip-cards] unavailable", error); });
    return () => controller.abort();
  }, [data, loadFlips]);
  return flips;
}

/** 新季报的对账卡；失败当没有，不影响其余卡片。 */
export function useReconCards(data: TrackingVariables | null | undefined, loadRecon: typeof loadReconCards = loadReconCards, revision = 0): ReconCard[] {
  const [cards, setCards] = useState<ReconCard[]>([]);
  useEffect(() => {
    const controller = new AbortController();
    setCards([]);
    if (data) loadRecon(data, controller.signal, undefined, items => { if (!controller.signal.aborted) setCards(items); }).then(items => { if (!controller.signal.aborted) setCards(items); }, error => { if (!controller.signal.aborted) console.warn("[finance/recon-cards] unavailable", error); });
    return () => controller.abort();
  }, [data, loadRecon, revision]);
  return cards;
}

export function VariableDesk({ load = loadTrackingVariables, loadFlips = loadFlipCards, loadRecon = loadReconCards, loadFilings = loadFilingRows, loadResults = loadReconResults, loadEvents = loadResearchEvents, filter = "全部" }: { load?: Loader; loadFlips?: typeof loadFlipCards; loadRecon?: typeof loadReconCards; loadFilings?: typeof loadFilingRows; loadResults?: typeof loadReconResults; loadEvents?: typeof loadResearchEvents; filter?: StreamFilter }) {
  const { ask } = useAiQuestion();
  const [data, setData] = useState<TrackingVariables | null | undefined>(undefined);
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const flips = useFlipCards(data, loadFlips);
  const [reconRevision, setReconRevision] = useState(0);
  const refreshRecon = useCallback(() => setReconRevision(value => value + 1), []);
  const recon = useReconCards(data, loadRecon, reconRevision);
  const [resultsRevision, setResultsRevision] = useState(0);
  const results = useReconResults(recon, loadResults, resultsRevision, refreshRecon);
  const [showAll, setShowAll] = useState(false);
  const [eventsKey, setEventsKey] = useState(0);
  const events = useWritebackEvents(loadEvents, eventsKey);
  const sessions = useContext(ResearchSessionContext);
  const researchServices = useMemo(() => sessions ? createCompanyPageServices(sessions) : null, [sessions]);
  const startResearch = async (company: NonNullable<StreamCard['research']>) => {
    if (!researchServices) throw new Error('研究暂不可用');
    const store = companyPageStore(researchServices, codeOf(company.symbol), company.name);
    await store.refresh();
    if (store.getSnapshot().error) throw new Error(store.getSnapshot().error);
    await store.restart();
    if (store.getSnapshot().task?.status === 'failed') throw new Error('研究没有开始');
    setResultsRevision(value => value + 1);
  };
  const filings = useFilingRows(loadFilings, showAll);
  useEffect(() => {
    const controller = new AbortController();
    setData(undefined); setFailed(false);
    load(controller.signal).then(setData, error => {
      if (controller.signal.aborted) return;
      console.warn("[finance/variable-desk] unavailable", error);
      setFailed(true);
    });
    return () => controller.abort();
  }, [load, attempt]);
  const all = useMemo(() => data ? [
    ...flips.map(flip => flipStream(flip, data.as_of)),
    ...recon.map(card => reconStream(card, results[reconResultKey(card)])),
    ...data.cards.map(priceStream),
    ...events.map(writebackStream),
    ...filingStreams(filings.rows, filter === "全部"),
  ] : [], [data, flips, recon, results, filings.rows, events, filter]);
  const stream = useMemo(() => streamOf(all, filter), [all, filter]);
  useAiPage({ key: "feed:variables", title: "动态", context: data
    ? `关注公司的动态，按时间倒序。\n${streamOf(all, "全部").slice(0, 30).map(card => `${card.type}：${card.title.map(piece => piece.text).join("")}（${card.involved.map(piece => piece.text).join("")}）`).join("\n") || "最近没有动态"}` : "动态正在读取",
    suggestions: ["最近哪条动态对我关注的公司影响最大？"] });
  // 「讨论」打开问助手面板：卡片标题和第二行作为本轮引用，输入框预填问句；不新开深度对话。
  const discuss = useCallback((card: StreamCard) => {
    ask?.(card.discuss.question, { title: card.discuss.title, text: card.discuss.text }, card.discuss.question);
  }, [ask]);

  if (failed) return <p role="alert" className="variable-desk-note">动态暂时读取不到。<button type="button" className="btn btn-text btn-sm" onClick={() => setAttempt(value => value + 1)}>重试</button></p>;
  if (data === undefined) return <div className="variable-desk-cards"><LoadingCard /><LoadingCard /><LoadingCard /></div>;
  if (data === null) return <p className="variable-desk-note">关注公司后，这里会汇总它们的财报、价格变动和公告。<Link className="btn btn-primary btn-sm" to="/watch">去关注</Link></p>;
  return <div className="variable-desk" data-feed-stream="">
    {filter === "公告" && (filings.hidden > 0 || showAll) && <button type="button" className="btn btn-sm variable-desk-routine" data-show-all="" aria-pressed={showAll} onClick={() => setShowAll(value => !value)}>{showAll ? "只看重要的" : `查看全部（另有 ${filings.hidden} 条例行）`}</button>}
    {stream.length === 0
      ? <p className="variable-desk-empty">{filter === "全部" ? "最近没有需要看的动态" : `最近没有${filter}类的动态`}</p>
      : <div className="variable-desk-cards">{stream.map(card => <StreamItem key={card.key} card={card} onDiscuss={discuss} onResearch={researchServices ? startResearch : undefined} onOpenSession={sessions ? id => void sessions.openSession(id).catch(() => {}) : undefined} onRevert={async item => { await revertWriteback(item); setEventsKey(value => value + 1); }} />)}</div>}
  </div>;
}

const RESULT_POLL_MS = 15_000;
/** 财报卡的重研结论；有研究在进行时每 15 秒刷新进度，失败当没有。 */
function useReconResults(recon: ReconCard[], loadResults: typeof loadReconResults, revision: number, onSettled: () => void) {
  const [results, setResults] = useState<Awaited<ReturnType<typeof loadReconResults>>>({});
  const lastRevision = useRef(revision);
  const key = recon.map(card => `${card.symbol}:${card.period}:${card.arrival?.id || ''}`).join(",");
  useEffect(() => {
    const controller = new AbortController();
    let timer: number | undefined;
    let wasActive = revision !== lastRevision.current;
    lastRevision.current = revision;
    const run = () => loadResults(recon, controller.signal).then(value => {
      if (controller.signal.aborted) return;
      setResults(value);
      const active = Object.values(value).some(item => item && !item.changed && item.text.startsWith("重新研究中"));
      if (active) { wasActive = true; timer = window.setTimeout(() => { void run(); }, RESULT_POLL_MS); }
      else if (wasActive) { wasActive = false; onSettled(); }
    }, error => { if (!controller.signal.aborted) console.warn("[finance/recon-results] unavailable", error); });
    void run();
    return () => { controller.abort(); window.clearTimeout(timer); };
  }, [key, loadResults, revision, onSettled]); // eslint-disable-line react-hooks/exhaustive-deps
  return results;
}

/** 对话里调整的记录；失败当没有，不影响其余卡片。`key` 变化时重读（撤回之后）。 */
function useWritebackEvents(loadEvents: typeof loadResearchEvents, key: number) {
  const [events, setEvents] = useState<Awaited<ReturnType<typeof loadResearchEvents>>>([]);
  useEffect(() => {
    const controller = new AbortController();
    loadEvents(controller.signal).then(value => { if (!controller.signal.aborted) setEvents(value); }, error => { if (!controller.signal.aborted) console.warn("[finance/research-events] unavailable", error); });
    return () => controller.abort();
  }, [loadEvents, key]);
  return events;
}

/** 取得关注公司的公告；失败当没有，不影响其余卡片。 */
function useFilingRows(loadFilings: typeof loadFilingRows, showAll: boolean) {
  const [state, setState] = useState<{ rows: FilingRow[]; hidden: number }>({ rows: [], hidden: 0 });
  useEffect(() => {
    const controller = new AbortController();
    loadFilings(showAll, controller.signal).then(value => { if (!controller.signal.aborted) setState(value); }, error => { if (!controller.signal.aborted) console.warn("[finance/filings] unavailable", error); });
    return () => controller.abort();
  }, [loadFilings, showAll]);
  return state;
}

const DATA_ATTR: Record<string, string> = { 价格: "data-variable-card", 财报: "data-recon-card", 估值: "data-flip-card", 公告: "data-filing-card", 对话: "data-writeback-card" };
export function StreamItem({ card, onDiscuss, onOpenSession, onRevert, onResearch }: { card: StreamCard; onDiscuss: (card: StreamCard) => void; onOpenSession?: (sessionId: string) => void; onRevert?: (event: NonNullable<StreamCard["revert"]>["event"]) => Promise<void>; onResearch?: (company: NonNullable<StreamCard['research']>) => Promise<void> }) {
  const [expanded, setExpanded] = useState(false);
  const [reverting, setReverting] = useState<"idle" | "busy" | "failed">("idle");
  const [starting, setStarting] = useState<'idle' | 'busy' | 'failed'>('idle');
  const research = async () => {
    if (!card.research || !onResearch || starting === 'busy') return;
    setStarting('busy');
    try { await onResearch(card.research); setStarting('idle'); }
    catch { setStarting('failed'); }
  };
  const revert = async () => {
    if (!card.revert || !onRevert) return;
    setReverting("busy");
    try { await onRevert(card.revert.event); setReverting("idle"); } catch (error) { console.warn("[finance/stream] revert failed", error); setReverting("failed"); }
  };
  const detailLines = card.details.map((line, index) => <p key={index}>{line.map((piece, i) => piece.strong
    ? <b key={i} className={piece.tone ? `is-${piece.tone}` : undefined}>{piece.text}</b> : <Fragment key={i}>{piece.text}</Fragment>)}</p>);
  const expandable = card.details.length > 0 || !!card.bridge || !!card.url || !!card.extra?.length;
  const marker = { [DATA_ATTR[card.type]!]: card.companies[0]?.symbol ?? "", "data-stream-card": card.key, "data-stream-type": card.type };
  return <Card>
    <article className="variable-card" {...marker}>
      <div>
        <h4 className="variable-card-title">{toneSpans(card.title)}</h4>
        <p className="variable-card-touch">{toneSpans(card.involved)}</p>
        {card.result && <p className={`variable-card-result${card.result.strong ? " is-strong" : ""}`} data-recon-result="">{card.result.text}</p>}
      </div>
      {expanded && <div className="variable-card-effects">
        {card.bridge && <ProfitBridge bridge={card.bridge} />}
        {card.bridge && <p className="profit-bridge-note">科目取自利润表，单季 = 累计值相减</p>}
        {card.bridge ? <details className="profit-bridge-data" data-bridge-data=""><summary>看数据</summary>{detailLines}</details> : detailLines}
        {card.url && <p><a href={card.url} target="_blank" rel="noreferrer">打开公告原文</a></p>}
        {card.extra?.map((item, index) => <p key={index}>{item.url ? <a href={item.url} target="_blank" rel="noreferrer">{item.title}</a> : item.title}</p>)}
      </div>}
      {reverting === "failed" && <p className="variable-card-note" role="status">撤回没有成功，请稍后重试</p>}
      {starting === 'failed' && <p className="variable-card-note" role="status">研究没有开始，请稍后重试</p>}
      <div className="variable-card-foot">
        <span>{card.pinned && <b className="variable-card-pinned" title="估值判断变了，排在最前">置顶 · </b>}{card.type}{streamDayText(card) ? ` · ${streamDayText(card)}` : ""}{card.extra?.length ? ` · 另有 ${card.extra.length} 份公告` : ""}</span>
        <span className="variable-card-actions">
          {expandable && <button type="button" className="btn btn-sm" aria-expanded={expanded} onClick={() => setExpanded(value => !value)}>{expanded ? "收起" : "展开"}</button>}
          {card.research && <button type="button" className="btn btn-sm" disabled={starting === 'busy' || !onResearch} onClick={() => void research()}>{starting === 'busy' ? '正在开始' : '重新研究'}</button>}
          {card.companies.map(company => <Link key={company.symbol} className="btn btn-sm" to={watchPath(codeOf(company.symbol))}>看{company.name}</Link>)}
          {card.session && onOpenSession && <button type="button" className="btn btn-sm" onClick={() => onOpenSession(card.session!)}>打开对话</button>}
          {card.revert?.state === "available" && onRevert && <button type="button" className="btn btn-sm" disabled={reverting === "busy"} onClick={() => void revert()}>{reverting === "busy" ? "正在撤回" : "撤回"}</button>}
          <button type="button" className="btn btn-sm" onClick={() => onDiscuss(card)}>讨论</button>
        </span>
      </div>
    </article>
  </Card>;
}

/** 一个变量下各家公司的影响明细（跟踪页展开用）。 */
export function Detail({ variable, company, step }: { variable: TrackedVariable; company: VariableCompany; step: number | null }) {
  const metrics: [string, string, string | undefined][] = [
    [`${company.name} · 每涨 ${withUnit(priceText(step == null ? null : String(step)), variable.unit)}`, sensitivityImpactText(profitAtStep(company, step)), undefined],
    ["较对比期", impactText(company.impact_vs_anchor), toneClass(company.impact_vs_anchor)],
    ["占利润", percentText(company.pct_of_base), toneClass(company.pct_of_base)],
    ["中性价影响", yuanPerShareText(company.neutral_price_delta), toneClass(company.neutral_price_delta)],
  ];
  return <div className="variable-detail-grid" data-company={company.symbol}>
    {metrics.map(([label, value, cls]) => <Metric key={label} label={label} value={<span className={cls}>{value}</span>} />)}
    {company.stale && <small className="variable-stale">这份研究已过期，数字可能需要更新</small>}
  </div>;
}
