import { useEffect, useRef } from 'react';
import type { ChatSnapshot, UseChat, ToolCallBlock } from '@deepseek-ai/dsh-client-ui-chat/client';
import { webCitationUrl } from '../lib/citationMarks';

type Preview = { title: string; summary: string };

/** Use the closing answer's own tool results, never another turn's URL cache. */
export function searchPreviews(snapshot: ChatSnapshot, messageId: string) {
  const closing = snapshot.legacy.nodes.find(node => node.kind === 'assistant' && node.messageId === messageId);
  if (!closing || closing.kind !== 'assistant') return null;
  const sources = new Map<string, Preview>();
  for (const key of snapshot.locations.getTurn(closing.turn)) {
    const node = snapshot.nodes.get(key);
    if (node?.kind !== 'tool-call') continue;
    const { root } = node.data as { root: ToolCallBlock };
    if (!('kind' in root) || root.kind !== 'tool-result' || root.isError || root.seq > closing.seq || root.call?.name !== 'stock_search_external') continue;
    for (const block of root.content) {
      if (block.type !== 'text') continue;
      let payload;
      try { payload = JSON.parse(block.text); } catch { continue; }
      if (!Array.isArray(payload?.results)) continue;
      for (const item of payload.results) {
        if (!item || typeof item.url !== 'string') continue;
        const url = webCitationUrl(item.url);
        if (!url) continue;
        const title = typeof item.title === 'string' ? item.title.trim() : '';
        const summary = typeof item.snippet === 'string' ? item.snippet.trim() : '';
        if (title || summary) sources.set(url, { title, summary });
      }
    }
  }
  return { turn: closing.turn, sources };
}

/** Nonvisual adapter in the native answer slot; the shared preview owns presentation. */
export function SearchPreviews({ useChat, messageId }: { useChat: UseChat; messageId: string }) {
  const marker = useRef<HTMLSpanElement>(null);
  const snapshot = useChat((value: ChatSnapshot) => value);
  useEffect(() => {
    const flow = marker.current?.closest('[data-chat-flow]');
    const data = searchPreviews(snapshot, messageId);
    if (!flow || !data) return;
    const touched = new Set<HTMLElement>();
    const stamp = () => {
      for (const row of flow.querySelectorAll(`[data-chat-turn="${data.turn}"][data-chat-flow-kind="assistant-step"]`)) {
        for (const anchor of row.querySelectorAll<HTMLElement>('a[href], button[data-evidence-ref]')) {
          const raw = anchor.getAttribute('href') || anchor.dataset.evidenceRef || '';
          const url = webCitationUrl(raw);
          const source = url ? data.sources.get(url) : undefined;
          if (!source) continue;
          anchor.dataset.searchTitle = source.title;
          anchor.dataset.searchSummary = source.summary;
          touched.add(anchor);
        }
      }
    };
    stamp();
    const observer = new MutationObserver(stamp);
    observer.observe(flow, { childList: true, subtree: true });
    return () => {
      observer.disconnect();
      for (const anchor of touched) { delete anchor.dataset.searchTitle; delete anchor.dataset.searchSummary; }
    };
  }, [snapshot, messageId]);
  return <span ref={marker} hidden />;
}
