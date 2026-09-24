import type { PageBlock } from "../lib/localService.ts";

export function dailyReviewBlockTime(block: PageBlock | undefined, parsed?: string | null): string | null {
  if (block?.status === "failed" || block?.status === "missing") return null;
  return block?.fetched_at || parsed || null;
}

export function dailyReviewBlockStatus(block: PageBlock | undefined, now = new Date()): string | null {
  if (block?.status !== "stale_fallback") return null;
  const date = block.fetched_at ? new Date(block.fetched_at) : null;
  const valid = date && !Number.isNaN(date.getTime());
  const p = (n: number) => String(n).padStart(2, "0");
  const day = valid ? `${date.getFullYear()}-${p(date.getMonth() + 1)}-${p(date.getDate())}` : "时间未知";
  const today = `${now.getFullYear()}-${p(now.getMonth() + 1)}-${p(now.getDate())}`;
  const time = valid ? `${p(date.getHours())}:${p(date.getMinutes())}` : "";
  return `这次没取到（${block.error || "取数失败"}），下面是 ${valid ? `${day === today ? "" : `${day} `}${time}` : day} 的内容`;
}

export function dailyReviewEmptyStatus(block: PageBlock | undefined, error?: string | null): string {
  return block?.error || error || "本次未取得可用数据，可以刷新重试";
}
