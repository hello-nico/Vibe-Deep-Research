import { Search } from "lucide-react";
import { cn } from "@/lib/utils";

export function WorkspaceSearch({
  value,
  onChange,
  placeholder,
  "aria-label": ariaLabel,
  className,
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
  "aria-label"?: string;
  className?: string;
}) {
  return (
    <label className={cn("relative mb-5 block", className)}>
      <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
      <input
        className="workspace-field w-full pl-9"
        placeholder={placeholder}
        aria-label={ariaLabel || placeholder}
        value={value}
        onChange={event => onChange(event.target.value)}
      />
    </label>
  );
}
