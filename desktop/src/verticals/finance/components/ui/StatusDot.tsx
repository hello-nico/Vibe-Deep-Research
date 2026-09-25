import './status-dot.css';

export type StatusTone = 'ok' | 'bad' | 'wait' | 'run' | 'off';

/** A status dot whose meaning shows immediately on hover or keyboard focus (no native title delay). */
export function StatusDot({ tone, label, className = '' }: { tone: StatusTone; label: string; className?: string }) {
  return <span className={`status-dot tone-${tone} ${className}`} tabIndex={0} role="img" aria-label={label}>
    <span className="status-dot-tip" aria-hidden="true">{label}</span>
  </span>;
}
