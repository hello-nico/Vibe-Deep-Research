import { MEMORY_CATEGORIES, type MemoryCategory, type MemoryDoc, type MemoryEntry } from "./memory";

export type AboutMeItem = MemoryEntry & { kind: "soul" | "recent" };
export interface AboutMeSection { category?: MemoryCategory; items: AboutMeItem[] }

/** 旧记忆只在展示时改成用户口吻；不改变存储正文。 */
export function memoryTextForDisplay(text: string): string {
  const withoutNarration = text
    .replace(/^用户(?:要求|表示|说|提到|补充|强调)[：:]\s*/, "")
    .replace(/^用户(?:表达|提出)(?:了)?对(.+?)的(判断|看法)[：:]\s*/, "我对$1的$2：");
  return withoutNarration.replace(/^用户/, "我");
}

/** 画像与近期记忆合成一列，按更新时间倒序，没有时间的排最后。 */
export function aboutMeItems(soul: MemoryDoc | null, recent: MemoryDoc | null): AboutMeItem[] {
  const rows = [
    ...(soul?.entries ?? []).map(entry => ({ ...entry, text: memoryTextForDisplay(entry.text), kind: "soul" as const })),
    ...(recent?.entries ?? []).map(entry => ({ ...entry, text: memoryTextForDisplay(entry.text), kind: "recent" as const })),
  ];
  const time = (entry: MemoryEntry) => Date.parse(entry.updated_at || "") || 0;
  return rows.sort((a, b) => time(b) - time(a));
}

/** 四类按固定顺序分段；旧条目没有合法类别时原样放在末尾，不猜分类。 */
export function aboutMeSections(soul: MemoryDoc | null, recent: MemoryDoc | null): AboutMeSection[] {
  const items = aboutMeItems(soul, recent);
  const sections = MEMORY_CATEGORIES.map(category => ({ category, items: items.filter(item => item.category === category) }))
    .filter(section => section.items.length > 0);
  const uncategorized = items.filter(item => !MEMORY_CATEGORIES.some(category => category === item.category));
  return uncategorized.length ? [...sections, { items: uncategorized }] : sections;
}

export function aboutMeSource(entry: MemoryEntry): string {
  return entry.stance === "inferred" ? "从对话中记下" : "我说的";
}

export function aboutMeDate(value?: string): string {
  const date = new Date(value || "");
  return Number.isNaN(date.getTime()) ? "" : `${date.getMonth() + 1}月${date.getDate()}日`;
}

export const rememberOps = (text: string, category: MemoryCategory) => [{ op: "upsert", stance: "stated", category, text: text.trim(), user_authorized: true }];
export const forgetOps = (id: string) => [{ op: "delete", id }];
