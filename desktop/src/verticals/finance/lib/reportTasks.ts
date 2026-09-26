// 报告任务绑定：会话 ↔ 报告目标（slug + 输入版本），权威状态在 DSH_HOME/research/report-tasks.json。
// 绑定是任务身份索引，不保存执行状态；运行中状态来自会话列表，制品状态来自 Backend。

export interface ReportTaskBinding {
  kind?: 'report' | 'research';
  slug: string;
  title?: string;
  input_hash?: string;
  symbol?: string;
  run_status?: 'running' | 'completed' | 'failed' | 'cancelled';
  finished_at?: string;
  settlement_status?: string;
  settlement_reason?: string;
  settlement_updated_at?: string;
  bound_at?: string;
  parent_id?: string;
}

export const RESEARCH_START_GRACE_MS = 15_000;
// Corresponds to the research settlement deadline in Stock dsh/src/research-tools.mjs.
export const RESEARCH_SETTLEMENT_MS = 180_000;

export type ResearchTaskStatus = 'researching' | 'settling' | 'awaiting_authorization' | 'no_increment'
  | 'partial' | 'failed' | 'cancelled' | 'interrupted' | 'unconfirmed' | 'skipped' | 'published' | 'invalid';

export interface ResearchSettlementRecord {
  status?: string;
  display_status?: string;
  started_at?: string;
  settlement_reason?: string;
  reason?: string;
  draft_id?: string;
  draft_token?: string;
}

export function researchDraftStatus(status: 'pending' | 'published' | 'invalid'): ResearchTaskStatus {
  return status === 'pending' ? 'awaiting_authorization' : status === 'published' ? 'published' : 'invalid';
}

export const SETTLEMENT_SKIP_REASONS: Record<string, string> = {
  no_material: '没有可整理的新材料',
  snapshot_too_large: '本轮材料过多，未自动整理',
  ingest_timeout: '年报入库未完成',
};

export function researchSkipReasonText(reason?: string): string {
  return (reason && SETTLEMENT_SKIP_REASONS[reason]) || '';
}

export function researchSkipSummary(reason?: string): string {
  const text = researchSkipReasonText(reason);
  return text ? `本次没有整理：${text}` : '本次没有整理';
}

function within(time: string | undefined, duration: number, now: number): boolean {
  const started = Date.parse(time || '');
  return Number.isFinite(started) && now - started < duration;
}

export function researchTaskStatus(binding: ReportTaskBinding, running: boolean,
  settlement?: ResearchSettlementRecord | null, now = Date.now()): ResearchTaskStatus {
  if (running) return 'researching';
  if (binding.run_status === 'failed' || binding.run_status === 'cancelled') return binding.run_status;
  const result = settlement?.display_status || settlement?.status || binding.settlement_status;
  if (result === 'running' || result === 'waiting_ingest') {
    const started = settlement?.started_at || binding.settlement_updated_at;
    return within(started, RESEARCH_SETTLEMENT_MS, now) ? 'settling' : 'interrupted';
  }
  if (result === 'awaiting_authorization' || result === 'no_increment' || result === 'partial'
    || result === 'failed' || result === 'cancelled' || result === 'interrupted' || result === 'skipped') return result;
  if (binding.run_status === 'running')
    return within(binding.bound_at, RESEARCH_START_GRACE_MS, now) ? 'researching' : 'interrupted';
  return 'unconfirmed';
}

export async function startResearchRun(input: { slug: string; symbol: string; prompt: string; title: string }): Promise<{ session_id: string; status: 'started' | 'running' }> {
  const response = await fetch('/finance-research-runs', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(input) });
  const payload = await response.json().catch(() => ({})) as { session_id?: string; status?: string; detail?: string };
  if (!response.ok) throw new Error(payload.detail || '公司研究任务启动失败');
  if (!payload.session_id || !payload.status) throw new Error('公司研究任务启动失败');
  return payload as { session_id: string; status: 'started' | 'running' };
}

export async function cancelResearchRun(sessionId: string): Promise<void> {
  const response = await fetch('/finance-research-runs', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'cancel', session_id: sessionId }) });
  if (!response.ok) {
    const payload = await response.json().catch(() => ({})) as { detail?: string };
    throw new Error(payload.detail || '无法中止该研究任务');
  }
}

export interface ReportTaskStore {
  sessions: Record<string, ReportTaskBinding>;
  host_session_id?: string;
  pending?: { kind?: 'research' | 'report'; slug?: string; requested_at?: string } | null;
}

export type ReportArtifact = { report_id: string; created_at: string; input_hash: string; session_id?: string };

export function reportTaskTitle(binding: ReportTaskBinding, objectLabel?: string): string {
  const name = binding.title?.replace(/^报告生成\s*·\s*/, '').trim()
    || (objectLabel && !['公司研究', '行业研究'].includes(objectLabel) ? objectLabel : '')
    || binding.slug;
  return `图文报告 · ${name}`;
}

export function activeTaskKind(store: ReportTaskStore, slug: string, running: (id: string) => boolean,
  now = Date.now()): 'research' | 'report' | null {
  if (store.pending?.slug === slug && within(store.pending.requested_at, 15_000, now))
    return store.pending.kind === 'research' ? 'research' : 'report';
  for (const [id, binding] of Object.entries(store.sessions || {})) {
    if (binding.slug !== slug) continue;
    if (binding.kind === 'research' && (running(id)
      || (binding.settlement_status === 'running' && within(binding.settlement_updated_at, RESEARCH_SETTLEMENT_MS, now)))) return 'research';
    if ((binding.kind || 'report') === 'report' && running(id)) return 'report';
  }
  return null;
}

export function reportTaskOutcome(binding: ReportTaskBinding, running: boolean,
  artifacts: readonly ReportArtifact[] | null, sessionId: string): 'running' | 'generated' | 'unsaved' | 'failed' | 'cancelled' | 'unconfirmed' {
  if (running) return 'running';
  if (binding.run_status === 'failed' || binding.run_status === 'cancelled') return binding.run_status;
  if (!artifacts || !binding.bound_at) return 'unconfirmed';
  const started = Date.parse(binding.bound_at);
  if (!Number.isFinite(started)) return 'unconfirmed';
  if (artifacts.some(item => item.session_id === sessionId && item.input_hash === binding.input_hash
    && Date.parse(item.created_at) >= started)) return 'generated';
  return binding.run_status === 'completed' ? 'unsaved' : 'unconfirmed';
}

export type LatestResearch = { sessionId: string; status: ResearchTaskStatus; runFailed: boolean; startedAt?: string; finishedAt?: string };

/** 某对象最近一次公司研究及其阶段（研究中 / 整理中 / 整理结果）；没有研究记录时为 null。 */
export function latestResearch(store: ReportTaskStore | null, slug: string, running: (id: string) => boolean,
  now = Date.now()): LatestResearch | null {
  let latest: [string, ReportTaskBinding] | null = null;
  for (const entry of Object.entries(store?.sessions || {})) {
    if (entry[1].kind !== 'research' || entry[1].slug !== slug) continue;
    if (!latest || String(entry[1].bound_at || '') > String(latest[1].bound_at || '')) latest = entry;
  }
  if (!latest) return null;
  const [sessionId, binding] = latest;
  return { sessionId, status: researchTaskStatus(binding, running(sessionId), null, now),
    runFailed: binding.run_status === 'failed' || binding.run_status === 'cancelled', startedAt: binding.bound_at, finishedAt: binding.finished_at };
}

/** 该对象正在生成的图文报告（含刚提交、会话还没出现的 15 秒窗口）；没有时为 null。 */
export function runningReport(store: ReportTaskStore | null, slug: string, running: (id: string) => boolean,
  now = Date.now()): { startedAt?: string } | null {
  for (const [id, binding] of Object.entries(store?.sessions || {})) {
    if ((binding.kind || 'report') === 'report' && binding.slug === slug && running(id)) return { startedAt: binding.bound_at };
  }
  const pending = store?.pending;
  if (pending?.slug === slug && pending.kind !== 'research' && within(pending.requested_at, 15_000, now)) return { startedAt: pending.requested_at };
  return null;
}

function elapsed(label: string, startedAt: string | undefined, now: number): string {
  const minutes = Math.floor((now - Date.parse(startedAt || '')) / 60_000);
  return Number.isFinite(minutes) && minutes >= 1 ? `${label} · 已用 ${minutes} 分钟` : label;
}

function monthDay(time?: string): string {
  const date = new Date(time || '');
  return Number.isNaN(date.getTime()) ? '' : `${date.getMonth() + 1} 月 ${date.getDate()} 日`;
}

/**
 * 研究名单每行的状态：后台长时间运行的 Agent 任务（公司研究、知识整理、图文报告）进行中时优先显示，
 * 其次是待你确认的结论；其余只在研究页还没有结论时说明上次研究的结果。
 * tone 为 active 时是进行中或待你处理，其余为弱提示。
 */
export function researchProgressLine(research: LatestResearch | null, report: { startedAt?: string } | null,
  draftPending: boolean, hasSummary: boolean, now = Date.now()): { text: string; tone: 'active' | 'muted' } | null {
  const status = research?.status;
  if (status === 'researching') return { text: elapsed('公司研究进行中', research?.startedAt, now), tone: 'active' };
  if (status === 'settling') return { text: '研究已完成，正在整理结论', tone: 'active' };
  if (report) return { text: elapsed('图文报告生成中', report.startedAt, now), tone: 'active' };
  if (draftPending) return { text: '有新的研究结论，确认后写入研究页', tone: 'active' };
  if (hasSummary) return null;
  if (!research) return { text: '还没有研究结论，可发起公司研究', tone: 'muted' };
  const day = monthDay(research.finishedAt || research.startedAt);
  const when = day ? `${day} ` : '';
  if (research.runFailed) return { text: `${when}的研究没有完成，可重新发起`, tone: 'muted' };
  if (status === 'no_increment' || status === 'skipped') return { text: `${when}已研究，这次没有新增结论`, tone: 'muted' };
  return { text: `${when}已研究，结论未写入研究页，可重新发起`, tone: 'muted' };
}

export function legacyCompanySymbol(title: string): string | undefined {
  return /^公司研究 · (\d{6}) · /.exec(title)?.[1];
}

export async function bindReportTask(sessionId: string, slug: string, inputHash: string): Promise<ReportTaskBinding> {
  const response = await fetch("/finance-report-tasks", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ session_id: sessionId, slug, input_hash: inputHash }),
  });
  if (!response.ok) {
    const payload = (await response.json().catch(() => ({}))) as { detail?: string };
    throw new Error(payload.detail || "报告任务绑定失败");
  }
  return (await response.json()) as ReportTaskBinding;
}

export async function loadReportTasks(): Promise<ReportTaskStore> {
  const response = await fetch("/finance-report-tasks");
  if (!response.ok) throw new Error("报告任务读取失败");
  return (await response.json()) as ReportTaskStore;
}

export async function startReportRun(input: { slug: string; input_hash: string; prompt: string; title?: string }): Promise<{
  session_id: string;
  status: 'started' | 'running' | 'busy_other_version';
  host_session_id?: string;
}> {
  const response = await fetch("/finance-report-runs", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  const payload = await response.json().catch(() => ({})) as { session_id?: string; status?: string; detail?: string };
  if (!response.ok) throw new Error(payload.detail || "报告任务启动失败");
  if (!payload.session_id || !payload.status) throw new Error("报告任务启动失败");
  return payload as { session_id: string; status: 'started' | 'running' | 'busy_other_version'; host_session_id?: string };
}

export async function cancelReportRun(sessionId: string): Promise<void> {
  const response = await fetch("/finance-report-runs", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action: "cancel", session_id: sessionId }),
  });
  if (!response.ok) {
    const payload = (await response.json().catch(() => ({}))) as { detail?: string };
    throw new Error(payload.detail || "无法中止该任务");
  }
}
