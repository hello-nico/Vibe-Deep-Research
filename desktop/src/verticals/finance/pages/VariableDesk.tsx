import { Fragment, useCallback, useEffect, useState, type KeyboardEvent } from "react";
import { Link } from "react-router-dom";
import { Card, Metric, SectionLabel, Sparkline, TableWrap, Tag } from "../components/ui/Card";
import { StatusDot, type StatusTone } from "../components/ui/StatusDot";
import { useResearchSessions } from "../dsh/research-session";
import { watchPath } from "../lib/routes";
import {
  cardPieces, cardQuestion, dayLabel, impactText, loadTrackingVariables, orderVariables, percentText, priceText,
  shortName, signedPriceText, sourceText, toNumber, tone, versusAnchor, withUnit, yuanPerShareText,
  type TrackedVariable, type TrackingVariables, type VariableCard, type VariableCompany,
} from "../lib/trackingVariables";
import "./variable-desk.css";

type Loader = (signal?: AbortSignal) => Promise<TrackingVariables | null>;
const toneClass = (value: string | null | undefined) => { const t = tone(value); return t ? `is-${t}` : undefined; };
/** 价格涨跌的颜色看对利润的方向：各家同向才着色。 */
const profitTone = (variable: TrackedVariable, field: "impact_1d" | "impact_vs_anchor") => {
  const tones = new Set(variable.companies.map(company => toneClass(company[field])));
  return tones.size === 1 ? [...tones][0] : undefined;
};
const codeOf = (symbol: string) => symbol.split(".")[0]!;
/** 来源层级：圆点颜色表达层级，悬停出文字；不占列、不放图例。 */
const TIERS: Record<TrackedVariable["tier"], [StatusTone, string]> = {
  market_daily: ["ok", "日行情"], low_frequency: ["info", "低频公开数据"], company_disclosed: ["wait", "公司披露"], none: ["off", "无公开数据"],
};
const delta = (text: string, cls?: string) => <span className={cls}>{text}</span>;

/** 动态页「关键变量」：价格动了对关注公司意味着什么（卡片），哪些价格牵动它们（表格），还有哪些没盯上。版式按 T12a 原型。 */
export function VariableDesk({ load = loadTrackingVariables }: { load?: Loader }) {
  const sessions = useResearchSessions();
  const [data, setData] = useState<TrackingVariables | null | undefined>(undefined);
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [notice, setNotice] = useState<string | null>(null);
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
  const discuss = useCallback((card: VariableCard) => {
    setNotice(null);
    void sessions.start(cardQuestion(card)).catch(() => setNotice("暂时无法新开对话，请稍后重试"));
  }, [sessions]);

  if (failed) return <p role="alert" className="variable-desk-note">关键变量暂时读取不到。<button type="button" className="btn btn-text btn-sm" onClick={() => setAttempt(value => value + 1)}>重试</button></p>;
  if (data === undefined) return <div className="variable-desk" aria-busy="true" aria-label="正在加载"><div className="variable-desk-skeleton" /><div className="variable-desk-skeleton" /></div>;
  if (data === null) return <p className="variable-desk-note">关注公司后，这里会汇总它们研究里的关键变量和价格变动。<Link className="btn btn-primary btn-sm" to="/watch">去关注</Link></p>;
  return <div className="variable-desk">
    <Cards data={data} onDiscuss={discuss} />
    {notice && <p role="status" className="variable-desk-note">{notice}</p>}
    <Table variables={orderVariables(data.variables)} />
    <Coverage data={data} />
  </div>;
}

function Cards({ data, onDiscuss }: { data: TrackingVariables; onDiscuss: (card: VariableCard) => void }) {
  const { cards } = data;
  return <section>
    <SectionLabel>价格动了，对你关注的公司意味着什么</SectionLabel>
    {cards.length === 0
      ? <p className="variable-desk-empty">最近 20 个交易日没有足以影响利润的价格变动</p>
      : <div className="variable-desk-cards">{cards.map((card, index) => {
        const evidence = data.variables.find(item => item.var_id === card.var_id)?.companies.find(company => company.symbol === card.companies[0]?.symbol);
        const hover = evidence?.researched_at ? `系数来自 ${dayLabel(evidence.researched_at.slice(0, 10))}的个股页研究，每涨 ${withUnit(priceText(evidence.step), card.unit)}，利润 ${impactText(evidence.profit_per_step)}` : undefined;
        return <Card key={`${card.date}:${card.var_id}`} alert={index === 0}>
          <article className="variable-card" data-variable-card={card.var_id}>
            <div className="variable-card-tags">
              {card.companies.map(company => <Tag key={company.symbol} brand>{company.name}</Tag>)}
              <Tag>{card.name} · 日行情</Tag>
            </div>
            <p className="variable-card-sentence" title={hover}>{cardPieces(card).map((piece, i) => piece.strong
              ? <b key={i} className={piece.tone ? `is-${piece.tone}` : undefined}>{piece.text}</b> : <Fragment key={i}>{piece.text}</Fragment>)}</p>
            <div className="variable-card-foot">
              <span>{dayLabel(card.date)}</span>
              <span className="variable-card-actions">
                {card.companies.map(company => <Link key={company.symbol} className="btn btn-sm" to={watchPath(codeOf(company.symbol))}>看个股页{card.companies.length > 1 ? ` · ${shortName(company.name)}` : ""}</Link>)}
                <button type="button" className="btn btn-sm" onClick={() => onDiscuss(card)}>讨论</button>
              </span>
            </div>
          </article>
        </Card>;
      })}</div>}
  </section>;
}

function Table({ variables }: { variables: TrackedVariable[] }) {
  const [open, setOpen] = useState<string | null>(null);
  if (!variables.length) return null;
  const toggle = (id: string) => setOpen(value => value === id ? null : id);
  const onKey = (event: KeyboardEvent, id: string) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); toggle(id); } };
  return <section>
    <SectionLabel aside="点一行看每家公司的影响">哪些价格牵动你关注的公司</SectionLabel>
    <TableWrap>
      <table className="data-table variable-table">
        <thead><tr><th>变量</th><th>近 40 日</th><th className="col-num">最新</th><th className="col-num">较前一日</th><th className="col-num">较基数期均价</th><th>影响的公司（点行看明细）</th></tr></thead>
        <tbody>{variables.map(variable => {
          const noData = variable.status === "no_data", gap = variable.status === "gap", plain = noData || gap;
          const expanded = open === variable.var_id;
          const anchorDiff = versusAnchor(variable);
          const source = noData ? variable.reason : [sourceText(variable.source), variable.last_date].filter(Boolean).join(" · ");
          return <Fragment key={variable.var_id}>
            <tr className={`variable-row${noData ? " is-nodata" : ""}`} data-variable-row={variable.var_id} data-status={variable.status}
              tabIndex={0} aria-expanded={expanded} onClick={() => toggle(variable.var_id)} onKeyDown={event => onKey(event, variable.var_id)}>
              <td><span className="variable-name">{variable.name}<StatusDot tone={TIERS[variable.tier][0]} label={TIERS[variable.tier][1]} className="variable-tier" /></span><small className="variable-source">{source}</small></td>
              <td>{!plain && (variable.series?.length ?? 0) > 1 ? <Sparkline values={variable.series!.map(([, value]) => toNumber(value) ?? NaN)} label={`${variable.name}近 40 日走势`} /> : <span className="variable-muted">—</span>}</td>
              <td className="col-num">{plain || variable.latest == null ? <span className="variable-muted">—</span> : withUnit(priceText(variable.latest), variable.unit)}</td>
              <td className="col-num">{plain ? <span className="variable-muted">—</span> : delta(signedPriceText(variable.change_1d), profitTone(variable, "impact_1d"))}</td>
              <td className="col-num">{plain || anchorDiff == null ? <span className="variable-muted">—</span> : delta(signedPriceText(String(anchorDiff)), profitTone(variable, "impact_vs_anchor"))}</td>
              <td><div className="variable-chips">{variable.companies.map(company => <Chip key={company.symbol} company={company} waiting={plain} />)}</div></td>
            </tr>
            {expanded && <tr className="variable-detail"><td colSpan={6}>{plain
              ? <p className="variable-reason">{variable.reason ?? "暂时没有这个变量的行情"}</p>
              : variable.companies.map(company => <Detail key={company.symbol} variable={variable} company={company} />)}</td></tr>}
          </Fragment>;
        })}</tbody>
      </table>
    </TableWrap>
  </section>;
}

function Chip({ company, waiting }: { company: VariableCompany; waiting: boolean }) {
  return <Tag>{company.name}{!waiting && company.impact_vs_anchor != null && <b className={toneClass(company.impact_vs_anchor)}>{impactText(company.impact_vs_anchor)}</b>}</Tag>;
}

function Detail({ variable, company }: { variable: TrackedVariable; company: VariableCompany }) {
  const metrics: [string, string, string | undefined][] = [
    [`${company.name} · 每涨 ${withUnit(priceText(company.step), variable.unit)}`, impactText(company.profit_per_step), undefined],
    [`较基数期均价 ${priceText(company.anchor)}`, impactText(company.impact_vs_anchor), toneClass(company.impact_vs_anchor)],
    ["占基数利润", percentText(company.pct_of_base), toneClass(company.pct_of_base)],
    ["中性价影响", yuanPerShareText(company.neutral_price_delta), toneClass(company.neutral_price_delta)],
  ];
  return <div className="variable-detail-grid" data-company={company.symbol}>
    {metrics.map(([label, value, cls]) => <Metric key={label} label={label} value={<span className={cls}>{value}</span>} />)}
    {company.stale && <small className="variable-stale">这份研究已过期，系数可能需要更新</small>}
  </div>;
}

function Coverage({ data }: { data: TrackingVariables }) {
  const watched = data.variables.filter(item => item.status !== "no_data");
  const names = new Map(data.variables.flatMap(item => item.companies.map(company => [company.symbol, company.name] as const)));
  const { uncovered, unresearched } = data.coverage;
  if (!watched.length && !uncovered.length && !unresearched.length) return null;
  return <section>
    <SectionLabel>还有哪些没盯上</SectionLabel>
    <div className="variable-coverage">
      {([
        ["watched", "在自动盯的变量", watched.length, watched.map(item => item.name).join("、")],
        ["uncovered", "没有日行情的变量", uncovered.length, uncovered.map(item => `${item.name}（${item.companies.map(symbol => names.get(symbol) ?? symbol).join("、")}）`).join("；")],
        ["unresearched", "还没研究的关注公司", unresearched.length, unresearched.map(symbol => names.get(symbol) ?? codeOf(symbol)).join("、")],
      ] as const).map(([key, label, count, note]) => <Card key={key}><div className="variable-cover-card" data-cover={key}><Metric label={label} value={count} /><p>{note}</p></div></Card>)}
    </div>
  </section>;
}
