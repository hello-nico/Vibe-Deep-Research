import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { createPortal } from "react-dom";
import { useContext } from 'react';
import { ChevronDown, Sparkles, Square, X } from "lucide-react";

import { cn } from "@/lib/utils";
import type { AiDockProps } from "../../../../core/ai/AiDock";
import { useAiWired, useCurrentAiPage, useAiQuestion, usePageAssistantObjects, type PageAssistantObject } from "../../../../core/ai/pageContext";
import { useResearchSessions } from "../../dsh/research-session";
import { emptyTaskTrajectory } from "../../lib/taskTrajectory";
import { FinanceSlots } from '../../dsh/NativeDsh';
import { assistantBindingForPage } from "../../assistant/binding.ts";
import {
  assistantModeHint,
  assistantSeatSnapshot,
  assistantSessionErrorMessage,
  setAssistantSeat,
  subscribeAssistantSeat,
  type AssistantMode,
} from "../../assistant/sessions.ts";

const noopSubscribe = () => () => {};
const emptyModelSnapshot = () => null;
const emptyTrajectorySnapshot = () => emptyTaskTrajectory;

function AssistantMenu({
  label,
  title,
  value,
  options,
  disabled,
  onSelect,
  truncate = true,
}: {
  label: string;
  title: string;
  value: string;
  options: { id: string; name: string }[];
  disabled?: boolean;
  onSelect: (id: string) => void;
  truncate?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [menuBox, setMenuBox] = useState<{ left: number; bottom: number; width: number } | null>(null);
  const box = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const menu = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    if (!open || !trigger.current) { setMenuBox(null); return; }
    const place = () => {
      const rect = trigger.current!.getBoundingClientRect();
      setMenuBox({ left: rect.left, bottom: window.innerHeight - rect.top + 4, width: Math.max(rect.width, 120) });
    };
    place();
    window.addEventListener("resize", place);
    return () => window.removeEventListener("resize", place);
  }, [open]);
  useEffect(() => {
    if (!open) return;
    const onDoc = (event: MouseEvent) => {
      const target = event.target as Node;
      if (box.current?.contains(target) || menu.current?.contains(target)) return;
      setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);
  const current = options.find(item => item.id === value)?.name || value || "选择";
  return (
    <div ref={box} className="finance-assistant-mode relative shrink-0">
      <button
        ref={trigger}
        type="button"
        disabled={disabled}
        aria-label={label}
        aria-haspopup="listbox"
        aria-expanded={open}
        title={title}
        className="finance-assistant-mode-trigger"
        onClick={() => setOpen(next => !next)}
      >
        <span className={truncate ? "truncate" : "whitespace-nowrap"}>{current}</span>
        <ChevronDown className="h-3 w-3 shrink-0 text-muted-foreground" />
      </button>
      {open && menuBox && createPortal(
        <div
          ref={menu}
          className="finance-assistant-menu"
          role="listbox"
          aria-label={label}
          style={{ left: menuBox.left, bottom: menuBox.bottom, minWidth: menuBox.width }}
        >
          {options.map(item => (
            <button
              key={item.id}
              type="button"
              role="option"
              aria-selected={item.id === value}
              className={cn(item.id === value && "is-current")}
              onClick={() => { onSelect(item.id); setOpen(false); }}
            >
              {item.name}
            </button>
          ))}
        </div>,
        document.body,
      )}
    </div>
  );
}

export function AssistantModeSelect() {
  const sessions = useResearchSessions();
  const seat = useSyncExternalStore(subscribeAssistantSeat, assistantSeatSnapshot, assistantSeatSnapshot);
  if (!seat.sessionId) return null;
  const changeMode = async (next: AssistantMode) => {
    if (next === seat.mode || seat.busy) return;
    const snap = seat.sessionId ? sessions.sessionState(seat.sessionId) : null;
    if (snap?.running) {
      setAssistantSeat({ notice: "等这次回答结束后再切换。" });
      return;
    }
    if (seat.sessionId) {
      try {
        await sessions.switchAssistantMode(seat.sessionId, next, seat.pageKey);
      } catch (err) {
        setAssistantSeat({ notice: assistantSessionErrorMessage(err, "模式没切换成功，请重试") });
        return;
      }
    }
    setAssistantSeat({ mode: next, notice: "" });
  };
  return (
    <AssistantMenu
      label="问助手模式"
      title={seat.mode === "ask" ? "只看本页和你引用的内容，几秒内回答。" : "会按需查资料、读原文后再回答；发现值得保存的资料，会先问你。"}
      value={seat.mode}
      disabled={seat.busy}
      options={[{ id: "ask", name: "Ask" }, { id: "agent", name: "Agent" }]}
      truncate={false}
      onSelect={id => { void changeMode(id as AssistantMode); }}
    />
  );
}

function AssistantModelSelect({ sessionId }: { sessionId: string }) {
  const sessions = useResearchSessions();
  const directory = useMemo(() => {
    try { return sessions.assistantModel?.(sessionId) ?? null; }
    catch { return null; }
  }, [sessions, sessionId]);
  const snap = useSyncExternalStore(directory?.subscribe ?? noopSubscribe, directory?.getSnapshot ?? emptyModelSnapshot, directory?.getSnapshot ?? emptyModelSnapshot);
  useEffect(() => { void directory?.load(); }, [directory, sessionId]);
  if (!directory || !snap) return null;
  const current = snap.current ? `${snap.current.provider}/${snap.current.model}` : "";
  const options = snap.groups.flatMap(group => group.models.map(model => ({
    id: `${group.id}/${model.id}`,
    name: model.name,
  })));
  return (
    <AssistantMenu
      label="问助手模型"
      title="只对本页问助手生效"
      value={current}
      disabled={snap.status === "loading" || snap.status === "selecting"}
      options={current || options.length ? options : [{ id: "", name: "选择模型" }]}
      onSelect={id => {
        const [provider, model] = id.split("/");
        if (provider && model) void directory.select({ provider, model });
      }}
    />
  );
}

function AssistantTranscript({ sessionId }: { sessionId: string }) {
  const slots = useContext(FinanceSlots);
  return <div className="finance-assistant-transcript min-h-0 flex-1">
    {slots?.renderSlot('finance.panel.conversation', { sessionId, assistant: true })}
  </div>;
}

function mentionStart(text: string, caret: number): number {
  const before = text.slice(0, caret);
  const at = before.lastIndexOf("@");
  if (at < 0) return -1;
  if (at > 0 && !/\s/.test(before[at - 1] || "")) return -1;
  if (before.slice(at + 1).includes("\n")) return -1;
  return at;
}

export function FinanceAiDock({ renderPanel, showTrigger = true }: Pick<AiDockProps, "renderPanel"> & { showTrigger?: boolean }) {
  const wired = useAiWired();
  const currentPage = useCurrentAiPage();
  const sessions = useResearchSessions();
  const panel = useSyncExternalStore(sessions.subscribeSidePanel, sessions.getSidePanel, sessions.getSidePanel);
  const open = panel?.kind === 'assistant';
  const [heldPage, setHeldPage] = useState(currentPage);
  const page = open ? heldPage || currentPage : currentPage;
  const { question, objects, uncitate, clearQuestion } = useAiQuestion();
  const currentRegistry = usePageAssistantObjects();
  const heldRegistry = useRef(currentRegistry);
  const registry = open ? heldRegistry.current : currentRegistry;
  const seat = useSyncExternalStore(subscribeAssistantSeat, assistantSeatSnapshot, assistantSeatSnapshot);
  const [error, setError] = useState("");
  const [sessionId, setSessionId] = useState("");
  const [draft, setDraft] = useState("");
  const [chips, setChips] = useState<PageAssistantObject[]>([]);
  const [mentionQuery, setMentionQuery] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const [stopping, setStopping] = useState(false);
  const openedQuestion = useRef(0);
  const bindKey = useRef("");
  const attachGen = useRef(0);
  const wasOpen = useRef(open);
  const wantFresh = useRef(false);
  const composing = useRef(false);
  const chipsByBind = useRef(new Map<string, PageAssistantObject[]>());
  const draftsByBind = useRef(new Map<string, string>());
  const chipsRef = useRef<PageAssistantObject[]>([]);
  const draftRef = useRef("");
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  chipsRef.current = chips;
  draftRef.current = draft;
  const activeQuestion = question?.pageKey === page?.key ? question : null;
  // Callers put the selected passage after the first line of the question context.
  const selectedExcerpt = activeQuestion?.object?.kind === 'document' && !activeQuestion.reference
    ? (activeQuestion.context.split('\n').slice(1).join('\n').trim() || '') : '';
  const binding = useMemo(() => page ? assistantBindingForPage(page.key) : null, [page?.key]);

  const rememberChips = useCallback((key: string, next: PageAssistantObject[]) => {
    chipsByBind.current.set(key, next);
    setChips(next);
  }, []);

  useEffect(() => () => {
    attachGen.current += 1;
    setAssistantSeat({ seated: false, busy: false });
  }, []);

  useEffect(() => {
    if (wasOpen.current && !open) {
      attachGen.current += 1;
      setAssistantSeat({ seated: false, busy: false });
      setSending(false);
      setStopping(false);
    }
    wasOpen.current = open;
  }, [open]);

  const close = useCallback(() => {
    attachGen.current += 1;
    setAssistantSeat({ seated: false, busy: false });
    sessions.closeSidePanel();
    setError("");
    setMentionQuery(null);
  }, [sessions]);

  const openPanel = useCallback(() => {
    setHeldPage(currentPage);
    heldRegistry.current = currentRegistry;
    sessions.openAssistantPanel(sessionId, currentPage?.title);
  }, [currentPage, currentRegistry, sessions, sessionId]);

  const attach = useCallback(async (fresh = false) => {
    if (!page || !binding) return;
    const gen = ++attachGen.current;
    const expected = binding.bindKey;
    setAssistantSeat({ busy: true, notice: "" });
    setError("");
    try {
      const result = await sessions.ensureAssistant({
        pageKey: page.key,
        title: page.title,
        mode: seat.mode || "ask",
        plugin: binding.plugin,
        target: binding.target,
        fresh,
      });
      if (attachGen.current !== gen) return;
      if (sessions.getSidePanel()?.kind !== 'assistant') return;
      bindKey.current = expected;
      setAssistantSeat({ seated: false, sessionId: result.sessionId, mode: result.mode || "ask", pageKey: expected, busy: false });
      setSessionId(result.sessionId);
      sessions.openAssistantPanel(result.sessionId, page.title);
    } catch (err) {
      if (attachGen.current !== gen) return;
      setAssistantSeat({ seated: false, busy: false });
      setError(assistantSessionErrorMessage(err));
    }
  }, [page, binding, sessions, seat.mode]);

  useEffect(() => {
    if (!open || !page || !binding) return;
    if (wantFresh.current) {
      wantFresh.current = false;
      void attach(true);
      return;
    }
    if (bindKey.current === binding.bindKey && sessionId) return;
    const prev = bindKey.current;
    if (prev && prev !== binding.bindKey) {
      chipsByBind.current.set(prev, chipsRef.current);
      draftsByBind.current.set(prev, draftRef.current);
      setDraft(draftsByBind.current.get(binding.bindKey) || "");
    }
    rememberChips(binding.bindKey, chipsByBind.current.get(binding.bindKey) || []);
    void attach(false);
  }, [open, page?.key, binding?.bindKey, attach, sessionId, rememberChips]);

  useEffect(() => {
    // Compare with the page on screen, not the page the open panel is holding: “就此追问” on a new page
    // must move the panel to that page instead of being ignored.
    if (question && question.sequence > openedQuestion.current && question.pageKey === currentPage?.key) {
      openedQuestion.current = question.sequence;
      openPanel();
    }
  }, [question, currentPage?.key, openPanel]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        if (mentionQuery !== null) { setMentionQuery(null); return; }
        close();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, close, mentionQuery]);

  useEffect(() => {
    if (question?.pageKey !== page?.key) return;
    const fresh = (objects ?? []).filter(item => !chips.some(chip => chip.id === item.id));
    if (!fresh.length) return;
    const key = binding?.bindKey || "";
    rememberChips(key, [...chips, ...fresh]);
  }, [objects, chips, binding?.bindKey, rememberChips, question?.pageKey, page?.key]);

  const newThread = () => {
    attachGen.current += 1;
    setSessionId("");
    setError("");
    bindKey.current = "";
    wantFresh.current = true;
    if (binding) {
      rememberChips(binding.bindKey, []);
      draftsByBind.current.set(binding.bindKey, "");
    }
    setDraft("");
    setAssistantSeat({ mode: "ask", sessionId: "", seated: false, busy: true });
  };

  const candidates = mentionQuery === null ? [] : registry.query(mentionQuery).filter(item => !chips.some(chip => chip.id === item.id));

  const addChip = (item: PageAssistantObject) => {
    const key = binding?.bindKey || "";
    rememberChips(key, chips.some(chip => chip.id === item.id) ? chips : [...chips, item]);
    const box = textareaRef.current;
    if (box) {
      const at = mentionStart(box.value, box.selectionStart);
      if (at >= 0) {
        const next = `${box.value.slice(0, at)}${box.value.slice(box.selectionStart)}`;
        setDraft(next);
      }
    }
    setMentionQuery(null);
    box?.focus();
  };

  const onDraft = (value: string, caret?: number) => {
    setDraft(value);
    if (binding) draftsByBind.current.set(binding.bindKey, value);
    const pos = caret ?? value.length;
    const at = mentionStart(value, pos);
    setMentionQuery(at < 0 ? null : value.slice(at + 1, pos));
  };

  const trajectory = useMemo(() => {
    if (!sessionId) return null;
    try { return sessions.trajectory(sessionId); }
    catch { return null; }
  }, [sessions, sessionId]);
  const snap = useSyncExternalStore(
    trajectory?.subscribe ?? noopSubscribe,
    trajectory?.getSnapshot ?? emptyTrajectorySnapshot,
    trajectory?.getSnapshot ?? emptyTrajectorySnapshot,
  );
  let live = null as ReturnType<typeof sessions.sessionState>;
  try { live = sessionId ? sessions.sessionState(sessionId) : null; } catch { live = null; }
  const running = Boolean(sending || snap.running || live?.running);
  const hasDraft = Boolean(draft.trim());
  const showStop = running && !hasDraft;

  const stop = async () => {
    if (!sessionId || stopping) return;
    const gen = attachGen.current;
    setStopping(true);
    setError("");
    try {
      await sessions.cancelSession(sessionId);
    } catch (err) {
      if (attachGen.current !== gen) return;
      setError(assistantSessionErrorMessage(err, "没能停止当前回答"));
    } finally {
      if (attachGen.current === gen) setStopping(false);
    }
  };

  const send = async () => {
    if (!page || !binding || !sessionId || sending || seat.busy || running) return;
    const text = draft.trim();
    if (!text) return;
    const gen = attachGen.current;
    setSending(true);
    setError("");
    try {
      await sessions.startAssistant({
        pageKey: page.key,
        title: page.title,
        mode: seat.mode || "ask",
        plugin: binding.plugin,
        target: binding.target,
        prompt: text,
        // “就此追问”选中的原文放在问题的 context 里，必须随本轮页面上下文一起交给助手，否则它不知道问的是哪一段。
        pageSnapshot: [page.snapshotForSend?.(seat.mode || 'ask', chips) ?? page.context, selectedExcerpt ? activeQuestion?.context : '']
          .filter(Boolean).join('\n\n'),
        marketIndices: page.marketIndices,
        companyQuotes: page.companyQuotes,
        objects: chips.map(item => ({
          kind: item.kind,
          id: item.id,
          label: item.label,
          version: item.version,
          url: item.url,
          hint: item.hint,
          source: item.source,
          time: item.time,
          locator: item.locator,
          section: item.section,
          detail: item.detail,
        })),
      });
      if (attachGen.current !== gen) return;
      setDraft("");
      draftsByBind.current.set(binding.bindKey, "");
      setMentionQuery(null);
    } catch (err) {
      if (attachGen.current !== gen) return;
      setError(assistantSessionErrorMessage(err, "消息没发出去，请重试"));
    } finally {
      if (attachGen.current === gen) setSending(false);
    }
  };

  const ready = Boolean(sessionId) && !seat.busy;
  if (!binding) return null;

  return (
    <>
      {showTrigger && <button
        onClick={openPanel}
        disabled={!currentPage}
        title={
          !wired ? "问助手暂时不可用，请刷新页面"
            : currentPage ? `问助手 · ${currentPage.title}`
            : "这一页还没有加载出内容"
        }
        className={cn(
          "ai-chat-trigger inline-flex h-9 shrink-0 items-center gap-1.5 rounded-lg border px-3.5",
          "text-sm font-medium transition-colors",
          currentPage
            ? "border-primary/25 bg-card text-primary hover:bg-primary/5"
            : "cursor-not-allowed border-border bg-muted/40 text-muted-foreground/60",
        )}
      >
        <Sparkles className="h-4 w-4" />
        问助手
      </button>}

      {page && renderPanel(
        open ? <>
          <header className="flex items-center justify-between gap-3 border-b border-border px-4 py-3">
            <div className="flex min-w-0 items-center gap-2.5">
              <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary"><Sparkles className="h-3.5 w-3.5" /></span>
              <div className="min-w-0"><p className="text-xs text-muted-foreground">问助手</p><h2 className="truncate text-sm font-semibold">{page.title}</h2></div>
            </div>
            <div className="flex shrink-0 items-center gap-1">
              {sessionId && <button type="button" className="rounded-lg px-2 py-1 text-xs text-muted-foreground hover:bg-muted hover:text-foreground" onClick={newThread}>新讨论</button>}
              <button type="button" onClick={close} aria-label="关闭" className="rounded-lg p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground">
                <X className="h-4 w-4" />
              </button>
            </div>
          </header>
          {sessionId && binding ? <AssistantTranscript sessionId={sessionId} /> : (
            <div className="flex min-h-0 flex-1 flex-col p-4 text-sm text-muted-foreground">
              <p>{error || "正在准备，马上就好…"}</p>
            </div>
          )}
          {chips.length > 0 && (
            <div className="flex flex-wrap gap-1.5 border-t border-border/50 px-4 py-2">
              {chips.map(item => (
                <span key={item.id} className="inline-flex max-w-full items-center gap-1 rounded-full bg-primary/10 px-2 py-0.5 text-[11px] text-primary">
                  <span className="truncate" title={item.hint || item.label}>{item.label}</span>
                  <button type="button" aria-label={`移除 ${item.label}`} onClick={() => {
                    rememberChips(binding?.bindKey || "", chips.filter(chip => chip.id !== item.id));
                    uncitate?.(item.id);
                  }}><X size={10} /></button>
                </span>
              ))}
            </div>
          )}
          {selectedExcerpt && (
            <div className="relative mx-4 mb-2 rounded-lg border p-2 pr-8 text-xs">
              <button type="button" onClick={clearQuestion} aria-label="移除所选原文" className="absolute right-2 top-2 text-muted-foreground hover:text-foreground"><X size={14} /></button>
              <details><summary className="cursor-pointer">已选原文：{selectedExcerpt.slice(0, 40)}{selectedExcerpt.length > 40 ? '…' : ''}</summary>
              <p className="mt-2 max-h-32 overflow-auto whitespace-pre-wrap">{selectedExcerpt}</p></details>
            </div>
          )}
          {activeQuestion?.reference && !chips.some(item => item.label === activeQuestion.reference?.title) && (
            <div className="relative mx-4 mb-2 rounded-lg border p-2 pr-8 text-xs">
              <button type="button" onClick={clearQuestion} aria-label="移除引用" className="absolute right-2 top-2 text-muted-foreground hover:text-foreground"><X size={14} /></button>
              <details><summary className="cursor-pointer">已引用：{activeQuestion.reference.title}</summary>
              <p className="mt-2 max-h-32 overflow-auto whitespace-pre-wrap">{activeQuestion.reference.text}</p></details>
            </div>
          )}
          {sessionId && (error || seat.notice) && <p role="alert" className="px-4 text-xs text-destructive">{error || seat.notice}</p>}
          <div className="finance-assistant-composer relative border-t border-border p-3">
            {mentionQuery !== null && (
              <div className="finance-assistant-mentions absolute inset-x-3 bottom-full z-20 mb-1 max-h-56 overflow-auto rounded-lg border bg-background shadow-lg" role="listbox" aria-label="本页条目">
                {candidates.length ? candidates.map(item => (
                  <button
                    key={item.id}
                    type="button"
                    role="option"
                    className="flex w-full flex-col items-start gap-0.5 px-3 py-2 text-left text-sm hover:bg-muted/60"
                    onMouseDown={event => { event.preventDefault(); addChip(item); }}
                  >
                    <span className="truncate font-medium">{item.label}</span>
                    {(item.hint || item.section) && <span className="truncate text-[11px] text-muted-foreground">{[item.section, item.hint].filter(Boolean).join(" · ")}</span>}
                  </button>
                )) : <p className="px-3 py-2 text-xs text-muted-foreground">本页暂无可引用的条目</p>}
              </div>
            )}
            <textarea
              ref={textareaRef}
              value={draft}
              disabled={!ready}
              placeholder={assistantModeHint(seat.mode)}
              aria-label="问助手输入"
              rows={3}
              className="w-full resize-none rounded-xl border border-border bg-card px-3 py-2 text-sm outline-none placeholder:text-muted-foreground/70 disabled:opacity-50"
              onCompositionStart={() => { composing.current = true; }}
              onCompositionEnd={event => {
                composing.current = false;
                onDraft(event.currentTarget.value, event.currentTarget.selectionStart);
              }}
              onChange={event => {
                const value = event.currentTarget.value;
                if (composing.current) { setDraft(value); return; }
                onDraft(value, event.currentTarget.selectionStart);
              }}
              onKeyDown={event => {
                if (event.key === "Enter" && !event.shiftKey && mentionQuery !== null && candidates[0]) {
                  event.preventDefault();
                  addChip(candidates[0]);
                  return;
                }
                if (event.key === "Enter" && !event.shiftKey && mentionQuery === null) {
                  event.preventDefault();
                  void send();
                }
              }}
            />
            {running && hasDraft && (
              <p className="mt-2 text-xs text-muted-foreground">当前回答结束后可发送</p>
            )}
            <div className="mt-2 flex items-center justify-between gap-2">
              <div className="flex min-w-0 items-center gap-1">
                <AssistantModeSelect />
                {sessionId && <AssistantModelSelect sessionId={sessionId} />}
              </div>
              <button
                type="button"
                className="workspace-action workspace-action-compact workspace-action-primary inline-flex items-center gap-1"
                aria-label={showStop ? "停止" : "发送"}
                disabled={!ready || (showStop ? stopping : running || !hasDraft)}
                onClick={() => { showStop ? void stop() : void send(); }}
              >
                {showStop ? <><Square className="h-3 w-3" />停止</> : "发送"}
              </button>
            </div>
          </div>
        </> : null,
        close,
      )}
    </>
  );
}
