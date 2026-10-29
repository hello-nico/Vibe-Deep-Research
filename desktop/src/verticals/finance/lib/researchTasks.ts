import { researchRead } from './research';
import { readRequest } from './readRequest';
import { gradeLabel } from './companyNarrative';

/**
 * 公司研究的任务记录：宿主只读接口 `GET /finance-research-tasks`（任务记录与自动续跑 R2/R4）。
 * 页面只显示「第 N 步，共 6 步 · 名称」和一句结果，不显示记录里的其他内容。
 */
export type ResearchRecordStatus = 'running' | 'completed' | 'failed' | 'cancelled' | 'interrupted';
export type ResearchStepStatus = 'pending' | 'running' | 'done' | 'skipped' | 'failed';
export interface ResearchRecordStep { key: string; label: string; status: ResearchStepStatus; outputs?: Record<string, unknown> }
export interface ResearchRecord {
  task_id: string; symbol: string; slug?: string; title?: string; status: ResearchRecordStatus; current_step: number;
  steps: ResearchRecordStep[]; sessions: string[]; reason: string | null; created_at: string; updated_at: string; finished_at?: string | null;
  trigger?: string | null; trigger_period?: string | null; report_period?: string | null;
}

const STATUSES = new Set<string>(['running', 'completed', 'failed', 'cancelled', 'interrupted']);

export async function loadResearchTasks(query: { symbol?: string; limit?: number } = {}, signal?: AbortSignal): Promise<ResearchRecord[]> {
  const params = new URLSearchParams();
  if (query.symbol) params.set('symbol', query.symbol);
  if (query.limit) params.set('limit', String(query.limit));
  const response = await readRequest(`/finance-research-tasks${params.size ? `?${params}` : ''}`, { signal });
  const payload = await response.json().catch(() => null) as { items?: ResearchRecord[] } | null;
  if (!response.ok || !Array.isArray(payload?.items)) throw new Error('研究记录读取失败');
  if (payload.items.some(item => !STATUSES.has(item.status) || !Array.isArray(item.steps))) throw new Error('研究记录读取失败');
  return payload.items;
}

/** 每家公司只留最新一条，按更新时间倒序，最多 limit 家。 */
export function latestPerCompany(items: readonly ResearchRecord[], limit = 10): ResearchRecord[] {
  const newest = new Map<string, ResearchRecord>();
  for (const item of items) {
    const seen = newest.get(item.symbol);
    if (!seen || item.updated_at > seen.updated_at) newest.set(item.symbol, item);
  }
  return [...newest.values()].sort((a, b) => b.updated_at.localeCompare(a.updated_at)).slice(0, limit);
}

export const researchActive = (record: ResearchRecord) => record.status === 'running' || record.status === 'interrupted';

/** 某家公司此刻是否有研究在进行（含自动接续）。读不到记录时抛错，由调用方决定怎么处理。 */
export async function companyResearchRunning(symbol: string, signal?: AbortSignal): Promise<boolean> {
  const [latest] = await loadResearchTasks({ symbol, limit: 1 }, signal);
  return !!latest && researchActive(latest);
}

const CODE_ONLY = /^\d{6}(\.(SH|SZ|BJ))?$/i;
/** 任务标题里没有公司名（空或只是代码）：显示时要补名。 */
export const needsCompanyName = (record: ResearchRecord) => CODE_ONLY.test((record.title || '').replace(/^公司研究\s*·\s*/, '').trim()) || !(record.title || '').trim();
/** 就地补名：标题没有公司名且查到了名称，标题改写成「公司研究 · 名称」；查不到原样返回。 */
export const withCompanyName = (record: ResearchRecord, names: Record<string, string>): ResearchRecord => {
  const name = needsCompanyName(record) ? names[record.symbol.split('.')[0]!] : undefined;
  return name ? { ...record, title: `公司研究 · ${name}` } : record;
};
export const companyNameOf = (record: ResearchRecord) => (record.title || '').replace(/^公司研究\s*·\s*/, '') || record.symbol.split('.')[0]!;

/** 研究步骤的显示名：主机记录里的原名有内部用语时，在界面上换成白话。 */
const STEP_LABEL: Record<string, string> = {
  fetch: '收集资料',
  read_report: '读报告',
  key_variables: '算价格影响',
  valuation: '估值与判断',
  save: '保存资料',
  settle: '整理结论',
};
const stepLabel = (step: { key: string; label: string }) => STEP_LABEL[step.key] ?? step.label;

export const stepProgress = (record: ResearchRecord) => {
  const step = record.steps[record.current_step - 1];
  const label = step ? stepLabel(step) : undefined;
  return label ? `${record.current_step}/${record.steps.length} · ${label}` : '研究中';
};

/** 一行的结果句。grade 是个股页研究里的估值五档，读不到就只写「完成」。 */
export function researchLine(record: ResearchRecord, grade?: string | null): string {
  switch (record.status) {
    case 'running': return stepProgress(record);
    case 'interrupted': return '继续中';
    case 'completed': return grade ? `完成 · ${gradeLabel(grade)}` : '完成';
    case 'failed': return record.reason || '未完成';
    default: return '已中止';
  }
}

const STEP_STATE: Record<ResearchStepStatus, string> = { pending: '等待', running: '进行中', done: '完成', skipped: '跳过', failed: '未完成' };
/** 展开后的六步：名称 + 状态；读报告步附报告标题，关键变量步附变量名，其余输出不显示。 */
export function researchStepRows(record: ResearchRecord): { key: string; label: string; state: string; status: ResearchStepStatus; note: string }[] {
  return record.steps.map(step => {
    const outputs = step.outputs ?? {};
    const note = step.key === 'read_report' && typeof outputs.title === 'string' ? outputs.title
      : step.key === 'key_variables' && Array.isArray(outputs.variables) ? outputs.variables.filter(item => typeof item === 'string').join('、') : '';
    return { key: step.key, label: stepLabel(step), state: STEP_STATE[step.status] ?? '', status: step.status, note };
  });
}

export async function readValuationGrade(symbol: string, signal?: AbortSignal): Promise<string | null> {
  try {
    const page = await researchRead<{ research?: { valuation?: { grade?: string } } | null }>(`/wiki/companies/${symbol}/page-research`, { signal });
    return page.research?.valuation?.grade ?? null;
  } catch { return null; }
}
