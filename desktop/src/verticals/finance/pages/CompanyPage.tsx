import { createContext, useEffect, useMemo, useState, useSyncExternalStore, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { Loader2 } from 'lucide-react';
import { EvidenceLink } from '../components/EvidenceCard';
import { SourceTimeline } from '../components/WikiReport';
import { ResearchLoading } from '../components/ui/ResearchLoading';
import { ScenarioTable } from '../components/ScenarioTable';
import { conflictValues, fieldIdLabel, fieldLabel, findField, forecastNote, formulaText, gapText, showField, thresholdText, type DataPacket, type PacketField, type ScenarioTableData } from '../lib/companyPacket';
import { COMPANY_PAGE_BLOCKS, companyPageProgress, companyPageStore, companyPageTaskActive, type CompanyPageBlock, type CompanyPageBlockId, type CompanyPageData, type CompanyPageResearch, type CompanyPageServices, type CompanyPageState } from '../lib/companyPage';
import { financialNumber } from '../lib/financialDisplay';
import { currencyLabel } from '../lib/marketSymbol';
import { Metric, MetricTag, Panel } from '../components/ui/Card';
import './company-page.css';

export const CompanyPageServicesContext = createContext<CompanyPageServices | null>(null);
export function useCompanyPageState(services: CompanyPageServices, symbol: string, name: string, opened = false) {
  const store = useMemo(() => companyPageStore(services, symbol, name), [services, symbol, name]);
  const state = useSyncExternalStore(store.subscribe, store.getSnapshot, store.getSnapshot);
  useEffect(() => { store.rename(name); }, [store, name]);
  useEffect(() => { void store.refresh(opened); }, [store, opened]);
  return state;
}
export function CompanyPageProgress({ state, location, onOpen }: { state: CompanyPageState; location: 'roster' | 'toolbar' | 'page'; onOpen: (sessionId: string) => void }) {
  const label = companyPageProgress(state);
  if (!label) return null;
  const running = companyPageTaskActive(state.task);
  const sessionId = state.task?.sessionId;
  const content = <>{running && <Loader2 size={14} className="animate-spin" aria-hidden="true" />}{label}</>;
  if (location === 'page') return <div data-company-progress="page" className="company-page-progress is-page" role="status" aria-live="polite">
    {running ? <ResearchLoading compact title={label} sections={['个股页研究']} active={{ index: 0, label }} /> : <p className="company-page-conclusion is-muted">{label}</p>}
    {sessionId && <button type="button" className="company-page-link" onClick={() => onOpen(sessionId)}>查看研究过程</button>}
  </div>;
  const className = location === 'toolbar' ? 'workspace-action' : 'company-roster-progress';
  return <div data-company-progress={location} className={`company-page-progress is-${location}`} role="status" aria-live="polite">
    {sessionId ? <button type="button" className={className} onClick={() => onOpen(sessionId)} title="查看研究过程">{content}</button> : <span className={className}>{content}</span>}
  </div>;
}
function DataLoading({ label }: { label: string }) {
  return <div className="company-page-skeleton" role="status" aria-label={`正在读取${label}`}><span /><span /></div>;
}
function Detail({ children }: { children: ReactNode }) {
  return <details className="company-page-detail"><summary>查看依据与解释</summary><div>{children}</div></details>;
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
function Fields({ packet, ids }: { packet?: DataPacket; ids: readonly string[] }) {
  if (!packet) return null;
  return <div className="company-page-metrics">{ids.map(id => {
    const field = packet.fields[id];
    return field ? <FieldMetric key={id} label={fieldLabel(id)} field={field} note={forecastNote(field)} /> : null;
  })}</div>;
}
function BlockText({ id, block, change }: { id: string; block?: CompanyPageBlock; change?: string }) {
  if (!block?.summary) return null;
  return <>
    <p className="company-page-conclusion" data-company-summary={id} title={change} data-change-hint={change || undefined}>{block.summary}</p>
    {block.details && <Detail><p>{block.details}</p></Detail>}
  </>;
}
function peersOf(packet?: DataPacket) {
  const peers = packet?.fields.peers;
  return (peers?.items ?? []).flatMap(item => item.pe && item.pe.status !== 'gap' && item.pe.value != null ? [{ name: item.name || item.symbol || '同业', field: item.pe }] : []);
}
type DataState = { [K in keyof CompanyPageData]: { loading: boolean; value?: CompanyPageData[K]; error?: boolean } };
const initialData = (): DataState => ({ quote: { loading: true }, packet: { loading: true }, documents: { loading: true } });
export function CompanyPage({ symbol, name, services, onTask }: { symbol: string; name: string; services: CompanyPageServices; onTask: (sessionId: string) => void }) {
  const research = useCompanyPageState(services, symbol, name, true);
  const [data, setData] = useState<DataState>(initialData);
  const [scenarios, setScenarios] = useState<ScenarioTableData | null>(null);
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
  const packet = data.packet.value;
  const quote = data.quote.value;
  const drivers = packet?.industry_drivers?.fields ?? {};
  const gapOnly = Boolean(saved?.gapNote);
  return <article className="company-page" aria-label={`${name} 个股页`}>
    <section className="card company-page-hero">
      <header className="company-page-header"><div><h1 className="workspace-title">{name}</h1><p className="company-page-code">{symbol}</p></div>
        <div className="company-page-price">{data.quote.loading ? <DataLoading label="行情" /> : quote?.price != null ? <><strong>{financialNumber(quote.price)} <small>{currencyLabel(quote.currency)}</small></strong>{quote.change_pct != null && <span className={quote.change_pct > 0 ? 'is-up' : quote.change_pct < 0 ? 'is-down' : undefined} title={quote.fetched_at ? `行情时点 ${quote.fetched_at}` : undefined}>{quote.change_pct > 0 ? '+' : ''}{financialNumber(quote.change_pct)}%</span>}</> : <p className="company-page-gap">行情暂不可用</p>}</div>
      </header>
      <section className="company-page-lead" data-company-section="thesis"><p className="company-page-label">论点</p>
        {gapOnly ? <p className="company-page-conclusion" data-gap-note="">{saved?.gapNote}</p> : <Thesis research={saved} state={research} />}
        {!gapOnly && saved?.valuation?.grade && <p className="company-page-grade" data-valuation-grade={saved.valuation.grade}>{saved.valuation.grade}</p>}
        <CompanyPageProgress state={research} location="page" onOpen={onTask} />
        {research.error && saved && <p className="company-page-gap" role="status">{research.error}</p>}
        {saved && !gapOnly && saved.researchedAt && <Detail><p>研究于 {saved.researchedAt.slice(0, 10)}</p>{saved.valuation?.conditions && <p>{saved.valuation.conditions}</p>}</Detail>}
      </section>
    </section>
    {COMPANY_PAGE_BLOCKS.map(([id, title]) => <Panel className="company-page-section" data-company-section={id} title={title} key={id}>
      {data.packet.loading ? <DataLoading label={title} /> : data.packet.error ? <p className="company-page-gap">数据暂时取不到</p> : <BlockBody id={id} packet={packet} block={saved?.sections?.[id]} change={saved?.changes?.[id]} research={saved} scenarios={scenarios} scenarioRef={scenarioRef} drivers={drivers} />}
    </Panel>)}
    <Panel className="company-page-section" title="关联">{saved?.related?.length ? <div className="company-page-relations">{saved.related.map(item => <Link key={item.topicId} className="btn btn-sm" to={`/insights/topics/${encodeURIComponent(item.topicId.replace(/^topic:/, ''))}`}>{item.title} · 证据墙 ↗</Link>)}</div> : <p className="company-page-gap">暂无已确认的研究关联</p>}</Panel>
    <Panel className="company-page-section" title="资料">{data.documents.loading ? <DataLoading label="资料" /> : data.documents.error ? <p className="company-page-gap">资料暂不可用</p> : <SourceTimeline content={data.documents.value} />}</Panel>
  </article>;
}
function Thesis({ research, state }: { research: CompanyPageResearch | null; state: CompanyPageState }) {
  if (research?.thesis) return <p className="company-page-conclusion" title={research.changes?.thesis} data-change-hint={research.changes?.thesis || undefined}>{research.thesis}</p>;
  if (!state.loaded) return <DataLoading label="已保存研究" />;
  if (state.error) return <p className="company-page-conclusion is-muted">研究暂不可用，数据仍可查看</p>;
  if (!companyPageProgress(state)) return <p className="company-page-conclusion is-muted">尚无研究判断</p>;
  return null;
}
function BlockBody({ id, packet, block, change, research, scenarios, scenarioRef, drivers }: {
  id: CompanyPageBlockId; packet?: DataPacket; block?: CompanyPageBlock; change?: string; research: CompanyPageResearch | null;
  scenarios: ScenarioTableData | null; scenarioRef?: string | null; drivers: Record<string, PacketField>;
}) {
  return <>
    {id === 'business' && <Fields packet={packet} ids={['revenue', 'gross_margin']} />}
    {id === 'profit_formula' && <>
      <Fields packet={packet} ids={['net_profit_attributable']} />
      {formulaText(packet!) && <p className="company-page-conclusion">{formulaText(packet!)}</p>}
      <div className="company-page-metrics">{Object.entries(drivers).map(([metric, field]) => <FieldMetric key={metric} label={fieldLabel(metric)} field={field} />)}</div>
    </>}
    {id === 'cash' && <Fields packet={packet} ids={['operating_cash_flow', 'capex_cash', 'dividend_paid', 'residual_cash']} />}
    {id === 'valuation' && <>
      <Fields packet={packet} ids={['price', 'pe', 'pb', 'dividend_yield', 'eps_ttm', 'eps_forecast', 'eps_forecast_next', 'forward_pe']} />
      {peersOf(packet).length > 0 && <div className="company-page-metrics">{peersOf(packet).map(item => <FieldMetric key={item.name} label={`${item.name} 市盈率`} field={item.field} />)}</div>}
      {!research?.gapNote && <ScenarioTable rows={scenarioRef ? scenarios?.rows ?? null : null} mode={scenarios?.mode} />}
    </>}
    {id === 'tracking' && research && <>
      {research.pillars?.map(item => <div key={item.id} data-pillar={item.id}>
        <p className="company-page-conclusion">{item.text}</p>
        <div className="company-page-metrics">{(item.fieldIds ?? []).map(fieldId => <BoundField key={fieldId} packet={packet} id={fieldId} />)}</div>
      </div>)}
      {research.falsifiers?.map(item => {
        const condition = [thresholdText(item.threshold), item.window].filter(Boolean).join(' · ');
        return <div key={item.text} data-falsifier="">
          <p>{item.text}{condition ? ` ${condition}` : ''}</p>
          {item.fieldId && <BoundField packet={packet} id={item.fieldId} />}
        </div>;
      })}
      {research.catalysts?.length ? <Detail>
        {research.catalysts.map(item => <p key={`${item.date}${item.event}`}>{item.date} {item.event}</p>)}
      </Detail> : null}
    </>}
    <BlockText id={id} block={block} change={change} />
  </>;
}
