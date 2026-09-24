import { useEffect, type PointerEvent as ReactPointerEvent } from 'react';

// 问助手、查看依据、任务过程共用一个右侧面板宽度（--finance-assistant-width），
// 主内容区按同一宽度让位；拖动任一面板左缘即调整三者，宽度记在本机。
const STORAGE_KEY = 'finance-side-panel-width';
const MIN_WIDTH = 320;

function maxWidth() {
  return Math.max(MIN_WIDTH, Math.min(960, Math.round(window.innerWidth * 0.6)));
}

function applyWidth(px: number) {
  const width = Math.min(maxWidth(), Math.max(MIN_WIDTH, Math.round(px)));
  document.documentElement.style.setProperty('--finance-assistant-width', `${width}px`);
  return width;
}

/** Restore the remembered width once per page load; falls back to the CSS default. */
export function useSidePanelWidth() {
  useEffect(() => {
    try {
      const saved = Number(localStorage.getItem(STORAGE_KEY));
      if (saved > 0) applyWidth(saved);
    } catch { /* storage unavailable: keep the CSS default */ }
  }, []);
}

export function SidePanelResizeHandle() {
  const start = (event: ReactPointerEvent<HTMLDivElement>) => {
    const panel = event.currentTarget.parentElement;
    if (!panel || event.button !== 0) return;
    event.preventDefault();
    const right = panel.getBoundingClientRect().right;
    const handle = event.currentTarget;
    handle.setPointerCapture(event.pointerId);
    document.body.classList.add('finance-side-resizing');
    let width = 0;
    const move = (next: PointerEvent) => { width = applyWidth(right - next.clientX); };
    const stop = () => {
      handle.removeEventListener('pointermove', move);
      handle.removeEventListener('pointerup', stop);
      handle.removeEventListener('pointercancel', stop);
      document.body.classList.remove('finance-side-resizing');
      if (width) try { localStorage.setItem(STORAGE_KEY, String(width)); } catch { /* keep in-page width */ }
    };
    handle.addEventListener('pointermove', move);
    handle.addEventListener('pointerup', stop);
    handle.addEventListener('pointercancel', stop);
  };
  return <div role="separator" aria-orientation="vertical" aria-label="拖动调整面板宽度" className="finance-side-resize" onPointerDown={start} />;
}
