import { createContext, useContext, useEffect, useMemo, useRef, useState, type ComponentType, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import type { Context } from '@deepseek-ai/cordis';
import type { ChatNodeViewProps } from '@deepseek-ai/dsh-client-ui-chat/client';
import { EvidenceLink } from '../components/EvidenceCard';
import { ResearchResult } from '../components/ResearchResult';
import { financialNumber } from '../lib/financialDisplay';
import { Suggest, type SuggestActions } from './suggestion-node';
import { hideUnfencedSuggestions, unfencedSuggestionRanges, parseVibe, summarizeVibeMarkdown, vibeBlocks, type VibeCheck, type VibeNode, type VibeValue } from './vibe';

export const VIBE_RENDERER = Symbol.for('vibe.finance.components');
export const VIBE_COPY = Symbol.for('vibe.finance.component-summary');
const copySources = new Map<string, Set<{ blocks: ReadonlySet<number>; suggestions: ReadonlyMap<number, string> }>>();
/** The shell clipboard is shared by code toolbars; transform only mounted replies. */
export function registerVibeCopySource(text: string, blocks: ReadonlySet<number>, suggestions: ReadonlyMap<number, string> = new Map()) {
  if (!vibeBlocks(text).length && !unfencedSuggestionRanges(text).length) return () => {};
  const entry = { blocks, suggestions }, entries = copySources.get(text) ?? new Set();
  entries.add(entry);
  copySources.set(text, entries);
  return () => {
    entries.delete(entry);
    if (!entries.size) copySources.delete(text);
  };
}
export interface VibeRenderOptions { pending: boolean; source: string; offset: number }
interface VibeContextData {
  check?: VibeCheck | { turn: number; failed: true }; texts: string[]; actions: SuggestActions;
  phase: 'running' | 'waiting' | 'hidden'; visibleBlocks: Set<number>;
  suggestionTarget?: HTMLElement | null;
}
export const VibeContext = createContext<VibeContextData | undefined>(undefined);

export function registerVibeRenderer(render: (code: string, options: VibeRenderOptions) => ReactNode) {
  const host = globalThis as Record<symbol, unknown>;
  const summary = (text: string) => {
    const entries = copySources.get(text);
    if (!entries) return text;
    // Clipboard receives only text: identical replies must not leak hidden blocks.
    const sources = [...entries];
    const visible = new Set([...sources[0]!.blocks].filter(index => sources.every(source => source.blocks.has(index))));
    const suggestions = new Map([...sources[0]!.suggestions].filter(([index, text]) => sources.every(source => source.suggestions.get(index) === text)));
    return summarizeVibeMarkdown(text, visible, suggestions);
  };
  host[VIBE_RENDERER] = render;
  host[VIBE_COPY] = summary;
  return () => {
    if (host[VIBE_RENDERER] === render) delete host[VIBE_RENDERER];
    if (host[VIBE_COPY] === summary) delete host[VIBE_COPY];
  };
}

function Value({ node, value }: { node: VibeNode; value: VibeValue }) {
  return <EvidenceLink reference={node.attrs.ref!} citationLabel={value.source_title || node.attrs.label}>
    <span className="font-semibold tabular-nums">{financialNumber(value.value)}{value.unit && ` ${value.unit}`}</span>
    {value.period && <span className="ml-2 text-xs text-muted-foreground">{value.period}</span>}
  </EvidenceLink>;
}

const palette = ['#2563eb', '#d97706', '#9333ea', '#059669', '#e11d48', '#0891b2', '#ea580c', '#64748b'];
export function VibeBlock({ code, options }: { code: string; options: VibeRenderOptions }) {
  const context = useContext(VibeContext);
  const result = useMemo(() => {
    if (!context?.check) return context && context.phase !== 'hidden' ? { pending: true } : { diagnostic: 'missing_check' };
    try {
      if ('failed' in context.check) throw new Error('校验事件格式错误');
      const suggest = context.check.suggest;
      if (options.pending && context.phase === 'running') return { pending: true };
      const sourceIndex = context.texts.indexOf(options.source);
      const local = vibeBlocks(options.source).findIndex(block => block.offset === options.offset && block.code === code);
      if (sourceIndex < 0 || local < 0) throw new Error('校验事件无法对应正文');
      const index = context.texts.slice(0, sourceIndex).reduce((n, text) => n + vibeBlocks(text).length, 0) + local;
      const block = context.check.blocks.find(item => item.index === index);
      if (!block || (!block.ok && !block.elements.length)) throw new Error('组件块没有有效校验结果');
      const checks = new Map(block.elements.map(element => [element.path, element]));
      let suggestion: ReactNode = null;
      const render = (node: VibeNode): ReactNode => {
        const check = checks.get(node.path);
        if (!check || check.component !== node.component) throw new Error('组件元素与校验事件不一致');
        if (check.status === 'dropped') return null;
        const visibleChildren = node.children.filter(child => checks.get(child.path)?.status !== 'dropped');
        const children = () => visibleChildren.flatMap(child => {
          const content = render(child);
          return content === null ? [] : [<div key={child.path}>{content}</div>];
        });
        const value = check.values?.[node.attrs.ref ?? ''];
        switch (node.component) {
          case 'section': case 'grid': case 'row': case 'stat': {
            const content = children();
            if (!content.length) return null;
            if (node.component === 'section') return <section className="my-4 space-y-3"><h3 className="font-semibold text-foreground">{node.attrs.question}</h3>{content}</section>;
            const className = node.component === 'grid'
              ? node.attrs.cols === '3' ? 'grid grid-cols-1 gap-3 lg:grid-cols-3' : 'grid grid-cols-1 gap-3 md:grid-cols-2'
              : node.component === 'row' ? 'flex flex-wrap gap-3 [&>div]:min-w-0 [&>div]:flex-1' : 'grid grid-cols-1 gap-3 sm:grid-cols-2';
            return <div className={className}>{content}</div>;
          }
          case 'chart': return <div className="min-w-0">{node.attrs.title && <h4 className="mb-2 font-medium">{node.attrs.title}</h4>}<ResearchResult resultId={node.attrs.ref!} /></div>;
          case 'item':
            if (!value) throw new Error('指标缺少已解析数值');
            return <div className="rounded-xl border border-border bg-card p-4"><p className="mb-2 text-sm text-muted-foreground">{node.attrs.label}</p><Value node={node} value={value} /></div>;
          case 'compare': {
            const bars = node.children.filter(child => checks.get(child.path)?.status === 'ok');
            if (!bars.length) return null;
            const values = bars.map(child => checks.get(child.path)?.values?.[child.attrs.ref ?? '']);
            if (values.some(v => !v) || new Set(values.map(v => v!.unit)).size > 1) throw new Error('对比缺少同口径数值');
            const numbers = values.map(v => Number(v!.value));
            const min = Math.min(0, ...numbers), max = Math.max(0, ...numbers);
            const range = max - min || 1;
            const zero = -min / range * 100;
            return <figure className="rounded-xl border border-border bg-card p-4"><figcaption className="mb-3 font-medium">{node.attrs.title}</figcaption>
              {bars.map((bar, i) => <div key={bar.path} className="mb-3"><div className="mb-1 flex flex-wrap justify-between gap-2 text-sm"><span>{bar.attrs.label}</span><Value node={bar} value={values[i]!} /></div>
                <div className="relative h-2 rounded bg-muted"><span className="absolute -top-1 h-4 border-l border-foreground/40" style={{ left: `${zero}%` }} aria-hidden="true" />
                  <div className="absolute h-2 rounded" data-value={numbers[i]} style={{ left: `${Math.min(zero, (numbers[i]! - min) / range * 100)}%`, width: `${Math.abs(numbers[i]!) / range * 100}%`, backgroundColor: palette[i] }} /></div></div>)}
            </figure>;
          }
          case 'flow': {
            const content = visibleChildren.flatMap(step => {
              const content = render(step);
              return content === null ? [] : [{ path: step.path, content }];
            });
            if (!content.length) return null;
            return <figure className="rounded-xl border border-border bg-card p-4"><ol className="flex flex-wrap items-center gap-3">{content.map((step, i) => <li key={step.path}>{i > 0 && <span className="mr-3 text-muted-foreground" aria-hidden="true">→</span>}{step.content}</li>)}</ol>{node.attrs.note && <figcaption className="mt-3 text-sm text-muted-foreground">{node.attrs.note}</figcaption>}</figure>;
          }
          case 'step': return <span className="inline-block rounded-lg bg-[var(--fill-2)] px-3 py-2">{node.text.trim()}</span>;
          case 'suggest':
            if (suggest?.items.length && context.suggestionTarget) suggestion = createPortal(<Suggest data={suggest} actions={context.actions} />, context.suggestionTarget, node.path);
            return null;
          default: throw new Error('校验事件含目录外组件');
        }
      };
      const content = parseVibe(code).flatMap(node => {
        const content = render(node);
        return content === null ? [] : [<div key={node.path}>{content}</div>];
      });
      return { index, content, suggestion };
    } catch { return { diagnostic: 'invalid_check' }; }
  }, [code, options.pending, options.source, options.offset, context]);
  useEffect(() => {
    if (result.diagnostic) console.warn(`[finance/vibe] ${result.diagnostic}，已隐藏组件块`);
  }, [result.diagnostic]);
  useEffect(() => {
    if ((!result.content?.length && !result.suggestion) || result.index === undefined || !context) return;
    const index = result.index;
    context.visibleBlocks.add(index);
    return () => { context.visibleBlocks.delete(index); };
  }, [result, context]);
  if (result.pending) return <div role="status" className="my-3 rounded-xl border border-border bg-card p-4 text-sm text-muted-foreground">正在准备研究组件…</div>;
  return <>{Boolean(result.content?.length) && <div className="my-3 text-foreground" data-vibe-block>{result.content}</div>}{result.suggestion}</>;
}

/** Shadow only the assistant seat, retaining the native renderer and its inject face. */
export function installVibeAssistantContext(ctx: Context) {
  return ctx.slots.inject('conversation.chat.node', () => {
    let previous: unknown;
    let release: (() => void) | undefined;
    const sync = () => {
      const native = ctx.slots.entries('conversation.chat.node').find(entry => entry.options.key === 'assistant-step' && (entry.options.priority ?? 0) === 0);
      if (native === previous) return;
      previous = native;
      release?.(); release = undefined;
      if (!native) return;
      const Assistant = native.component as ComponentType<ChatNodeViewProps<'assistant-step'>>;
      function VibeAssistant(props: ChatNodeViewProps<'assistant-step'>) {
        const check = props.useTurnData('finance-vibe');
        const process = props.useTurnData('turn-process');
        const ownCheck = process?.answerStep === props.node.data.step ? check : undefined;
        const turn = props.node.location.kind === 'turn' || props.node.location.kind === 'step' ? props.node.location.turn.turn : undefined;
        const endedAt = props.useChat(snapshot => turn === undefined ? undefined : snapshot.timeline.turns.get(turn)?.end?.time);
        // An already closed turn is history; only observed live turns get a grace period.
        const historical = useRef(endedAt !== undefined);
        const [expiredEnd, setExpiredEnd] = useState<number>();
        const [suggestionTarget, setSuggestionTarget] = useState<HTMLDivElement | null>(null);
        const phase = endedAt === undefined ? 'running' : historical.current || expiredEnd === endedAt || Date.now() >= endedAt + 10_000 ? 'hidden' : 'waiting';
        useEffect(() => {
          if (endedAt === undefined || historical.current || ownCheck || phase === 'hidden') return;
          const timer = setTimeout(() => setExpiredEnd(endedAt), Math.max(0, endedAt + 10_000 - Date.now()));
          return () => clearTimeout(timer);
        }, [endedAt, ownCheck, phase]);
        const copyText = props.node.data.blocks.flatMap(block => block.kind === 'text' ? [block.text] : []).join('');
        const sanitized = hideUnfencedSuggestions(copyText);
        let offset = 0;
        const blocks = props.node.data.blocks.map(block => {
          if (block.kind !== 'text') return block;
          const text = sanitized.slice(offset, offset + block.text.length);
          offset += block.text.length;
          return { ...block, text };
        }).filter(block => block.kind !== 'text' || block.text.trim());
        const texts = blocks.flatMap(block => block.kind === 'text' ? [block.text] : []);
        const bare = ownCheck && !('failed' in ownCheck) && ownCheck.suggest?.items.length
          ? unfencedSuggestionRanges(copyText).find(span => ownCheck.unfencedSuggestions?.some(checked =>
            checked.start === span.start && checked.end === span.end && checked.status === 'ok')) : undefined;
        const visibleBlocks = useMemo(() => new Set<number>(), [copyText, ownCheck]);
        const visibleSuggestions = useMemo(() => {
          if (!bare || !ownCheck || 'failed' in ownCheck || !ownCheck.suggest) return new Map<number, string>();
          const suggest = ownCheck.suggest;
          const labels = suggest.type === 'question' ? suggest.items.map(item => item.text) : suggest.items.map(item => `${item.symbol}：${item.reason}`);
          return new Map([[bare.start, '相关推荐：' + labels.join('；') + '。']]);
        }, [bare?.start, ownCheck]);
        useEffect(() => registerVibeCopySource(copyText, visibleBlocks, visibleSuggestions), [copyText, visibleBlocks, visibleSuggestions]);
        const value: VibeContextData = { check: ownCheck, texts, actions: props, phase, visibleBlocks, suggestionTarget };
        return <VibeContext.Provider value={value}><Assistant {...props} node={{ ...props.node, data: { ...props.node.data, blocks } }} /><div ref={setSuggestionTarget} data-vibe-suggestions-tail style={{ display: 'contents' }}>{bare && ownCheck && !('failed' in ownCheck) && ownCheck.suggest && <Suggest data={ownCheck.suggest} actions={props} />}</div></VibeContext.Provider>;
      }
      release = ctx.slots.register({ name: 'conversation.chat.node', key: 'assistant-step', priority: -10, locale: 'chat',
        inject: () => native.inject?.() ?? {} }, VibeAssistant);
    };
    const unsubscribe = ctx.slots.subscribe('conversation.chat.node', sync);
    sync();
    return () => { unsubscribe(); release?.(); };
  });
}
