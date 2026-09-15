import { useEffect, useId, useLayoutEffect, useMemo, useRef, useState, type KeyboardEvent } from "react";
import { createPortal } from "react-dom";
import { cn } from "@/lib/utils";
import {
  workspaceSelectMatches,
  workspaceSelectMenuBox,
  type WorkspaceSelectOption,
} from "@/lib/workspaceSelect";

export type { WorkspaceSelectOption };

export function WorkspaceSelect<T extends string>({
  value,
  onChange,
  options,
  className,
  disabled,
  id,
  searchPlaceholder,
  emptyText = "没有匹配项",
  "aria-label": ariaLabel,
}: {
  value: T;
  onChange: (value: T) => void;
  options: readonly WorkspaceSelectOption<T>[];
  className?: string;
  disabled?: boolean;
  id?: string;
  searchPlaceholder?: string;
  emptyText?: string;
  "aria-label"?: string;
}) {
  const listId = useId();
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const typeahead = useRef({ buffer: "", at: 0 });
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const [box, setBox] = useState<{ top: number; left: number; minWidth: number; maxHeight: number }>();
  const visible = useMemo(
    () => options.filter(option => workspaceSelectMatches(option, query)),
    [options, query],
  );
  const selected = options.find(option => option.value === value);
  const place = () => {
    const trigger = triggerRef.current;
    const menu = menuRef.current;
    if (!trigger) return;
    const rect = trigger.getBoundingClientRect();
    setBox(workspaceSelectMenuBox(rect, { width: window.innerWidth, height: window.innerHeight }, {
      height: menu?.scrollHeight || 280,
      width: menu?.scrollWidth || rect.width,
    }));
  };
  const close = (restore = true) => {
    setOpen(false);
    setQuery("");
    if (restore) triggerRef.current?.focus();
  };
  const choose = (next: T) => {
    onChange(next);
    close();
  };
  const reveal = (nextActive?: number) => {
    if (disabled) return;
    setQuery("");
    setActive(nextActive ?? Math.max(0, options.findIndex(option => option.value === value)));
    place();
    setOpen(true);
  };
  useLayoutEffect(() => {
    if (!open) return;
    place();
    menuRef.current?.querySelector("[data-checked='true']")?.scrollIntoView({ block: "nearest" });
    searchRef.current?.focus();
  }, [open]);
  useLayoutEffect(() => {
    if (!open) return;
    menuRef.current?.querySelector("[data-active='true']")?.scrollIntoView({ block: "nearest" });
    place();
  }, [active, query, open, visible.length]);
  useEffect(() => {
    if (!open) return;
    const onPointer = (event: PointerEvent) => {
      const target = event.target as Node | null;
      if (triggerRef.current?.contains(target) || menuRef.current?.contains(target)) return;
      close(false);
    };
    const onWindow = () => place();
    document.addEventListener("pointerdown", onPointer);
    window.addEventListener("resize", onWindow);
    window.addEventListener("scroll", onWindow, true);
    return () => {
      document.removeEventListener("pointerdown", onPointer);
      window.removeEventListener("resize", onWindow);
      window.removeEventListener("scroll", onWindow, true);
    };
  }, [open]);
  const move = (delta: number) => {
    if (!visible.length) return;
    setActive(index => (index + delta + visible.length) % visible.length);
  };
  const onTriggerKey = (event: KeyboardEvent<HTMLButtonElement>) => {
    if (disabled) return;
    if (event.key === "Escape" && open) {
      event.preventDefault();
      close();
      return;
    }
    if (event.key === "ArrowDown" || event.key === "ArrowUp" || event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      if (!open) {
        reveal(event.key === "ArrowUp" ? Math.max(0, options.length - 1) : undefined);
        return;
      }
      if (event.key === "Enter" || event.key === " ") {
        const option = visible[active];
        if (option) choose(option.value);
        return;
      }
      move(event.key === "ArrowDown" ? 1 : -1);
      return;
    }
    if (!open || searchPlaceholder) return;
    if (event.key.length !== 1 || event.metaKey || event.ctrlKey || event.altKey) return;
    const now = Date.now();
    const buffer = now - typeahead.current.at > 500 ? event.key : `${typeahead.current.buffer}${event.key}`;
    typeahead.current = { buffer, at: now };
    const index = options.findIndex(option => option.label.toLowerCase().startsWith(buffer.toLowerCase()));
    if (index >= 0) setActive(index);
  };
  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        id={id}
        disabled={disabled}
        className={cn("workspace-select", className)}
        role="combobox"
        aria-expanded={open}
        aria-haspopup="listbox"
        aria-controls={listId}
        aria-activedescendant={open && visible[active] ? `${listId}-${active}` : undefined}
        aria-label={ariaLabel}
        onClick={() => (open ? close() : reveal())}
        onKeyDown={onTriggerKey}
      >
        <span className="workspace-select-value">
          <span className="workspace-select-option-label">{selected?.label || "请选择"}</span>
          {selected?.detail && <span className="workspace-select-value-detail">{selected.detail}</span>}
        </span>
      </button>
      {open && createPortal(
        <div
          ref={menuRef}
          id={listId}
          role="listbox"
          className="workspace-select-menu"
          style={{ ...box, visibility: box ? "visible" : "hidden" }}
        >
          {searchPlaceholder && (
            <input
              ref={searchRef}
              className="workspace-field workspace-select-menu-search"
              aria-label={searchPlaceholder}
              placeholder={searchPlaceholder}
              value={query}
              onChange={event => {
                setQuery(event.target.value);
                setActive(0);
              }}
              onKeyDown={event => {
                event.stopPropagation();
                if (event.key === "Escape") {
                  event.preventDefault();
                  close();
                  return;
                }
                if (event.key === "ArrowDown") {
                  event.preventDefault();
                  move(1);
                  return;
                }
                if (event.key === "ArrowUp") {
                  event.preventDefault();
                  move(-1);
                  return;
                }
                if (event.key === "Enter") {
                  event.preventDefault();
                  const option = visible[active];
                  if (option) choose(option.value);
                }
              }}
            />
          )}
          {visible.map((option, index) => (
            <div
              key={option.value}
              id={`${listId}-${index}`}
              role="option"
              className="workspace-select-option"
              aria-selected={option.value === value}
              data-active={index === active ? "true" : undefined}
              data-checked={option.value === value ? "true" : undefined}
              onMouseEnter={() => setActive(index)}
              onMouseDown={event => event.preventDefault()}
              onClick={() => choose(option.value)}
            >
              <span className="workspace-select-check" aria-hidden>{option.value === value ? "✓" : ""}</span>
              <span className="workspace-select-option-label">{option.label}</span>
              {option.detail && <span className="workspace-select-option-detail">{option.detail}</span>}
            </div>
          ))}
          {visible.length === 0 && <p className="workspace-select-empty">{emptyText}</p>}
        </div>,
        document.body,
      )}
    </>
  );
}
