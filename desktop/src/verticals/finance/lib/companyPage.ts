import type { Quote } from './api';
import type { DataPacket, PacketThreshold, ScenarioTableData } from './companyPacket';

export const COMPANY_PAGE_BLOCKS = [
  ['business', '商业模式'],
  ['profit_formula', '利润公式'],
  ['variables', '变量试算'],
  ['cash', '现金'],
  ['valuation', '估值'],
  ['tracking', '跟踪'],
] as const;
export type CompanyPageBlockId = (typeof COMPANY_PAGE_BLOCKS)[number][0];
export type CompanyType = 'generic' | 'commodity_cycle' | 'leveraged_cyclical_utility' | 'scarce_asset_rent' | 'bank';
export type ValuationGrade = '明显低估' | '偏低' | '合理' | '偏高' | '明显高估';
/** Research fields follow D5 until A line publishes a page-research sample. Task state is a DSH projection. */
export interface CompanyPageBlock {
  summary: string; details?: string; fieldIds?: string[]; calculationRefs?: string[];
}
export interface CompanyPageResearch {
  companyType?: CompanyType; thesis?: string; gapNote?: string; researchedAt?: string; basisVersion?: string;
  sections?: Partial<Record<CompanyPageBlockId, CompanyPageBlock>>;
  pillars?: { id: string; text: string; fieldIds?: string[] }[];
  falsifiers?: { pillarId?: string; text: string; fieldId?: string; window?: string; threshold?: PacketThreshold | null }[];
  catalysts?: { date: string; event: string }[];
  valuation?: { grade?: ValuationGrade; basis?: string[]; conditions?: string; scenarioRef?: string | null };
  changes?: Partial<Record<CompanyPageBlockId | 'thesis', string>>;
  related?: { topicId: string; title: string }[];
  /** T7.3：关键变量的敏感性凭据与变量来源（公司自述或对话确认）。 */
  sensitivity?: { resultRef?: string | null; drivers?: SensitivityDriver[] } | null;
  /** 对话写回带来的来源（来源会话、时间），供页面悬停与撤回。 */
  changedFrom?: { origin?: string; sessionId?: string; at?: string; confirmedAt?: string; reason?: string } | null;
}
export interface SensitivityDriver {
  var_id: string; name?: string; quote?: string; origin?: 'report' | 'conversation'; sessionId?: string; confirmedAt?: string;
}
/** 'researching' is the host record's running; 'interrupted' is continuing by itself from the last finished step. */
export type CompanyResearchStatus = 'researching' | 'interrupted' | 'failed' | 'cancelled' | 'completed';
export interface CompanyPageTask {
  sessionId: string; status: CompanyResearchStatus; stage: string; startedAt?: string;
  /** The research was saved but the knowledge settlement after it did not finish; only the process panel says so. */
  settlementFailed?: boolean;
}
/** The research-task record served by the host (task doc R2); only what the page reads. */
export interface ResearchTaskRecord {
  task_id: string; status: 'running' | 'completed' | 'failed' | 'cancelled' | 'interrupted'; current_step: number;
  steps: { key: string; label: string; status: string }[]; sessions: string[]; reason: string | null; created_at: string;
}
const STATUS_OF: Record<ResearchTaskRecord['status'], CompanyResearchStatus> = {
  running: 'researching', interrupted: 'interrupted', failed: 'failed', cancelled: 'cancelled', completed: 'completed',
};
/** The page's view of a task record: the stage line is the only text the page shows for it. */
export function companyPageTaskOf(record: ResearchTaskRecord): CompanyPageTask {
  const status = STATUS_OF[record.status];
  if (!status || !Array.isArray(record.steps) || !Array.isArray(record.sessions)) throw new Error('研究记录读取失败');
  const label = record.steps[record.current_step - 1]?.label;
  const stage = status === 'researching' ? (label ? `第 ${record.current_step} 步，共 ${record.steps.length} 步 · ${label}` : '正在研究')
    : status === 'interrupted' ? '正在接着上次的进度继续'
    : status === 'failed' ? record.reason || '这次研究未完成，可以稍后重新研究'
    : status === 'cancelled' ? '研究已中止' : '';
  const settlementFailed = status === 'completed' && record.steps[record.steps.length - 1]?.status === 'skipped';
  return { sessionId: record.sessions[record.sessions.length - 1] ?? '', status, stage, startedAt: record.created_at, ...(settlementFailed ? { settlementFailed } : {}) };
}
/** A running task always holds back a new start; any other unsuccessful state only for a day, so older ones (incl. pre-T7 Wiki research) do not. */
export const COMPANY_PAGE_RETRY_MS = 24 * 60 * 60 * 1000;
const blocksStart = (task: CompanyPageTask | undefined, now: number) => !!task && task.status !== 'completed'
  && (companyPageTaskActive(task) || now - Date.parse(task.startedAt || '') < COMPANY_PAGE_RETRY_MS);
export interface CompanyPageResearchRead {
  research: CompanyPageResearch | null; stale: boolean; basisVersion: string; task?: CompanyPageTask;
  /** T7.3：当前研究记录的逻辑版本（撤回时带上，防并发覆盖）与是否有上一版可恢复。 */
  researchVersion?: string; canRevert?: boolean; changedFrom?: CompanyPageResearch['changedFrom'];
}
export interface CompanyPageDocument { document_id: string; title: string; reporting_period?: string; document_type?: string }
export interface CompanyPageData {
  quote: Quote | null; packet: DataPacket; documents: { items: CompanyPageDocument[] };
}
export interface CompanyPageServices {
  data: { [K in keyof CompanyPageData]: (symbol: string, signal: AbortSignal) => Promise<CompanyPageData[K]> };
  /** Background ensure finished for this symbol; re-read the packet quietly. Returns an unsubscribe. */
  subscribePacket?(symbol: string, listener: () => void): () => void;
  readResearch(symbol: string): Promise<CompanyPageResearchRead>;
  readScenario?(ref: string, signal?: AbortSignal): Promise<ScenarioTableData | null>;
  /** 读回一份计算凭据（敏感性、占位引用的 calc）。读不到返回 null，页面照常显示其余内容。 */
  readResult?(ref: string, signal?: AbortSignal): Promise<unknown | null>;
  /** 撤回对话写回：恢复上一版研究。 */
  revertResearch?(symbol: string, expectedResearchVersion?: string): Promise<void>;
  subscribeResearch?(listener: () => void): () => void;
  startResearch(symbol: string, name: string, basisVersion: string): Promise<CompanyPageTask>;
}
export interface CompanyPageState {
  loaded: boolean; research: CompanyPageResearch | null; stale: boolean; task?: CompanyPageTask; error?: string;
  researchVersion?: string; canRevert?: boolean; changedFrom?: CompanyPageResearch['changedFrom'];
}
export const EMPTY_COMPANY_PAGE: CompanyPageState = { loaded: false, research: null, stale: false };
export function companyPageTaskActive(task?: CompanyPageTask) { return task?.status === 'researching' || task?.status === 'interrupted'; }

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
  private basisVersion = '';
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
      this.basisVersion = value.basisVersion;
      const task = value.task ?? ((!value.research || value.stale) && companyPageTaskActive(this.state.task) ? this.state.task : undefined);
      this.publish({ loaded: true, research: value.research ?? this.state.research, stale: value.stale, task, researchVersion: value.researchVersion, canRevert: value.canRevert, changedFrom: value.changedFrom });
      const key = value.basisVersion;
      if (this.opened && (!value.research || value.stale) && !this.attempted.has(key) && !blocksStart(task, Date.now())) {
        this.attempted.add(key);
        await this.begin();
      }
    } catch (error) {
      const denied = error instanceof Error && 'status' in error && (error as { status?: number }).status === 401;
      const unavailable = denied ? '服务器拒绝了访问令牌，请在设置里检查' : '研究暂不可用';
      console.warn('[finance/company-page] research unavailable', denied ? unavailable : error);
      this.publish({ ...this.state, loaded: true, error: unavailable });
    }
  }
  private async begin() {
    this.publish({ ...this.state, task: { sessionId: '', status: 'researching', stage: '正在开始研究' } });
    try {
      const started = await this.services.startResearch(this.symbol, this.name, this.basisVersion);
      this.publish({ ...this.state, task: started });
      this.schedule();
    } catch (error) {
      console.warn('[finance/company-page] start failed', error);
      this.publish({ ...this.state, task: { sessionId: '', status: 'failed', stage: '这次研究未完成' } });
    }
  }
  /** User-initiated 「重新研究」: same entry as the automatic start, but not once per basis version. No-op while a task is running or the page is unread. */
  restart = async () => {
    if (!this.state.loaded || this.state.error || !this.basisVersion || companyPageTaskActive(this.state.task)) return;
    await this.begin();
  };
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
  const task = state.task;
  if (!task || task.status === 'completed') return null;
  // An unsuccessful task older than the retry window (incl. pre-T7 Wiki research) is history, not the page's state.
  if (!companyPageTaskActive(task) && task.startedAt && Date.now() - Date.parse(task.startedAt) >= COMPANY_PAGE_RETRY_MS) return null;
  if (task.stage) return task.stage;
  return task.status === 'researching' ? '正在研究' : task.status === 'interrupted' ? '正在接着上次的进度继续'
    : task.status === 'cancelled' ? '研究已中止' : '这次研究未完成';
}
