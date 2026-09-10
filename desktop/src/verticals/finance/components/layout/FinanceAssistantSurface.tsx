import { createContext, useContext, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import './research-surfaces.css';

const SurfaceContext = createContext<{
  target: HTMLDivElement | null;
  setTarget: (target: HTMLDivElement | null) => void;
} | null>(null);

/** Only the mount location lives here; dialogue state stays with its owner. */
export function FinanceAssistantSurfaceProvider({ children }: { children: ReactNode }) {
  const [target, setTarget] = useState<HTMLDivElement | null>(null);
  return <SurfaceContext.Provider value={{ target, setTarget }}>{children}</SurfaceContext.Provider>;
}

/** Registered once in the existing root-scoped shell.overlay slot. */
export function FinanceAssistantSeat() {
  const surface = useContext(SurfaceContext);
  if (!surface) throw new Error('助手承载未连接');
  return <div ref={surface.setTarget} data-finance-assistant-seat />;
}

export function useFinanceOverlayTarget() {
  return useContext(SurfaceContext)?.target;
}

export function FinanceAssistantSurface({ children }: { children: ReactNode; close: () => void }) {
  const surface = useContext(SurfaceContext);
  if (!surface) throw new Error('助手承载未连接');
  if (!surface.target) return null;
  return createPortal(
    <div className="finance-assistant-panel fixed bottom-3 right-3 top-[76px] z-50 flex w-[min(28rem,calc(100vw-1.5rem))]">
      <aside aria-label="页面助手" className="ai-surface relative flex w-full flex-col rounded-2xl overflow-hidden border shadow-lg">
        {children}
      </aside>
    </div>,
    surface.target,
  );
}
