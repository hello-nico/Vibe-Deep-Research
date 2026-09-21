import { useEffect, useSyncExternalStore } from 'react';
import { X } from 'lucide-react';
import { useResearchSessions, type TaskProcessRef } from '../dsh/research-session';
import { TaskTranscript, useTaskTrajectory } from './TaskTranscript';
import { emptyTaskTrajectory } from '../lib/taskTrajectory';
import './task-process.css';

const noopSubscribe = () => () => {};
const emptySnapshot = () => emptyTaskTrajectory;

export function TaskProcessPanel({ task, onClose }: { task: TaskProcessRef; onClose: () => void }) {
  const sessions = useResearchSessions();
  const store = useTaskTrajectory(task.sessionId);
  const snapshot = useSyncExternalStore(store?.subscribe ?? noopSubscribe, store?.getSnapshot ?? emptySnapshot);
  const live = sessions.sessionState(task.sessionId);
  const running = Boolean(snapshot.running || live?.running);
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => { if (event.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);
  return <div className="finance-task-process fixed bottom-3 right-3 top-[76px] z-50 flex w-[min(36rem,calc(100vw-1.5rem))]">
    <aside role="dialog" aria-label="任务过程" className="task-process-panel relative flex w-full flex-col overflow-hidden rounded-2xl border bg-background shadow-lg">
      <header className="flex items-start justify-between gap-3 border-b border-border px-4 py-3">
        <div className="min-w-0">
          <p className="text-xs text-muted-foreground">{task.kind === 'report' ? '图文报告' : '知识整理'}</p>
          <h2 className="mt-1 truncate text-sm font-semibold">{task.title}</h2>
        </div>
        <button type="button" className="rounded-lg p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground" aria-label="关闭过程" onClick={onClose}><X size={16} /></button>
      </header>
      <TaskTranscript
        sessionId={task.sessionId}
        compactUser
        intro={task.kind === 'report' ? '生成开始后，过程和回答会按发生顺序出现在这里。' : '整理开始后，过程和回答会按发生顺序出现在这里。'}
      />
      <footer className="flex flex-wrap gap-2 border-t border-border px-4 py-3">
        {task.kind === 'report' && running && <button type="button" className="workspace-action workspace-action-compact" onClick={() => { void sessions.cancelTask(task.sessionId).catch(() => {}); }}>中止</button>}
        {task.resultHref && <a className="workspace-action workspace-action-compact" href={task.resultHref} onClick={onClose}>打开成果</a>}
      </footer>
    </aside>
  </div>;
}
