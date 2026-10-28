import { useEffect, useState } from "react";
import { StatusDot } from "../ui/StatusDot";
import { loadAttentionIds, markArrivalsSeen, seenArrivals } from "../../lib/feedAttention";

export const FEED_DOT_POLL_MS = 300_000;

/** 导航「动态」旁的小圆点：有未看的新报告待重研或判断变化时亮。 */
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
  return <StatusDot tone="info" label="新报告或估值变化" className="workspace-nav-dot" />;
}
