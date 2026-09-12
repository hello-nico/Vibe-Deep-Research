import { useEffect, useState } from "react";
import { Link, Navigate, useParams } from "react-router-dom";
import { ChevronLeft, Layers3 } from "lucide-react";
import { PageHeader } from "../components/ui/PageHeader";
import { GlassCard } from "../components/ui/GlassCard";
import { Disclaimer } from "../components/ui/Disclaimer";
import { WikiReader } from "../components/ResearchKnowledge";
import { researchRead, type NbsIndustry } from "../lib/research";
import { useAiPage } from "../../../core/ai/pageContext";

export function IndustryCenter() {
  const { key } = useParams();
  const [items, setItems] = useState<NbsIndustry[] | null>(null);
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");
  const [links, setLinks] = useState<{ slug: string; title: string }[]>([]);
  const [material, setMaterial] = useState("");
  const [linkError, setLinkError] = useState("");
  useEffect(() => {
    const controller = new AbortController(); setError("");
    void researchRead<{ items: NbsIndustry[]; wiki_status?: string }>("/wiki/industries/nbs", { signal: controller.signal })
      .then(value => { setItems(value.items); setStatus(value.wiki_status || ""); })
      .catch(e => { if (!controller.signal.aborted) setError(String(e)); });
    return () => controller.abort();
  }, []);
  const selected = key
    ? items?.find(item => item.short_name === key || item.slug === `industries/nbs-${key}` || item.slug.endsWith(`/${key}`))
    : undefined;
  useEffect(() => {
    if (!selected) { setLinks([]); return; }
    const controller = new AbortController();
    setLinks([]); setMaterial(""); setLinkError("");
    void researchRead<{ items: { slug: string; title: string }[] }>(`/wiki/pages/related?slug=${encodeURIComponent(selected.slug)}`, { signal: controller.signal })
      .then(value => setLinks(value.items)).catch(() => { if (!controller.signal.aborted) setLinkError("相关材料暂时无法读取，请稍后重试"); });
    return () => controller.abort();
  }, [selected?.slug]);
  useAiPage({
    key: `nbs:${key ?? "list"}`,
    title: selected?.official_name || "行业研究",
    context: selected ? `${selected.official_name} · ${selected.coverage_note}` : "41 个统计局表3 分行业入口，不是申万 Profile。",
    suggestions: ["这个行业现在缺哪些可复用材料", "相关 Theme 或公司从哪里读"],
  });
  if (key && /^\d{6}$/.test(key)) return <Navigate replace to={`/sectors/profiles/${key}`} />;
  return <div>
    <PageHeader title={selected?.official_name || "行业研究"} subtitle="从行业出发，阅读公司、专题与比较研究。"
      actions={<Link className="workspace-action" to="/sectors/profiles"><Layers3 />申万研究材料</Link>} />
    {selected && <div className="workspace-toolbar"><Link className="workspace-action" to="/sectors"><ChevronLeft />行业目录</Link></div>}
    {error && <p role="alert">{error}</p>}
    {status === "unavailable" && <p role="status" className="mb-4 text-sm text-muted-foreground">行业资料暂时无法读取，请稍后重试。</p>}
    {!items && !error && <p role="status">正在读取行业入口…</p>}
    {items && !selected && <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">{items.map(item => (
      <Link key={item.subject_id} to={`/sectors/${encodeURIComponent(item.short_name)}`} className="group">
        <GlassCard glow className="flex h-full min-h-32 flex-col justify-between">
          <div>
            <p className="text-xs text-muted-foreground">{String(item.ordinal).padStart(2, "0")} · {item.published ? "已有正文" : "正文待准备"}</p>
            <h2 className="mt-2 text-base font-semibold">{item.official_name}</h2>
          </div>
          <p className="mt-3 text-xs text-muted-foreground">{item.coverage_note}</p>
        </GlassCard>
      </Link>
    ))}</div>}
    {selected && <>
      {selected.published ? <WikiReader slug={selected.slug} /> : <GlassCard><p className="text-sm text-muted-foreground">{selected.official_name} 的资料尚待补充，可以先阅读下方相关材料。</p></GlassCard>}
      <GlassCard className="mt-4">
        <h2 className="mb-3 text-sm font-semibold">相关材料</h2>
        {linkError && <p role="alert" className="text-sm text-destructive">{linkError}</p>}
        {!linkError && links.length === 0 && <p className="text-sm text-muted-foreground">暂时没有相关研究材料。</p>}
        <div className="flex flex-wrap gap-2">{links.map(item => <button key={item.slug} className="workspace-action" onClick={() => setMaterial(item.slug)}>{item.title}</button>)}</div>
      </GlassCard>
      {material && <div className="mt-4"><button className="workspace-action mb-3" onClick={() => setMaterial("")}>收起材料</button><WikiReader slug={material} /></div>}
    </>}
    <Disclaimer />
  </div>;
}
