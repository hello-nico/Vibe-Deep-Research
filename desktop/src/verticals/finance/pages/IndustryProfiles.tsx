import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { PageHeader } from '../components/ui/PageHeader';
import { GlassCard } from '../components/ui/GlassCard';
import { Disclaimer } from '../components/ui/Disclaimer';
import { researchRead } from '../lib/research';
import { useAiPage } from '../../../core/ai/pageContext';
import { ArrowUpRight, Layers3, ChevronLeft } from 'lucide-react';

interface Profile { industry_code: string; industry_name: string; status: string; card_count: number; companies?: string[]; core_questions?: { q: string; rationale: string; evidence_docs: string[] }[] }
export function IndustryProfiles() {
  const { key } = useParams();
  const [items, setItems] = useState<Profile[] | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [error, setError] = useState('');
  const [titles, setTitles] = useState<Record<string, string>>({});
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
  useAiPage({ key: `industry-profile:${key ?? 'list'}`, title: profile?.industry_name || '行业研究', context: profile ? JSON.stringify(profile) : '行业研究资料，尚未选定行业。', suggestions: ['这个行业最值得核实的问题是什么？'] });
  return <div><PageHeader title={profile?.industry_name || '申万研究材料'} subtitle="申万 Profile 是 Theme 的基础材料，不是 41 个统计局行业身份" />
    <div className="workspace-toolbar">{key && <Link className="workspace-action" to="/sectors/profiles"><ChevronLeft />行业目录</Link>}<Link className="workspace-action" to="/sectors"><Layers3 />41 个标准行业</Link><Link className="workspace-action" to="/sectors/legacy"><Layers3 />产业链专题</Link></div>
    {error && <p role="alert">{error}</p>}{!items && !profile && !error && <p role="status">正在读取行业资料…</p>}
    {items && <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">{items.map(item => {
      const card = <GlassCard glow className="flex h-full min-h-44 flex-col justify-between transition-transform group-hover:-translate-y-1">
        <div><div className="mb-4 flex items-center justify-between"><Layers3 size={20} className="text-primary" /><span className="text-xs text-muted-foreground">{item.industry_code}</span></div><h2 className="text-base font-bold">{item.industry_name}</h2><p className="mt-2 text-xs text-muted-foreground">{item.card_count ? `${item.card_count} 个研究切入点，了解行业的关键变化` : '行业资料正在积累'}</p></div>
        <div className="mt-5 flex items-center justify-between border-t border-border/50 pt-3 text-xs"><span className="text-muted-foreground">{item.status === 'ready' ? '查看研究方向' : '资料待补充'}</span><ArrowUpRight size={16} className="text-primary" /></div>
      </GlassCard>;
      return item.status === 'ready' ? <Link className="group" key={item.industry_code} to={`/sectors/profiles/${item.industry_code}`}>{card}</Link> : <div key={item.industry_code}>{card}</div>;
    })}</div>}
    {profile && <GlassCard><p className="mb-4 text-sm text-muted-foreground">{profile.industry_code} · 覆盖公司：{profile.companies?.join('、') || '未列出'}</p>
      <div className="space-y-6">{profile.core_questions?.map((question, i) => <section key={i}><h2 className="mb-2 font-semibold">{question.q}</h2><p className="whitespace-pre-wrap text-sm leading-7">{question.rationale}</p>
        <div className="mt-4 flex flex-wrap gap-2">{question.evidence_docs.map((id, j) => <Link className="inline-flex max-w-full items-center gap-2 rounded-lg border border-primary/15 bg-primary/5 px-3 py-2 text-xs text-primary transition-colors hover:bg-primary/10" to={`/my-reports/read/${encodeURIComponent(id)}`} key={id}><span className="min-w-0 break-words leading-5">{titles[id] && titles[id] !== '来源研报' ? titles[id] : `阅读来源研报 ${j + 1}`}</span><ArrowUpRight className="shrink-0" size={14} /></Link>)}</div></section>)}</div>
    </GlassCard>}<Disclaimer /></div>;
}
