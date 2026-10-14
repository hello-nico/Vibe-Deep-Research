import { Fragment, useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Card, Metric } from "../components/ui/Card";
import { useAiPage, useAiQuestion } from "../../../core/ai/pageContext";
import { watchPath } from "../lib/routes";
import {
  cardQuestion, cardSentence, cardTitle, cardTitlePieces, cardTouch, cardTouchPieces, companyPieces, dayLabel, impactText, loadTrackingVariables, percentText, priceText,
  shortName, tone, withUnit, yuanPerShareText,
  type TrackedVariable, type TrackingVariables, type VariableCard, type VariableCompany,
} from "../lib/trackingVariables";
import "./variable-desk.css";

type Loader = (signal?: AbortSignal) => Promise<TrackingVariables | null>;
export const toneClass = (value: string | null | undefined) => { const t = tone(value); return t ? `is-${t}` : undefined; };
const toneSpans = (pieces: { text: string; tone?: 'up' | 'down' }[]) => pieces.map((piece, i) => piece.tone ? <span key={i} className={`is-${piece.tone}`}>{piece.text}</span> : <Fragment key={i}>{piece.text}</Fragment>);
const codeOf = (symbol: string) => symbol.split(".")[0]!;

/** 动态页「关键变量」：价格动了，对你关注的公司意味着什么。每张卡一件事，金额点「展开」才看。变量总表在「跟踪」页。 */
export function VariableDesk({ load = loadTrackingVariables }: { load?: Loader }) {
  const { ask } = useAiQuestion();
  const [data, setData] = useState<TrackingVariables | null | undefined>(undefined);
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);
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
  useAiPage({ key: "feed:variables", title: "关键变量", context: data
    ? `关注公司的关键变量与价格变动。\n${data.cards.map(cardSentence).join("\n") || "最近 20 个交易日没有足以影响利润的价格变动"}` : "关键变量正在读取",
    suggestions: ["最近哪个价格变动对我关注的公司影响最大？"] });
  // 「讨论」打开问助手面板：卡片标题和第二行作为本轮引用，输入框预填问句；不新开深度对话。
  const discuss = useCallback((card: VariableCard) => {
    ask?.(cardQuestion(card), { title: cardTitle(card), text: `${cardTouch(card)}\n${cardSentence(card)}` }, cardQuestion(card));
  }, [ask]);

  if (failed) return <p role="alert" className="variable-desk-note">关键变量暂时读取不到。<button type="button" className="btn btn-text btn-sm" onClick={() => setAttempt(value => value + 1)}>重试</button></p>;
  if (data === undefined) return <div className="variable-desk" aria-busy="true" aria-label="正在加载"><div className="variable-desk-skeleton" /><div className="variable-desk-skeleton" /></div>;
  if (data === null) return <p className="variable-desk-note">关注公司后，这里会汇总它们研究里的关键变量和价格变动。<Link className="btn btn-primary btn-sm" to="/watch">去关注</Link></p>;
  return <div className="variable-desk">
    <Cards cards={data.cards} onDiscuss={discuss} />
  </div>;
}

function Cards({ cards, onDiscuss }: { cards: VariableCard[]; onDiscuss: (card: VariableCard) => void }) {
  const [open, setOpen] = useState<Set<string>>(() => new Set());
  const toggle = (key: string) => setOpen(previous => { const next = new Set(previous); if (!next.delete(key)) next.add(key); return next; });
  if (cards.length === 0) return <p className="variable-desk-empty">最近 20 个交易日没有足以影响利润的价格变动</p>;
  const alertKey = cards.find(card => card.judgment_changed)?.var_id; // 判断改变才提醒，同屏最多一张
  return <div className="variable-desk-cards">{cards.map(card => {
    const key = `${card.date}:${card.var_id}`;
    const expanded = open.has(key);
    return <Card key={key} alert={card.var_id === alertKey && card.judgment_changed === true}>
      <article className="variable-card" data-variable-card={card.var_id}>
        <div>
          <h4 className="variable-card-title">{toneSpans(cardTitlePieces(card))}</h4>
          <p className="variable-card-touch">{toneSpans(cardTouchPieces(card))}</p>
        </div>
        {expanded && <div className="variable-card-effects">{card.companies.map(company => <p key={company.symbol}>{companyPieces(company).map((piece, i) => piece.strong
          ? <b key={i} className={piece.tone ? `is-${piece.tone}` : undefined}>{piece.text}</b> : <Fragment key={i}>{piece.text}</Fragment>)}</p>)}</div>}
        <div className="variable-card-foot">
          <span>{dayLabel(card.date)}</span>
          <span className="variable-card-actions">
            <button type="button" className="btn btn-sm" aria-expanded={expanded} onClick={() => toggle(key)}>{expanded ? "收起" : "展开"}</button>
            {card.companies.map(company => <Link key={company.symbol} className="btn btn-sm" to={watchPath(codeOf(company.symbol))}>看个股页{card.companies.length > 1 ? ` · ${shortName(company.name)}` : ""}</Link>)}
            <button type="button" className="btn btn-sm" onClick={() => onDiscuss(card)}>讨论</button>
          </span>
        </div>
      </article>
    </Card>;
  })}</div>;
}

/** 一个变量下各家公司的影响明细（跟踪页展开用）。 */
export function Detail({ variable, company }: { variable: TrackedVariable; company: VariableCompany }) {
  const metrics: [string, string, string | undefined][] = [
    [`${company.name} · 每涨 ${withUnit(priceText(company.step), variable.unit)}`, impactText(company.profit_per_step), undefined],
    [`较基数期均价 ${priceText(company.anchor)}`, impactText(company.impact_vs_anchor), toneClass(company.impact_vs_anchor)],
    ["占基数利润", percentText(company.pct_of_base), toneClass(company.pct_of_base)],
    ["中性价影响", yuanPerShareText(company.neutral_price_delta), toneClass(company.neutral_price_delta)],
  ];
  return <div className="variable-detail-grid" data-company={company.symbol}>
    {metrics.map(([label, value, cls]) => <Metric key={label} label={label} value={<span className={cls}>{value}</span>} />)}
    {company.stale && <small className="variable-stale">这份研究已过期，数字可能需要更新</small>}
  </div>;
}
