import { createContext, useContext, useEffect, useMemo, useState, useSyncExternalStore, type ReactNode } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Loader2 } from 'lucide-react';
import { EvidenceLink } from '../components/EvidenceCard';
import { SourceTimeline } from '../components/WikiReport';
import { ScenarioTable } from '../components/ScenarioTable';
import { conflictValues, fieldIdLabel, otherPeriodText, pagePeriodText, sectionMeta, findField, forecastNote, formulaText, gapText, multipleText, scenarioPriceText, showField, thresholdText, type DataPacket, type PacketField, type ScenarioTableData } from '../lib/companyPacket';
import { loadLivePrice } from '../lib/trackingVariables';
import { COMPANY_TYPE_NAME, calcRefsIn, expectations, variablesQuestion, verdictLine, changeLine, fillSlots, conversationHint, conversationOrigin, epsAt, initialSliderValues, keyIdsOf, newMaterialText, nextReport, numericValue, parseSensitivity, peerMedian, periodLabel, plainNumber, profitAt, quarterSeries, segmentGapText, segmentGross, segmentLine, sliderUnitText, splitSentence, watchItems, yuanText, type LivePrice, type ReportCalendar, type SegmentSummary, type SensitivityModel, type SliderValues } from '../lib/companyNarrative';
import { AnswerSentence, ExpectationRows, FlowBar, GradePills, QuarterBars, SensitivityPanel, ValuationBand, WatchCards, type BandTier, type DriverNote } from '../components/CompanyNarrative';
import { CompanyOpinion } from '../components/CompanyOpinion';
import { ConversationFactors } from '../components/ConversationFactors';
import { ResearchSessionContext } from '../dsh/research-session';
import { companyPageProgress, companyPageStore, companyPageTaskActive, type CompanyPageData, type CompanyPageResearch, type CompanyPageServices, type CompanyPageState } from '../lib/companyPage';
import { financialNumber } from '../lib/financialDisplay';
import { chainPath, createUserChain, defaultChainServices, loadRecommendations, type ChainRecommendation, type ChainServices } from '../lib/chainPage';
import { loadDriverSetByIndustry, type DriverSet } from '../lib/templateDrivers';
import { currencyLabel } from '../lib/marketSymbol';
import { buildCompanySnapshotSections } from '../assistant/companySnapshot';
import type { SnapshotSection } from '../assistant/snapshot';
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
  return <Metric label={label} title={[periodLabel(field.period), note].filter(Boolean).join(' · ')}
    tags={<>{field.period && <MetricTag>{periodLabel(field.period)}</MetricTag>}{note && <MetricTag>{note}</MetricTag>}{ref && <EvidenceLink reference={ref}>出处</EvidenceLink>}</>}
    value={showField(field)} />;
}
function BoundField({ packet, id }: { packet?: DataPacket; id: string }) {
  const field = findField(packet, id);
  if (!field) return <p className="company-page-gap" data-gap="missing">暂时取不到{fieldIdLabel(id)}</p>;
  return <FieldMetric label={id === 'price' ? '快照价格' : fieldIdLabel(field.field_id ?? id)} field={field} note={forecastNote(field)} />;
}
/** 第一层关键数：最多三个（选法 `keyIdsOf` 与问助手快照共用），期间与口径收进悬停。 */
function KeyNumbers({ packet, ids, peers = false }: { packet?: DataPacket; ids: readonly string[]; peers?: boolean }) {
  const shown = keyIdsOf(packet, ids).map(id => ({ id, field: findField(packet, id)! }));
  if (!shown.length) return null;
  return <div className="company-page-metrics" data-key-numbers="">{shown.map(({ id, field }) => {
    const median = peers && (id === 'pe' || id === 'pb') ? peerMedian(packet, id) : null;
    // 估值一节的市盈率是近四季实际利润口径；与利润试算处「按估算利润的市盈率」不同，悬停里说明。
    const recent = peers && id === 'pe';
    return <Metric key={id} label={recent ? '市盈率（近四季）' : fieldIdLabel(field.field_id ?? id)} value={showField(field)}
      title={[periodLabel(field.period), field.scope, recent ? '按近四季实际净利润算；利润试算处的市盈率按估算利润算，两者不同' : ''].filter(Boolean).join(' · ')}
      tags={<>{otherPeriodText(packet, field) && <MetricTag>{otherPeriodText(packet, field)}</MetricTag>}{median != null && <MetricTag>同业中位 {plainNumber(median, id === 'pe' ? 1 : 2)}</MetricTag>}</>} />;
  })}</div>;
}
/** 生意一节的第一层关键数：各业务毛利（没有分部成本时是各业务收入），最多三项。 */
function SegmentNumbers({ summary, packet }: { summary: SegmentSummary; packet?: DataPacket }) {
  if (!summary.shown.length) return null;
  // 有 page_period 时只在分部报告期与页面不同期时标（分部只到半年报）；旧 Backend 保持原样。
  const tag = packet?.page_period ? otherPeriodText(packet, { period: summary.period }) : summary.period ? periodLabel(summary.period) : '';
  return <div className="company-page-metrics" data-key-numbers="" data-segments={summary.mode}>{summary.shown.map(row => {
    const line = segmentLine(row, summary.mode);
    return <Metric key={row.name} label={line.label} value={line.value} title={line.title} tags={tag ? <MetricTag>{tag}</MetricTag> : undefined} />;
  })}</div>;
}
/** 节标题右侧的口径：第一个关键数的期间（年报、日期）。 */
function metaOf(packet: DataPacket | undefined, ids: readonly string[]) {
  const first = keyIdsOf(packet, ids).map(id => findField(packet, id)).find(field => field?.period);
  return sectionMeta(packet, first);
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
  business: '它靠什么赚钱', variables: '价格动一下，利润变多少', cash: '利润是不是真金白银',
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
  return (scenarios?.rows ?? []).flatMap((row): BandTier[] => {
    const price = row.price ? Number(row.price) : NaN;
    if (!Number.isFinite(price)) {
      if (row.price || !row.gapNote) return [];
      // 没有价的档（如亏损）：不上区间带，下面的文字行写明原因，不整表丢。
      const earnings = row.earnings == null ? '' : scenarios?.mode === 'total' ? `利润 ${yuanText(Number(row.earnings))}` : `每股收益 ${plainNumber(Number(row.earnings), 2)} 元/股`;
      return [{ name: row.name, price: null, text: [earnings, multipleText(row.multiple), row.gapNote].filter(Boolean).join(' → ') }];
    }
    const tier = model?.tiers.find(item => item.name === row.name);
    const multiple = multipleText(row.multiple);
    const priceText = scenarioPriceText(row.price);
    const reason = row.reason ? `（${row.reason}）` : '';
    if (model && tier) {
      // 三档统一用主价格（模型第一个因素）讲；其他因素的取值收进该行展开，免得每行讲的价格不一样。
      const lead = model.variables[0];
      const others = model.variables.slice(1).map(item => `${item.name} ${sliderUnitText(item, tier.values[item.id] ?? item.current)}`).join('；');
      const profit = tier.profit ?? profitAt(model, { ...initialSliderValues(model), ...tier.values });
      const variable = lead ? `${lead.name} ${sliderUnitText(lead, tier.values[lead.id] ?? lead.current)}` : '';
      return [{ name: row.name, price, text: [variable, `利润 ${yuanText(profit)}`, `${multiple}${reason}`, priceText].filter(Boolean).join(' → '), more: others || undefined }];
    }
    const earnings = row.earnings == null ? '' : scenarios?.mode === 'total' ? `利润 ${yuanText(Number(row.earnings))}` : `每股收益 ${plainNumber(Number(row.earnings), 2)} 元/股`;
    return [{ name: row.name, price, text: [earnings, `${multiple}${reason}`, priceText].filter(Boolean).join(' → ') }];
  });
}

/** 用户此刻正在看的那一节：视口中线落在哪一节就是哪一节，都不含时取可见面积最大的；没有节返回 undefined。 */
export function viewedCompanySection(root: ParentNode = document, viewportHeight = window.innerHeight): string | undefined {
  const middle = viewportHeight / 2;
  let best: { id: string; visible: number } | undefined;
  for (const element of root.querySelectorAll<HTMLElement>('[data-company-section]')) {
    const id = element.getAttribute('data-company-section');
    if (!id) continue;
    const { top, bottom } = element.getBoundingClientRect();
    if (top <= middle && middle <= bottom) return id;
    const visible = Math.min(bottom, viewportHeight) - Math.max(top, 0);
    if (visible > 0 && (!best || visible > best.visible)) best = { id, visible };
  }
  return best?.id;
}

/** `onSnapshot`：页面每次有可见变化就交出一份分节快照，由外层登记给问助手（页面内容只在这里知道）。 */
/** 推荐所在链：读推荐接口，不再按申万行业自动挂。已建的进入你的那条链，未建的点一下建好再进入；读不到整段不出现。 */
function ChainRecommendations({ symbol, services }: { symbol: string; services: ChainServices }) {
  const navigate = useNavigate();
  const [items, setItems] = useState<ChainRecommendation[]>([]);
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  useEffect(() => {
    const controller = new AbortController();
    setItems([]); setError('');
    void loadRecommendations(symbol, services, controller.signal).then(value => { if (!controller.signal.aborted) setItems(value); });
    return () => controller.abort();
  }, [symbol, services]);
  if (!items.length) return null;
  const build = async (item: ChainRecommendation) => {
    if (busy) return;
    setBusy(item.publicChainId); setError('');
    try { navigate(chainPath(await createUserChain(item.publicChainId, services))); }
    catch { setError('这条产业链没建成，请稍后再试。'); }
    finally { setBusy(''); }
  };
  return <p className="company-page-code" data-chain-entry="">推荐所在链：{items.map((item, index) => <span key={item.publicChainId}>{index ? '、' : ''}
    {item.built && item.userChainId ? <Link to={chainPath(item.userChainId)}>{item.name}</Link>
      : <>{item.name}<button type="button" className="btn btn-text btn-sm" disabled={Boolean(busy)} onClick={() => void build(item)}>{busy === item.publicChainId ? '正在建…' : '建这条产业链'}</button></>}</span>)}
    {error && <span role="alert" data-chain-error=""> {error}</span>}</p>;
}

export function CompanyPage({ symbol, name, services, onSnapshot, chainServices = defaultChainServices }: { symbol: string; name: string; services: CompanyPageServices; onSnapshot?: (sections: SnapshotSection[]) => void; chainServices?: ChainServices }) {
  const research = useCompanyPageState(services, symbol, name, true);
  const store = useMemo(() => companyPageStore(services, symbol, name), [services, symbol, name]);
  const [data, setData] = useState<DataState>(initialData);
  const [scenarios, setScenarios] = useState<ScenarioTableData | null>(null);
  const [calcs, setCalcs] = useState<Record<string, unknown>>({});
  const [slid, setSlid] = useState<SliderValues>({});
  const [reverting, setReverting] = useState<'idle' | 'busy' | 'failed'>('idle');
  const researchSessions = useContext(ResearchSessionContext);
  const openSession = researchSessions ? (sessionId: string) => { void researchSessions.openSession(sessionId).catch(() => {}); } : undefined;
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
  const summaries = Object.values(saved?.sections ?? {}).flatMap(block => [block?.summary, block?.details]);
  const calcKey = unique([...(sensitivityRef ? [sensitivityRef] : []), ...[...summaries, saved?.valuation?.conditions, ...(saved?.pillars ?? []).map(item => item.text), ...(saved?.falsifiers ?? []).map(item => item.text), ...(saved?.catalysts ?? []).map(item => item.event)].flatMap(text => calcRefsIn(text)), ...calcRefsIn(saved?.thesis)]).join(',');
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
  // 预约披露日：A 股读 Backend 日历，读不到（含港股）时「接下来盯什么」退回法定截止日。
  const [calendar, setCalendar] = useState<ReportCalendar | null>(null);
  useEffect(() => {
    const controller = new AbortController();
    setCalendar(null);
    if (!services.readCalendar) return () => controller.abort();
    void services.readCalendar(symbol, controller.signal).then(value => { if (!controller.signal.aborted) setCalendar(value); });
    return () => controller.abort();
  }, [services, symbol]);
  // 所属行业的估值框架（驱动）：用于没有价格模型的公司列「盯什么」；读不到就只列下一次报告。
  const industryCode = data.packet.value?.identity?.industry_code;
  const [templateDrivers, setTemplateDrivers] = useState<DriverSet | null>(null);
  useEffect(() => {
    let alive = true;
    setTemplateDrivers(null);
    if (industryCode) void loadDriverSetByIndustry(industryCode).then(set => { if (alive) setTemplateDrivers(set); });
    return () => { alive = false; };
  }, [industryCode]);
  const model = useMemo(() => sensitivityRef && calcs[sensitivityRef] ? parseSensitivity(calcs[sensitivityRef]) : null, [sensitivityRef, calcs]);
  useEffect(() => { setSlid({}); }, [model]);
  // 页首「现在」用变量最新价，取不到页首退回研究时的默认值并写「研究时」。
  const [live, setLive] = useState<LivePrice | null>(null);
  const impliedId = model?.implied?.id;
  useEffect(() => {
    setLive(null);
    if (!impliedId) return;
    const controller = new AbortController();
    void loadLivePrice(symbol, impliedId, undefined, controller.signal).then(value => { if (!controller.signal.aborted) setLive(value); });
    return () => controller.abort();
  }, [symbol, impliedId]);
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
  const verdict = verdictLine({ grade: saved?.valuation?.grade, model, live });
  const expectation = expectations({ packet, scenarios, model, price, grade: saved?.valuation?.grade, verdict });
  const revert = async () => {
    if (!services.revertResearch) return;
    setReverting('busy');
    try { await services.revertResearch(symbol, research.researchVersion); setReverting('idle'); await store.refresh(); }
    catch (error) { console.warn('[finance/company-page] revert failed', error); setReverting('failed'); }
  };
  // 研究文字里的 {…} 数据引用统一在这里解析成数值；解析不到写「（数据缺失）」。
  const fill = (text?: string) => fillSlots(text, packet, calcs, undefined, price);
  const watch = watchItems({ model, packet, calendar, drivers: templateDrivers });
  // 研究里原有的支柱与不成立的条件不再占第一层，收进「查看数据」。
  const pillars = (saved?.pillars ?? []).map(pillar => {
    const matching = (saved?.falsifiers ?? []).filter(item => item.pillarId === pillar.id);
    return {
      id: pillar.id, text: fill(pillar.text), fieldIds: unique([...(pillar.fieldIds ?? []), ...matching.flatMap(item => item.fieldId ? [item.fieldId] : [])]),
      falsifiers: matching.map(item => [fill(item.text), thresholdText(item.threshold), item.window].filter(Boolean).join(' · ')),
    };
  });
  const loadingBody = (title: string) => data.packet.loading ? <DataLoading label={title} /> : data.packet.error ? <p className="company-page-gap">数据暂时取不到</p> : null;
  const block = (id: 'business' | 'cash' | 'valuation') => saved?.sections?.[id];
  // 小节标题：「影响因素」一节用前两个因素名，其余是固定问句。
  const titles = { ...QUESTIONS, variables: variablesQuestion(model?.variables.map(item => item.name)) };
  const section = (id: keyof typeof QUESTIONS, answer: string | undefined, chart: ReactNode, keys: readonly string[], more: ReactNode, change?: string, meta?: string) => {
    const keyNumbers = <KeyNumbers packet={packet} ids={keys} peers={id === 'valuation'} />;
    return <Panel className="company-page-section" data-company-section={id} title={titles[id]} meta={meta} key={id}>
      {loadingBody(titles[id]) ?? <>
        {answer && <div data-change-hint={change || undefined} title={change}><AnswerSentence id={id} text={answer} packet={packet} calcs={calcs} livePrice={price} /></div>}
        {chart}
        {keyNumbers}
        {more}
      </>}
    </Panel>;
  };
  const hasKeys = (ids: readonly string[]) => ids.some(id => numericValue(findField(packet, id)) != null);
  const moreOf = (id: 'business' | 'cash', ids: readonly string[], keys: readonly string[], gap = '') => {
    const details = block(id)?.details;
    const onFirstLayer = new Set(keyIdsOf(packet, keys));
    const list = unique(ids).filter(fieldId => !onFirstLayer.has(fieldId));
    return (details || list.length || gap) ? <Detail>
      {details && <p>{fill(details)}</p>}
      {gap && <p className="company-page-gap" data-gap="segment-cost">{gap}</p>}
      <div className="company-page-metrics">{list.map(fieldId => <BoundField key={fieldId} packet={packet} id={fieldId} />)}</div>
    </Detail> : null;
  };
  const segments = segmentGross(packet);
  const segmentIds = [...segments.shown, ...segments.excluded].flatMap(row => row.cost != null ? [row.revenueId, row.costId] : [row.revenueId]);
  const businessAll = unique([...(block('business')?.fieldIds ?? []), ...DEFAULT_KEYS.business]);
  // 有分部数据时第一层只放各业务毛利；营业收入、毛利率等总量指标收进「查看数据」。
  const businessKeys = segments.shown.length ? [] : withoutSlots(businessAll, block('business')?.summary);
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
    business: loading || Boolean(block('business')?.summary) || segments.shown.length > 0 || hasKeys(businessKeys),
    variables: loading || Boolean(variableAnswer) || Boolean(model) || bars.length > 0 || Boolean(formula),
    cash: loading || Boolean(block('cash')?.summary) || hasFlow || hasKeys(cashKeys),
    valuation: loading || Boolean(valuation?.summary) || tiers.length > 0 || hasKeys(DEFAULT_KEYS.valuation),
    tracking: (Boolean(saved) && !gapOnly && watch.length > 0) || Boolean(saved?.sections?.tracking?.summary),
  };
  const snapshotSections = onSnapshot ? buildCompanySnapshotSections({
    name, symbol, typeName: saved?.companyType ? COMPANY_TYPE_NAME[saved.companyType] : undefined,
    quote: quote ? { price: quote.price, currencyLabel: currencyLabel(quote.currency), change_pct: quote.change_pct, fetched_at: quote.fetched_at } : null,
    quoteLoading: data.quote.loading,
    thesis: saved?.thesis, gapNote: saved?.gapNote, grade: saved?.valuation?.grade, changeText: change?.text,
    packet, packetLoading: data.packet.loading, packetError: Boolean(data.packet.error), calcs,
    show: showSection, titles,
    answers: { business: block('business')?.summary, variables: variableAnswer, cash: block('cash')?.summary, valuation: valuation?.summary, tracking: saved?.sections?.tracking?.summary },
    keys: { business: businessKeys, cash: cashKeys, valuation: DEFAULT_KEYS.valuation },
    formulaSentence, formula, quarterBars: bars, model, values, price, tiers, adjusted,
    expectLines: saved && !gapOnly ? [...expectation.rows.map(row => row.pieces.map(piece => piece.text).join('')), ...(expectation.difference ? [expectation.difference] : [])] : [],
    impliedText: verdict.implied ? `${verdict.label}：${verdict.implied}${verdict.flip ? `，${verdict.flip}` : ''}` : undefined,
    watch, segments, related: saved?.related ?? [],
  }) : [];
  const snapshotKey = JSON.stringify(snapshotSections);
  useEffect(() => { onSnapshot?.(snapshotSections); }, [snapshotKey]); // eslint-disable-line react-hooks/exhaustive-deps
  return <article className="company-page" aria-label={name}>
    <section className="card company-page-hero">
      <header className="company-page-header"><div><h1 className="workspace-title">{name}</h1><p className="company-page-code">{[symbol, saved?.companyType ? COMPANY_TYPE_NAME[saved.companyType] : ''].filter(Boolean).join(' · ')}</p>
        <ChainRecommendations symbol={symbol} services={chainServices} /></div>
        <div className="company-page-price">{data.quote.loading ? <DataLoading label="行情" /> : quote?.price != null ? <><strong>{financialNumber(quote.price)} <small>{currencyLabel(quote.currency)}</small></strong>{quote.fetched_at && <small className="company-page-quote-time">行情 {periodLabel(quote.fetched_at)}</small>}{quote.change_pct != null && <span className={quote.change_pct > 0 ? 'is-up' : quote.change_pct < 0 ? 'is-down' : undefined} title={quote.fetched_at ? `行情时点 ${quote.fetched_at}` : undefined}>{quote.change_pct > 0 ? '+' : ''}{financialNumber(quote.change_pct)}%</span>}</> : <p className="company-page-gap">行情暂不可用</p>}</div>
      </header>
      <section className="company-page-lead" data-company-section="thesis"><p className="company-page-label">论点</p>
        {gapOnly ? <p className="company-page-conclusion" data-gap-note="">{saved?.gapNote}</p> : <Thesis research={saved} state={research} packet={packet} calcs={calcs} livePrice={price} />}
        {!gapOnly && verdict.label && <p className="company-page-verdict" data-verdict="">
          <Tag brand><span data-valuation-grade={saved?.valuation?.grade}>{verdict.label}</span></Tag>
          {verdict.implied && <span data-verdict-implied="">：{verdict.implied}</span>}
          {verdict.flip && <span data-verdict-flip="">，{verdict.flip}</span>}
        </p>}
        {!gapOnly && change && <p className="company-page-change" data-change-line="">
          <span data-change-hint={change.conversation ? '' : undefined} title={[conversationHint(change.conversation), change.detail].filter(Boolean).join('\n') || undefined}>{change.text}</span>
          {change.conversation?.sessionId && openSession && <button type="button" className="company-page-link" data-open-conversation="" onClick={() => openSession(change.conversation!.sessionId!)}>打开对话</button>}
          {change.revertable && services.revertResearch && <button type="button" className="company-page-link" disabled={reverting === 'busy'} onClick={() => void revert()}>{reverting === 'busy' ? '正在撤回' : '撤回'}</button>}
          {reverting === 'failed' && <span className="company-page-gap" role="status">撤回没有成功，请稍后重试</span>}
        </p>}
        {!gapOnly && change?.conversation && saved?.changes?.thesis && <p className="company-page-origin" data-origin="thesis">论点：{conversationOrigin(change.conversation.at)}</p>}
        <CompanyOpinion name={name} symbol={symbol} />
        {pagePeriodText(packet) && <p className="company-page-period" data-page-period={packet?.page_period}>{pagePeriodText(packet)}</p>}
        {saved && research.stale && !research.error && <p className="company-page-stale" data-stale-line="">
          {newMaterialText(nextReport(packet, new Date(), calendar))}
          <button type="button" className="company-page-link" disabled={companyPageTaskActive(research.task)} onClick={() => void store.restart()}>重新研究</button>
        </p>}
        {research.error && saved && <p className="company-page-gap" role="status">{research.error}</p>}
      </section>
    </section>
    {showSection.business && section('business', block('business')?.summary, <SegmentNumbers summary={segments} packet={packet} />, businessKeys, moreOf('business', [...segmentIds, ...businessAll, ...(block('business')?.fieldIds ?? [])], businessKeys, segmentGapText(segments)), saved?.changes?.business, segments.period ? sectionMeta(packet, { period: segments.period }) : metaOf(packet, businessKeys))}
    {showSection.variables && section('variables', variableAnswer,
      model
        ? <SensitivityPanel model={model} values={values} onChange={(id, value) => setSlid(previous => ({ ...previous, [id]: value }))} onReset={resetSliders} price={price} drivers={notes} onOpenSession={openSession} />
        : <>{(formulaSentence || formula) && <div className="narrative-formula" data-formula="">{formulaSentence && <AnswerSentence id="profit_formula" text={formulaSentence} packet={packet} calcs={calcs} livePrice={price} />}{formula && <span className="company-page-gap">{formula}</span>}</div>}<QuarterBars bars={bars} /></>,
      [],
      (variableBlocks.some(item => item?.details) || variableIds.length || Object.keys(drivers).length || model?.baseLabel || model?.assumptions) ? <Detail>
        {model?.baseLabel && <p data-base-label="">对比期利润：{model.baseLabel}</p>}
        {model?.assumptions && <p data-assumptions="">试算假设：{model.assumptions}</p>}
        {variableBlocks.map((item, index) => item?.details ? <p key={index}>{fill(item.details)}</p> : null)}
        <div className="company-page-metrics">{unique([...variableIds, ...Object.values(drivers).map(item => item.field_id ?? '')]).filter(Boolean).map(fieldId => <BoundField key={fieldId} packet={packet} id={fieldId} />)}</div>
      </Detail> : null,
      saved?.changes?.variables ?? saved?.changes?.profit_formula)}
    {showSection.cash && section('cash', block('cash')?.summary, <FlowBar packet={packet} />, cashKeys, moreOf('cash', unique([...cashAll, ...(block('cash')?.fieldIds ?? [])]), cashKeys), saved?.changes?.cash, metaOf(packet, cashKeys))}
    {showSection.valuation && section('valuation', valuation?.summary,
      <>
        {saved && !gapOnly && <ExpectationRows view={expectation} />}
        <ValuationBand tiers={tiers} price={price} adjusted={adjusted} />
        {saved?.valuation?.grade && !gapOnly && <GradePills grade={saved.valuation.grade} />}
      </>,
      DEFAULT_KEYS.valuation,
      <Detail>
        {verdict.gap && <p data-implied-gap="">{verdict.gap}</p>}
        {saved && !gapOnly && expectation.details.map(line => <p key={line} data-expect-detail="">{line}</p>)}
        {valuation?.details && <p>{fill(valuation.details)}</p>}
        {saved?.valuation?.conditions && !gapOnly && <p data-valuation-conditions="">什么情况会改判断：{fill(saved.valuation.conditions)}</p>}
        <div className="company-page-metrics">{unique(['price', ...(valuation?.fieldIds ?? []), 'eps_ttm', 'eps_forecast', 'eps_forecast_next', 'forward_pe', ...DEFAULT_KEYS.valuation]).filter(fieldId => !keyIdsOf(packet, DEFAULT_KEYS.valuation).includes(fieldId)).map(fieldId => <BoundField key={fieldId} packet={packet} id={fieldId} />)}</div>
        {peersOf(packet).length > 0 && <div className="company-page-metrics">{peersOf(packet).map(item => <FieldMetric key={item.name} label={`${item.name} 市盈率`} field={item.field} />)}</div>}
        {!gapOnly && <ScenarioTable rows={scenarioRef ? scenarios?.rows ?? null : null} mode={scenarios?.mode} />}
      </Detail>,
      saved?.changes?.valuation, metaOf(packet, DEFAULT_KEYS.valuation))}
    {showSection.tracking && section('tracking', saved?.sections?.tracking?.summary, <WatchCards items={watch} />, [],
      (saved?.sections?.tracking?.details || pillars.length || saved?.catalysts?.length) ? <Detail>
        {saved?.sections?.tracking?.details && <p>{fill(saved.sections.tracking.details)}</p>}
        {change?.conversation && saved?.changes?.tracking && pillars.length > 0 && <p className="company-page-origin" data-origin="pillars">支柱与不成立的条件：{conversationOrigin(change.conversation.at)}</p>}
        {pillars.map(item => <div key={item.id} data-pillar={item.id}>
          <p>支柱：{item.text}</p>
          {item.falsifiers.map(line => <p key={line}>不成立的条件：{line}</p>)}
          {item.fieldIds.length > 0 && <div className="company-page-metrics">{item.fieldIds.filter(fieldId => fieldId !== 'price').map(fieldId => <BoundField key={fieldId} packet={packet} id={fieldId} />)}</div>}
        </div>)}
        {saved?.catalysts?.map(item => <p key={`${item.date}${item.event}`}>{item.date} {fill(item.event)}</p>)}
      </Detail> : null,
      saved?.changes?.tracking)}
    {!gapOnly && saved && <ConversationFactors symbol={symbol} researching={companyPageTaskActive(research.task)} onResearch={() => void store.restart()} />}
    <Panel className="company-page-section" title="关联">{saved?.related?.length ? <div className="company-page-relations">{saved.related.map(item => <Link key={item.topicId} className="btn btn-sm" to={`/insights/topics/${encodeURIComponent(item.topicId.replace(/^topic:/, ''))}`}>{item.title} · 证据墙 ↗</Link>)}</div> : <p className="company-page-gap">暂无已确认的研究关联</p>}</Panel>
    <Panel className="company-page-section" title="资料">{data.documents.loading ? <DataLoading label="资料" /> : data.documents.error ? <p className="company-page-gap">资料暂不可用</p> : <SourceTimeline content={data.documents.value} />}</Panel>
  </article>;
}
function Thesis({ research, state, packet, calcs, livePrice }: { research: CompanyPageResearch | null; state: CompanyPageState; packet?: DataPacket; calcs: Record<string, unknown>; livePrice?: number | null }) {
  if (research?.thesis) return <div title={research.changes?.thesis} data-change-hint={research.changes?.thesis || undefined}><AnswerSentence id="thesis" text={research.thesis} packet={packet} calcs={calcs} livePrice={livePrice} /></div>;
  if (!state.loaded) return <DataLoading label="已保存研究" />;
  if (state.error === '服务器拒绝了访问令牌，请在设置里检查') return <p className="company-page-conclusion is-muted">{state.error}</p>;
  if (state.error) return <p className="company-page-conclusion is-muted">研究暂不可用，数据仍可查看</p>;
  if (!companyPageProgress(state)) return <p className="company-page-conclusion is-muted">尚无研究判断</p>;
  return null;
}
