import { useEffect, useRef, useState } from "react";
import { Search } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * 搜索框自己持有正在输入的文字：中文输入法拼写期间（compositionstart 到 compositionend）不向外通知，
 * 选字完成后才把结果交给 onChange。外部 value（例如写在网址里的 q）只在不处于拼写时同步回来，
 * 避免上层重渲染把拼写中的字母当成最终文字。
 */
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
  const [draft, setDraft] = useState(value);
  const composing = useRef(false);
  useEffect(() => { if (!composing.current) setDraft(value); }, [value]);
  return (
    <label className={cn("relative block w-60 max-w-full", className)}>
      <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--text-3)]" />
      <input
        className="workspace-field workspace-search w-full pl-9"
        placeholder={placeholder}
        aria-label={ariaLabel || placeholder}
        value={draft}
        onCompositionStart={() => { composing.current = true; }}
        onCompositionEnd={event => { composing.current = false; setDraft(event.currentTarget.value); onChange(event.currentTarget.value); }}
        onChange={event => { setDraft(event.target.value); if (!composing.current) onChange(event.target.value); }}
      />
    </label>
  );
}
