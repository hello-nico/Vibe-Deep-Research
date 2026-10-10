import type { LucideIcon } from "lucide-react";
import "./ui.css";

export interface WorkspaceTabOption<T extends string> {
  value: T;
  label: string;
  /** 分段切换不显示图标；保留字段兼容旧调用。 */
  icon?: LucideIcon;
  badge?: string;
}

export function WorkspaceTabs<T extends string>({
  value,
  onChange,
  options,
  "aria-label": ariaLabel,
}: {
  value: T;
  onChange: (value: T) => void;
  options: readonly WorkspaceTabOption<T>[];
  "aria-label"?: string;
}) {
  return (
    <div className="segmented" role="tablist" aria-label={ariaLabel}>
      {options.map(option => {
        const selected = value === option.value;
        return (
          <button
            key={option.value}
            type="button"
            role="tab"
            aria-selected={selected}
            onClick={() => onChange(option.value)}
          >
            {option.label}
            {option.badge ? <span className="ml-1.5 tag tone-brand">{option.badge}</span> : null}
          </button>
        );
      })}
    </div>
  );
}
