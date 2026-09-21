import { useEffect, useState } from "react";
import { Link, Navigate, useNavigate, useParams } from "react-router-dom";
import { ChevronLeft, Layers3 } from "lucide-react";
import { PageHeader } from "../components/ui/PageHeader";
import { GlassCard } from "../components/ui/GlassCard";
import { Disclaimer } from "../components/ui/Disclaimer";
import { ResearchLoading } from "../components/ui/ResearchLoading";
import { DashboardCard } from "../components/IndustryDashboardCard";
import { WorkspaceSelect } from "../components/ui/WorkspaceSelect";
import { WorkspaceSearch } from "../components/ui/WorkspaceSearch";
import { WikiLoading, WikiReader, WikiViewTabs } from "../components/ResearchKnowledge";
import { industryIcon } from "../lib/industryIcons";
import { loadBackgroundTasks, researchRead, type NbsIndustry, type WikiPage } from "../lib/research";
import { workspaceSelectMatches } from "../lib/workspaceSelect";
import { useAiPage, useAiPageObjects } from "../../../core/ai/pageContext";
import { wikiAssistantObject } from "../lib/pageAssistantObjects";
import { buildDirectorySnapshot, buildWikiPageSnapshot } from "../assistant/snapshot.ts";
import { WikiDraftPublish } from "../components/WikiDraftPublish";

export function IndustryCenter() {
  const { key } = useParams();
  const navigate = useNavigate();
  const [items, setItems] = useState<NbsIndustry[] | null>(null);
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");
  const [wikiPage, setWikiPage] = useState<WikiPage | null>(null);
  const [markdown, setMarkdown] = useState("");
  const [profileCount, setProfileCount] = useState<number>();
  const [query, setQuery] = useState("");
  const [report, setReport] = useState(false);
  const [draftToken, setDraftToken] = useState("");
  useEffect(() => { setWikiPage(null); setDraftToken(""); setMarkdown(""); }, [key]);
  useEffect(() => {
    const controller = new AbortController(); setError("");
    void researchRead<{ items: NbsIndustry[]; wiki_status?: string }>("/wiki/industries/nbs", { signal: controller.signal })
      .then(value => { setItems(value.items); setStatus(value.wiki_status || ""); })
      .catch(e => { if (!controller.signal.aborted) setError(String(e)); });
    void researchRead<{ items: unknown[] }>("/industries/profiles", { signal: controller.signal })
      .then(value => { if (!controller.signal.aborted) setProfileCount(value.items.length); })
      .catch(() => {});
    return () => controller.abort();
  }, []);
  const selected = key
    ? items?.find(item => item.short_name === key || item.slug === `industries/nbs-${key}` || item.slug.endsWith(`/${key}`))
    : undefined;
  const visible = items?.filter(item => workspaceSelectMatches(
    { label: item.official_name, detail: `${item.short_name} ${item.summary || ""}` },
    query,
  ));
  useEffect(() => {
    const slug = selected?.slug;
    if (!slug) return;
    let alive = true;
    const tick = async () => {
      const tasks = await loadBackgroundTasks().catch(() => [] as { draft_token?: string; status?: string; display_status?: string; targets?: string[] }[]);
      if (!alive) return;
      const hit = tasks.find(item => (item.display_status || item.status) === "awaiting_authorization" && item.draft_token && (item.targets || []).includes(slug));
      setDraftToken(hit?.draft_token || "");
    };
    void tick();
    const timer = window.setInterval(() => void tick(), 8000);
    return () => { alive = false; window.clearInterval(timer); };
  }, [selected?.slug]);
  const pageKey = selected ? `industry-wiki:${selected.slug}` : `nbs:${key ?? "list"}`;
  useAiPage({
    key: pageKey,
    title: selected?.official_name || "行业研究",
    context: selected
      ? buildWikiPageSnapshot({
        kind: 'industry',
        title: selected.official_name,
        slug: selected.slug,
        coverageNote: selected.coverage_note,
        loadState: !selected.published ? 'unpublished' : (wikiPage || markdown ? 'ready' : 'loading'),
        page: wikiPage,
        markdown,
      })
      : buildDirectorySnapshot({
        heading: `行业目录 ${items?.length ?? 0} 个。`,
        items: (visible ?? []).map(item => ({ title: item.official_name, id: item.slug })),
        loading: !items,
      }),
    suggestions: ["这个行业的利润如何形成？", "研究这个行业需要关注哪些变化？"],
  });
  const industryObjects = selected
    ? [wikiAssistantObject({ slug: selected.slug, title: selected.official_name, inputHash: wikiPage?.input_hash, section: '行业研究' })].flatMap(item => item ? [item] : [])
    : (visible ?? []).flatMap(item => {
      const wiki = wikiAssistantObject({ slug: item.slug, title: item.official_name, section: '行业研究' });
      return wiki ? [wiki] : [];
    });
  useAiPageObjects(pageKey, industryObjects);
  if (key && /^\d{6}$/.test(key)) return <Navigate replace to={`/sectors/profiles/${key}`} />;
  const profilesLink = <Link className="workspace-action shrink-0" to="/sectors/profiles"><Layers3 />{profileCount != null ? `${profileCount} 个产业研究` : "产业研究"}</Link>;
  return <div>
    <PageHeader title={selected?.official_name || "行业研究"} subtitle={selected ? undefined : "了解行业如何运转，沿着问题持续研究。"}
      search={selected ? undefined : <WorkspaceSearch className="mb-0" placeholder="搜索行业名称" value={query} onChange={setQuery} />}
      actions={selected ? undefined : profilesLink} />
    {selected && <div className="workspace-toolbar justify-between"><div className="flex min-w-0 flex-wrap items-center gap-3"><Link className="workspace-action" to="/sectors"><ChevronLeft />全部行业</Link><WorkspaceSelect aria-label="切换行业" className="max-w-full" value={selected.short_name} onChange={next => navigate(`/sectors/${encodeURIComponent(next)}`)} searchPlaceholder="搜索行业" emptyText="没有匹配的行业" options={(items ?? []).map(item => ({ value: item.short_name, label: item.official_name }))} />{selected.published && <WikiViewTabs report={report} onChange={setReport} />}</div>{profilesLink}</div>}
    {error && <p role="alert">{error}</p>}
    {status === "unavailable" && <p role="status" className="mb-4 text-sm text-muted-foreground">行业资料暂时无法读取，请稍后重试。</p>}
    {!items && !error && (key
      ? <GlassCard className="min-h-[440px] !p-4 sm:!p-7"><WikiLoading slug={`industries/${key}`} /></GlassCard>
      : <ResearchLoading title="正在读取行业入口" sections={["行业身份", "经营结构"]} />)}
    {items && !selected && (visible?.length
      ? <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">{visible.map(item => (
      <DashboardCard
        key={item.subject_id}
        title={item.official_name}
        description={item.summary || "行业资料待补充。"}
        href={`/sectors/${encodeURIComponent(item.short_name)}`}
        footer={item.published ? "查看研究方向" : "资料待补充"}
        icon={industryIcon(item.official_name)}
      />
    ))}</div>
      : <GlassCard><p className="py-12 text-center text-sm text-muted-foreground">{items.length ? "没有匹配的行业，请调整搜索。" : "暂无行业资料。"}</p></GlassCard>)}
    {selected && <GlassCard className="min-h-[440px] !p-4 sm:!p-7">
      {draftToken && <div className="mb-4 rounded-xl border border-border p-4" role="status">
        <p className="text-sm">研究草案已生成，待审阅；尚未发布到本页。</p>
        <WikiDraftPublish draftToken={draftToken} onPublished={() => { setDraftToken(""); setWikiPage(null); }} />
      </div>}
      {selected.published
        ? <WikiReader key={selected.slug} slug={selected.slug} hideToggle report={report} onReportChange={setReport} onPage={setWikiPage} onMarkdown={setMarkdown} />
        : <p className="text-sm text-muted-foreground">{selected.official_name} 的资料尚待补充。</p>}
    </GlassCard>}
    <Disclaimer />
  </div>;
}
