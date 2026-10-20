import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { FileText, Newspaper, RefreshCw, Loader2, AlertCircle, Star } from "lucide-react";
import { WorkspaceTabs } from "@/components/ui/WorkspaceTabs";
import { useAiPage, useAiPageObjects } from "../../../core/ai/pageContext";
import { useArchiveThenRefresh } from "../../../core/data/useArchiveThenRefresh";
import { GlassCard } from "@/components/ui/GlassCard";
import { Disclaimer } from "@/components/ui/Disclaimer";
import { Tag } from "@/components/ui/Card";
import { api, feedCachedAt, feedHidden } from "@/lib/api";
import { loadWatch } from "@/lib/watchlist";
import { feedPageContext, type FeedRow } from '@/lib/feedPageContext';
import { factorNote, loadFactorModel } from "@/lib/feedFactor";
import { driverNote, loadDriverSet, type DriverSet } from "@/lib/templateDrivers";
import { jevFactorText } from "@/lib/feedJev";
import { aShareQualified } from "@/lib/research";
import type { SensitivityModel } from "@/lib/companyNarrative";

// 页内分段：关注公司的公开新闻与公告，均经 Backend 公共接口读取。
const TABS = [
  { key: "news", label: "公开新闻", icon: Newspaper, desc: "汇总关注列表里各个股的近期新闻（公开源）" },
  { key: "filings", label: "A股公告", icon: FileText, desc: "汇总关注列表里各个股的近期公告" },
];

// 关注股公告 / 新闻聚合：从本地关注列表取代码，复用个股接口批量拉取、按时间倒序合并。
// 只做公开信息聚合，标的均为用户自己关注列表里的，不预置、不推荐。
const MAX_ROWS = 50;
// 股名不会变：同一页面会话内只取一次，切分段不再请求行情。
const NAME_CACHE = new Map<string, string>();
const clock = (at: number) => new Date(at).toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit", hour12: false });

function WatchlistFeed({ kind }: { kind: "filings" | "news" }) {
  const [codes, setCodes] = useState<string[]>(loadWatch);
  const [depNote, setDepNote] = useState<string | null>(null);
  const [updatedAt, setUpdatedAt] = useState<number | null>(null);
  // 公告：Jev 判为例行的默认不显示，点「查看全部」才出来。
  const [showAll, setShowAll] = useState(false);
  const [hidden, setHidden] = useState(0);

  // 公告与新闻各一次请求带上全部关注代码；Backend 按时间倒序返回，部分代码取不到时只少那几只。
  const load = useCallback(async (force: boolean): Promise<FeedRow[]> => {
    const cs = codes;
    if (!cs.length) return [];
    setDepNote(null);
    // 股名（一次批量），失败则退回显示代码
    const nameOf: Record<string, string> = Object.fromEntries(NAME_CACHE);
    const missing = cs.filter(c => !NAME_CACHE.has(c));
    if (missing.length) {
      try {
        const quotes = await api.quote(missing.join(","));
        for (const c of missing) if (quotes[c]?.name) { nameOf[c] = quotes[c].name; NAME_CACHE.set(c, quotes[c].name); }
      } catch { /* 忽略：无股名不影响公告/新闻 */ }
    }
    const codeOf = (symbol: string) => symbol.slice(0, 6);
    const stamp = (value: string | null) => (value || "").replace("T", " ");
    const out: FeedRow[] = kind === "filings"
      ? (await api.announcements(cs, MAX_ROWS, { force, all: showAll })).map(x => ({
        code: codeOf(x.symbol), name: nameOf[codeOf(x.symbol)] || codeOf(x.symbol), when: stamp(x.published_at), title: x.title, meta: x.document_id ? "已入库" : "", url: x.url ?? "", routine: x.routine === true,
      }))
      : (await api.news(cs, MAX_ROWS, { force })).map(x => ({
        code: codeOf(x.symbol), name: nameOf[codeOf(x.symbol)] || codeOf(x.symbol), when: stamp(x.published_at), title: x.title || "", url: x.url ?? "",
        factor: x.factor, also: x.also, followUp: x.follow_up === true,
      }));
    if (kind === "filings") setHidden(feedHidden(cs, MAX_ROWS));
    setUpdatedAt(feedCachedAt(kind === "filings" ? "/feed/announcements" : "/feed/news", cs, MAX_ROWS, kind === "filings" && showAll));
    if (cs.some(c => !/^\d{6}$/.test(c))) setDepNote("港股、美股暂无公告与新闻，只汇总 A 股关注。");
    return out.slice(0, MAX_ROWS);
  }, [kind, codes, showAll]);

  const { data, err, loading, refreshing, staleNote, refresh: rerun } =
    useArchiveThenRefresh<FeedRow[]>(force => load(force), [kind, codes.join(","), showAll], { refreshOnEnter: false });
  const rows = data ?? [];
  // 每条标题下的因素一句：按该公司已存的利润试算变量匹配；没有研究或没命中就不写。
  const [models, setModels] = useState<Record<string, SensitivityModel | null>>({});
  const codesKey = [...new Set(rows.map(row => row.code))].sort().join(",");
  useEffect(() => {
    let alive = true;
    for (const code of codesKey.split(",").filter(Boolean)) {
      const symbol = aShareQualified(code);
      if (!symbol) continue;
      void loadFactorModel(symbol).then(model => { if (alive) setModels(previous => previous[code] === model ? previous : { ...previous, [code]: model }); });
    }
    return () => { alive = false; };
  }, [codesKey]);
  // 没有价格模型的公司（银行、电力、消费等）：按所属行业估值框架的驱动标出新闻碰到什么；价格变量的一句优先。
  const [driverSets, setDriverSets] = useState<Record<string, DriverSet | null>>({});
  const withoutModel = Object.entries(models).filter(([, model]) => model === null).map(([code]) => code).sort().join(",");
  useEffect(() => {
    let alive = true;
    for (const code of withoutModel.split(",").filter(Boolean)) {
      void loadDriverSet(code).then(set => { if (alive && set) setDriverSets(previous => previous[code] === set ? previous : { ...previous, [code]: set }); });
    }
    return () => { alive = false; };
  }, [withoutModel]);
  const feedPage = feedPageContext({ kind, rows, watchCount: codes.length, loading, refreshing, err, staleNote, depNote });
  useAiPage(feedPage);
  useAiPageObjects(feedPage.key, feedPage.objects);

  // 刷新时顺便把关注列表重新读一遍（用户可能刚在别的页面加了自选）
  const refresh = () => {
    const cs = loadWatch();
    if (cs.join(",") !== codes.join(",")) setCodes(cs);   // 变了 → deps 变 → 自动重来
    else rerun();
  };

  if (!codes.length) {
    return (
      <div className="rounded-lg border border-dashed border-border/70 p-8 text-center text-sm text-muted-foreground/70">
        还没有关注股票。到<Link to="/watch" className="underline">「关注」</Link>添加公司，这里会汇总它们的{kind === "filings" ? "公告" : "新闻"}。
      </div>
    );
  }

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <Star className="h-3.5 w-3.5" /> 关注 {codes.length} 只 · 共 {rows.length} 条{kind === "filings" ? "公告" : "新闻"}（近期）
          {/* 🔴 先给存档、后台刷 ⇒ 得让人看得出现在这一屏是哪一份 */}
          {refreshing && rows.length > 0 && (
            <span className="status-pill tone-run">
              <Loader2 className="h-3 w-3 animate-spin" /> 正在更新，先显示上次的内容
            </span>
          )}
          {updatedAt !== null && !loading && <span className="text-[11px]">更新于 {clock(updatedAt)}</span>}
          {staleNote && <span className="text-[11px] text-warning">{staleNote}</span>}
        </span>
        {kind === "filings" && (hidden > 0 || showAll) && (
          <button type="button" className="workspace-action" data-show-all="" aria-pressed={showAll} onClick={() => setShowAll(value => !value)}>
            {showAll ? "只看重要的" : `查看全部（另有 ${hidden} 条例行）`}
          </button>
        )}
        <button onClick={refresh} disabled={loading || refreshing}
          className="workspace-action">
          {refreshing ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
          {refreshing ? "更新中…" : "刷新"}
        </button>
      </div>

      {err && (
        <div className="mb-3 flex items-center gap-2 rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
          <AlertCircle className="h-4 w-4 shrink-0" /> {err}
        </div>
      )}

      {depNote && <p role="status" className="py-3 text-xs text-warning">{depNote}</p>}
      {loading && rows.length === 0 ? (
        <p className="flex items-center justify-center gap-2 py-8 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> 正在汇总关注股的{kind === "filings" ? "公告" : "新闻"}…</p>
      ) : rows.length === 0 ? (
        <p className="py-8 text-center text-sm text-muted-foreground/60">{depNote ? '暂未取得可显示的资料，请稍后重试。' : `关注列表里的个股近期暂无${kind === "filings" ? "公告" : "新闻"}。`}</p>
      ) : (
        <div className="space-y-2">
          {rows.map((r, i) => {
            // Jev 读到的优先；没读到（首次读取、Jev 没开或失败）用关键词结果：价格变量一句优先，其次行业驱动。
            const factor = jevFactorText(r.factor, models[r.code]) || factorNote(models[r.code], r.title) || (models[r.code] === null ? driverNote(driverSets[r.code], r.title) : "");
            return (
              <div key={i} className="border-b border-border/30 pb-2 text-sm last:border-0">
                <div className="group flex items-baseline gap-3">
                  <span className="w-20 shrink-0 font-mono text-xs text-muted-foreground/70">{(r.when || "").slice(kind === "filings" ? 0 : 5, kind === "filings" ? 10 : 16)}</span>
                  <span className="w-16 shrink-0 truncate text-xs text-[var(--text-2)]" title={r.code}>{r.name}</span>
                  {kind === "filings" && r.meta && <span className="hidden w-20 shrink-0 truncate text-xs text-muted-foreground sm:block">{r.meta}</span>}
                  {r.url ? <a href={r.url} target="_blank" rel="noreferrer" className="flex-1 hover:underline">{r.title}</a> : <span className="flex-1">{r.title}</span>}
                  {r.followUp && <Tag><span data-feed-followup="">新进展</span></Tag>}
                  {r.also ? <Tag><span data-feed-also="" title={`另有 ${r.also} 篇相似报道，已合并为这一条`}>另有 {r.also} 篇相似报道，已合并为这一条</span></Tag> : null}
                  {r.routine && <Tag><span data-feed-routine="">例行</span></Tag>}
                </div>
                {factor && <p className="mt-1 pl-[calc(5rem+0.75rem+4rem+0.75rem)] text-xs text-muted-foreground" data-feed-factor="">{factor}</p>}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

/** 动态页「资讯」分段的内容；小栏目由 `/feed?tab=intel&sub=` 驱动，不认识的（含已移除的旧栏目）回落到第一个。 */
export function Intel({ sub, onSub }: { sub?: string | null; onSub?: (key: string) => void } = {}) {
  const tabParam = sub ?? undefined;
  const tab = TABS.some((t) => t.key === tabParam) ? tabParam! : TABS[0]!.key;
  const cur = TABS.find((t) => t.key === tab)!;

  return (
    <div>
      <div className="mb-4">
        <WorkspaceTabs
          aria-label="资讯栏目"
          value={tab}
          onChange={key => onSub?.(key)}
          options={TABS.map(({ key, label, icon }) => ({ value: key, label, icon }))}
        />
      </div>

      <GlassCard>
        {cur.key === "filings" ? <WatchlistFeed key="filings" kind="filings" /> : <WatchlistFeed key="news" kind="news" />}
      </GlassCard>

      <p className="mt-3 text-[11px] text-muted-foreground/60">
        只做公开信息聚合、不做推荐、不预测涨跌。公告 / 新闻均来自你关注列表里个股的公开披露与公开源。
      </p>
      <Disclaimer />
    </div>
  );
}
