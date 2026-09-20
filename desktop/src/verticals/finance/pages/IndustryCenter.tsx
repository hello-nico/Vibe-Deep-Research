import { useEffect, useState } from "react";
import { Link, Navigate, useNavigate, useParams } from "react-router-dom";
import { ChevronLeft, Layers3 } from "lucide-react";
import { PageHeader } from "../components/ui/PageHeader";
import { GlassCard } from "../components/ui/GlassCard";
import { Disclaimer } from "../components/ui/Disclaimer";
import { ResearchLoading } from "../components/ui/ResearchLoading";
import { DashboardCard } from "../components/IndustryDashboardCard";
import { WorkspaceSelect } from "../components/ui/WorkspaceSelect";
import { WikiLoading, WikiReader } from "../components/ResearchKnowledge";
import { industryIcon } from "../lib/industryIcons";
import { researchRead, type NbsIndustry } from "../lib/research";
import { useAiPage } from "../../../core/ai/pageContext";

export function IndustryCenter() {
  const { key } = useParams();
  const navigate = useNavigate();
  const [items, setItems] = useState<NbsIndustry[] | null>(null);
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");
  const [loaded, setLoaded] = useState({ slug: '', markdown: '' });
  const [profileCount, setProfileCount] = useState<number>();
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
  useAiPage({
    key: `nbs:${key ?? "list"}`,
    title: selected?.official_name || "行业研究",
    context: selected ? `${selected.official_name} · ${selected.coverage_note}\n${loaded.slug === selected.slug ? loaded.markdown : ''}` : "行业资料列表：" + (items?.map(item => item.official_name).join('、') || '正在读取'),
    suggestions: ["这个行业的利润如何形成？", "研究这个行业需要关注哪些变化？"],
  });
  if (key && /^\d{6}$/.test(key)) return <Navigate replace to={`/sectors/profiles/${key}`} />;
  const profilesLink = <Link className="workspace-action shrink-0" to="/sectors/profiles"><Layers3 />{profileCount != null ? `${profileCount} 个产业研究` : "产业研究"}</Link>;
  return <div>
    <PageHeader title={selected?.official_name || "行业研究"} subtitle={selected ? undefined : "了解行业如何运转，沿着问题持续研究。"}
      actions={selected ? undefined : profilesLink} />
    {selected && <div className="workspace-toolbar justify-between"><div className="flex min-w-0 flex-wrap items-center gap-3"><Link className="workspace-action" to="/sectors"><ChevronLeft />全部行业</Link><WorkspaceSelect aria-label="切换行业" className="max-w-full" value={selected.short_name} onChange={next => navigate(`/sectors/${encodeURIComponent(next)}`)} options={(items ?? []).map(item => ({ value: item.short_name, label: item.official_name }))} /></div>{profilesLink}</div>}
    {error && <p role="alert">{error}</p>}
    {status === "unavailable" && <p role="status" className="mb-4 text-sm text-muted-foreground">行业资料暂时无法读取，请稍后重试。</p>}
    {!items && !error && (key
      ? <GlassCard className="min-h-[440px] !p-4 sm:!p-7"><WikiLoading slug={`industries/${key}`} /></GlassCard>
      : <ResearchLoading title="正在读取行业入口" sections={["行业身份", "经营结构"]} />)}
    {items && !selected && <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">{items.map(item => (
      <DashboardCard
        key={item.subject_id}
        title={item.official_name}
        description={item.summary || "行业资料待补充。"}
        href={`/sectors/${encodeURIComponent(item.short_name)}`}
        footer={item.published ? "查看研究方向" : "资料待补充"}
        icon={industryIcon(item.official_name)}
      />
    ))}</div>}
    {selected && <GlassCard className="min-h-[440px] !p-4 sm:!p-7">
      {selected.published
        ? <WikiReader key={selected.slug} slug={selected.slug} onMarkdown={markdown => setLoaded(previous => previous.slug === selected.slug && previous.markdown === markdown ? previous : { slug: selected.slug, markdown })} />
        : <p className="text-sm text-muted-foreground">{selected.official_name} 的资料尚待补充。</p>}
    </GlassCard>}
    <Disclaimer />
  </div>;
}
