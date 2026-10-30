import { Fragment, useId, type ReactNode } from 'react';
import { Tag } from './ui/Card';
import { bandTickGroups } from '../lib/bandTicks';
import { scenarioPriceNumber, type DataPacket } from '../lib/companyPacket';
import {
  GRADES, gradeLabel, groupQuotes, contributions, conversationHint, conversationOrigin, epsAt, flowItems, impliedPe, periodLabel, plainNumber, profitAt, quarterLabel,
  resolveSlot, ruleOfThumbText, sliderUnitText, splitSentence, yiText, yuanText,
  type Expectation, type QuarterBar, type SensitivityModel, type SliderValues, type WatchItem,
} from '../lib/companyNarrative';

/** 回答句：句中 {占位} 由页面按字段或计算凭据填入；缺口显示灰色「暂缺」。 */
export function AnswerSentence({ text, packet, calcs, id, livePrice }: { text: string; packet?: DataPacket; calcs: Record<string, unknown>; id: string; livePrice?: number | null }) {
  return <p className="company-page-conclusion" data-company-summary={id}>{splitSentence(text).map((part, index) => {
    if (part.kind === 'text') return part.text;
    const slot = resolveSlot(part.token, packet, calcs, livePrice);
    return slot
      ? <strong key={index} className="narrative-slot" title={slot.title}>{slot.text}</strong>
      : <span key={index} className="narrative-slot is-gap" title="读取失败">暂缺</span>;
  })}</p>;
}

/** 关键变量节无敏感性模型时的兜底：单季营业收入与归母净利柱图，最近一季用品牌橙。 */
export function QuarterBars({ bars }: { bars: QuarterBar[] }) {
  if (!bars.length) return null;
  const maxRevenue = Math.max(...bars.map(item => Math.abs(item.revenue ?? 0)), 1);
  const maxProfit = Math.max(...bars.map(item => Math.abs(item.profit ?? 0)), 1);
  return <div className="narrative-chart" data-chart="quarters">
    <div className="narrative-quarters">{bars.map((bar, index) => <figure key={bar.period} className={index === bars.length - 1 ? 'is-current' : undefined}>
      <div className="narrative-quarter-bars">
        <span className="is-revenue" style={{ height: `${bar.revenue == null ? 0 : Math.max(4, (Math.abs(bar.revenue) / maxRevenue) * 100)}%` }} title={bar.revenue == null ? '无营业收入' : `营业收入 ${yuanText(bar.revenue)}`} />
        <span className="is-profit" style={{ height: `${bar.profit == null ? 0 : Math.max(4, (Math.abs(bar.profit) / maxProfit) * 100)}%` }} title={bar.profit == null ? '无净利润' : `净利润 ${yuanText(bar.profit)}`} />
      </div>
      <figcaption><span>{quarterLabel(bar.period)}</span>
        <small>{bar.revenue == null ? '收入 —' : `收入 ${yuanText(bar.revenue)}`}</small>
        <small>{bar.profit == null ? '净利 —' : `净利 ${yuanText(bar.profit)}`}</small>
      </figcaption>
    </figure>)}</div>
    <p className="company-page-gap">单季 = 累计相减</p>
  </div>;
}


/** 现金：去向条。经营现金流整条，依次切成资本开支、分红、剩余；缺项不画，在下方灰字写「暂缺」。 */
export function FlowBar({ packet }: { packet?: DataPacket }) {
  const items = flowItems(packet);
  if (items.every(item => item.value == null)) return null;
  const [operating, ...parts] = items;
  const drawn = parts.filter(item => item.value != null);
  const gaps = items.filter(item => item.value == null);
  return <div className="narrative-chart" data-chart="flow">
    {operating!.value != null && drawn.length > 0 && <div className="narrative-flowbar" role="img" aria-label="经营现金流去向">
      {drawn.map(item => <span key={item.key} data-flow={item.key} className={item.key === 'residual_cash' ? 'is-rest' : item.key === 'dividend_paid' ? 'is-mid' : 'is-lead'}
        style={{ flexGrow: item.value! }} title={`${item.label} ${yuanText(item.value!)}`}>{item.label} {yuanText(item.value!)}</span>)}
    </div>}
    <p className="narrative-flow-note">
      {operating!.value != null ? <span data-flow="operating_cash_flow">经营现金流 {yuanText(operating!.value)}</span> : <span data-flow="operating_cash_flow" className="is-gap">经营现金流 —</span>}
      {gaps.filter(item => item.key !== 'operating_cash_flow').map(item => <span key={item.key} data-flow={item.key} className="is-gap">{item.label} 暂缺</span>)}
    </p>
  </div>;
}

function Slider({ variable, value, onChange, origin }: {
  variable: SensitivityModel['variables'][number]; value: number; onChange: (value: number) => void; origin?: ReactNode;
}) {
  const id = useId();
  const span = variable.max - variable.min;
  const percent = (point: number) => Math.min(100, Math.max(0, ((point - variable.min) / span) * 100));
  const at = (point: number) => `${percent(point)}%`;
  const gap = variable.anchor == null;
  const digits = variable.step < 1 ? 2 : 0;
  const diff = gap ? null : value - variable.anchor!;
  const currentLabel = variable.currentPeriod ? `${periodLabel(variable.currentPeriod)}披露` : '今天';
  return <div className="narrative-slider" data-variable={variable.id} data-anchor-gap={gap ? '' : undefined}>
    <div className="narrative-slider-head">
      <span><label htmlFor={id}>{variable.name}</label> <small>{[variable.sourceLabel, `${currentLabel} ${sliderUnitText(variable, variable.current)}`].filter(Boolean).join(' · ')}</small>{origin}</span>
      <span className="narrative-slider-value"><strong className="narrative-slot" title="滑块当前取值">{sliderUnitText(variable, value)}</strong>
        {gap ? <small>{variable.anchorLabel}暂缺，不可拖</small>
          : <small className={diff! > 0 ? 'is-up' : diff! < 0 ? 'is-down' : undefined}>{diff === 0 ? `与${variable.anchorLabel}持平` : `较${variable.anchorLabel} ${diff! > 0 ? '+' : '-'}${plainNumber(Math.abs(diff!), digits)}`}</small>}
      </span>
    </div>
    <div className="narrative-rail">
      <input id={id} type="range" aria-label={`${variable.name}取值`} min={variable.min} max={variable.max} step={variable.step} value={value} disabled={gap} onChange={event => onChange(Number(event.target.value))} />
      {!gap && <span className="narrative-tick is-anchor" style={{ left: at(variable.anchor!) }} title={`${variable.anchorLabel} ${sliderUnitText(variable, variable.anchor!)}`} data-anchor="" />}
      <span className="narrative-tick is-current" style={{ left: at(variable.current) }} title={`${currentLabel} ${sliderUnitText(variable, variable.current)}`} data-today="" />
      {!gap && <span className="narrative-anchor-label" style={{ left: `${Math.min(86, Math.max(14, percent(variable.anchor!)))}%` }}>▲ {variable.anchorLabel} {sliderUnitText(variable, variable.anchor!)}</span>}
    </div>
    <div className="narrative-slider-foot"><span>{sliderUnitText(variable, variable.min)}</span><span>{sliderUnitText(variable, variable.max)}</span></div>
  </div>;
}

export interface DriverNote { quote?: string; origin?: 'report' | 'conversation'; sessionId?: string; confirmedAt?: string }
/** 关键变量：公式行 + 公司自述 + 敏感性滑块；右侧利润、贡献正负条、每股收益与现价对应市盈率。 */
export function SensitivityPanel({ model, values, onChange, onReset, price, drivers, onOpenSession }: {
  model: SensitivityModel; values: SliderValues; onChange: (id: string, value: number) => void; onReset: (target: 'today' | 'anchor') => void; price: number | null; drivers: Record<string, DriverNote>; /** 点「来自 M-DD 的对话」回到那段对话。 */ onOpenSession?: (sessionId: string) => void;
}) {
  const parts = contributions(model, values);
  const profit = profitAt(model, values);
  const eps = epsAt(model, profit);
  const pe = impliedPe(price, eps);
  const reach = Math.max(...parts.map(item => Math.abs(item.profit)), 1);
  const delta = profit - model.baseProfit;
  const quotes = model.variables.flatMap(item => drivers[item.id]?.origin !== 'conversation' && drivers[item.id]?.quote ? [{ id: item.id, name: item.name, quote: drivers[item.id]!.quote! }] : []);
  const gaps = model.variables.filter(item => item.anchor == null);
  return <div className="narrative-chart narrative-sensitivity" data-chart="sensitivity">
    <div className="narrative-formula" data-formula="">
      <span>年化净利润 ≈ 对比期利润</span>
      {model.variables.map(item => <span key={item.id} className="narrative-chip" title={ruleOfThumbText(model, item) || undefined}>
        + {item.name}{ruleOfThumbText(model, item) ? <small>{ruleOfThumbText(model, item)}</small> : null}
      </span>)}
    </div>
    {quotes.length > 0 && <div className="narrative-quote" data-company-says="">
      <b>公司自己说</b>
      <span>{groupQuotes(quotes).map(group => <span key={group.quote}>{group.names.length > 1 || quotes.length > group.names.length ? `${group.names.join('、')}：` : ''}「{group.quote}」</span>)}</span>
    </div>}
    <div className="narrative-sensitivity-body">
      <div className="narrative-sliders">
        {model.variables.map(item => {
          const note = drivers[item.id];
          const hint = note?.origin === 'conversation' ? conversationHint({ at: note.confirmedAt, sessionId: note.sessionId }) : '';
          return <Slider key={item.id} variable={item} value={values[item.id] ?? item.current} onChange={value => onChange(item.id, value)}
            origin={hint ? (note?.sessionId && onOpenSession
              ? <button type="button" className="narrative-origin company-page-link" data-change-hint data-origin-session={note.sessionId} title={hint} onClick={() => onOpenSession(note.sessionId!)}>{conversationOrigin(note.confirmedAt)}</button>
              : <span className="narrative-origin" data-change-hint title={hint}>{conversationOrigin(note?.confirmedAt)}</span>) : undefined} />;
        })}
        <div className="narrative-slider-actions">
          <button type="button" className="btn btn-sm" data-reset="today" onClick={() => onReset('today')}>{model.model === 'thermal_power' ? '回到报告值' : '回到今天'}</button>
          <button type="button" className="btn btn-sm" data-reset="anchor" disabled={gaps.length === model.variables.length} onClick={() => onReset('anchor')}>回到对比期</button>
        </div>
      </div>
      <div className="narrative-result" data-result="">
        <div className="narrative-result-profit">
          <span>年化净利润（估算）</span>
          <strong data-profit="">{yuanText(profit)}</strong>
          <small className={delta > 0 ? 'is-up' : delta < 0 ? 'is-down' : undefined}>{delta === 0 ? '与对比期利润一致' : `比对比期 ${delta > 0 ? '+' : '-'}${yiText(Math.abs(delta))}`}</small>
        </div>
        <ul className="narrative-contrib">{parts.map(item => <li key={item.variable.id}>
          <span>{item.variable.name}</span>
          <span className="narrative-contrib-track" aria-hidden="true"><span className={item.profit >= 0 ? 'is-up' : 'is-down'} style={{ width: `${(Math.abs(item.profit) / reach) * 50}%`, [item.profit >= 0 ? 'left' : 'right']: '50%' }} /></span>
          {item.variable.anchor == null ? <strong className="is-gap" title="缺对比期均价">暂缺</strong>
            : <strong className={item.profit > 0 ? 'is-up' : item.profit < 0 ? 'is-down' : undefined}>{item.profit === 0 ? '0' : `${item.profit > 0 ? '+' : '-'}${yiText(Math.abs(item.profit))}`}</strong>}
        </li>)}</ul>
        <div className="narrative-result-pair">
          <div><span>对应每股收益</span><strong data-eps="">{plainNumber(eps, 2)} 元/股</strong></div>
          <div title="按估算利润与现价"><span>按估算利润的市盈率</span><strong data-pe="">{pe == null ? '—' : `${plainNumber(pe, 1)} 倍`}</strong></div>
        </div>
      </div>
    </div>
  </div>;
}

export interface BandTier { name: string; /** 没有价的档（如亏损）为 null：只在下面的文字行里出现，不上区间带。 */ price: number | null; text: string; /** 其他因素的取值，收进该行展开。 */ more?: string }
/** 估值：区间带。现价为品牌橙实心点，滑块调整后的中性价为空心点；下方一句图注。 */
export function ValuationBand({ tiers: all, price, adjusted }: { tiers: BandTier[]; price: number | null; adjusted: number | null }) {
  const tiers = all.filter((item): item is BandTier & { price: number } => item.price != null);
  if (!tiers.length) return null;
  const points = [...tiers.map(item => item.price), ...(price != null ? [price] : []), ...(adjusted != null ? [adjusted] : [])];
  const low = Math.min(...points) * 0.92, high = Math.max(...points) * 1.08, span = high - low || 1;
  const at = (value: number) => `${((value - low) / span) * 100}%`;
  const groups = bandTickGroups(tiers, span);
  return <div className="narrative-chart" data-chart="band">
    <div className="narrative-band" role="img" aria-label="三档目标价区间">
      <span className="narrative-band-range" style={{ left: at(Math.min(...tiers.map(item => item.price))), right: `${100 - ((Math.max(...tiers.map(item => item.price)) - low) / span) * 100}%` }} />
      {groups.map(group => <span key={group.map(item => item.name).join()} className="narrative-band-tick" style={{ left: at(group.reduce((sum, item) => sum + item.price, 0) / group.length) }}>
        <em>{group.map(item => item.name).join(' · ')}</em><b>{group.map(item => scenarioPriceNumber(item.price)).join(' / ')}</b></span>)}
      {price != null && <span className="narrative-band-dot is-price" style={{ left: at(price) }} title={`现价 ${plainNumber(price, 2)} 元/股`} data-band-price="" />}
      {adjusted != null && <span className="narrative-band-dot is-adjusted" style={{ left: at(adjusted) }} title={`调整后的中性价 ${plainNumber(adjusted, 2)} 元/股`} data-band-adjusted="" />}
    </div>
    <p className="company-page-gap" data-band-caption="">橙点为现价{adjusted != null ? `；空心点为按上面拖动的价格调整后的中性价（${plainNumber(adjusted, 2)} 元/股）` : ''}。三档价由代码按「每股收益 × 倍数」计算，可查看计算凭据。</p>
    <ul className="narrative-tiers">{all.map(item => <li key={item.name} data-tier={item.name}><span>{item.name}</span><p>{item.text}</p>{item.more && <details className="narrative-tier-more"><summary>其他因素取值</summary><p>{item.more}</p></details>}</li>)}</ul>
  </div>;
}

/** 估值节的三方预期：机构、模型、股价隐含各一行（一句话加一个数），下面一句分歧；灰字正文，不描边，不用橙色。 */
export function ExpectationRows({ view }: { view: Expectation }) {
  return <div className="narrative-expect" data-expectation="">
    {view.rows.map(row => <p key={row.key} data-expect={row.key}>{row.pieces.map((piece, index) => piece.strong ? <strong key={index} className="narrative-slot">{piece.text}</strong> : <Fragment key={index}>{piece.text}</Fragment>)}</p>)}
    {view.difference && <p className="narrative-expect-diff" data-expect-diff="">{view.difference}</p>}
  </div>;
}

/** 五档结论：五个档位并排，当前档用品牌橙浅底。 */
export function GradePills({ grade }: { grade: string }) {
  return <div className="narrative-grades" data-grade-pills={grade} role="img" aria-label={`五档结论：${gradeLabel(grade)}`}>
    {GRADES.map(name => <Tag key={name} brand={name === grade}>{gradeLabel(name)}</Tag>)}
  </div>;
}

/** 接下来盯什么：每张卡一句话加一个数（价格或下一次报告日期），不带状态词。 */
export function WatchCards({ items }: { items: WatchItem[] }) {
  if (!items.length) return null;
  return <div className="narrative-track-grid" data-chart="watch">{items.map(item => <article key={item.id} className="card narrative-track" data-watch={item.id} title={item.hint}>
    <div className="narrative-track-head">
      <span className="narrative-track-title"><b>{item.title}</b></span>
      {(item.value || item.sub) && <span className="narrative-track-now">{item.value && <strong>{item.value}</strong>}{item.sub && <small>{item.sub}</small>}</span>}
      <p className="narrative-track-note">{item.note}</p>
    </div>
  </article>)}</div>;
}
