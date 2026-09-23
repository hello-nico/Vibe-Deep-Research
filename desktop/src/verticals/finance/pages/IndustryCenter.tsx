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
import { IndustryRefreshConfirm } from "../components/CompanyRefreshConfirm";
import type { RefreshViewState } from "../components/CompanyRefreshConfirm";
import { WorkspaceMoreMenu } from "../components/ui/WorkspaceMoreMenu";

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
  const [reportSlot, setReportSlot] = useState<HTMLElement | null>(null);
  const [refreshView, setRefreshView] = useState<RefreshViewState>('idle');
  const [draftToken, setDraftToken] = useState("");
  const [revision, setRevision] = useState(0);
  const [reload, setReload] = useState(0);
  useEffect(() => { setWikiPage(null); setDraftToken(""); setMarkdown(""); }, [key]);
  useEffect(() => {
    const controller = new AbortController(); setError("");
    void researchRead<{ items: NbsIndustry[]; wiki_status?: string }>("/wiki/industries/nbs", { signal: controller.signal })
      .then(value => { setItems(value.items); setStatus(value.wiki_status || ""); })
      .catch(e => { if (!controller.signal.aborted) setError(e instanceof Error ? e.message : String(e)); });
    void researchRead<{ items: unknown[] }>("/industries/profiles", { signal: controller.signal })
      .then(value => { if (!controller.signal.aborted) setProfileCount(value.items.length); })
      .catch(() => {});
    return () => controller.abort();
  }, [reload]);
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
    {selected && <div className="object-toolbar">
      <div className="object-toolbar-group">
        <Link className="workspace-action" to="/sectors"><ChevronLeft />全部行业</Link>
        <WorkspaceSelect aria-label="切换行业" className="max-w-full" value={selected.short_name} onChange={next => navigate(`/sectors/${encodeURIComponent(next)}`)} searchPlaceholder="搜索行业" emptyText="没有匹配的行业" options={(items ?? []).map(item => ({ value: item.short_name, label: item.official_name }))} />
        {selected.published && <WikiViewTabs report={report} onChange={setReport} />}
      </div>
      <div className="object-toolbar-group object-toolbar-actions">
        {selected.published && <span className={report ? "hidden" : "contents"}><IndustryRefreshConfirm key={selected.slug} slug={selected.slug} version={wikiPage?.input_hash} title={selected.official_name} onUpdated={() => setRevision(value => value + 1)} onStateChange={setRefreshView} /></span>}
        {selected.published && report && <span ref={setReportSlot} className="contents" />}
        <WorkspaceMoreMenu actions={[{ id: 'profiles', label: profileCount != null ? `${profileCount} 个产业研究` : '产业研究', icon: <Layers3 size={14} />, onSelect: () => navigate('/sectors/profiles') }]} />
      </div>
    </div>}
    {error && <p role="alert">{error}<button type="button" className="workspace-action ml-2" onClick={() => setReload(value => value + 1)}>重试</button></p>}
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
        <p className="text-sm">草案已生成，你确认后才会显示在本页。</p>
        <WikiDraftPublish draftToken={draftToken} onPublished={() => { setDraftToken(""); setWikiPage(null); }} />
      </div>}
      {selected.published && !report && refreshView !== 'idle' && <WikiLoading slug={selected.slug} title={refreshView === 'checking' ? '正在检查资料' : '正在更新资料'} />}
      {selected.published
        ? <div hidden={!report && refreshView !== 'idle'}><WikiReader key={selected.slug} slug={selected.slug} revision={revision} hideToggle report={report} reportActionSlot={reportSlot} onReportChange={setReport} onPage={setWikiPage} onMarkdown={setMarkdown} /></div>
        : <p className="text-sm text-muted-foreground">{selected.official_name} 的资料尚待补充。</p>}
    </GlassCard>}
    <Disclaimer />
  </div>;
}
