import { useEffect, useMemo, useRef, useState } from "react";
import { Check, BookmarkPlus, AlertCircle } from "lucide-react";
import { addNote } from "@/lib/notes";

/** Backend 确认保存后才显示成功；同一结果的失败重试沿用操作身份。 */
export function SaveNoteButton({ kind, title, content }: { kind: string; title: string; content: string }) {
  const [state, setState] = useState<"idle" | "saving" | "saved" | "failed">("idle");
  const [err, setErr] = useState("");
  const operationId = useMemo(() => `op-${crypto.randomUUID()}`, [kind, title, content]);
  const currentOperation = useRef(operationId);
  currentOperation.current = operationId;
  useEffect(() => { setState("idle"); setErr(""); }, [operationId]);
  if (!content.trim()) return null;
  const save = async () => {
    setState("saving");
    try {
      await addNote(kind, title, content, operationId);
      if (currentOperation.current !== operationId) return;
      setState("saved");
    } catch (e) {
      if (currentOperation.current !== operationId) return;
      setErr(e instanceof Error ? e.message : String(e));
      setState("failed");
    }
  };
  return (
    <button
      onClick={save}
      disabled={state === "saving" || state === "saved"}
      title={err || undefined}
      className="workspace-action workspace-action-compact"
    >
      {state === "saved" ? (<><Check className="h-3.5 w-3.5" /> 已存入沉淀</>)
        : state === "failed" ? (<><AlertCircle className="h-3.5 w-3.5 text-destructive" /> 没存上，点这里重试</>)
        : state === "saving" ? (<><BookmarkPlus className="h-3.5 w-3.5" /> 存入中…</>)
        : (<><BookmarkPlus className="h-3.5 w-3.5" /> 存入沉淀</>)}
    </button>
  );
}
