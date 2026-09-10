import { useRef, useState, type CSSProperties, type KeyboardEvent, type PointerEvent, type ReactNode } from "react";
import { Maximize2, Minimize2 } from "lucide-react";
import { PageHeader } from "@/components/ui/PageHeader";

/** Finance owns the window geometry; the DSH portal seat stays mounted. */
export function ConversationWorkspace({ active, children }: { active: boolean; children: ReactNode }) {
  const [expanded, setExpanded] = useState(false);
  const [inset, setInset] = useState(34);
  const [headingHeight, setHeadingHeight] = useState<number>();
  const heading = useRef<HTMLDivElement>(null);
  const root = useRef<HTMLDivElement>(null);
  const drag = useRef<{ x: number; y: number; inset: number; height: number; max: number }>();
  const resize = (side: "top" | "left" | "right") => ({
    role: "separator",
    tabIndex: 0,
    "aria-label": side === "top" ? "调整聊天高度" : "调整聊天宽度",
    "aria-orientation": (side === "top" ? "horizontal" : "vertical") as "horizontal" | "vertical",
    onKeyDown(e: KeyboardEvent<HTMLDivElement>) {
      if (e.key === "Home") { e.preventDefault(); setInset(34); setHeadingHeight(undefined); return; }
      const delta = e.key === "ArrowUp" || e.key === "ArrowLeft" ? -16 : e.key === "ArrowDown" || e.key === "ArrowRight" ? 16 : 0;
      if (!delta) return;
      e.preventDefault();
      if (side === "top") setHeadingHeight(Math.max(0, Math.min(heading.current?.scrollHeight ?? 0, (heading.current?.clientHeight ?? 0) + delta)));
      else setInset(Math.max(8, Math.min(Math.max(8, ((root.current?.clientWidth ?? 0) - 640) / 2), (root.current ? parseFloat(getComputedStyle(root.current).paddingLeft) : inset) + delta * (side === "left" ? 1 : -1))));
    },
    onPointerDown(e: PointerEvent<HTMLDivElement>) {
      if (e.button !== 0) return;
      e.preventDefault();
      e.currentTarget.setPointerCapture(e.pointerId);
      drag.current = { x: e.clientX, y: e.clientY, inset: root.current ? parseFloat(getComputedStyle(root.current).paddingLeft) : inset, height: heading.current?.getBoundingClientRect().height ?? 0, max: heading.current?.scrollHeight ?? 0 };
    },
    onPointerMove(e: PointerEvent<HTMLDivElement>) {
      const start = drag.current;
      if (!start || !e.currentTarget.hasPointerCapture(e.pointerId)) return;
      if (side === "top") setHeadingHeight(Math.max(0, Math.min(start.max, start.height + e.clientY - start.y)));
      else setInset(Math.max(8, Math.min(Math.max(8, ((root.current?.clientWidth ?? 0) - 640) / 2), start.inset + (e.clientX - start.x) * (side === "left" ? 1 : -1))));
    },
    onPointerUp(e: PointerEvent<HTMLDivElement>) {
      if (e.currentTarget.hasPointerCapture(e.pointerId)) e.currentTarget.releasePointerCapture(e.pointerId);
      drag.current = undefined;
    },
    onLostPointerCapture() { drag.current = undefined; },
    onDoubleClick() { setInset(34); setHeadingHeight(undefined); },
  });
  return <div ref={root} className={active ? "conversation-workspace" : "workspace-content"} data-expanded={active && expanded} style={active ? { "--conversation-inset": `${inset}px` } as CSSProperties : undefined}>
    <div hidden={!active} className="conversation-heading" ref={heading} style={{ height: expanded ? 0 : headingHeight }}>
      <PageHeader title="深度对话" subtitle="查阅资料、核对证据，深入探讨你的研究问题" />
    </div>
    <div hidden={!active} className="conversation-window-actions">
      <button type="button" className="finance-session-action" aria-pressed={expanded} onClick={() => setExpanded(value => !value)}>
        {expanded ? <Minimize2 size={14} /> : <Maximize2 size={14} />}{expanded ? "还原窗口" : "展开窗口"}
      </button>
    </div>
    <div className="conversation-window" style={{ display: active ? "flex" : "none" }}>
      <section id="dsh-conversation" aria-label="深度对话" />
      {!expanded && <>
        <div className="conversation-resize conversation-resize-top" title="拖动调整高度，双击恢复默认" {...resize("top")} />
        <div className="conversation-resize conversation-resize-left" title="拖动调整宽度，双击恢复默认" {...resize("left")} />
        <div className="conversation-resize conversation-resize-right" title="拖动调整宽度，双击恢复默认" {...resize("right")} />
      </>}
    </div>
    <div className={active ? "conversation-footer" : undefined} style={active ? undefined : { display: "contents" }} hidden={active && expanded}>{children}</div>
  </div>;
}
