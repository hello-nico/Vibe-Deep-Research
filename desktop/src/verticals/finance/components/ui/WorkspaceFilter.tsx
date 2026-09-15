import { cn } from "@/lib/utils";

export interface WorkspaceFilterOption<T extends string> {
  value: T;
  label: string;
}

export function WorkspaceFilter<T extends string>({
  value,
  onChange,
  options,
  "aria-label": ariaLabel,
}: {
  value: T;
  onChange: (value: T) => void;
  options: readonly WorkspaceFilterOption<T>[];
  "aria-label"?: string;
}) {
  return (
    <div className="flex flex-wrap gap-2" role="tablist" aria-label={ariaLabel}>
      {options.map(option => (
        <button
          key={option.value}
          type="button"
          role="tab"
          aria-selected={value === option.value}
          className={cn("workspace-action", value === option.value && "workspace-action-primary")}
          onClick={() => onChange(option.value)}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}
