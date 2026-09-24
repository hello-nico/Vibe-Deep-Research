import { useSyncExternalStore, type ReactNode } from 'react';
import { FinanceSlots, type SlotProps } from '../../dsh/NativeDsh';
import { ResearchSessionContext, type ResearchSessions } from '../../dsh/research-session';
import { TopicSessionGateProvider } from '../../dsh/topic-session-gate';
import { FinanceAssistantSurfaceProvider } from './FinanceAssistantSurface';
import { TaskProcessPanel } from '../TaskProcessPanel';
import { ObjectPreviewLayer } from '../ObjectPreview';

function TaskProcessSeat({ research }: { research: ResearchSessions }) {
  const subscribe = research.subscribeTaskProcess || ((listener: () => void) => { void listener; return () => {}; });
  const read = research.getTaskProcess || (() => null);
  const task = useSyncExternalStore(subscribe, read, read);
  if (!task) return null;
  return <TaskProcessPanel task={task} onClose={() => research.closeTaskProcess()} />;
}

/** Root presentation only; startup and native Session lifecycle stay in the DSH entry. */
export function FinanceRoot({ slots, research, sessionError, children }: {
  slots: SlotProps;
  research: ResearchSessions;
  sessionError: string;
  children: ReactNode;
}) {
  return <FinanceSlots.Provider value={slots}>
    <FinanceAssistantSurfaceProvider>
      <ResearchSessionContext.Provider value={research}>
      <TopicSessionGateProvider>{children}</TopicSessionGateProvider>
      <TaskProcessSeat research={research} />
      <ObjectPreviewLayer />
    </ResearchSessionContext.Provider>
      {sessionError && <div role="alert" className="fixed bottom-4 right-4 z-50 rounded border bg-background p-4">{sessionError}</div>}
      {slots.renderSlot('shell.overlay', {})}
      <div style={{ position: 'fixed', inset: '64px 0 0 auto', width: 'min(480px, 100vw)', height: 'calc(100vh - 64px)', zIndex: 60, pointerEvents: 'none' }}>
        {slots.renderSlot('rightbar', { width: 480, viewportWidth: typeof window === 'undefined' ? 1280 : window.innerWidth, canShow: true })}
      </div>
    </FinanceAssistantSurfaceProvider>
  </FinanceSlots.Provider>;
}
