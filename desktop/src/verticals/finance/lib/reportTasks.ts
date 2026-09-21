// 报告任务绑定：会话 ↔ 报告目标（slug + 输入版本），权威状态在 DSH_HOME/research/report-tasks.json。
// 绑定是任务身份索引，不保存执行状态；运行中状态来自会话列表，制品状态来自 Backend。

export interface ReportTaskBinding {
  slug: string;
  input_hash: string;
  bound_at?: string;
  parent_id?: string;
}

export interface ReportTaskStore {
  sessions: Record<string, ReportTaskBinding>;
  host_session_id?: string;
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
