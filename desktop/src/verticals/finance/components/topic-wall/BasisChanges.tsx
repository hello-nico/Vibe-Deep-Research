import { useEffect, useState } from 'react';
import { ChevronDown } from 'lucide-react';
import { objectLabel, openRegisteredObject, resolveObjectLabels } from '../../lib/objectRegistry';
import { wikiPageDiff, type TopicBasisChanges, type WikiPageDiff } from '../../lib/research';
import './topic-wall.css';

const CATEGORY = { research: '研究结论', data: '数据更新', timeline: '资料时间线' };
const day = (value?: string | null) => value?.slice(0, 10) || '未知';
const readable = (value: unknown): string => {
  if (value == null) return '无';
  if (typeof value === 'string' || typeof value === 'number') return String(value);
  if (Array.isArray(value)) return value.map(readable).join('、');
  if (typeof value === 'object') return Object.entries(value).map(([key, item]) => `${key}：${readable(item)}`).join('；');
  return String(value);
};

export function BasisChanges({ basis, selectedSlug, continueResearch }: { basis: TopicBasisChanges | null; selectedSlug: string; continueResearch: () => void }) {
  const [expanded, setExpanded] = useState('');
  const [diff, setDiff] = useState<WikiPageDiff | null>(null);
  const [error, setError] = useState('');
  const [, refreshLabels] = useState(0);
  const changed = basis?.pages.filter(page => page.status === 'changed') || [];
  const unchanged = basis?.pages.filter(page => page.status === 'unchanged') || [];
  const unknown = basis?.pages.filter(page => page.status === 'version_unknown' || page.status === 'page_missing') || [];
  useEffect(() => { let active = true; void resolveObjectLabels((basis?.pages || []).map(page => page.slug || '').filter(Boolean)).then(() => { if (active) refreshLabels(value => value + 1); }).catch(() => {}); return () => { active = false; }; }, [basis]);
  useEffect(() => { if (selectedSlug) { setExpanded(selectedSlug); requestAnimationFrame(() => document.getElementById(`basis-${selectedSlug}`)?.scrollIntoView({ block: 'center' })); } }, [selectedSlug]);
  useEffect(() => {
    setDiff(null); setError('');
    const page = changed.find(item => item.slug === expanded);
    if (!page?.slug || !page.pinned) return;
    let active = true;
    void wikiPageDiff(page.slug, page.pinned).then(value => { if (active) setDiff(value); }).catch(cause => { if (active) setError(String(cause)); });
    return () => { active = false; };
  }, [expanded, basis]);
  if (!basis || (!changed.length && !unknown.length && !unchanged.length)) return null;
  return <section className="topic-section" id="topic-basis-changes">
    <div className="topic-basis-head">
      <h2>{changed.length ? <><i aria-hidden="true" />判断之后依据有更新</> : '判断依据'}</h2>
      {changed.length > 0 && <button type="button" className="workspace-action workspace-action-compact workspace-action-primary" onClick={continueResearch}>带着这些变化继续研究</button>}
    </div>
    {changed.length > 0 && <p className="topic-basis-note">只提示变化，不自动改判断；是否修订在议题对话里决定。</p>}
    {changed.map(page => {
      const open = expanded === page.slug;
      const counts = [['研究结论', page.summary?.research || 0], ['数据更新', page.summary?.data || 0], ['资料时间线', page.summary?.timeline || 0]] as const;
      return <div key={page.ref} id={`basis-${page.slug}`} className="topic-basis-item is-changed">
        <button type="button" className="topic-basis-row" aria-expanded={open} onClick={() => setExpanded(open ? '' : page.slug || '')}>
          <strong>{objectLabel(page.slug || '')}</strong>
          <span className="topic-basis-counts">{counts.filter(([, count]) => count > 0).map(([label, count]) => <span key={label} className="is-hot">{label} {count}</span>)}</span>
          <time>判断时 {day(basis.judged_at)} → 现在</time>
          <ChevronDown size={16} aria-hidden="true" />
        </button>
        {open && <div className="topic-basis-detail">
          {!diff && !error && <p className="topic-basis-quiet">正在读取版本差异…</p>}
          {error && <p role="alert" className="topic-basis-quiet">无法对比：{error}</p>}
          {diff && <>
            <p className="topic-basis-quiet">研究页版本 {day(diff.from_published_at)} → {day(diff.to_published_at)}</p>
            {diff.blocks.map((block, index) => <div key={`${block.category}:${block.kind}:${index}`} className="topic-basis-block">
              <strong>{CATEGORY[block.category]}</strong>
              <div className="topic-basis-compare"><div><small>判断时</small>{readable(block.before)}</div><div><small>现在</small>{readable(block.after)}</div></div>
              {!!block.items_changed?.length && <div className="topic-basis-compare">{block.items_changed.map((item, offset) => <div key={offset}>{readable(item.before)} → {readable(item.after)}</div>)}</div>}
            </div>)}
          </>}
          {page.slug && <div><button type="button" className="workspace-action workspace-action-compact" onClick={() => openRegisteredObject(page.slug!)}>打开研究页</button></div>}
        </div>}
      </div>;
    })}
    {!!unknown.length && <div className="topic-basis-item"><div className="topic-basis-row"><strong>无法对比</strong><span className="topic-basis-counts">{unknown.map(page => <span key={page.ref}>{page.slug ? objectLabel(page.slug) : '旧依据'} · {page.status === 'page_missing' ? '研究页暂不可读' : '旧版本不可读'}</span>)}</span></div></div>}
    {!!unchanged.length && <p className="topic-basis-quiet">资料无变化：{unchanged.map(page => objectLabel(page.slug || '')).join('、')}</p>}
  </section>;
}
