import { MEMORY_CATEGORIES, type MemoryCategory, type MemoryDoc, type MemoryEntry } from "./memory";

export type AboutMeItem = MemoryEntry & { kind: "soul" | "recent" };
export interface AboutMeSection { category?: MemoryCategory; label: string; hint?: string; items: AboutMeItem[] }

/** 每类空着时的一句说明：告诉用户这一类记什么。 */
export const CATEGORY_HINT: Record<MemoryCategory, string> = {
  水平与表达偏好: "比如：回答先给结论，少用术语",
  持仓与关注: "比如：我持有神火，偏中长线",
  投资风格与约束: "比如：不碰连续亏损的公司",
  纠正: "比如：不要把收入写成利润",
};

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

/** 四类按固定顺序始终分段，有记忆的组排前、空组排后并带一句说明；旧条目没有合法类别时放进末尾「其他」，不猜分类。 */
export function aboutMeSections(soul: MemoryDoc | null, recent: MemoryDoc | null): AboutMeSection[] {
  const items = aboutMeItems(soul, recent);
  const sections: AboutMeSection[] = MEMORY_CATEGORIES.map(category => ({ category, label: category, hint: CATEGORY_HINT[category], items: items.filter(item => item.category === category) }));
  const uncategorized = items.filter(item => !MEMORY_CATEGORIES.some(category => category === item.category));
  const all = uncategorized.length ? [...sections, { label: "其他", items: uncategorized }] : sections;
  // 有记忆的组排前，空组排后；各自保持固定顺序。
  return [...all.filter(section => section.items.length), ...all.filter(section => !section.items.length)];
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
