import "./ui.css";

export interface WorkspaceFilterOption<T extends string> {
  value: T;
  label: string;
}

/** 筛选分段：与分段切换同一外观（无底文字，选中项 10% 底色）。 */
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
    <div className="segmented" role="tablist" aria-label={ariaLabel}>
      {options.map(option => (
        <button
          key={option.value}
          type="button"
          role="tab"
          aria-selected={value === option.value}
          onClick={() => onChange(option.value)}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}
