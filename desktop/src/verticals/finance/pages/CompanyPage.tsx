import { createContext, useEffect, useMemo, useState, useSyncExternalStore, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { Loader2 } from 'lucide-react';
import { EvidenceLink } from '../components/EvidenceCard';
import { KnowledgeText, SourceTimeline } from '../components/WikiReport';
import { ResearchLoading } from '../components/ui/ResearchLoading';
import { VibeBlock, VibeContext } from '../dsh/vibe-node';
import type { SuggestActions } from '../dsh/suggestion-node';
import { readVibeCheck, vibeBlocks } from '../dsh/vibe';
import { COMPANY_PAGE_SECTIONS, companyPageProgress, companyPageStore, companyPageTaskActive, type CompanyPageData, type CompanyPageSection, type CompanyPageServices, type CompanyPageState } from '../lib/companyPage';
import { formatFactValue, providerName } from '../lib/wikiFacts';
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
  // The page card states the progress once; the process link is secondary there.
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
function SectionBody({ section }: { section?: CompanyPageSection }) {
  const components = section?.components;
  const source = components?.markdown ?? '';
  const check = useMemo(() => readVibeCheck(components?.check), [components?.check]);
  const context = useMemo(() => ({ check, texts: [source], phase: 'hidden' as const, visibleBlocks: new Set<number>(),
    actions: {} as SuggestActions }), [check, source]);
  if (!section) return null;
  // Body prose and validated blocks stay separate; unknown/unvalidated code never leaks into Markdown.
  const blocks = vibeBlocks(source);
  return <>
    <p className="company-page-conclusion" title={section.change} data-change-hint={section.change || undefined}>{section.summary}</p>
    {components && <VibeContext.Provider value={context}>{blocks.map(block => <VibeBlock key={block.offset} code={block.code} options={{ source, offset: block.offset, pending: false }} />)}</VibeContext.Provider>}
    {(section.details || section.refs?.length) ? <Detail>
      {section.details && <KnowledgeText markdown={section.details} />}
      {!!section.refs?.length && <p className="company-page-sources">依据：{section.refs.map((ref, i) => <EvidenceLink key={ref} reference={ref}>{i + 1}</EvidenceLink>)}</p>}
    </Detail> : null}
  </>;
}
type DataState = { [K in keyof CompanyPageData]: { loading: boolean; value?: CompanyPageData[K]; error?: boolean } };
const initialData = (): DataState => ({ quote: { loading: true }, snapshot: { loading: true }, facts: { loading: true }, documents: { loading: true } });
// Sections whose first layer is data the page fetches itself (index = section id − 1).
const DATA_SECTION_METRICS: Record<number, readonly (readonly [string, string])[]> = {
  0: [['revenue', '营业收入'], ['gross_profit', '毛利'], ['net_profit_attributable', '归母净利润']],
  3: [['operating_cash_flow', '经营现金流'], ['capex', '资本开支'], ['cash_dividend', '现金分红']],
  4: [['pe_ttm', '市盈率 TTM'], ['pb', '市净率'], ['dividend_yield', '股息率']],
};
export function CompanyPage({ symbol, name, services, onTask }: { symbol: string; name: string; services: CompanyPageServices; onTask: (sessionId: string) => void }) {
  const research = useCompanyPageState(services, symbol, name, true);
  const [data, setData] = useState<DataState>(initialData);
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
  const quote = data.quote.value;
  const sections = research.research?.sections ?? [];
  const statements = data.snapshot.value?.sections.financials;
  const financials = statements?.status === 'ok' && Array.isArray(statements.data?.items) ? statements.data.items : [];
  const factGroups = data.facts.value?.facts;
  const facts = [...(factGroups?.financial_facts ?? []), ...(factGroups?.valuation_facts ?? []), ...financials].filter((item): item is Record<string, unknown> => !!item && typeof item === 'object')
    .sort((a, b) => String(b.period ?? '').localeCompare(String(a.period ?? '')));
  const valuation = data.snapshot.value?.sections.valuation;
  const values = valuation?.status === 'ok' && valuation.data?.values && typeof valuation.data.values === 'object' ? valuation.data.values as Record<string, unknown> : {};
  const metricValue = (metric: string) => {
    const fact = facts.find(item => item.metric === metric && item.value != null && item.value !== '');
    const value = fact?.value ?? values[metric];
    return value == null || value === '' ? null : { fact, value };
  };
  const metricGroup = (metrics: readonly (readonly [string, string])[]) => <div className="company-page-metrics">{metrics.map(([metric, label]) => {
    const found = metricValue(metric);
    if (!found) return null;
    const { fact, value } = found;
    const item = fact ?? { value, unit: metric === 'dividend_yield' ? '%' : '倍' };
    const period = String(item.period || '');
    const source = providerName(String(item.provider || item.source || valuation?.data?.source || ''));
    return <Metric key={metric} label={label} title={[period || data.snapshot.value?.as_of, source].filter(Boolean).join(' · ')}
      tags={<>{period && <MetricTag>{period}</MetricTag>}{typeof item.ref === 'string' && <EvidenceLink reference={item.ref}>出处</EvidenceLink>}</>}
      value={formatFactValue(item)} />;
  })}</div>;
  return <article className="company-page" aria-label={`${name} 个股页`}>
    <section className="card company-page-hero">
    <header className="company-page-header"><div><h1 className="workspace-title">{name}</h1><p className="company-page-code">{symbol}</p></div>
      <div className="company-page-price">{data.quote.loading ? <DataLoading label="行情" /> : quote?.price != null ? <><strong>{financialNumber(quote.price)} <small>{currencyLabel(quote.currency)}</small></strong>{quote.change_pct != null && <span className={quote.change_pct > 0 ? 'is-up' : quote.change_pct < 0 ? 'is-down' : undefined} title={quote.fetched_at ? `行情时点 ${quote.fetched_at}` : undefined}>{quote.change_pct > 0 ? '+' : ''}{financialNumber(quote.change_pct)}%</span>}</> : <p className="company-page-gap">行情暂不可用</p>}</div>
    </header>
    <section className="company-page-lead" data-company-section="0"><p className="company-page-label">一句话判断</p>
      {research.research ? <SectionBody section={sections.find(section => section.id === 0)} /> : !research.loaded ? <DataLoading label="已保存研究" /> : research.error ? <p className="company-page-conclusion is-muted">研究暂不可用，数据仍可查看</p> : !companyPageProgress(research) && <p className="company-page-conclusion is-muted">尚无研究判断</p>}
      <CompanyPageProgress state={research} location="page" onOpen={onTask} />
      {research.error && research.research && <p className="company-page-gap" role="status">{research.error}</p>}
      {research.research && <Detail><p>研究于 {research.research.researchedAt.slice(0, 10)}</p></Detail>}
    </section>
    </section>
    {COMPANY_PAGE_SECTIONS.slice(1).map((title, i) => {
      const metrics = DATA_SECTION_METRICS[i];
      const section = sections.find(item => item.id === i + 1);
      // Data-only sections: skeleton while either source is still loading; no data and no research means no panel.
      const loading = !!metrics && (data.snapshot.loading || data.facts.loading);
      const hasData = !!metrics && metrics.some(([metric]) => metricValue(metric) != null);
      if (!section && !loading && !hasData) return null;
      return <Panel className="company-page-section" data-company-section={i + 1} title={title} key={title}>
        {metrics && (hasData ? metricGroup(metrics) : loading && <DataLoading label={title} />)}
        <SectionBody section={section} />
      </Panel>;
    })}
    <Panel className="company-page-section" title="关联">{research.research?.related?.length ? <div className="company-page-relations">{research.research.related.map(item => <Link key={item.topicId} className="btn btn-sm" to={`/insights/topics/${encodeURIComponent(item.topicId.replace(/^topic:/, ''))}`}>{item.title} · 证据墙 ↗</Link>)}</div> : <p className="company-page-gap">暂无已确认的研究关联</p>}</Panel>
    <Panel className="company-page-section" title="资料">{data.documents.loading ? <DataLoading label="资料" /> : data.documents.error ? <p className="company-page-gap">资料暂不可用</p> : <SourceTimeline content={data.documents.value} />}</Panel>
    {(data.snapshot.error || data.facts.error) && <p className="company-page-gap" role="status">部分数据暂不可用，已到达的数据仍可查看。</p>}
  </article>;
}
