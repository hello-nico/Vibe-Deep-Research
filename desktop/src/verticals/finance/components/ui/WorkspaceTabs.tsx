import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

export interface WorkspaceTabOption<T extends string> {
  value: T;
  label: string;
  icon: LucideIcon;
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
    <div className="flex flex-wrap gap-2" role="tablist" aria-label={ariaLabel}>
      {options.map(option => {
        const Icon = option.icon;
        const selected = value === option.value;
        return (
          <button
            key={option.value}
            type="button"
            role="tab"
            aria-selected={selected}
            className={cn(
              "inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm transition-colors",
              selected ? "bg-primary/15 font-medium text-primary shadow-glow" : "text-muted-foreground hover:bg-muted/50",
            )}
            onClick={() => onChange(option.value)}
          >
            <Icon className="h-4 w-4" />
            {option.label}
            {option.badge ? (
              <span className="rounded-full bg-primary/20 px-1.5 py-0.5 text-[9px] font-medium text-primary">{option.badge}</span>
            ) : null}
          </button>
        );
      })}
    </div>
  );
}
