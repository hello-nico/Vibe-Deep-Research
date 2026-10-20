import type { MemoryDoc, MemoryEntry } from "./memory";

export type AboutMeItem = MemoryEntry & { kind: "soul" | "recent" };

/** 画像与近期记忆合成一列，按更新时间倒序，没有时间的排最后。 */
export function aboutMeItems(soul: MemoryDoc | null, recent: MemoryDoc | null): AboutMeItem[] {
  const rows = [...(soul?.entries ?? []).map(entry => ({ ...entry, kind: "soul" as const })), ...(recent?.entries ?? []).map(entry => ({ ...entry, kind: "recent" as const }))];
  const time = (entry: MemoryEntry) => Date.parse(entry.updated_at || "") || 0;
  return rows.sort((a, b) => time(b) - time(a));
}

export function aboutMeSource(entry: MemoryEntry): string {
  if (entry.stance === "inferred") return "从对话中推断";
  if (entry.stance === "corrected") return "自己改过";
  return entry.source_session ? "对话里说的" : "自己填写";
}

export function aboutMeDate(value?: string): string {
  const date = new Date(value || "");
  return Number.isNaN(date.getTime()) ? "" : `${date.getMonth() + 1}月${date.getDate()}日`;
}

export const rememberOps = (text: string) => [{ op: "upsert", stance: "stated", text: text.trim(), user_authorized: true }];
export const forgetOps = (id: string) => [{ op: "delete", id }];
