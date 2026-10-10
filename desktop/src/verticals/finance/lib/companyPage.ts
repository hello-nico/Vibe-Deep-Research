import type { Quote } from './api';
import type { CompanyPeekSnapshot } from './companyPeek';
import type { ResearchTaskStatus } from './reportTasks';

export const COMPANY_PAGE_SECTIONS = ['一句话判断', '靠什么赚钱', '利润由什么决定', '关键变量的弹性', '利润是不是真金白银', '估值', '接下来看什么'] as const;
export type CompanyType = 'generic' | 'commodity_cycle' | 'leveraged_cyclical_utility' | 'scarce_asset_rent';
// Research fields follow Stock's page-research contract; task is a DSH projection.
export interface CompanyPageSection {
  id: number; summary: string; details?: string; change?: string; refs?: string[];
  components?: { markdown: string; check: unknown };
}
export interface CompanyPageResearch {
  companyType: CompanyType; researchedAt: string; basisVersion: string; sections: CompanyPageSection[];
  related?: { topicId: string; title: string }[];
}
export interface CompanyPageTask {
  sessionId: string; status: ResearchTaskStatus | 'completed'; stage: string; startedAt?: string;
}
/** A running task always holds back a new start; any other unsuccessful state only for a day, so older ones (incl. pre-T7 Wiki research) do not. */
export const COMPANY_PAGE_RETRY_MS = 24 * 60 * 60 * 1000;
const blocksStart = (task: CompanyPageTask | undefined, now: number) => !!task && task.status !== 'completed'
  && (task.status === 'researching' || now - Date.parse(task.startedAt || '') < COMPANY_PAGE_RETRY_MS);
export interface CompanyPageResearchRead {
  research: CompanyPageResearch | null; stale: boolean; basisVersion: string; task?: CompanyPageTask;
}
export interface CompanyPageFact { metric: string; value: unknown; unit?: string | null; period?: string | null; ref?: string | null; source?: string; provider?: string | null }
// Fields consumed from Backend CompanyFactsResponse; retain its fact categories.
export interface CompanyPageFacts {
  symbol: string; as_of: string;
  facts: { operating_facts: CompanyPageFact[]; financial_facts: CompanyPageFact[]; valuation_facts: CompanyPageFact[] };
}
export interface CompanyPageDocument { document_id: string; title: string; reporting_period?: string; document_type?: string }
export interface CompanyPageData {
  quote: Quote | null; snapshot: CompanyPeekSnapshot | null; facts: CompanyPageFacts; documents: { items: CompanyPageDocument[] };
}
export interface CompanyPageServices {
  data: { [K in keyof CompanyPageData]: (symbol: string, signal: AbortSignal) => Promise<CompanyPageData[K]> };
  readResearch(symbol: string): Promise<CompanyPageResearchRead>;
  subscribeResearch?(listener: () => void): () => void;
  startResearch(symbol: string, name: string, basisVersion: string): Promise<CompanyPageTask>;
}
export interface CompanyPageState {
  loaded: boolean; research: CompanyPageResearch | null; stale: boolean; task?: CompanyPageTask; error?: string;
}
export const EMPTY_COMPANY_PAGE: CompanyPageState = { loaded: false, research: null, stale: false };
export const companyPageTaskActive = (task?: CompanyPageTask) => task?.status === 'researching' || task?.status === 'settling' || task?.status === 'unconfirmed';

/** One owner per service/symbol. Navigation does not cancel DSH or create another task. */
export class CompanyPageStore {
  private state: CompanyPageState = EMPTY_COMPANY_PAGE;
  private listeners = new Set<() => void>();
  private attempted = new Set<string>();
  private reading?: Promise<void>;
  private opened = false;
  private timer?: ReturnType<typeof setTimeout>;
  private unsubscribeResearch?: () => void;
  private completedSession?: string;
  private services: CompanyPageServices;
  private symbol: string;
  private name: string;
  constructor(services: CompanyPageServices, symbol: string, name: string) {
    this.services = services; this.symbol = symbol; this.name = name;
  }
  /** The roster may know only the code at first; a later real name is used for the task title. */
  rename(name: string) { if (name && name !== this.symbol) this.name = name; }
  getSnapshot = () => this.state;
  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    if (this.listeners.size === 1) this.unsubscribeResearch = this.services.subscribeResearch?.(() => {
      if (this.reading) void this.reading.then(() => { if (this.listeners.size) void this.refresh(); });
      else void this.refresh();
    });
    if (companyPageTaskActive(this.state.task)) this.schedule();
    return () => {
      this.listeners.delete(listener);
      if (!this.listeners.size) {
        clearTimeout(this.timer); this.timer = undefined;
        this.unsubscribeResearch?.(); this.unsubscribeResearch = undefined;
      }
    };
  };
  private publish(value: CompanyPageState) { this.state = value; this.listeners.forEach(listener => listener()); }
  private schedule() {
    if (this.timer || !this.listeners.size) return;
    this.timer = setTimeout(() => { this.timer = undefined; void this.refresh(); }, 3000);
  }
  refresh = (opened = false): Promise<void> => {
    if (opened) this.opened = true;
    if (this.reading) return this.reading;
    this.reading = this.read().finally(() => {
      this.reading = undefined;
      if (companyPageTaskActive(this.state.task)) this.schedule();
      else { clearTimeout(this.timer); this.timer = undefined; }
    });
    return this.reading;
  };
  private async read() {
    try {
      let value = await this.services.readResearch(this.symbol);
      if (value.task?.status === 'completed' && this.completedSession !== value.task.sessionId) {
        this.completedSession = value.task.sessionId;
        // The first read may precede the DSH save receipt; read after observing completion.
        value = await this.services.readResearch(this.symbol);
      }
      const task = value.task ?? ((!value.research || value.stale) && companyPageTaskActive(this.state.task) ? this.state.task : undefined);
      this.publish({ loaded: true, research: value.research ?? this.state.research, stale: value.stale, task });
      const key = value.basisVersion;
      if (this.opened && (!value.research || value.stale) && !this.attempted.has(key) && !blocksStart(task, Date.now())) {
        this.attempted.add(key);
        this.publish({ ...this.state, task: { sessionId: '', status: 'researching', stage: '正在开始研究' } });
        try {
          const started = await this.services.startResearch(this.symbol, this.name, key);
          this.publish({ ...this.state, task: started });
        } catch (error) {
          console.warn('[finance/company-page] start failed', error);
          this.publish({ ...this.state, task: { sessionId: '', status: 'failed', stage: '这次研究未完成' } });
        }
      }
    } catch (error) {
      console.warn('[finance/company-page] research unavailable', error);
      this.publish({ ...this.state, loaded: true, error: '研究暂不可用' });
    }
  }
}
const stores = new WeakMap<CompanyPageServices, Map<string, CompanyPageStore>>();
export function companyPageStore(services: CompanyPageServices, symbol: string, name: string) {
  let entries = stores.get(services);
  if (!entries) { entries = new Map(); stores.set(services, entries); }
  let store = entries.get(symbol);
  if (!store) { store = new CompanyPageStore(services, symbol, name); entries.set(symbol, store); }
  return store;
}
export function companyPageProgress(state: CompanyPageState): string | null {
  // A finished task older than the retry window (incl. pre-T7 Wiki research) is history, not the page's state.
  if (state.task && state.task.status !== 'researching' && state.task.startedAt && Date.now() - Date.parse(state.task.startedAt) >= COMPANY_PAGE_RETRY_MS) return null;
  if (companyPageTaskActive(state.task)) return state.task!.stage || (state.task!.status === 'researching' ? '正在研究' : '研究已结束，结果仍在整理');
  if (state.task?.status === 'failed' || state.task?.status === 'invalid') return '这次研究未完成';
  if (state.task?.status === 'cancelled' || state.task?.status === 'interrupted') return '研究已中止';
  if (state.task?.status === 'partial') return '部分内容已整理，尚未形成完整判断';
  if (state.task?.status === 'awaiting_authorization') return '研究草案待确认';
  if (state.task?.status === 'no_increment') return '研究已结束，没有新增内容';
  if (state.task?.status === 'skipped') return '本次研究未整理';
  return null;
}
