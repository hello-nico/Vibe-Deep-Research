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
  // 失败原因（接口名、HTTP 状态）只留在数据里排查，不上屏。
  return `这次没有取到最新数据，显示的是 ${valid ? `${day === today ? "" : `${day} `}${time}` : "之前"} 的内容`;
}

/** 整页级错误（如本机服务未启动）照实说明；单块取数失败的接口细节不上屏。 */
export function dailyReviewEmptyStatus(_block?: PageBlock, error?: string | null): string {
  return error || "这次没有取到数据，可以稍后刷新重试";
}
