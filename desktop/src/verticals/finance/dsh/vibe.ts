import { fromMarkdown } from 'mdast-util-from-markdown';
import type { Nodes } from 'mdast';
import type { ConversationNodeDefinition } from '@deepseek-ai/dsh-client-ui-conversation/client';
import type { CompanySuggestion, QuestionSuggestion } from './result-projection.ts';

export interface VibeValue { value: number | string; unit: string; period: string; source_title: string }
export interface VibeElementCheck {
  path: string; component: string; status: 'ok' | 'dropped'; reason?: string;
  values?: Record<string, VibeValue>;
}
export interface VibeBlockCheck { index: number; ok: boolean; elements: VibeElementCheck[] }
export type VibeSuggest = { type: 'question'; items: QuestionSuggestion[] } | { type: 'company'; items: CompanySuggestion[] };
export interface UnfencedSuggestion { start: number; end: number; status: 'ok' | 'dropped'; reason?: string }
export interface VibeCheck { turn: number; blocks: VibeBlockCheck[]; suggest?: VibeSuggest; unfencedSuggestions?: UnfencedSuggestion[] }
export interface VibeNode { component: string; path: string; attrs: Record<string, string>; text: string; children: VibeNode[] }

function decode(value: string) {
  return value.replace(/&(?:amp|lt|gt|quot|apos|#\d+|#x[\da-f]+);/gi, entity => {
    const names: Record<string, string> = { '&amp;': '&', '&lt;': '<', '&gt;': '>', '&quot;': '"', '&apos;': "'" };
    if (names[entity]) return names[entity]!;
    const hex = entity[2]?.toLowerCase() === 'x';
    const code = Number.parseInt(entity.slice(hex ? 3 : 2, -1), hex ? 16 : 10);
    return Number.isInteger(code) && code >= 0 && code <= 0x10ffff ? String.fromCodePoint(code) : entity;
  });
}

declare module '@deepseek-ai/dsh-client-ui-conversation/client' {
  interface ConversationTurnDataMap { 'finance-vibe': VibeCheck | { turn: number; failed: true } }
}

/** Read the non-executable tag vocabulary. Stock owns semantic validation. */
export function parseVibe(code: string): VibeNode[] {
  const roots: VibeNode[] = [], stack: VibeNode[] = [];
  let cursor = 0;
  for (const match of code.matchAll(/<\/?[A-Za-z][\w-]*(?:"[^"]*"|'[^']*'|[^"'<>])*>/g)) {
    if (stack.length) stack.at(-1)!.text += decode(code.slice(cursor, match.index));
    cursor = match.index + match[0].length;
    const token = match[0];
    const close = /^<\/([A-Za-z][\w-]*)/.exec(token);
    if (close) {
      let at = stack.length - 1;
      while (at >= 0 && stack[at]!.component !== close[1]) at--;
      if (at >= 0) stack.splice(at);
      continue;
    }
    const open = /^<([A-Za-z][\w-]*)([\s\S]*?)(\/?)>$/.exec(token)!;
    const parent = stack.at(-1), siblings = parent?.children ?? roots;
    const node: VibeNode = { component: open[1]!, path: parent ? `${parent.path}.${siblings.length}` : String(siblings.length), attrs: {}, text: '', children: [] };
    let rest = open[2]!;
    while (rest.trim()) {
      const attr = /^\s+([A-Za-z][\w-]*)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'{}=<>]+))/.exec(rest);
      if (!attr) break; // The matching event drops this malformed element.
      node.attrs[attr[1]!] = decode(attr[2] ?? attr[3] ?? attr[4]!);
      rest = rest.slice(attr[0].length);
    }
    siblings.push(node);
    if (!open[3]) stack.push(node);
  }
  if (stack.length) stack.at(-1)!.text += decode(code.slice(cursor));
  return roots;
}

export function vibeBlocks(markdown: string) {
  const blocks: { code: string; offset: number }[] = [];
  const visit = (node: Nodes) => {
    if (node.type === 'code' && node.lang === 'vibe') blocks.push({ code: node.value, offset: node.position?.start.offset ?? -1 });
    if ('children' in node) node.children.forEach(visit);
  };
  visit(fromMarkdown(markdown));
  return blocks;
}

/** Standalone recommendation paragraphs only; fenced examples remain ordinary code. */
export function unfencedSuggestionRanges(markdown: string) {
  const ranges: { start: number; end: number }[] = [];
  let open: { mark: string; size: number } | undefined, offset = 0, plainStart = 0;
  const plain = (start: number, end: number) => {
    const text = markdown.slice(start, end);
    let cursor = 0;
    const paragraph = (from: number, to: number) => {
      const raw = text.slice(from, to), source = raw.trim();
      if (!/^<suggest(?:\s|>)[\s\S]*<\/suggest>$/.test(source)) return;
      const indent = /^(?:[ \t]*\r?\n)*([ \t]*)</.exec(raw)?.[1] ?? '';
      if (indent.includes('\t') || indent.length > 3) return;
      const nodes = parseVibe(source);
      if (nodes.length !== 1 || nodes[0]!.component !== 'suggest') return;
      const at = start + from + raw.indexOf(source);
      ranges.push({ start: at, end: at + source.length });
    };
    for (const gap of text.matchAll(/\r?\n[ \t]*\r?\n/g)) {
      paragraph(cursor, gap.index); cursor = gap.index + gap[0].length;
    }
    paragraph(cursor, text.length);
  };
  for (const line of markdown.split(/(?<=\n)/)) {
    const fence = /^ {0,3}(`{3,}|~{3,})([^\n]*)\r?\n?$/.exec(line);
    if (!open && fence) { plain(plainStart, offset); open = { mark: fence[1]![0]!, size: fence[1]!.length }; }
    else if (open && fence && fence[1]![0] === open.mark && fence[1]!.length >= open.size && !fence[2]!.trim()) {
      open = undefined; plainStart = offset + line.length;
    }
    offset += line.length;
  }
  if (!open) plain(plainStart, markdown.length);
  return ranges;
}

export function hideUnfencedSuggestions(markdown: string) {
  for (const { start, end } of unfencedSuggestionRanges(markdown).reverse()) {
    // Preserve UTF-16 offsets for fenced component/event matching later in this text.
    markdown = markdown.slice(0, start) + markdown.slice(start, end).replace(/[^\r\n]/g, ' ') + markdown.slice(end);
  }
  return markdown;
}

export function vibeResultReferences(markdown: string, check: VibeCheck | { turn: number; failed: true } | undefined): Set<string> {
  const refs = new Set<string>();
  if (!check || 'failed' in check) return refs;
  vibeBlocks(markdown).forEach((block, index) => {
    const result = check.blocks.find(item => item.index === index);
    if (!result) return;
    const visit = (node: VibeNode) => {
      const element = result.elements.find(item => item.path === node.path && item.component === node.component);
      if (element?.status !== 'ok') return;
      if (node.component === 'chart' && /^result:[0-9a-f]{32}$/.test(node.attrs.ref ?? '')) refs.add(node.attrs.ref!);
      node.children.forEach(visit);
    };
    parseVibe(block.code).forEach(visit);
  });
  return refs;
}

function record(value: unknown): value is Record<string, unknown> { return value !== null && typeof value === 'object' && !Array.isArray(value); }
export function readVibeCheck(value: unknown): VibeCheck | undefined {
  if (!record(value) || !Number.isSafeInteger(value.turn) || Number(value.turn) < 0 || !Array.isArray(value.blocks)) return;
  const seenBlocks = new Set<number>();
  for (const block of value.blocks) {
    if (!record(block) || !Number.isInteger(block.index) || Number(block.index) < 0 || seenBlocks.has(Number(block.index))
      || typeof block.ok !== 'boolean' || !Array.isArray(block.elements)) return;
    seenBlocks.add(Number(block.index));
    const paths = new Set<string>();
    for (const element of block.elements) {
      if (!record(element) || typeof element.path !== 'string' || !/^\d+(?:\.\d+)*$/.test(element.path)
        || paths.has(element.path) || typeof element.component !== 'string' || !['ok', 'dropped'].includes(String(element.status))) return;
      paths.add(element.path);
      if (element.values !== undefined) {
        if (!record(element.values)) return;
        for (const item of Object.values(element.values)) {
          if (!record(item) || !['number', 'string'].includes(typeof item.value) || String(item.value).trim() === ''
            || !Number.isFinite(Number(item.value)) || !['unit', 'period', 'source_title'].every(key => typeof item[key] === 'string')) return;
        }
      }
    }
  }
  if (value.suggest !== undefined) {
    const s = value.suggest;
    if (!record(s) || !['question', 'company'].includes(String(s.type)) || !Array.isArray(s.items)) return;
    if (!s.items.every(item => record(item) && (s.type === 'question' ? typeof item.text === 'string'
      : typeof item.symbol === 'string' && typeof item.reason === 'string'))) return;
  }
  if (value.unfencedSuggestions !== undefined) {
    if (!Array.isArray(value.unfencedSuggestions)) return;
    let end = 0;
    for (const span of value.unfencedSuggestions) {
      if (!record(span) || !Number.isSafeInteger(span.start) || !Number.isSafeInteger(span.end)
        || Number(span.start) < end || Number(span.end) <= Number(span.start) || !['ok', 'dropped'].includes(String(span.status))) return;
      end = Number(span.end);
    }
  }
  return value as unknown as VibeCheck;
}

type CheckState = VibeCheck | { turn: number; failed: true };
export const vibeDefinition: ConversationNodeDefinition<CheckState> = {
  kind: 'finance-vibe',
  match(event) {
    const e = event as unknown as { type: string; data?: { turn?: number } };
    return e.type === 'stock-research/vibe-check' && Number.isSafeInteger(e.data?.turn) && Number(e.data?.turn) >= 0
      ? { id: String(e.data!.turn), role: 'start' } : null;
  },
  start(_context, match) {
    return readVibeCheck(match.event.data) ?? { turn: (match.event.data as unknown as { turn: number }).turn, failed: true };
  },
  update(context) { return context.state; },
  buildLocationData(context, scope, previous) {
    if (scope !== 'turn' || !context.state) return null;
    if (previous?.key === 'finance-vibe' && previous.value === context.state) return previous;
    return { kind: 'turn', turn: context.state.turn, key: 'finance-vibe', value: context.state };
  },
};

/** Copy readable labels, never raw reference IDs; also covers open fences. */
export function summarizeVibeMarkdown(markdown: string, visibleBlocks?: ReadonlySet<number>, visibleSuggestions: ReadonlyMap<number, string> = new Map()): string {
  const nodes = fromMarkdown(markdown), replacements: { start: number; end: number; text: string }[] = [];
  for (const span of unfencedSuggestionRanges(markdown)) {
    replacements.push({ ...span, text: visibleSuggestions.get(span.start) ?? '' });
  }
  let index = 0;
  const visit = (node: Nodes) => {
    if (node.type === 'code' && node.lang === 'vibe' && node.position?.start.offset !== undefined && node.position.end.offset !== undefined) {
      if (visibleBlocks && !visibleBlocks.has(index++)) {
        replacements.push({ start: node.position.start.offset, end: node.position.end.offset, text: '' });
        return;
      }
      let summary = '研究组件';
      try {
        const labels: string[] = [];
        const collect = (n: VibeNode) => {
          const label = n.attrs.question || n.attrs.title || n.attrs.label || n.attrs.note || n.text.trim();
          if (label) labels.push(label.replace(/(?:result|claim|evidence|provider|calc):[^\s<>"']+/g, '已引用数据'));
          n.children.forEach(collect);
        };
        parseVibe(node.value).forEach(collect);
        if (labels.length) summary += '：' + labels.join('；');
      } catch { /* Broken components still copy a safe, single textual summary. */ }
      replacements.push({ start: node.position.start.offset, end: node.position.end.offset, text: summary + '。' });
    }
    if ('children' in node) node.children.forEach(visit);
  };
  visit(nodes);
  for (const r of replacements.sort((a, b) => b.start - a.start)) markdown = markdown.slice(0, r.start) + r.text + markdown.slice(r.end);
  return markdown;
}
