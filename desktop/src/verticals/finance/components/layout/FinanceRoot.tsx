import { useSyncExternalStore, type ReactNode } from 'react';
import { FinanceSlots, type SlotProps } from '../../dsh/NativeDsh';
import { ResearchSessionContext, type ResearchSessions } from '../../dsh/research-session';
import { TopicSessionGateProvider } from '../../dsh/topic-session-gate';
import { FinanceAssistantSurfaceProvider } from './FinanceAssistantSurface';
import { TaskProcessPanel } from '../TaskProcessPanel';

function TaskProcessSeat({ research }: { research: ResearchSessions }) {
  const subscribe = research.subscribeTaskProcess || ((listener: () => void) => { void listener; return () => {}; });
  const read = research.getTaskProcess || (() => null);
  const task = useSyncExternalStore(subscribe, read, read);
  if (!task) return null;
  return <TaskProcessPanel task={task} onClose={() => research.closeTaskProcess()} />;
}

/** Root presentation only; startup and native Session lifecycle stay in the DSH entry. */
export function FinanceRoot({ slots, research, sessionError, showDetails, children }: {
  slots: SlotProps;
  research: ResearchSessions;
  sessionError: string;
  showDetails: boolean;
  children: ReactNode;
}) {
  return <FinanceSlots.Provider value={slots}>
    <FinanceAssistantSurfaceProvider>
      <ResearchSessionContext.Provider value={research}>
      <TopicSessionGateProvider>{children}</TopicSessionGateProvider>
      <TaskProcessSeat research={research} />
    </ResearchSessionContext.Provider>
      {sessionError && <div role="alert" className="fixed bottom-4 right-4 z-50 rounded border bg-background p-4">{sessionError}</div>}
      {slots.renderSlot('shell.overlay', {})}
      {showDetails && <div style={{ position: 'fixed', inset: '64px 0 0 auto', width: 'min(480px, 100vw)', zIndex: 60, background: 'var(--background, #161820)' }}>{slots.renderSlot('details', {})}</div>}
    </FinanceAssistantSurfaceProvider>
  </FinanceSlots.Provider>;
}
