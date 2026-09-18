import { useEffect, useState, useSyncExternalStore } from 'react';
import { X } from 'lucide-react';
import { useResearchSessions, type TaskProcessRef, type TaskTrajectoryStep } from '../dsh/research-session';
import { durationLabel, emptyTaskTrajectory } from '../lib/taskTrajectory';
import './task-process.css';

const noopSubscribe = () => () => {};
const emptySnapshot = () => emptyTaskTrajectory;

function clock(time?: number) {
  if (!time) return '';
  return new Date(time).toLocaleString('zh-CN', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

function StepCard({ step }: { step: TaskTrajectoryStep }) {
  const [open, setOpen] = useState(Boolean(step.failed || step.streaming));
  const meta = [clock(step.time), durationLabel(step.durationMs)].filter(Boolean).join(' · ');
  const expandable = Boolean(step.body || step.detail || step.args || step.error);
  return <li className={`task-process-step${step.failed ? ' is-failed' : ''}${step.streaming ? ' is-streaming' : ''}`}>
    <button type="button" className="task-process-step-head" disabled={!expandable} aria-expanded={open} onClick={() => expandable && setOpen(value => !value)}>
      <span className="task-process-step-title">{step.title || '执行记录'}</span>
      {meta && <span className="task-process-step-meta">{meta}</span>}
    </button>
    {open && expandable && <div className="task-process-step-body">
      {step.error && <p className="task-process-error" role="alert">{step.error}</p>}
      {step.body && <pre className="task-process-pre">{step.body}</pre>}
      {step.detail && <details className="task-process-details"><summary>推理过程</summary><pre className="task-process-pre">{step.detail}</pre></details>}
      {step.args && <details className="task-process-details"><summary>调用参数</summary><pre className="task-process-pre">{step.args}</pre></details>}
    </div>}
  </li>;
}

export function TaskProcessPanel({ task, onClose }: { task: TaskProcessRef; onClose: () => void }) {
  const sessions = useResearchSessions();
  const store = sessions.trajectory(task.sessionId);
  const snap = useSyncExternalStore(store?.subscribe ?? noopSubscribe, store?.getSnapshot ?? emptySnapshot, store?.getSnapshot ?? emptySnapshot);
  const live = sessions.sessionState(task.sessionId);
  const running = Boolean(snap.running || live?.running);
  const failed = Boolean(snap.failed || live?.lastAgentError || live?.promptError);
  const [loadingOlder, setLoadingOlder] = useState(false);
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => { if (event.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);
  const status = snap.openState === 'loading' || snap.openState === 'cold' ? '正在读取执行记录'
    : snap.openState === 'error' ? '执行记录读取失败'
    : running ? '执行中' : failed ? '未完成' : snap.steps.length ? '已结束' : '没有可回看的执行轨迹';
  const loadOlder = async () => {
    if (!store?.loadOlder || loadingOlder) return;
    setLoadingOlder(true);
    try { await store.loadOlder(); }
    finally { setLoadingOlder(false); }
  };
  return <div className="finance-task-process fixed bottom-3 right-3 top-[76px] z-50 flex w-[min(36rem,calc(100vw-1.5rem))]">
    <aside role="dialog" aria-label="任务过程" className="task-process-panel relative flex w-full flex-col overflow-hidden rounded-2xl border bg-background shadow-lg">
      <header className="flex items-start justify-between gap-3 border-b border-border px-4 py-3">
        <div className="min-w-0">
          <p className="text-xs text-muted-foreground">{task.kind === 'report' ? '图文报告' : '知识整理'}</p>
          <h2 className="mt-1 truncate text-sm font-semibold">{task.title}</h2>
          <p className="mt-1 text-xs text-muted-foreground" role="status">{status}{snap.streaming ? ' · 生成中' : ''}</p>
        </div>
        <button type="button" className="rounded-lg p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground" aria-label="关闭过程" onClick={onClose}><X size={16} /></button>
      </header>
      <div className="min-h-0 flex-1 overflow-auto px-4 py-3">
        {snap.openError && <p className="mb-3 text-sm text-destructive" role="alert">{snap.openError}</p>}
        {snap.hasMore && <button type="button" className="workspace-action workspace-action-compact mb-3" disabled={loadingOlder || snap.loadingOlder} onClick={() => { void loadOlder(); }}>
          {loadingOlder || snap.loadingOlder ? '正在加载更早记录…' : '加载更早记录'}
        </button>}
        {snap.runningCalls.length > 0 && <ul className="mb-3 space-y-2">{snap.runningCalls.map(call =>
          <li key={call.id} className="rounded-lg border border-primary/30 bg-primary/5 px-3 py-2 text-sm">
            <p>正在执行 · {call.name}</p>
            {call.args && <pre className="task-process-pre mt-2">{call.args}</pre>}
          </li>
        )}</ul>}
        {snap.steps.length === 0 && snap.openState === 'open' && !running && <p className="text-sm text-muted-foreground">还没有可回看的执行轨迹。任务记录仍保留，稍后可再打开。</p>}
        <ol className="space-y-2">{snap.steps.map(step => <StepCard key={step.id} step={step} />)}</ol>
      </div>
      <footer className="flex flex-wrap gap-2 border-t border-border px-4 py-3">
        {task.kind === 'report' && running && <button type="button" className="workspace-action workspace-action-compact" onClick={() => { void sessions.cancelTask(task.sessionId).catch(() => {}); }}>中止</button>}
        {task.resultHref && <a className="workspace-action workspace-action-compact" href={task.resultHref} onClick={onClose}>打开成果</a>}
      </footer>
    </aside>
  </div>;
}
