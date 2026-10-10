import './status-dot.css';

export type StatusTone = 'ok' | 'bad' | 'wait' | 'run' | 'off' | 'info';

/** 状态点（7px）：颜色表达状态，悬停或键盘聚焦立即显示说明；正常状态不要渲染。 */
export function StatusDot({ tone, label, className = '' }: { tone: StatusTone; label: string; className?: string }) {
  return <span className={`status-dot tone-${tone} ${className}`} tabIndex={0} role="img" aria-label={label}>
    <span className="status-dot-tip" aria-hidden="true">{label}</span>
  </span>;
}
