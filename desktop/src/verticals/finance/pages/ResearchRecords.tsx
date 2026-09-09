import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { PageHeader } from '../components/ui/PageHeader';
import { GlassCard } from '../components/ui/GlassCard';
import { Disclaimer } from '../components/ui/Disclaimer';
import { KnowledgeText, ReferenceButtons, WikiReader } from '../components/ResearchKnowledge';
import { researchRead, wikiPages, type WikiItem } from '../lib/research';
import { useAiPage } from '../../../core/ai/pageContext';

export function ResearchRecords() {
  const [kind, setKind] = useState('topics');
  const [items, setItems] = useState<WikiItem[] | null>(null);
  const [selected, select] = useState('');
  const [topic, setTopic] = useState<{ markdown: string; observation?: { source_refs?: string[]; fact_refs?: string[]; relation_refs?: string[] }; judgment?: { basis_refs?: string[] } } | null>(null);
  const [wikiMarkdown, setWikiMarkdown] = useState('');
  const [error, setError] = useState('');
  useEffect(() => {
    const controller = new AbortController(); setItems(null); select(''); setTopic(null); setError('');
    const request = kind === 'topics' ? researchRead<{ items: { topic_id: string; title: string }[] }>('/wiki/research-topics', { signal: controller.signal }).then(value => value.items.map(item => ({ slug: item.topic_id, title: item.title }))) : wikiPages(kind, controller.signal);
    void request.then(setItems).catch(e => { if (!controller.signal.aborted) setError(String(e)); });
    return () => controller.abort();
  }, [kind]);
  useEffect(() => {
    setTopic(null);
    if (kind !== 'topics' || !selected) return;
    const controller = new AbortController();
    void researchRead<NonNullable<typeof topic>>('/wiki/research-topics/' + selected.split('/').map(encodeURIComponent).join('/'), { signal: controller.signal }).then(setTopic).catch(e => { if (!controller.signal.aborted) setError(String(e)); });
    return () => controller.abort();
  }, [kind, selected]);
  useAiPage({ key: `research-record:${kind}:${selected}`, title: '研究记录', context: (kind === 'topics' ? topic?.markdown : wikiMarkdown) || `当前积累类型 ${kind}；所选记录 ${selected || '无'}，尚未附正文。`, suggestions: ['哪些问题还没有得到证据支持？'] });
  return <div><PageHeader title="研究记录" subtitle="Topic 保留近期问题；Theme / Comparison 积累长期研究知识" />
    <div className="mb-4 flex flex-wrap gap-3">{[['topics', 'Topic'], ['themes', 'Theme'], ['comparisons', 'Comparison']].map(([value, label]) => <button key={value} onClick={() => setKind(value!)} className={`rounded-lg border px-3 py-2 text-sm ${kind === value ? 'border-primary text-primary' : 'border-border'}`}>{label}</button>)}<Link className="self-center text-sm text-primary" to="/notes/legacy">旧版笔记</Link></div>
    {error && <p role="alert">{error}</p>}
    {!items && !error && <p role="status">正在读取研究积累…</p>}
    {items && <div className="grid gap-4 lg:grid-cols-[260px_minmax(0,1fr)]"><GlassCard>{items.length === 0 && <p className="text-sm text-muted-foreground">暂无此类研究积累。</p>}{items.map(item => <button key={item.slug} className="block w-full rounded p-3 text-left text-sm hover:bg-muted" onClick={() => { select(item.slug); setError(''); }}>{item.title}</button>)}</GlassCard>
      <GlassCard>{selected ? kind === 'topics' ? topic ? <><p className="mb-4 text-xs text-muted-foreground">Topic · 近期研究工作记忆</p><KnowledgeText markdown={topic.markdown} /><ReferenceButtons key={selected} refs={[...(topic.observation?.source_refs ?? []), ...(topic.observation?.fact_refs ?? []), ...(topic.observation?.relation_refs ?? []), ...(topic.judgment?.basis_refs ?? [])]} /></> : <p role="status">正在读取 Topic…</p> : <WikiReader slug={selected} onMarkdown={setWikiMarkdown} /> : <p className="text-sm text-muted-foreground">选择一条研究记录。</p>}</GlassCard></div>}<Disclaimer /></div>;
}
