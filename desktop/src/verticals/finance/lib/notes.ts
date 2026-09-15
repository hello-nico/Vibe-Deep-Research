/**
 * 研究记录（沉淀）—— Backend `product_notes` 是正文与身份的唯一写入者。
 *
 * ⚠️ **读是同步的、写是异步的**：页面在渲染时同步读（`useState(loadNotes)`），
 *    所以缓存必须在业务页面挂载**之前**灌好（见 `dsh/client.tsx` 的 hydrate）。
 *    写则必须异步——写失败要让调用方看得见，不能默默"保存成功"。
 */
import { ResearchError, researchRead } from "./research";

export interface Note {
  id: string;
  kind: string;
  title: string;
  content: string;
  excerpt?: string;
  ts: number;
  hasFullBody?: boolean;
}

let cache: Note[] = [];
let hydrateError: Error | null = null;
const CATEGORY_LABELS: Record<string, string> = {
  review: "复盘",
  highlight: "今日要点",
  ask: "问助手",
  debate: "多空辩论",
  audit: "反思审计",
  backtest: "回测",
};

const KIND_TO_CATEGORY: Record<string, string> = {
  复盘: "review",
  今日要点: "highlight",
  问AI: "ask",
  "问 AI": "ask",
  "问 Agent": "ask",
  "问助手": "ask",
  多空辩论: "debate",
  反思审计: "audit",
  回测: "backtest",
};

function toCategory(kind: string): string {
  const direct = KIND_TO_CATEGORY[kind.trim()];
  if (direct) return direct;
  if (CATEGORY_LABELS[kind.trim()]) return kind.trim();
  throw new Error(`研究记录的分类「${kind}」没有对应的枚举 —— 加分类要同时改 Backend notes 与产品映射`);
}

const ASK_KIND_ALIASES = new Set(["问 Agent", "问AI", "问 AI"]);
const ASK_KIND_LABEL = "问助手";

function displayKind(kind: string): string {
  return ASK_KIND_ALIASES.has(kind.trim()) ? ASK_KIND_LABEL : kind;
}

function displayTitle(title: string): string {
  return title.replace(/^(问 Agent|问AI|问 AI)(?= · |$)/, ASK_KIND_LABEL);
}

function noteError(error: unknown): Error {
  if (error instanceof ResearchError) {
    if (error.status === 503) {
      if (/无法确认研究关联/.test(error.message)) return new Error(error.message);
      return new Error("研究记录服务暂时不可用，请稍后重试");
    }
    if (error.status === 409) return new Error("这条记录已关联议题，不能删除");
    if (error.status === 413) return new Error("记录正文超过 10 万字符，未截断也未保存");
    return new Error(error.message);
  }
  return error instanceof Error ? error : new Error(String(error));
}

interface NotePayload {
  note_id?: string;
  id?: string;
  category?: string;
  kind?: string;
  title?: string;
  body?: string;
  content?: string;
  excerpt?: string;
  created_at?: string;
  ts?: number;
  has_full_body?: boolean;
}

function toNote(row: NotePayload, full = false): Note {
  const cat = String(row.category ?? row.kind ?? "");
  const rawBody = row.body ?? row.content;
  return {
    id: String(row.note_id ?? row.id ?? ""),
    kind: displayKind(CATEGORY_LABELS[cat] ?? cat),
    title: displayTitle(String(row.title ?? "")),
    content: full ? String(rawBody ?? "") : String(row.excerpt ?? rawBody ?? ""),
    excerpt: row.excerpt,
    ts: typeof row.ts === "number" ? row.ts : Date.parse(String(row.created_at ?? "")) || 0,
    hasFullBody: full,
  };
}

let seq = 0;
export async function hydrateNotes(): Promise<void> {
  const mine = ++seq;
  hydrateError = null;
  try {
    const items: Note[] = [];
    for (let offset = 0; ; ) {
      const page = await researchRead<{ items: NotePayload[]; total: number; next_offset: number | null }>(
        `/notes?limit=40&offset=${offset}`,
      );
      items.push(...page.items.map((row) => toNote(row)));
      if (page.next_offset == null) break;
      offset = page.next_offset;
    }
    if (mine !== seq) return;
    cache = items.sort((a, b) => b.ts - a.ts);
  } catch (error) {
    if (mine !== seq) return;
    hydrateError = noteError(error);
    throw hydrateError;
  }
}

export function notesLoadError(): Error | null {
  return hydrateError;
}

export function loadNotes(): Note[] {
  return [...cache];
}

// 可重试的保存入口持有 operationId；独立保存即使内容相同也使用不同 ID。
export async function addNote(kind: string, title: string, content: string, operationId = `op-${crypto.randomUUID()}`): Promise<Note[]> {
  try {
    const saved = await researchRead<NotePayload>("/notes", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        category: toCategory(kind),
        title,
        body: content,
        operation_id: operationId,
      }),
    });
    seq++;
    cache = [toNote(saved, true), ...cache.filter((n) => n.id !== saved.note_id && n.id !== saved.id)];
    return [...cache];
  } catch (error) {
    throw noteError(error);
  }
}

export async function getNote(id: string): Promise<Note> {
  try {
    const row = await researchRead<NotePayload>(`/notes/${encodeURIComponent(id)}`);
    const note = toNote(row, true);
    cache = cache.map((item) => item.id === note.id ? note : item);
    if (!cache.some((item) => item.id === note.id)) cache = [note, ...cache];
    return note;
  } catch (error) {
    throw noteError(error);
  }
}

export async function searchNotes(query: string, offset = 0, limit = 40, kind = ""): Promise<{ notes: Note[]; total: number; nextOffset: number | null }> {
  const params = new URLSearchParams({ offset: String(offset), limit: String(limit) });
  if (query.trim()) params.set("query", query.trim());
  if (kind.trim()) params.set("category", toCategory(kind));
  try {
    const page = await researchRead<{ items: NotePayload[]; total: number; next_offset: number | null }>(`/notes?${params}`);
    return { notes: page.items.map((row) => toNote(row)), total: page.total, nextOffset: page.next_offset };
  } catch (error) {
    throw noteError(error);
  }
}

export async function deleteNote(id: string): Promise<Note[]> {
  try {
    await researchRead(`/notes/${encodeURIComponent(id)}/delete`, { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" });
    seq++;
    cache = cache.filter((n) => n.id !== id);
    return [...cache];
  } catch (error) {
    throw noteError(error);
  }
}

export async function clearNotes(): Promise<void> {
  seq++;
  for (const n of [...cache]) {
    await deleteNote(n.id);
  }
}
