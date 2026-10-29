import { useEffect, useState } from "react";
import { StatusDot } from "../ui/StatusDot";
import { cachedAttentionIds, markArrivalsSeen, peekAttentionIds, seenArrivals } from "../../lib/feedAttention";

export const FEED_DOT_POLL_MS = 300_000;
/** 页面自己的数据先加载：小圆点晚几秒再算，不和当前页面抢连接。 */
export const FEED_DOT_DELAY_MS = 4_000;

/** 导航「动态」旁的小圆点：有未看的新报告待重研或判断变化时亮。 */
export function FeedDot({ pathname, load = cachedAttentionIds, peek = peekAttentionIds, delayMs = FEED_DOT_DELAY_MS }: { pathname: string; load?: typeof cachedAttentionIds; peek?: typeof peekAttentionIds; delayMs?: number }) {
  const [unseen, setUnseen] = useState<string[]>([]);
  const onFeed = pathname === "/feed" || pathname.startsWith("/feed/");
  const onCompany = /^\/watch\/[^/]+/.test(pathname);
  useEffect(() => {
    // 动态页自己已经读了这些数据：这里不再重读，只把本机已有的结果记为已看。
    if (onFeed) { const ids = peek(); if (ids) markArrivalsSeen(ids); setUnseen([]); return; }
    if (onCompany) { const seen = seenArrivals(); setUnseen((peek() ?? []).filter(id => !seen.has(id))); return; }
    const controller = new AbortController();
    const refresh = () => load(controller.signal).then(ids => {
      if (controller.signal.aborted) return;
      const seen = seenArrivals();
      setUnseen(ids.filter(id => !seen.has(id)));
    }, () => {});
    const first = window.setTimeout(() => { void refresh(); }, delayMs);
    const timer = window.setInterval(() => { void refresh(); }, FEED_DOT_POLL_MS);
    return () => { controller.abort(); window.clearTimeout(first); window.clearInterval(timer); };
  }, [onFeed, onCompany, load, peek, delayMs]);
  if (!unseen.length || onFeed) return null;
  return <StatusDot tone="info" label="新报告或估值变化" className="workspace-nav-dot" />;
}
