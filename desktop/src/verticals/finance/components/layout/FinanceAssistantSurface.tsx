import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
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
  const visible = children != null;
  const cache = useRef<ReactNode>(null);
  if (visible) cache.current = children;
  const [shown, setShown] = useState(visible);
  const [open, setOpen] = useState(false);
  useEffect(() => {
    if (visible) {
      setShown(true);
      let next = 0;
      const frame = requestAnimationFrame(() => {
        next = requestAnimationFrame(() => setOpen(true));
      });
      return () => {
        cancelAnimationFrame(frame);
        cancelAnimationFrame(next);
      };
    }
    setOpen(false);
  }, [visible]);
  useEffect(() => {
    if (visible || !shown) return;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const timer = window.setTimeout(() => setShown(false), reduce ? 0 : 500);
    return () => window.clearTimeout(timer);
  }, [visible, shown]);
  if (!surface.target || !shown || cache.current == null) return null;
  return createPortal(
    <div className="finance-assistant-panel" data-open={open} aria-hidden={!open || undefined} {...{ inert: open ? undefined : "" }}>
      <SidePanelResizeHandle />
      <aside aria-label="页面助手" className="ai-surface relative flex h-full w-full flex-col rounded-2xl overflow-hidden border shadow-lg">
        {cache.current}
      </aside>
    </div>,
    surface.target,
  );
}
