import { createContext, useEffect, useMemo, useState, useSyncExternalStore, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { Loader2 } from 'lucide-react';
import { EvidenceLink } from '../components/EvidenceCard';
import { SourceTimeline } from '../components/WikiReport';
import { ScenarioTable } from '../components/ScenarioTable';
import { conflictValues, fieldIdLabel, findField, forecastNote, formulaText, gapText, showField, thresholdText, type DataPacket, type PacketField, type ScenarioTableData } from '../lib/companyPacket';
import { COMPANY_TYPE_NAME, calcRefsIn, changeLine, conversationHint, epsAt, initialSliderValues, numericValue, parseSensitivity, peerMedian, periodLabel, plainNumber, profitAt, quarterSeries, sliderUnitText, splitSentence, variableOf, yoyField, yuanText, type SensitivityModel, type SliderValues } from '../lib/companyNarrative';
import { AnswerSentence, FlowBar, GradePills, QuarterBars, SensitivityPanel, TrackingCards, ValuationBand, type BandTier, type DriverNote, type TrackItem } from '../components/CompanyNarrative';
import { companyPageProgress, companyPageStore, companyPageTaskActive, type CompanyPageData, type CompanyPageResearch, type CompanyPageServices, type CompanyPageState } from '../lib/companyPage';
import { financialNumber } from '../lib/financialDisplay';
import { currencyLabel } from '../lib/marketSymbol';
import { Metric, MetricTag, Panel, Tag } from '../components/ui/Card';
import './company-page.css';

export const CompanyPageServicesContext = createContext<CompanyPageServices | null>(null);
export function useCompanyPageState(services: CompanyPageServices, symbol: string, name: string, opened = false) {
  const store = useMemo(() => companyPageStore(services, symbol, name), [services, symbol, name]);
  const state = useSyncExternalStore(store.subscribe, store.getSnapshot, store.getSnapshot);
  useEffect(() => { store.rename(name); }, [store, name]);
  useEffect(() => { void store.refresh(opened); }, [store, opened]);
  return state;
}
export function CompanyPageProgress({ state, location, onOpen }: { state: CompanyPageState; location: 'roster' | 'toolbar'; onOpen: (sessionId: string) => void }) {
  const label = companyPageProgress(state);
  if (!label) return null;
  const running = companyPageTaskActive(state.task);
  const sessionId = state.task?.sessionId;
  const content = <>{running && <Loader2 size={14} className="animate-spin" aria-hidden="true" />}{label}</>;
  const className = location === 'toolbar' ? 'workspace-action' : 'company-roster-progress';
  return <div data-company-progress={location} className={`company-page-progress is-${location}`} role="status" aria-live="polite">
    {sessionId ? <button type="button" className={`${className} is-clickable`} onClick={() => onOpen(sessionId)} title="查看研究过程">{content}</button> : <span className={className}>{content}</span>}
  </div>;
}
function DataLoading({ label }: { label: string }) {
  return <div className="company-page-skeleton" role="status" aria-label={`正在读取${label}`}><span /><span /></div>;
}
function Detail({ children, label = '查看数据' }: { children: ReactNode; label?: string }) {
  return <details className="company-page-detail"><summary>{label}</summary><div>{children}</div></details>;
}
function FieldMetric({ label, field, note }: { label: string; field: PacketField; note?: string }) {
  const conflicts = conflictValues(field);
  if (field.status === 'gap') return <p className="company-page-gap" data-gap={field.metric || label}>{label}：{gapText(field)}</p>;
  if (conflicts.length >= 2) return <div className="company-page-conflict" data-conflict={field.metric || label}>
    {conflicts.map(item => <Metric key={item.label} label={`${label} · ${item.label}`} value={showField(item.field)} />)}
    {field.reason && <p className="company-page-gap">{gapText(field)}</p>}
  </div>;
  if (field.value == null || field.value === '') return null;
  const ref = typeof field.ref === 'string' ? field.ref : undefined;
  return <Metric label={label} title={[field.period, note].filter(Boolean).join(' · ')}
    tags={<>{field.period && <MetricTag>{field.period}</MetricTag>}{note && <MetricTag>{note}</MetricTag>}{ref && <EvidenceLink reference={ref}>出处</EvidenceLink>}</>}
    value={showField(field)} />;
}
function BoundField({ packet, id }: { packet?: DataPacket; id: string }) {
  const field = findField(packet, id);
  if (!field) return <p className="company-page-gap" data-gap="missing">暂时取不到{fieldIdLabel(id)}</p>;
  return <FieldMetric label={fieldIdLabel(field.field_id ?? id)} field={field} note={forecastNote(field)} />;
}
/** 第一层关键数：最多三个，期间与口径收进悬停。 */
const KEY_LIMIT = 3;
function keyIdsOf(packet: DataPacket | undefined, ids: readonly string[]) {
  return ids.filter(id => numericValue(findField(packet, id)) != null).slice(0, KEY_LIMIT);
}
function KeyNumbers({ packet, ids, peers = false }: { packet?: DataPacket; ids: readonly string[]; peers?: boolean }) {
  const shown = keyIdsOf(packet, ids).map(id => ({ id, field: findField(packet, id)! }));
  if (!shown.length) return null;
  return <div className="company-page-metrics" data-key-numbers="">{shown.map(({ id, field }) => {
    const median = peers && (id === 'pe' || id === 'pb') ? peerMedian(packet, id) : null;
    return <Metric key={id} label={fieldIdLabel(field.field_id ?? id)} value={showField(field)} title={[field.period, field.scope].filter(Boolean).join(' · ')}
      tags={median != null ? <MetricTag>同业中位 {plainNumber(median, id === 'pe' ? 1 : 2)}</MetricTag> : undefined} />;
  })}</div>;
}
/** 节标题右侧的口径：第一个关键数的期间（年报、日期）。 */
function metaOf(packet: DataPacket | undefined, ids: readonly string[]) {
  const first = keyIdsOf(packet, ids).map(id => findField(packet, id)?.period).find(Boolean);
  return periodLabel(first);
}
const unique = (items: readonly string[]) => [...new Set(items)];
/** 回答句里已经嵌了的字段，第一层关键数不再重复。 */
const withoutSlots = (keys: readonly string[], answer?: string) => {
  const used = new Set(splitSentence(answer ?? '').flatMap(part => part.kind === 'slot' ? [part.token] : []));
  return keys.filter(id => !used.has(id));
};
function peersOf(packet?: DataPacket) {
  const peers = packet?.fields.peers;
  return (peers?.items ?? []).flatMap(item => item.pe && item.pe.status !== 'gap' && item.pe.value != null ? [{ name: item.name || item.symbol || '同业', field: item.pe }] : []);
}
type DataState = { [K in keyof CompanyPageData]: { loading: boolean; value?: CompanyPageData[K]; error?: boolean } };
const initialData = (): DataState => ({ quote: { loading: true }, packet: { loading: true }, documents: { loading: true } });

const QUESTIONS = {
  business: '它靠什么赚钱', variables: '关键变量动一下，利润变多少', cash: '利润是不是真金白银',
  valuation: '现在的价格在赌什么', tracking: '接下来盯什么',
} as const;
const DEFAULT_KEYS = {
  business: ['revenue', 'gross_margin', 'net_profit_attributable'],
  cash: ['lens:cash_after_capex.cash_after_capex', 'lens:cash_conversion.cash_conversion', 'dividend_yield'],
  valuation: ['pe', 'pb', 'dividend_yield'],
  variables: [], tracking: [],
} as const;

function neutralMultiple(scenarios: ScenarioTableData | null) {
  const value = Number(scenarios?.rows.find(row => row.name === '中性')?.multiple);
  return Number.isFinite(value) && value > 0 ? value : null;
}
function bandTiers(scenarios: ScenarioTableData | null, model: SensitivityModel | null): BandTier[] {
  return (scenarios?.rows ?? []).flatMap(row => {
    const price = Number(row.price);
    if (!Number.isFinite(price)) return [];
    const tier = model?.tiers.find(item => item.name === row.name);
    const multiple = row.multiple ? `${row.multiple} 倍` : '';
    const priceText = `${plainNumber(price, 2)} 元/股`;
    const reason = row.reason ? `（${row.reason}）` : '';
    if (model && tier) {
      const lead = [...model.variables].sort((a, b) => Math.abs(b.coef * ((tier.values[b.id] ?? b.current) - b.current)) - Math.abs(a.coef * ((tier.values[a.id] ?? a.current) - a.current)))[0];
      const profit = tier.profit ?? profitAt(model, { ...initialSliderValues(model), ...tier.values });
      const variable = lead ? `${lead.name} ${sliderUnitText(lead, tier.values[lead.id] ?? lead.current)}` : '';
      return [{ name: row.name, price, text: [variable, `利润 ${yuanText(profit)}`, `${multiple}${reason}`, priceText].filter(Boolean).join(' → ') }];
    }
    const earnings = row.earnings == null ? '' : scenarios?.mode === 'total' ? `利润 ${yuanText(Number(row.earnings))}` : `每股收益 ${plainNumber(Number(row.earnings), 2)} 元/股`;
    return [{ name: row.name, price, text: [earnings, `${multiple}${reason}`, priceText].filter(Boolean).join(' → ') }];
  });
}

export function CompanyPage({ symbol, name, services }: { symbol: string; name: string; services: CompanyPageServices }) {
  const research = useCompanyPageState(services, symbol, name, true);
  const store = useMemo(() => companyPageStore(services, symbol, name), [services, symbol, name]);
  const [data, setData] = useState<DataState>(initialData);
  const [scenarios, setScenarios] = useState<ScenarioTableData | null>(null);
  const [calcs, setCalcs] = useState<Record<string, unknown>>({});
  const [slid, setSlid] = useState<SliderValues>({});
  const [reverting, setReverting] = useState<'idle' | 'busy' | 'failed'>('idle');
  useEffect(() => {
    const controller = new AbortController();
    setData(initialData());
    for (const key of Object.keys(services.data) as (keyof CompanyPageData)[]) {
      void services.data[key](symbol, controller.signal).then(value => {
        if (!controller.signal.aborted) setData(previous => ({ ...previous, [key]: { loading: false, value } }));
      }).catch(() => {
        if (!controller.signal.aborted) setData(previous => ({ ...previous, [key]: { loading: false, error: true } }));
      });
    }
    return () => controller.abort();
  }, [services, symbol]);
  // R6: the first packet is shown at once; when the background ensure finishes the packet is re-read without a loading state.
  useEffect(() => {
    if (!services.subscribePacket) return;
    const controller = new AbortController();
    const unsubscribe = services.subscribePacket(symbol, () => {
      void services.data.packet(symbol, controller.signal).then(value => {
        if (!controller.signal.aborted) setData(previous => ({ ...previous, packet: { loading: false, value } }));
      }).catch(() => { /* keep what is on screen */ });
    });
    return () => { controller.abort(); unsubscribe(); };
  }, [services, symbol]);
  const saved = research.research;
  const scenarioRef = saved?.valuation?.scenarioRef;
  useEffect(() => {
    const controller = new AbortController();
    setScenarios(null);
    if (!scenarioRef || !services.readScenario) return () => controller.abort();
    void services.readScenario(scenarioRef, controller.signal).then(rows => { if (!controller.signal.aborted) setScenarios(rows); });
    return () => controller.abort();
  }, [services, scenarioRef]);
  // 计算凭据：敏感性与句中 {calc:…} 占位引用的凭据，读不到的占位显示「暂缺」。
  const sensitivityRef = saved?.sensitivity?.resultRef ?? undefined;
  const summaries = Object.values(saved?.sections ?? {}).map(block => block?.summary);
  const calcKey = unique([...(sensitivityRef ? [sensitivityRef] : []), ...summaries.flatMap(text => calcRefsIn(text)), ...calcRefsIn(saved?.thesis)]).join(',');
  useEffect(() => {
    const controller = new AbortController();
    setCalcs({});
    if (!calcKey || !services.readResult) return () => controller.abort();
    for (const ref of calcKey.split(',')) {
      void services.readResult(ref, controller.signal).then(result => {
        if (!controller.signal.aborted && result) setCalcs(previous => ({ ...previous, [ref]: result }));
      });
    }
    return () => controller.abort();
  }, [services, calcKey]);
  const model = useMemo(() => sensitivityRef && calcs[sensitivityRef] ? parseSensitivity(calcs[sensitivityRef]) : null, [sensitivityRef, calcs]);
  useEffect(() => { setSlid({}); }, [model]);
  const values = model ? { ...initialSliderValues(model), ...slid } : {};
  const resetSliders = (target: 'today' | 'anchor') => {
    if (!model) return;
    setSlid(target === 'today' ? {} : Object.fromEntries(model.variables.flatMap(item => item.anchor == null ? [] : [[item.id, item.anchor]])));
  };
  const moved = Boolean(model && model.variables.some(item => values[item.id] !== item.current));
  const packet = data.packet.value;
  const quote = data.quote.value;
  const price = typeof quote?.price === 'number' ? quote.price : numericValue(packet?.fields.price);
  const multiple = neutralMultiple(scenarios);
  const adjusted = model && moved && multiple != null ? epsAt(model, profitAt(model, values)) * multiple : null;
  const notes: Record<string, DriverNote> = Object.fromEntries((saved?.sensitivity?.drivers ?? []).map(item => [item.var_id, item]));
  const drivers = packet?.industry_drivers?.fields ?? {};
  const gapOnly = Boolean(saved?.gapNote);
  const change = changeLine(saved, { changedFrom: research.changedFrom, canRevert: research.canRevert });
  const tiers = bandTiers(scenarios, model);
  const implied = model?.implied;
  const impliedVar = implied && model ? variableOf(model, implied.id) : undefined;
  const revert = async () => {
    if (!services.revertResearch) return;
    setReverting('busy');
    try { await services.revertResearch(symbol, research.researchVersion); setReverting('idle'); await store.refresh(); }
    catch (error) { console.warn('[finance/company-page] revert failed', error); setReverting('failed'); }
  };
  const tracking: TrackItem[] = (saved?.pillars ?? []).map(pillar => {
    const matching = (saved?.falsifiers ?? []).filter(item => item.pillarId === pillar.id);
    const lead = matching.find(item => item.fieldId) ?? matching[0];
    // 同比类警戒线用年内累计同比镜头的值比较；取不到时不判状态。
    const yoy = lead?.threshold?.kind === 'yoy_pct';
    const yoyLens = yoy ? yoyField(packet, lead?.fieldId) : undefined;
    return {
      id: pillar.id, text: pillar.text, fieldIds: pillar.fieldIds ?? [], fieldId: lead?.fieldId, yoy,
      field: yoy ? yoyLens : lead?.fieldId ? findField(packet, lead.fieldId) : undefined,
      threshold: lead?.threshold, window: lead?.window, falsifier: lead?.text,
      more: matching.filter(item => item !== lead).map(item => ({ text: item.text, line: [thresholdText(item.threshold), item.window].filter(Boolean).join(' · ') })),
    };
  });
  const loadingBody = (title: string) => data.packet.loading ? <DataLoading label={title} /> : data.packet.error ? <p className="company-page-gap">数据暂时取不到</p> : null;
  const block = (id: 'business' | 'cash' | 'valuation') => saved?.sections?.[id];
  const section = (id: keyof typeof QUESTIONS, answer: string | undefined, chart: ReactNode, keys: readonly string[], more: ReactNode, change?: string, meta?: string) => {
    const keyNumbers = <KeyNumbers packet={packet} ids={keys} peers={id === 'valuation'} />;
    return <Panel className="company-page-section" data-company-section={id} title={QUESTIONS[id]} meta={meta} key={id}>
      {loadingBody(QUESTIONS[id]) ?? <>
        {answer && <div data-change-hint={change || undefined} title={change}><AnswerSentence id={id} text={answer} packet={packet} calcs={calcs} /></div>}
        {chart}
        {keyNumbers}
        {more}
      </>}
    </Panel>;
  };
  const hasKeys = (ids: readonly string[]) => ids.some(id => numericValue(findField(packet, id)) != null);
  const moreOf = (id: 'business' | 'cash', ids: readonly string[], keys: readonly string[]) => {
    const details = block(id)?.details;
    const onFirstLayer = new Set(keyIdsOf(packet, keys));
    const list = unique(ids).filter(fieldId => !onFirstLayer.has(fieldId));
    return (details || list.length) ? <Detail>
      {details && <p>{details}</p>}
      <div className="company-page-metrics">{list.map(fieldId => <BoundField key={fieldId} packet={packet} id={fieldId} />)}</div>
    </Detail> : null;
  };
  const businessAll = unique([...(block('business')?.fieldIds ?? []), ...DEFAULT_KEYS.business]);
  const businessKeys = withoutSlots(businessAll, block('business')?.summary);
  // 去向条已经画出经营现金流、资本开支、分红与剩余现金，第一层关键数不再重复这四项。
  const FLOW_KEYS = ['operating_cash_flow', 'capex_cash', 'dividend_paid', 'residual_cash'];
  const cashAll = unique([...(block('cash')?.fieldIds ?? []).filter(id => !FLOW_KEYS.includes(id)), ...DEFAULT_KEYS.cash]);
  const cashKeys = withoutSlots(cashAll, block('cash')?.summary);
  const variableBlocks = [saved?.sections?.profit_formula, saved?.sections?.variables];
  const variableAnswer = saved?.sections?.variables?.summary || saved?.sections?.profit_formula?.summary;
  const formulaSentence = saved?.sections?.profit_formula?.summary && saved.sections.profit_formula.summary !== variableAnswer ? saved.sections.profit_formula.summary : undefined;
  const variableIds = unique(variableBlocks.flatMap(item => item?.fieldIds ?? []));
  const bars = quarterSeries(packet);
  const formula = packet ? formulaText(packet) : '';
  const hasFlow = packet ? ['operating_cash_flow', 'capex_cash', 'dividend_paid', 'residual_cash'].some(key => numericValue(packet.fields[key]) != null) : false;
  const valuation = block('valuation');
  // 整节无数据时不渲染；数据包还没到时先留骨架，保持位置。
  const loading = data.packet.loading || Boolean(data.packet.error);
  const showSection = {
    business: loading || Boolean(block('business')?.summary) || hasKeys(businessKeys),
    variables: loading || Boolean(variableAnswer) || Boolean(model) || bars.length > 0 || Boolean(formula),
    cash: loading || Boolean(block('cash')?.summary) || hasFlow || hasKeys(cashKeys),
    valuation: loading || Boolean(valuation?.summary) || tiers.length > 0 || hasKeys(DEFAULT_KEYS.valuation),
    tracking: tracking.length > 0 || Boolean(saved?.sections?.tracking?.summary),
  };
  return <article className="company-page" aria-label={`${name} 个股页`}>
    <section className="card company-page-hero">
      <header className="company-page-header"><div><h1 className="workspace-title">{name}</h1><p className="company-page-code">{[symbol, saved?.companyType ? COMPANY_TYPE_NAME[saved.companyType] : ''].filter(Boolean).join(' · ')}</p></div>
        <div className="company-page-price">{data.quote.loading ? <DataLoading label="行情" /> : quote?.price != null ? <><strong>{financialNumber(quote.price)} <small>{currencyLabel(quote.currency)}</small></strong>{quote.fetched_at && <small className="company-page-quote-time">行情 {periodLabel(quote.fetched_at)}</small>}{quote.change_pct != null && <span className={quote.change_pct > 0 ? 'is-up' : quote.change_pct < 0 ? 'is-down' : undefined} title={quote.fetched_at ? `行情时点 ${quote.fetched_at}` : undefined}>{quote.change_pct > 0 ? '+' : ''}{financialNumber(quote.change_pct)}%</span>}</> : <p className="company-page-gap">行情暂不可用</p>}</div>
      </header>
      <section className="company-page-lead" data-company-section="thesis"><p className="company-page-label">论点</p>
        {gapOnly ? <p className="company-page-conclusion" data-gap-note="">{saved?.gapNote}</p> : <Thesis research={saved} state={research} packet={packet} calcs={calcs} />}
        {!gapOnly && (saved?.valuation?.grade || change) && <p className="company-page-change" data-change-line="">
          {saved?.valuation?.grade && <Tag brand><span data-valuation-grade={saved.valuation.grade}>{saved.valuation.grade}</span></Tag>}
          {change && <span data-change-hint={change.conversation ? '' : undefined} title={conversationHint(change.conversation) || undefined}>{change.text}</span>}
          {change?.revertable && services.revertResearch && <button type="button" className="company-page-link" disabled={reverting === 'busy'} onClick={() => void revert()}>{reverting === 'busy' ? '正在撤回' : '撤回'}</button>}
          {reverting === 'failed' && <span className="company-page-gap" role="status">撤回没有成功，请稍后重试</span>}
        </p>}
        {research.error && saved && <p className="company-page-gap" role="status">{research.error}</p>}
      </section>
    </section>
    {showSection.business && section('business', block('business')?.summary, null, businessKeys, moreOf('business', [...businessAll, ...(block('business')?.fieldIds ?? [])], businessKeys), saved?.changes?.business, metaOf(packet, businessKeys))}
    {showSection.variables && section('variables', variableAnswer,
      model
        ? <SensitivityPanel model={model} values={values} onChange={(id, value) => setSlid(previous => ({ ...previous, [id]: value }))} onReset={resetSliders} price={price} drivers={notes} />
        : <>{(formulaSentence || formula) && <div className="narrative-formula" data-formula="">{formulaSentence && <AnswerSentence id="profit_formula" text={formulaSentence} packet={packet} calcs={calcs} />}{formula && <span className="company-page-gap">{formula}</span>}</div>}<QuarterBars bars={bars} /></>,
      [],
      (variableBlocks.some(item => item?.details) || variableIds.length || Object.keys(drivers).length) ? <Detail>
        {variableBlocks.map((item, index) => item?.details ? <p key={index}>{item.details}</p> : null)}
        <div className="company-page-metrics">{unique([...variableIds, ...Object.values(drivers).map(item => item.field_id ?? '')]).filter(Boolean).map(fieldId => <BoundField key={fieldId} packet={packet} id={fieldId} />)}</div>
      </Detail> : null,
      saved?.changes?.variables ?? saved?.changes?.profit_formula, model?.baseLabel ? `基数：${model.baseLabel}` : undefined)}
    {showSection.cash && section('cash', block('cash')?.summary, <FlowBar packet={packet} />, cashKeys, moreOf('cash', unique([...cashAll, ...(block('cash')?.fieldIds ?? [])]), cashKeys), saved?.changes?.cash, metaOf(packet, cashKeys))}
    {showSection.valuation && section('valuation', valuation?.summary,
      <>
        <ValuationBand tiers={tiers} price={price} adjusted={adjusted} />
        {saved?.valuation?.grade && !gapOnly && <GradePills grade={saved.valuation.grade} />}
        {implied && impliedVar && <p className="narrative-implied" data-implied="">按中性倍数 <strong className="narrative-slot">{plainNumber(implied.multiple ?? multiple ?? 0, 1)} 倍</strong>，现价相当于市场在赌{impliedVar.name}约 <strong className="narrative-slot" title="线性反解，口径见假设">{sliderUnitText(impliedVar, implied.value)}</strong></p>}
      </>,
      DEFAULT_KEYS.valuation,
      <Detail>
        {valuation?.details && <p>{valuation.details}</p>}
        {saved?.valuation?.conditions && !gapOnly && <p data-valuation-conditions="">什么情况会改判断：{saved.valuation.conditions}</p>}
        <div className="company-page-metrics">{unique(['price', ...(valuation?.fieldIds ?? []), 'eps_ttm', 'eps_forecast', 'eps_forecast_next', 'forward_pe', ...DEFAULT_KEYS.valuation]).filter(fieldId => !keyIdsOf(packet, DEFAULT_KEYS.valuation).includes(fieldId)).map(fieldId => <BoundField key={fieldId} packet={packet} id={fieldId} />)}</div>
        {peersOf(packet).length > 0 && <div className="company-page-metrics">{peersOf(packet).map(item => <FieldMetric key={item.name} label={`${item.name} 市盈率`} field={item.field} />)}</div>}
        {!gapOnly && <ScenarioTable rows={scenarioRef ? scenarios?.rows ?? null : null} mode={scenarios?.mode} />}
      </Detail>,
      saved?.changes?.valuation, metaOf(packet, DEFAULT_KEYS.valuation))}
    {showSection.tracking && section('tracking', saved?.sections?.tracking?.summary, <TrackingCards items={tracking} renderBound={fieldId => <BoundField key={fieldId} packet={packet} id={fieldId} />} />, [],
      (saved?.sections?.tracking?.details || saved?.catalysts?.length) ? <Detail>
        {saved?.sections?.tracking?.details && <p>{saved.sections.tracking.details}</p>}
        {saved?.catalysts?.map(item => <p key={`${item.date}${item.event}`}>{item.date} {item.event}</p>)}
      </Detail> : null,
      saved?.changes?.tracking)}
    <Panel className="company-page-section" title="关联">{saved?.related?.length ? <div className="company-page-relations">{saved.related.map(item => <Link key={item.topicId} className="btn btn-sm" to={`/insights/topics/${encodeURIComponent(item.topicId.replace(/^topic:/, ''))}`}>{item.title} · 证据墙 ↗</Link>)}</div> : <p className="company-page-gap">暂无已确认的研究关联</p>}</Panel>
    <Panel className="company-page-section" title="资料">{data.documents.loading ? <DataLoading label="资料" /> : data.documents.error ? <p className="company-page-gap">资料暂不可用</p> : <SourceTimeline content={data.documents.value} />}</Panel>
  </article>;
}
function Thesis({ research, state, packet, calcs }: { research: CompanyPageResearch | null; state: CompanyPageState; packet?: DataPacket; calcs: Record<string, unknown> }) {
  if (research?.thesis) return <div title={research.changes?.thesis} data-change-hint={research.changes?.thesis || undefined}><AnswerSentence id="thesis" text={research.thesis} packet={packet} calcs={calcs} /></div>;
  if (!state.loaded) return <DataLoading label="已保存研究" />;
  if (state.error) return <p className="company-page-conclusion is-muted">研究暂不可用，数据仍可查看</p>;
  if (!companyPageProgress(state)) return <p className="company-page-conclusion is-muted">尚无研究判断</p>;
  return null;
}
