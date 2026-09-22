import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { PageHeader } from '../components/ui/PageHeader';
import { GlassCard } from '../components/ui/GlassCard';
import { Disclaimer } from '../components/ui/Disclaimer';
import { ResearchLoading } from '../components/ui/ResearchLoading';
import { DashboardCard } from '../components/IndustryDashboardCard';
import { WorkspaceSearch } from '../components/ui/WorkspaceSearch';
import { researchRead } from '../lib/research';
import { workspaceSelectMatches } from '../lib/workspaceSelect';
import { useAiPage, useAiPageObjects } from '../../../core/ai/pageContext';
import { profileAssistantObject } from '../lib/pageAssistantObjects';
import { buildDirectorySnapshot, buildIndustryProfileSnapshot } from '../assistant/snapshot.ts';
import { ArrowUpRight, Layers3, ChevronLeft } from 'lucide-react';

interface Profile {
  industry_code: string;
  industry_name: string;
  status: string;
  card_count: number;
  companies?: string[];
  core_questions?: { q: string; rationale: string; evidence_docs: string[] }[];
  profile_sha256?: string;
  profile_ref?: string;
}
export function IndustryProfiles() {
  const { key } = useParams();
  const [items, setItems] = useState<Profile[] | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [error, setError] = useState('');
  const [titles, setTitles] = useState<Record<string, string>>({});
  const [query, setQuery] = useState('');
  useEffect(() => {
    const controller = new AbortController(); setTitles({});
    const ids = [...new Set(profile?.core_questions?.flatMap(question => question.evidence_docs) ?? [])];
    void Promise.all(ids.map(async id => {
      try {
        const document = await researchRead<{ title?: string }>(`/documents/${encodeURIComponent(id)}`, { signal: controller.signal });
        return [id, document.title || '来源研报'] as const;
      } catch { return [id, '来源研报'] as const; }
    })).then(entries => { if (!controller.signal.aborted) setTitles(Object.fromEntries(entries)); });
    return () => controller.abort();
  }, [profile]);
  useEffect(() => {
    const controller = new AbortController(); setError(''); setProfile(null); setItems(null);
    const request = key ? researchRead<Profile>('/industries/profiles/' + encodeURIComponent(key), { signal: controller.signal }).then(setProfile)
      : researchRead<{ items: Profile[] }>('/industries/profiles', { signal: controller.signal }).then(value => setItems(value.items));
    void request.catch(e => { if (!controller.signal.aborted) setError(String(e)); });
    return () => controller.abort();
  }, [key]);
  const visible = items?.filter(item => workspaceSelectMatches(
    { label: item.industry_name, detail: [item.industry_code, ...(item.companies ?? [])].join(' ') },
    query,
  ));
  const pageKey = `industry-profile:${key ?? 'list'}`;
  useAiPage({
    key: pageKey,
    title: profile?.industry_name || '产业研究',
    context: profile
      ? buildIndustryProfileSnapshot(profile, titles)
      : buildDirectorySnapshot({
        heading: `产业目录 ${items?.length ?? 0} 项。`,
        items: (visible ?? []).map(item => ({ title: item.industry_name, id: item.industry_code })),
        loading: !items && !profile,
      }),
    suggestions: ['这个行业最值得核实的问题是什么？'],
  });
  const profileObjects = profile
    ? [profileAssistantObject({ code: profile.industry_code, name: profile.industry_name, profileRef: profile.profile_ref, sha256: profile.profile_sha256 })].flatMap(item => item ? [item] : [])
    : (visible ?? []).flatMap(item => {
      const object = profileAssistantObject({ code: item.industry_code, name: item.industry_name, profileRef: item.profile_ref, sha256: item.profile_sha256 });
      return object ? [object] : [];
    });
  useAiPageObjects(pageKey, profileObjects);
  const sectorsLink = <Link className="workspace-action" to="/sectors"><Layers3 />41 个标准行业</Link>;
  return <div><PageHeader title={profile?.industry_name || '产业研究'} subtitle={key ? undefined : '持续关注产业链核心问题（基于申万行业分类）'}
      search={key ? undefined : <WorkspaceSearch className="mb-0" placeholder="搜索产业名称" value={query} onChange={setQuery} />}
      actions={key ? undefined : sectorsLink} />
    {key && <div className="workspace-toolbar justify-between"><Link className="workspace-action" to="/sectors/profiles"><ChevronLeft />行业目录</Link>{sectorsLink}</div>}
    {error && <p role="alert">{error}</p>}{!items && !profile && !error && <ResearchLoading title="正在读取产业研究" sections={["产业结构", "需求变化"]} />}
    {items && (visible?.length
      ? <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">{visible.map(item => (
      <DashboardCard
        key={item.industry_code}
        title={item.industry_name}
        description={item.card_count ? `${item.card_count} 个研究切入点，了解行业的关键变化` : '行业资料正在积累'}
        href={item.status === 'ready' ? `/sectors/profiles/${item.industry_code}` : undefined}
        ready={item.status === 'ready'}
        footer={item.status === 'ready' ? '查看研究方向' : '资料待补充'}
      />
    ))}</div>
      : <GlassCard><p className="py-12 text-center text-sm text-muted-foreground">{items.length ? '没有匹配的产业，请调整搜索。' : '暂无产业研究资料。'}</p></GlassCard>)}
    {profile && <GlassCard><p className="mb-4 text-sm text-muted-foreground">覆盖公司：{profile.companies?.join('、') || '未列出'}</p>
      <div className="space-y-6">{profile.core_questions?.map((question, i) => <section key={i}><h2 className="mb-2 font-semibold">{question.q}</h2><p className="whitespace-pre-wrap text-sm leading-7">{question.rationale}</p>
        <div className="mt-4 flex flex-wrap gap-2">{question.evidence_docs.map((id, j) => <Link className="inline-flex max-w-full items-center gap-2 rounded-lg border border-primary/15 bg-primary/5 px-3 py-2 text-xs text-primary transition-colors hover:bg-primary/10" to={`/my-reports/read/${encodeURIComponent(id)}`} key={id}><span className="min-w-0 break-words leading-5">{titles[id] && titles[id] !== '来源研报' ? titles[id] : `阅读来源研报 ${j + 1}`}</span><ArrowUpRight className="shrink-0" size={14} /></Link>)}</div></section>)}</div>
    </GlassCard>}<Disclaimer /></div>;
}
