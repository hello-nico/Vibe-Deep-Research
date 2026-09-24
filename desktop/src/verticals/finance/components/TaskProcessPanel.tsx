import { useEffect, useSyncExternalStore } from 'react';
import { X } from 'lucide-react';
import { useResearchSessions, type TaskProcessRef } from '../dsh/research-session';
import { TaskTranscript, useTaskTrajectory } from './TaskTranscript';
import { emptyTaskTrajectory } from '../lib/taskTrajectory';
import './task-process.css';
import { SidePanelResizeHandle } from './layout/SidePanelResize';
import { openRegisteredObject, registeredObject } from '../lib/objectRegistry';

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
  return <div className="finance-task-process finance-side-panel">
    <SidePanelResizeHandle />
    <aside role="dialog" aria-label="任务过程" className="task-process-panel relative flex w-full flex-col overflow-hidden rounded-2xl border bg-background shadow-lg">
      <header className="flex items-start justify-between gap-3 border-b border-border px-4 py-3">
        <div className="min-w-0">
          <p className="text-xs text-muted-foreground">{task.kind === 'report' ? '图文报告' : task.kind === 'research' ? '公司研究' : '知识整理'}</p>
          <h2 className="mt-1 truncate text-sm font-semibold">{task.title}</h2>
        </div>
        <button type="button" className="rounded-lg p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground" aria-label="关闭过程" onClick={onClose}><X size={16} /></button>
      </header>
      <div className="min-h-0 flex-1 overflow-y-auto">
        {task.kind === 'research' && <p className="border-b border-border px-4 py-2 text-xs font-medium">第一阶段 · 公司研究</p>}
        <TaskTranscript sessionId={task.sessionId} compactUser
          intro={task.kind === 'report' ? '生成开始后，过程和回答会按发生顺序出现在这里。' : task.kind === 'research'
            ? '研究过程和回答会按发生顺序出现在这里。' : '整理开始后，过程和回答会按发生顺序出现在这里。'} />
        {task.kind === 'research' && <>
          <p className="border-y border-border px-4 py-2 text-xs font-medium">第二阶段 · 知识整理</p>
          {task.settlementSessionId ? <TaskTranscript sessionId={task.settlementSessionId} compactUser intro="整理过程会按发生顺序出现在这里。" />
            : <p className="px-4 py-3 text-xs text-muted-foreground">{task.status === 'researching' ? '研究结束后开始整理。' : '本次没有需要展示的整理过程。'}</p>}
        </>}
      </div>
      <footer className="flex flex-wrap gap-2 border-t border-border px-4 py-3">
        {(task.kind === 'report' || task.kind === 'research') && running && <button type="button" className="workspace-action workspace-action-compact" onClick={() => { void sessions.cancelTask(task.sessionId).catch(() => {}); }}>中止</button>}
        {task.resultRef && (registeredObject(task.resultRef)?.href || registeredObject(task.resultRef)?.drawer) && <button type="button" className="workspace-action workspace-action-compact" onClick={() => { onClose(); openRegisteredObject(task.resultRef!); }}>打开成果</button>}
      </footer>
    </aside>
  </div>;
}
