import { useSyncExternalStore, type ReactNode } from 'react';
import { FinanceSlots, type SlotProps } from '../../dsh/NativeDsh';
import { ResearchSessionContext, type ResearchSessions } from '../../dsh/research-session';
import { FinanceAssistantSurfaceProvider } from './FinanceAssistantSurface';
import { TaskProcessPanel } from '../TaskProcessPanel';
import { TopicConversationPanel } from '../TopicConversationPanel';
import { ObjectPreviewLayer } from '../ObjectPreview';

function SidePanelSeat({ research }: { research: ResearchSessions }) {
  const panel = useSyncExternalStore(research.subscribeSidePanel, research.getSidePanel, research.getSidePanel);
  if (panel?.kind === 'task') return <TaskProcessPanel key={panel.task.sessionId} task={panel.task} onClose={research.closeSidePanel} />;
  if (panel?.kind === 'topic') return <TopicConversationPanel key={panel.sessionId} topic={panel} onClose={research.closeSidePanel} />;
  return null;
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
      {children}
      <SidePanelSeat research={research} />
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
