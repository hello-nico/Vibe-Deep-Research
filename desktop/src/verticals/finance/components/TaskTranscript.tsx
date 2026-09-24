import { useEffect, useMemo, useState, useSyncExternalStore, type ComponentType } from 'react';
import ReactMarkdown, { defaultUrlTransform } from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { useResearchSessions, type TaskTrajectoryStep } from '../dsh/research-session';
import { durationLabel, emptyTaskTrajectory, extractBoundSources, extractResultIds, visibleProcessPrompt, visibleUserPrompt } from '../lib/taskTrajectory';
import { decodeEvidenceLink } from '../lib/evidence';
import { outboundWebUrl, remarkCitationMarks } from '../lib/citationMarks';

const noopSubscribe = () => () => {};
const emptySnapshot = () => emptyTaskTrajectory;

function clock(time?: number) {
  if (!time) return '';
  return new Date(time).toLocaleString('zh-CN', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

function AssistantMarkdown({ markdown }: { markdown: string }) {
  const body = markdown.replace(/^\uFEFF?---\r?\n[\s\S]*?\r?\n---(?:\r?\n|$)/, '');
  return (
    <div className="finance-cite-root prose prose-sm max-w-none break-words leading-7 dark:prose-invert overflow-x-auto">
      <ReactMarkdown
        remarkPlugins={[remarkGfm, remarkCitationMarks]}
        urlTransform={url => decodeEvidenceLink(url) ? url : defaultUrlTransform(url)}
        components={{
          a: ({ href, children }) => {
            const evidence = decodeEvidenceLink(href || '');
            const web = outboundWebUrl(href || '') || (evidence ? outboundWebUrl(evidence) : null);
            if (web) return <a href={web} target="_blank" rel="noopener noreferrer">{children}</a>;
            return evidence
              ? <button type="button" className="finance-citation" data-evidence-ref={evidence} aria-label="查看依据" onClick={() => window.dispatchEvent(new CustomEvent('finance-open-evidence', { detail: evidence }))}>{children}</button>
              : href
                ? <a href={href} target="_blank" rel="noopener noreferrer">{children}</a>
                : children;
          },
        }}
      >
        {body}
      </ReactMarkdown>
    </div>
  );
}

function ResultEmbeds({ ids }: { ids: string[] }) {
  const [mods, setMods] = useState<{
    Embed: ComponentType<{ resultId: string }>;
    Boundary: ComponentType<{ children: import('react').ReactNode }>;
  } | null>(null);
  useEffect(() => {
    if (!ids.length) return;
    let active = true;
    void import('./ResearchResult').then(mod => {
      if (active) setMods({ Embed: mod.ResultEmbed, Boundary: mod.ResultEmbedBoundary });
    });
    return () => { active = false; };
  }, [ids.length]);
  if (!ids.length) return null;
  if (!mods) return <p className="mt-3 text-xs text-muted-foreground">正在载入成果…</p>;
  return <div className="mt-3 space-y-3">{ids.map(id => <mods.Boundary key={id}><mods.Embed resultId={id} /></mods.Boundary>)}</div>;
}

function BoundSourceList({ body }: { body?: string }) {
  const sources = extractBoundSources(body || '');
  if (!sources.length) return null;
  return (
    <ul className="mt-2 space-y-1 text-[11px] text-muted-foreground">
      {sources.map(item => (
        <li key={item.url || item.version || item.label} data-version={item.version}>
          本轮依据 · {item.label}
          {item.fetchedAt ? ` · ${item.fetchedAt}` : ''}
        </li>
      ))}
    </ul>
  );
}

function StepRow({ step, compactUser = false }: { step: TaskTrajectoryStep; compactUser?: boolean }) {
  const user = step.kind === 'user';
  const assistant = step.kind === 'assistant';
  const visible = user ? (compactUser ? visibleProcessPrompt(step.body || '') : visibleUserPrompt(step.body || '')) : step.body;
  const resultIds = extractResultIds([step.body, step.args].filter(Boolean).join('\n'));
  const [open, setOpen] = useState(Boolean(step.failed));
  const when = clock(step.time);
  const meta = [when, durationLabel(step.durationMs)].filter(Boolean).join(' · ');

  if (user) {
    return (
      <li className="finance-assistant-turn is-user" aria-label="你发送的问题" title={when}>
        <div className="finance-assistant-user-bubble">
          {visible && <p className="whitespace-pre-wrap break-words">{visible}</p>}
          <BoundSourceList body={step.body} />
        </div>
      </li>
    );
  }

  if (assistant) {
    if (!visible && !resultIds.length && !step.error && !step.streaming) return null;
    return (
      <li className="finance-assistant-turn is-assistant" aria-label="助手回答" title={meta}>
        {step.error && <p className="text-xs text-destructive" role="alert">{step.error}</p>}
        {visible && <AssistantMarkdown markdown={visible} />}
        {step.streaming && !visible && <p className="text-xs text-muted-foreground">正在生成…</p>}
        {resultIds.length > 0 && <ResultEmbeds ids={resultIds} />}
      </li>
    );
  }

  const expandable = Boolean(visible || step.args || step.error || resultIds.length);
  return (
    <li className="finance-assistant-turn is-process">
      <button type="button" className="flex w-full items-start justify-between gap-2 text-left" disabled={!expandable} aria-expanded={open} onClick={() => expandable && setOpen(value => !value)}>
        <span className="min-w-0">{step.title}</span>
        {meta && <span className="shrink-0 text-[11px]">{meta}</span>}
      </button>
      {resultIds.length > 0 && <ResultEmbeds ids={resultIds} />}
      {open && expandable && (
        <div className="mt-2 space-y-2">
          {step.error && <p className="text-xs text-destructive" role="alert">{step.error}</p>}
          {visible && <pre className="max-h-64 overflow-auto whitespace-pre-wrap break-words text-xs">{visible}</pre>}
          {step.args && <details><summary className="cursor-pointer text-[11px]">调用参数</summary><pre className="mt-1 max-h-40 overflow-auto whitespace-pre-wrap text-xs">{step.args}</pre></details>}
        </div>
      )}
    </li>
  );
}

export function useTaskTrajectory(sessionId?: string) {
  const sessions = useResearchSessions();
  const store = useMemo(() => {
    if (!sessionId) return null;
    try { return sessions.trajectory(sessionId); }
    catch { return null; }
  }, [sessions, sessionId]);
  useEffect(() => {
    if (!store) return;
    return store.subscribe(() => {});
  }, [store]);
  return store;
}

export function TaskTranscript({ sessionId, intro, compactUser = false }: { sessionId: string; intro?: string; compactUser?: boolean }) {
  const sessions = useResearchSessions();
  const store = useMemo(() => {
    try { return sessions.trajectory(sessionId); }
    catch { return null; }
  }, [sessions, sessionId]);
  const snap = useSyncExternalStore(store?.subscribe ?? noopSubscribe, store?.getSnapshot ?? emptySnapshot, store?.getSnapshot ?? emptySnapshot);
  let live = null as ReturnType<typeof sessions.sessionState>;
  try { live = sessions.sessionState(sessionId); } catch { live = null; }
  const running = Boolean(snap.running || live?.running);
  const failed = Boolean(snap.failed || live?.lastAgentError || live?.promptError);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const hasEvents = snap.steps.length > 0 || snap.runningCalls.length > 0;
  const status = running || snap.streaming || snap.openState === 'cold' || snap.openState === 'loading'
    ? '生成中…'
    : failed || snap.openState === 'error'
      ? '未完成'
      : hasEvents ? '已结束' : '';
  return (
    <div className="min-h-0 flex-1 overflow-auto px-4 py-3">
      {snap.openError && <p className="mb-3 text-sm text-destructive" role="alert">{snap.openError}</p>}
      {status && <p className="mb-3 text-xs text-muted-foreground" role="status">{status}</p>}
      {snap.hasMore && (
        <button type="button" className="workspace-action workspace-action-compact mb-3" disabled={loadingOlder || snap.loadingOlder} onClick={() => {
          if (!store?.loadOlder || loadingOlder) return;
          setLoadingOlder(true);
          void store.loadOlder().finally(() => setLoadingOlder(false));
        }}>
          {loadingOlder || snap.loadingOlder ? '正在加载更早记录…' : '加载更早记录'}
        </button>
      )}
      {snap.runningCalls.length > 0 && (
        <ul className="mb-3 space-y-2">{snap.runningCalls.map(call => (
          <li key={call.id} className="rounded-lg border border-primary/30 bg-primary/5 px-3 py-2 text-sm">
            <p>正在执行 · {call.name}</p>
            {call.args && <pre className="mt-2 max-h-32 overflow-auto whitespace-pre-wrap text-xs">{call.args}</pre>}
          </li>
        ))}</ul>
      )}
      {!hasEvents && intro && !running && snap.openState === 'open' && (
        <p className="finance-assistant-turn is-assistant">{intro}</p>
      )}
      <ol className="finance-assistant-transcript">{snap.steps.map(step => <StepRow key={step.id} step={step} compactUser={compactUser} />)}</ol>
    </div>
  );
}
