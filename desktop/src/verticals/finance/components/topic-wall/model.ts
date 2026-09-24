import type { TopicBasisChanges, TopicWallEdge, TopicWallNode, ResearchProposal } from '../../lib/research';

export type Point = { x: number; y: number };
export type WallPositions = Record<string, Point>;
const STORAGE_PREFIX = 'finance-topic-wall:';

export const NODE_W = 200;
export const NODE_H = 64;
export const NOTE = { x: 24, y: 24, w: 260, h: 132 };
const GAP = 88;

/** Deterministic layout for a stage `width` wide: topic subjects in the middle, documents / notes / results
 *  on the left below the judgment note, other objects on the right. Same nodes, same width, same points. */
export function layoutWall(nodes: readonly TopicWallNode[], width = 1100): WallPositions {
  const sorted = [...nodes].sort((a, b) => a.ref.localeCompare(b.ref));
  const groups: Record<'left' | 'center' | 'right', TopicWallNode[]> = { left: [], center: [], right: [] };
  for (const node of sorted) {
    const group = node.origins.includes('subject') ? 'center'
      : ['document', 'note', 'result'].includes(node.kind) ? 'left' : 'right';
    groups[group].push(node);
  }
  const stage = Math.max(760, width);
  const x = { left: 40, center: Math.round(stage / 2 - NODE_W / 2), right: stage - NODE_W - 40 };
  const top = { left: NOTE.y + NOTE.h + 48, right: 56, center: 0 };
  const tallest = Math.max(groups.left.length ? top.left + groups.left.length * GAP : 0, groups.right.length ? top.right + groups.right.length * GAP : 0, 360);
  top.center = Math.max(120, Math.round((tallest - groups.center.length * GAP) / 2));
  const positions: WallPositions = {};
  for (const group of ['left', 'center', 'right'] as const)
    groups[group].forEach((node, index) => { positions[node.ref] = { x: x[group], y: top[group] + index * GAP }; });
  return positions;
}

/** Where the segment from the centre of `from` toward `to` leaves a node-sized box centred on `to`. */
export function boxEdge(from: Point, to: Point, halfW = NODE_W / 2 + 4, halfH = NODE_H / 2 + 4): Point {
  const dx = from.x - to.x, dy = from.y - to.y;
  if (!dx && !dy) return to;
  const scale = Math.min(halfW / Math.abs(dx || 1e-9), halfH / Math.abs(dy || 1e-9));
  return { x: to.x + dx * scale, y: to.y + dy * scale };
}

export function readWallPositions(topicId: string): WallPositions {
  try {
    const raw = localStorage.getItem(STORAGE_PREFIX + topicId);
    if (!raw) return {};
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {};
    return Object.fromEntries(Object.entries(parsed).filter(([, value]) => {
      const point = value as Point;
      return Number.isFinite(point?.x) && Number.isFinite(point?.y);
    })) as WallPositions;
  } catch { return {}; }
}

export function writeWallPositions(topicId: string, positions: WallPositions): void {
  try { localStorage.setItem(STORAGE_PREFIX + topicId, JSON.stringify(positions)); } catch { /* Layout remains usable in memory. */ }
}

export function clearWallPositions(topicId: string): void {
  try { localStorage.removeItem(STORAGE_PREFIX + topicId); } catch { /* Automatic layout still works. */ }
}

export function wallLineStyle(kind: TopicWallEdge['kind'] | 'basis') {
  if (kind === 'hard') return { stroke: '#334155', width: 2.2, dash: undefined, marker: true };
  if (kind === 'link') return { stroke: 'hsl(var(--primary))', width: 2.2, dash: undefined, marker: false };
  if (kind === 'basis') return { stroke: 'hsl(var(--primary) / .55)', width: 1.4, dash: '2 5', marker: true };
  return { stroke: '#7c8798', width: 2, dash: '7 6', marker: false };
}

export const changedBasisRefs = (basis: TopicBasisChanges | null): Set<string> =>
  new Set((basis?.pages || []).filter(page => page.status === 'changed' && page.slug).map(page => page.slug!));

export function hypothesisProposal(proposals: readonly ResearchProposal[], hypothesisId: string): ResearchProposal | undefined {
  return proposals.find(proposal => proposal.status === 'pending' && proposal.hypothesis_id === hypothesisId);
}

export function validateHypothesis(note: string, from: string, to: string, edges: readonly TopicWallEdge[]): string | null {
  if (!note.trim() || note.trim().length > 200) return '请用 1–200 字说明这条假设。';
  if (!from || !to || from === to) return '请选择两个不同的对象。';
  if (edges.some(edge => edge.kind === 'hypothesis' && ((edge.from === from && edge.to === to) || (edge.from === to && edge.to === from))))
    return '这两个对象已有假设线。';
  return null;
}
