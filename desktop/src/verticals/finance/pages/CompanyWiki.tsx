import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { PageHeader } from '../components/ui/PageHeader';
import { GlassCard } from '../components/ui/GlassCard';
import { Disclaimer } from '../components/ui/Disclaimer';
import { WikiReader } from '../components/ResearchKnowledge';
import { companySlug, wikiPages, type WikiItem } from '../lib/research';
import { loadWatch } from '../lib/watchlist';
import { useAiPage } from '../../../core/ai/pageContext';
import { Building2, ArrowUpRight, RefreshCw, Star } from 'lucide-react';

export function CompanyWiki() {
  const [pages, setPages] = useState<WikiItem[] | null>(null);
  const [slug, setSlug] = useState('');
  const [markdown, setMarkdown] = useState('');
  const [error, setError] = useState('');
  const [revision, refresh] = useState(0);
  useEffect(() => {
    const controller = new AbortController(); setError('');
    void wikiPages('companies', controller.signal).then(setPages).catch(e => { if (!controller.signal.aborted) setError(String(e)); });
    return () => controller.abort();
  }, [revision]);
  const watched = loadWatch();
  const favorites = new Set(watched.map(companySlug).filter(Boolean));
  const ordered = [...(pages ?? [])].sort((a, b) => Number(favorites.has(b.slug)) - Number(favorites.has(a.slug)));
  useAiPage({ key: `company-wiki:${slug}`, title: '个股研究', context: slug ? `当前公司 Wiki：${slug}\n${markdown || '正文尚未加载。'}` : '公司 Wiki 列表：' + ordered.map(page => page.title).join('、'), suggestions: ['研究这家公司需要核对哪些证据？'] });
  return <div><PageHeader title="个股研究" subtitle="从关注的公司出发，读懂经营变化与研究依据" actions={<button className="workspace-action" onClick={() => refresh(x => x + 1)}><RefreshCw size={14} />刷新资料</button>} />
    <div className="workspace-toolbar"><Link className="workspace-action" to="/watchlist"><Star />从自选开始</Link><Link className="workspace-action" to="/research/legacy"><ArrowUpRight />专题研究</Link></div>
    {error && <p role="alert" className="mb-4">{error}</p>}
    {!pages && !error && <p role="status">正在读取公司 Wiki…</p>}
    {pages && <div className="grid items-start gap-5 lg:grid-cols-[240px_minmax(0,1fr)]"><GlassCard className="!p-3">
      <p className="px-3 py-3 text-xs text-muted-foreground">公司资料 · {ordered.length}</p>
      {ordered.length === 0 && <p className="p-3 text-sm text-muted-foreground">还没有公司资料，从自选股发起第一次研究。</p>}
      {ordered.map(page => <button key={page.slug} onClick={() => setSlug(page.slug)} className={`mb-2 w-full rounded-lg px-3 py-3 text-left text-sm ${slug === page.slug ? 'bg-primary/10 text-primary' : 'hover:bg-muted'}`}>
        <span className="flex items-center gap-2"><Building2 size={16} />{page.title}{favorites.has(page.slug) && <Star size={12} className="ml-auto text-primary" />}</span><span className="mt-2 block pl-6 text-xs text-muted-foreground">{page.slug.split('/')[1]?.toUpperCase()}</span></button>)}
    </GlassCard><GlassCard className="min-h-[440px] !p-7">{slug ? <WikiReader key={`${slug}:${revision}`} slug={slug} onMarkdown={setMarkdown} /> : <div className="flex min-h-[380px] flex-col items-center justify-center text-center"><div className="mb-5 rounded-2xl bg-primary/10 p-4 text-primary"><Building2 size={30} /></div><h2 className="text-lg font-semibold">从一家公司开始</h2><p className="mt-3 max-w-xs text-sm leading-7 text-muted-foreground">选择左侧公司，查看经营资料与研究依据；也可以从自选中加入新的研究对象。</p><Link className="mt-6 inline-flex items-center gap-2 text-sm text-primary" to="/watchlist">查看我的自选<ArrowUpRight size={16} /></Link></div>}</GlassCard></div>}
    <Disclaimer /></div>;
}
