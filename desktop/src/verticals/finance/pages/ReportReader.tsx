import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { Download, FileText } from 'lucide-react';
import { PageHeader } from '../components/ui/PageHeader';
import { GlassCard } from '../components/ui/GlassCard';
import { KnowledgeText } from '../components/ResearchKnowledge';
import { researchRead } from '../lib/research';

interface Document { title?: string; symbol?: string; has_raw: boolean; has_parsed: boolean }
export function ReportReader() {
  const { id = '' } = useParams();
  const [document, setDocument] = useState<Document | null>(null);
  const [body, setBody] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    const controller = new AbortController();
    setDocument(null); setBody(''); setError(''); setLoading(true);
    void (async () => {
      const metadata = await researchRead<Document>(`/documents/${encodeURIComponent(id)}`, { signal: controller.signal });
      setDocument(metadata);
      if (!metadata.has_parsed) return;
      const response = await fetch(`/finance-research/documents/${encodeURIComponent(id)}/parsed`, { signal: controller.signal });
      if (!response.ok) throw new Error('研报正文暂时无法读取，请下载原件查看。');
      setBody(await response.text());
    })().catch(e => { if (!controller.signal.aborted) setError(e instanceof Error ? e.message : '研报读取失败'); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [id]);
  return <div>
    <PageHeader title="研报阅读" subtitle={document?.title || '查阅来源资料，了解研究依据'} actions={document?.has_raw && <a className="workspace-action" href={`/finance-research/documents/${encodeURIComponent(id)}/raw`} target="_blank" rel="noreferrer"><Download size={16} />下载原件</a>} />
    <div className="mb-5 flex gap-4 text-sm text-muted-foreground"><Link className="hover:text-primary" to="/sectors">板块中心</Link><Link className="hover:text-primary" to="/my-reports">我的研报</Link></div>
    <GlassCard className="!p-6 sm:!p-8"><article className="mx-auto max-w-4xl">
      {document && <header className="mb-6 border-b border-border pb-5"><FileText className="mb-3 text-primary" size={24} /><h2 className="text-xl font-semibold leading-8">{document.title || '来源研报'}</h2><p className="mt-2 text-xs text-muted-foreground">{document.symbol} · 研报正文</p></header>}
      {loading ? <p role="status" className="py-12 text-center text-muted-foreground">正在读取研报…</p> : error ? <p role="alert" className="py-8 text-muted-foreground">{error}</p> : body ? <KnowledgeText markdown={body} /> : <p className="py-12 text-center text-muted-foreground">暂未整理出可阅读的正文，可通过右上角下载原件查看。</p>}
    </article></GlassCard>
  </div>;
}
