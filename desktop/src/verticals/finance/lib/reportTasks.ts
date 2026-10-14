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

function within(time: string | undefined, duration: number, now: number): boolean {
  const started = Date.parse(time || '');
  return Number.isFinite(started) && now - started < duration;
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

/** 该对象是否有图文报告在生成（含刚提交、会话还没出现的 15 秒窗口）。公司研究的状态读任务记录，见 researchTasks.ts。 */
export function activeTaskKind(store: ReportTaskStore, slug: string, running: (id: string) => boolean,
  now = Date.now()): 'report' | null {
  if (store.pending?.slug === slug && store.pending.kind !== 'research' && within(store.pending.requested_at, 15_000, now)) return 'report';
  for (const [id, binding] of Object.entries(store.sessions || {})) {
    if (binding.slug === slug && (binding.kind || 'report') === 'report' && running(id)) return 'report';
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
