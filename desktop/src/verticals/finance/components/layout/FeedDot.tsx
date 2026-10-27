import { useEffect, useState } from "react";
import { StatusDot } from "../ui/StatusDot";
import { loadAttentionIds, markArrivalsSeen, seenArrivals } from "../../lib/feedAttention";

export const FEED_DOT_POLL_MS = 300_000;

/** 导航「动态」旁的小圆点（不显示数字）：有未看的判断变化就亮；进入动态页即视为看过，记在本机。 */
export function FeedDot({ pathname, load = loadAttentionIds }: { pathname: string; load?: typeof loadAttentionIds }) {
  const [unseen, setUnseen] = useState<string[]>([]);
  const onFeed = pathname === "/feed" || pathname.startsWith("/feed/");
  useEffect(() => {
    const controller = new AbortController();
    const refresh = () => load(controller.signal).then(ids => {
      if (controller.signal.aborted) return;
      if (onFeed) { markArrivalsSeen(ids); setUnseen([]); return; }
      const seen = seenArrivals();
      setUnseen(ids.filter(id => !seen.has(id)));
    }, () => {});
    void refresh();
    const timer = window.setInterval(() => { void refresh(); }, FEED_DOT_POLL_MS);
    return () => { controller.abort(); window.clearInterval(timer); };
  }, [onFeed, load]);
  if (!unseen.length || onFeed) return null;
  return <StatusDot tone="info" label="动态里有估值判断变了的公司" className="workspace-nav-dot" />;
}
