import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { BookOpen, Building2, Factory, FileText, Layers3, Maximize2, Minimize2, Minus, Plus, Spline, X } from 'lucide-react';
import { EvidenceLink } from '../EvidenceCard';
import { useFinanceOverlayTarget } from '../layout/FinanceAssistantSurface';
import { SidePanelResizeHandle } from '../layout/SidePanelResize';
import { objectFacts, objectLabel, openRegisteredObject, resolveObjectLabels } from '../../lib/objectRegistry';
import { createTopicHypothesis, withdrawTopicHypothesis, type ResearchProposal, type ResearchTopic, type TopicBasisChanges, type TopicWall as WallData, type TopicWallEdge } from '../../lib/research';
import { boxEdge, changedBasisRefs, clearWallPositions, hypothesisProposal, layoutWall, NODE_H, NODE_W, NOTE, readWallPositions, validateHypothesis, wallLineStyle, writeWallPositions, type Point } from './model';
import { useConfirm } from '../ui/ConfirmDialog';
import './topic-wall.css';

const JUDGMENT_STATE = { gathering: '收集中', provisional: '初步判断', blocked: '受阻' } as Record<string, string>;
const KIND = { company: '公司', industry: '行业', document: '资料', note: '研究记录', result: '研究成果', theme: '主题研究', comparison: '对比研究' } as Record<string, string>;
const ICON = { company: Building2, industry: Factory, document: FileText, note: BookOpen, result: Layers3, theme: Layers3, comparison: Layers3 } as Record<string, typeof BookOpen>;
const EDGE_KIND = { hard: '事实关系 · 只读', link: '研究关联', hypothesis: '未核验假设' } as Record<string, string>;

function basisObject(ref: string): string | null {
  if (ref.startsWith('page:')) return ref.slice(5).split('@')[0] || null;
  const match = /^(?:source|evidence):([0-9a-f]{32})/.exec(ref);
  return match ? `document:${match[1]}` : null;
}

function nodeName(ref: string, kind: string): string {
  const name = objectLabel(ref);
  return name === '引用' ? KIND[kind] || '对象' : name;
}

function LegendLine({ kind }: { kind: 'hard' | 'link' | 'hypothesis' | 'basis' }) {
  const style = wallLineStyle(kind);
  return <svg width="26" height="8" aria-hidden="true"><line x1="0" y1="4" x2="26" y2="4" stroke={style.stroke} strokeWidth={style.width} strokeDasharray={style.dash} strokeLinecap="round" /></svg>;
}

export function TopicWall({ topic, wall, basis, proposals, refresh, continueResearch, openChanges, decide }: {
  topic: ResearchTopic; wall: WallData; basis: TopicBasisChanges | null; proposals: ResearchProposal[];
  refresh: () => Promise<void>; continueResearch: (prompt: string) => Promise<void>;
  openChanges: (slug: string) => void; decide: (proposal: ResearchProposal, action: 'confirm' | 'reject') => Promise<boolean>;
}) {
  const overlay = useFinanceOverlayTarget();
  const frame = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(1100);
  const [expanded, setExpanded] = useState(false);
  useEffect(() => {
    const element = frame.current; if (!element) return;
    const observer = new ResizeObserver(([entry]) => { if (entry) setWidth(Math.round(entry.contentRect.width)); });
    observer.observe(element);
    return () => observer.disconnect();
  }, [wall.nodes.length > 0, expanded]);
  const automatic = useMemo(() => layoutWall(wall.nodes, width), [wall.nodes, width]);
  const [saved, setSaved] = useState(() => readWallPositions(topic.topic_id));
  const positions = { ...automatic, ...saved };
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState<Point>({ x: 0, y: 0 });
  const [drawing, setDrawing] = useState(false);
  const [first, setFirst] = useState('');
  const [pair, setPair] = useState<[string, string] | null>(null);
  const [note, setNote] = useState('');
  const [selected, setSelected] = useState<TopicWallEdge | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [confirmDialog, confirm] = useConfirm();
  const [, refreshLabels] = useState(0);
  const drag = useRef<{ ref: string; origin: Point; point: Point; latest: Point; moved: boolean } | null>(null);
  const suppressClick = useRef(false);
  const changed = changedBasisRefs(basis);
  const height = Math.max(520, ...Object.values(positions).map(point => point.y + NODE_H + 72));
  const stageWidth = Math.max(760, width);
  useEffect(() => { let active = true; void resolveObjectLabels(wall.nodes.map(node => node.ref)).then(() => { if (active) refreshLabels(value => value + 1); }).catch(() => {}); return () => { active = false; }; }, [wall.nodes]);
  useEffect(() => {
    const key = (event: KeyboardEvent) => { if (event.key === 'Escape') { setDrawing(false); setFirst(''); setPair(null); setSelected(null); setExpanded(false); } };
    window.addEventListener('keydown', key);
    return () => window.removeEventListener('keydown', key);
  }, []);
  const chooseNode = (ref: string) => {
    if (suppressClick.current) { suppressClick.current = false; return; }
    if (!drawing) { openRegisteredObject(ref); return; }
    if (!first) { setFirst(ref); return; }
    if (first === ref) return;
    const existing = wall.edges.find(edge => edge.kind === 'hypothesis' && ((edge.from === first && edge.to === ref) || (edge.from === ref && edge.to === first)));
    if (existing) { setSelected(existing); setDrawing(false); setFirst(''); setError('这两个对象已有假设线。'); return; }
    setPair([first, ref]); setDrawing(false); setFirst(''); setNote(''); setError('');
  };
  const save = async () => {
    if (!pair) return;
    const issue = validateHypothesis(note, pair[0], pair[1], wall.edges);
    if (issue) { setError(issue); return; }
    setBusy(true); setError('');
    try { await createTopicHypothesis(topic.topic_id, pair[0], pair[1], note.trim()); setPair(null); await refresh(); }
    catch (cause) { setError(String(cause)); } finally { setBusy(false); }
  };
  const withdraw = async (edge: TopicWallEdge) => {
    if (!(await confirm({ kicker: '证据墙 · 假设', title: '撤回这条假设？', body: '撤回后这条虚线会从墙上移除；已有的研究关联和事实关系不受影响。', confirmLabel: '撤回' }))) return;
    setBusy(true); setError('');
    try { await withdrawTopicHypothesis(topic.topic_id, edge.edge_id); setSelected(null); await refresh(); }
    catch (cause) { setError(String(cause)); } finally { setBusy(false); }
  };
  const findBasis = async (edge: TopicWallEdge) => {
    setSelected(null);
    await continueResearch(`请核对这条假设并找依据：${objectLabel(edge.from)} — ${objectLabel(edge.to)}：${edge.label}（假设 ${edge.edge_id}，端点 ${edge.from} → ${edge.to}）。只有核对原文且找到依据后，才用这个假设 ID 和端点提出升格提案；找不到请如实说明。`);
  };
  const pointerDown = (event: React.PointerEvent<HTMLDivElement>, ref: string) => {
    if (drawing || event.button !== 0) return;
    const point = positions[ref]; if (!point) return;
    drag.current = { ref, origin: { x: event.clientX, y: event.clientY }, point, latest: point, moved: false };
    event.currentTarget.setPointerCapture(event.pointerId);
  };
  const pointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!drag.current) return;
    const { ref, origin, point } = drag.current;
    const latest = { x: point.x + (event.clientX - origin.x) / zoom, y: point.y + (event.clientY - origin.y) / zoom };
    drag.current.latest = latest;
    drag.current.moved ||= Math.abs(event.clientX - origin.x) + Math.abs(event.clientY - origin.y) > 4;
    if (drag.current.moved) setSaved(previous => ({ ...previous, [ref]: latest }));
  };
  const pointerUp = () => {
    if (!drag.current) return;
    const { ref, latest, moved } = drag.current;
    drag.current = null;
    if (moved) { suppressClick.current = true; window.setTimeout(() => { suppressClick.current = false; }, 0); writeWallPositions(topic.topic_id, { ...saved, [ref]: latest }); }
  };
  const centre = (ref: string): Point | null => { const point = positions[ref]; return point ? { x: point.x + NODE_W / 2, y: point.y + NODE_H / 2 } : null; };
  const basisRefs = [...new Set((topic.judgment?.basis_refs || []).map(basisObject).filter((ref): ref is string => !!ref))];
  const noteAnchor = { x: NOTE.x + NOTE.w, y: NOTE.y + NOTE.h / 2 };
  const setZoomBy = (delta: number) => setZoom(value => Math.min(1.5, Math.max(0.5, Math.round((value + delta) * 10) / 10)));
  const selectedProposal = selected?.kind === 'hypothesis' ? hypothesisProposal(proposals, selected.edge_id) : undefined;

  const viewport = <div ref={frame} className={`topic-wall-viewport ${drawing ? 'is-drawing' : ''} ${expanded ? 'is-expanded' : ''}`} onPointerDown={event => {
        if ((event.target as Element).closest('.topic-wall-node, .topic-wall-edge, .topic-wall-toolbar, .topic-wall-legend, .topic-wall-composer')) return;
        const origin = { x: event.clientX, y: event.clientY }, before = pan;
        const element = event.currentTarget;
        element.setPointerCapture(event.pointerId);
        const move = (next: PointerEvent) => setPan({ x: before.x + next.clientX - origin.x, y: before.y + next.clientY - origin.y });
        const up = () => { element.removeEventListener('pointermove', move); };
        element.addEventListener('pointermove', move); element.addEventListener('pointerup', up, { once: true });
      }}>
      <div className="topic-wall-toolbar">
        <button type="button" className={`topic-wall-tool ${drawing ? 'is-active' : 'is-dashed'}`} onClick={() => { setDrawing(value => !value); setFirst(''); setSelected(null); }}><Plus size={14} />画假设线</button>
        <button type="button" className="topic-wall-tool" onClick={() => { clearWallPositions(topic.topic_id); setSaved({}); setPan({ x: 0, y: 0 }); setZoom(1); }}>重新排布</button>
        <button type="button" className="topic-wall-tool" aria-pressed={expanded} onClick={() => setExpanded(value => !value)}>{expanded ? <><Minimize2 size={14} />还原窗口</> : <><Maximize2 size={14} />展开画布</>}</button>
        <div className="topic-wall-zoom" role="group" aria-label="证据墙缩放">
          <button type="button" aria-label="缩小" onClick={() => setZoomBy(-0.1)}><Minus size={14} /></button>
          <span>{Math.round(zoom * 100)}%</span>
          <button type="button" aria-label="放大" onClick={() => setZoomBy(0.1)}><Plus size={14} /></button>
        </div>
      </div>
      {drawing && <div className="topic-wall-drawing" role="status">{first ? `已选「${objectLabel(first)}」，再点一个对象` : '依次点两个对象'} · 按 Esc 取消</div>}
      <div className="topic-wall-stage" style={{ width: stageWidth, height, transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})` }}>
        <svg className="topic-wall-lines" width={stageWidth} height={height} aria-hidden="true">
          <defs>
            <marker id="topic-wall-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto"><path d="M0 0 10 5 0 10z" fill="#334155" /></marker>
            <marker id="topic-basis-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto"><path d="M0 0 10 5 0 10z" fill="hsl(var(--primary) / .7)" /></marker>
          </defs>
          {basisRefs.map(ref => {
            const target = centre(ref); if (!target) return null;
            const end = boxEdge(noteAnchor, target);
            const style = wallLineStyle('basis');
            return <path key={`basis:${ref}`} d={`M${noteAnchor.x} ${noteAnchor.y} Q ${(noteAnchor.x + end.x) / 2} ${noteAnchor.y} ${end.x} ${end.y}`} fill="none" stroke={style.stroke} strokeWidth={style.width} strokeDasharray={style.dash} strokeLinecap="round" markerEnd="url(#topic-basis-arrow)" />;
          })}
          {wall.edges.map(edge => {
            const a = centre(edge.from), b = centre(edge.to); if (!a || !b) return null;
            const style = wallLineStyle(edge.kind);
            const start = boxEdge(b, a), end = boxEdge(a, b);
            const active = selected?.edge_id === edge.edge_id;
            return <g key={edge.edge_id}>
              {active && <line x1={start.x} y1={start.y} x2={end.x} y2={end.y} stroke="hsl(var(--primary) / .25)" strokeWidth="10" strokeLinecap="round" />}
              <line x1={start.x} y1={start.y} x2={end.x} y2={end.y} stroke={style.stroke} strokeWidth={style.width} strokeDasharray={style.dash} strokeLinecap="round" markerEnd={style.marker ? 'url(#topic-wall-arrow)' : undefined} />
            </g>;
          })}
        </svg>
        {wall.edges.map(edge => {
          const a = centre(edge.from), b = centre(edge.to); if (!a || !b) return null;
          return <button key={`label:${edge.edge_id}`} type="button" className={`topic-wall-edge is-${edge.kind}`} style={{ left: (a.x + b.x) / 2, top: (a.y + b.y) / 2 }}
            aria-label={`${EDGE_KIND[edge.kind] || '关系'}：${edge.label}`} onClick={() => setSelected(edge)}>
            {edge.kind === 'hypothesis' ? `假设 · ${edge.label}` : edge.label}
          </button>;
        })}
        <div className="topic-wall-judgment" style={{ left: NOTE.x, top: NOTE.y, width: NOTE.w }}>
          <div className="topic-wall-judgment-head"><span>当前判断 · {JUDGMENT_STATE[topic.judgment?.state || ''] || '尚未形成判断'}</span>{topic.judgment?.judged_at && <time>{topic.judgment.judged_at.slice(5, 10)} 判断</time>}</div>
          <p>{topic.judgment?.text || '尚未形成判断，继续研究后会出现在这里。'}</p>
          {!!basisRefs.length && <small>依据 {basisRefs.length} 项 · 箭头指向依据对象</small>}
        </div>
        {wall.nodes.map(node => {
          const point = positions[node.ref]; if (!point) return null;
          const Icon = ICON[node.kind] || Layers3;
          const meta = objectFacts(node.ref)?.meta;
          return <div key={node.ref} className={`topic-wall-node kind-${node.kind} ${node.origins.includes('subject') ? 'is-subject' : ''} ${first === node.ref ? 'is-first' : ''}`}
            style={{ left: point.x, top: point.y, width: NODE_W, height: NODE_H }}
            onPointerDown={event => pointerDown(event, node.ref)} onPointerMove={pointerMove} onPointerUp={pointerUp}>
            <button type="button" data-object-ref={node.ref} className="topic-wall-node-button" onClick={() => chooseNode(node.ref)}>
              <span className="topic-wall-node-icon"><Icon size={16} /></span>
              <span className="topic-wall-node-text"><strong>{nodeName(node.ref, node.kind)}</strong><small>{[KIND[node.kind] || '对象', meta].filter(Boolean).join(' · ')}</small></span>
            </button>
            {changed.has(node.ref) && <button type="button" className="topic-wall-changed" onClick={() => openChanges(node.ref)}>判断后有更新</button>}
          </div>;
        })}
      </div>
      <div className="topic-wall-legend">
        <span><LegendLine kind="hard" />事实关系（只读）</span>
        <span><LegendLine kind="link" />研究关联</span>
        <span><LegendLine kind="hypothesis" />假设（未核验）</span>
        <span><LegendLine kind="basis" />判断依据</span>
        {wall.sections.hard === 'unavailable' && <strong>事实关系暂不可用</strong>}
        {wall.truncated && <strong>对象较多，只显示前 60 个</strong>}
      </div>
      {pair && <div className="topic-wall-composer" role="dialog" aria-label="写下假设">
        <p className="topic-wall-composer-pair">{objectLabel(pair[0])} — {objectLabel(pair[1])}</p>
        <label htmlFor="topic-wall-hypothesis">你的假设（一句话）</label>
        <textarea id="topic-wall-hypothesis" autoFocus maxLength={200} value={note} onChange={event => setNote(event.target.value)} placeholder="例如：两家的配售电布局相似" />
        <p className="topic-wall-composer-hint">保存为“假设 · 未核验”，只属于本议题，不会写入公司资料。</p>
        <div><button type="button" className="workspace-action" onClick={() => setPair(null)}>取消</button><button type="button" className="workspace-action workspace-action-primary" disabled={busy} onClick={() => void save()}>保存假设</button></div>
      </div>}
    </div>;

  return <section className="topic-wall-wrap">
    {confirmDialog}
    {error && <p role="alert" className="topic-wall-error">{error}</p>}
    {!wall.nodes.length ? <div className="topic-wall-empty">
      <span className="topic-wall-empty-icon" aria-hidden="true"><Spline size={24} /></span>
      <h3>墙上还没有对象</h3>
      <p>继续研究后，这个议题涉及的公司、行业、判断依据的资料和确认过的关联会出现在这里；对象之间已有的事实关系会连成线。</p>
      <button type="button" className="workspace-action workspace-action-primary" onClick={() => void continueResearch('继续研究这个议题，先核对已有资料与关系。')}>继续研究</button>
    </div> : expanded ? createPortal(viewport, document.body) : viewport}
    {selected && overlay && createPortal(<div className="finance-side-panel topic-wall-side"><SidePanelResizeHandle />
      <aside role="dialog" aria-label="关系详情" className="topic-wall-detail">
        <header>
          <div><p>{EDGE_KIND[selected.kind] || '关系'}</p><h2>{objectLabel(selected.from)} — {objectLabel(selected.to)}</h2></div>
          <button type="button" aria-label="关闭关系详情" onClick={() => setSelected(null)}><X size={16} /></button>
        </header>
        <div className="topic-wall-detail-body">
          {selected.kind === 'hypothesis' && <div className="topic-wall-chips"><span className="topic-wall-chip is-dashed">假设 · 未核验</span>{selected.created_at && <span className="topic-wall-muted">你写于 {selected.created_at.slice(5, 10)}</span>}</div>}
          <p className="topic-wall-detail-label">{selected.label}</p>
          {selected.kind === 'hard' && <p className="topic-wall-muted">由年报等披露抽取并经核验，不能在墙上修改。</p>}
          {selected.kind !== 'hypothesis' && <div className="topic-wall-evidence">{selected.basis.length ? selected.basis.map((ref, index) => <EvidenceLink key={ref} reference={ref}>依据 {index + 1}</EvidenceLink>) : <span className="topic-wall-muted">尚无可回读的依据。</span>}</div>}
          {selected.kind === 'hypothesis' && <>
            <div className="topic-wall-callout">
              <strong>找到依据后可以升格为研究关联</strong>
              <p>「找依据」会在右侧议题对话里请助手核对原文；助手给出升格提案，你确认后才改成实线。</p>
              <div className="topic-wall-detail-actions"><button type="button" className="workspace-action workspace-action-primary" disabled={busy} onClick={() => void findBasis(selected)}>找依据</button><button type="button" className="workspace-action" disabled={busy} onClick={() => void withdraw(selected)}>撤回假设</button></div>
            </div>
            {selectedProposal && <section className="topic-wall-proposal">
              <h3>升格提案</h3>
              <p>{selectedProposal.reason}</p>
              <div className="topic-wall-evidence">{selectedProposal.basis?.map((ref, index) => <EvidenceLink key={ref} reference={ref}>依据 {index + 1}</EvidenceLink>)}</div>
              <div className="topic-wall-detail-actions"><button type="button" className="workspace-action workspace-action-primary" disabled={busy} onClick={() => void decide(selectedProposal, 'confirm').then(ok => { if (ok) setSelected(null); })}>确认升格</button><button type="button" className="workspace-action" disabled={busy} onClick={() => void decide(selectedProposal, 'reject')}>保持假设</button></div>
            </section>}
          </>}
        </div>
      </aside></div>, overlay)}
  </section>;
}
