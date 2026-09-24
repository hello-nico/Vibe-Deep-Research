import { createContext, useContext, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import './research-surfaces.css';
import { SidePanelResizeHandle, useSidePanelWidth } from './SidePanelResize';

const SurfaceContext = createContext<{
  target: HTMLDivElement | null;
  setTarget: (target: HTMLDivElement | null) => void;
} | null>(null);

/** Only the mount location lives here; dialogue state stays with its owner. */
export function FinanceAssistantSurfaceProvider({ children }: { children: ReactNode }) {
  const [target, setTarget] = useState<HTMLDivElement | null>(null);
  useSidePanelWidth();
  return <SurfaceContext.Provider value={{ target, setTarget }}>{children}</SurfaceContext.Provider>;
}

/** Registered once in the existing root-scoped shell.overlay slot. */
export function FinanceAssistantSeat() {
  const surface = useContext(SurfaceContext);
  if (!surface) throw new Error('问助手暂时不可用，请刷新页面');
  return <div ref={surface.setTarget} data-finance-assistant-seat />;
}

export function useFinanceOverlayTarget() {
  return useContext(SurfaceContext)?.target;
}

export function FinanceAssistantSurface({ children }: { children: ReactNode; close: () => void }) {
  const surface = useContext(SurfaceContext);
  if (!surface) throw new Error('问助手暂时不可用，请刷新页面');
  if (!surface.target || children == null) return null;
  return createPortal(
    <div className="finance-assistant-panel" data-open="true">
      <SidePanelResizeHandle />
      <aside aria-label="页面助手" className="relative flex h-full w-full flex-col overflow-hidden rounded-2xl border bg-background shadow-lg">
        {children}
      </aside>
    </div>,
    surface.target,
  );
}
