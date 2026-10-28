import { useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import './status-dot.css';

export type StatusTone = 'ok' | 'bad' | 'wait' | 'run' | 'off' | 'info';

const GAP = 8;
const EDGE = 8;

/** 状态点（7px）：颜色表达状态，悬停或键盘聚焦立即显示说明；正常状态不要渲染。
 *  说明挂到 body，按圆点位置定位并夹在视口内（上方放不下翻到下方），任何容器的裁切或贴边都挡不住它。 */
export function StatusDot({ tone, label, className = '' }: { tone: StatusTone; label: string; className?: string }) {
  const dot = useRef<HTMLSpanElement>(null);
  const tip = useRef<HTMLSpanElement>(null);
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<{ left: number; top: number } | null>(null);
  useLayoutEffect(() => {
    if (!open || !dot.current || !tip.current) { setPos(null); return; }
    const anchor = dot.current.getBoundingClientRect();
    const box = tip.current.getBoundingClientRect();
    const centered = anchor.left + anchor.width / 2 - box.width / 2;
    const left = Math.max(EDGE, Math.min(centered, window.innerWidth - box.width - EDGE));
    const above = anchor.top - GAP - box.height;
    const top = above >= EDGE ? above : anchor.bottom + GAP;
    setPos({ left, top });
  }, [open, label]);
  const show = () => setOpen(true);
  const hide = () => setOpen(false);
  return <span ref={dot} className={`status-dot tone-${tone} ${className}`} tabIndex={0} role="img" aria-label={label}
    onMouseEnter={show} onMouseLeave={hide} onFocus={show} onBlur={hide}>
    {open && createPortal(<span ref={tip} className={`status-dot-tip${pos ? ' is-open' : ''}`} aria-hidden="true"
      style={pos ? { left: pos.left, top: pos.top } : undefined}>{label}</span>, document.body)}
  </span>;
}
