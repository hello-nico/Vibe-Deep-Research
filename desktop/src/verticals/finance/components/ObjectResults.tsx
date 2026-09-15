import { useEffect, useState } from 'react';
import { researchRead } from '../lib/research';
import { ResearchResult } from './ResearchResult';

function ResultDisclosure({ item }: { item: { result_id: string; title: string } }) {
  const [open, setOpen] = useState(false);
  return <details className="mb-3 rounded-xl border p-3" onToggle={event => setOpen(event.currentTarget.open)}>
    <summary className="cursor-pointer">{item.title}</summary>
    {open && <ResearchResult resultId={item.result_id} presentation="report" />}
  </details>;
}

/** Same immutable results as the conversation, without implicit regeneration. */
export function ObjectResults({ slug }: { slug: string }) {
  const [items, setItems] = useState<{ result_id: string; title: string }[]>([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    const controller = new AbortController();
    setLoading(true); setItems([]); setError('');
    void researchRead<{ items: typeof items }>('/research-results?object_id=' + encodeURIComponent(slug), { signal: controller.signal })
      .then(result => { if (!controller.signal.aborted) setItems(result.items); })
      .catch(() => { if (!controller.signal.aborted) setError('成果暂时无法读取，仍可阅读下方研究资料。'); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [slug]);
  if (!loading && !error && !items.length) return null;
  return <div className="mx-auto mb-6 max-w-4xl">
    <p className="mb-3 text-sm text-muted-foreground">研究成果保留生成时的数据，正文沿用现有研究资料。</p>
    {loading && <p role="status">正在读取成果…</p>}
    {error && <p role="alert">{error}</p>}
    {items.map(item => <ResultDisclosure key={item.result_id} item={item} />)}
  </div>;
}
