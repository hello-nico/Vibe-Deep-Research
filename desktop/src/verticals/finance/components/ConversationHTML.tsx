import { useEffect, useRef, useState } from 'react';
import { ReportFrame } from './ReportFrame';
import { reportMessage } from './WikiReportPane';

export function conversationHeight(height: number): number { return Math.min(20_000, Math.max(80, Math.ceil(height) + 8)); }

export function themedConversationHTML(html: string, colors: readonly string[]): string {
  const names = ['bg', 'text', 'muted', 'line', 'accent', 'up', 'down'];
  const css = names.map((name, index) => `--vibe-${name}:${colors[index]};`).join('');
  return html.replace(/<\/head\s*>/i, `<style>:root{${css}}body{margin:0;background:var(--vibe-bg);color:var(--vibe-text);font:14px sans-serif}*{box-sizing:border-box}svg{max-width:100%}</style></head>`);
}

export function ConversationHTML({ html, refs, title }: { html: string; refs: readonly string[]; title: string }) {
  const frame = useRef<HTMLIFrameElement>(null);
  const host = useRef<HTMLDivElement>(null);
  const [colors, setColors] = useState(['transparent', '#222', '#777', '#ddd', '#c60', '#c33', '#27864b']);
  useEffect(() => {
    const update = () => {
      if (!host.current) return;
      const style = getComputedStyle(host.current);
      const get = (name: string, fallback: string) => {
        const value = style.getPropertyValue(name).trim();
        const color = name === '--text-3' || name === '--line-2' ? value : `hsl(${value})`;
        return CSS.supports('color', color) && !/[<>;{}]/.test(color) ? color : fallback;
      };
      const next = [get('--background', 'transparent'), get('--foreground', '#222'), get('--text-3', '#777'), get('--line-2', '#ddd'), get('--brand', '#c60'), '#c33', '#27864b'];
      setColors(old => old.join() === next.join() ? old : next);
    };
    update();
    const observer = new MutationObserver(update);
    observer.observe(document.documentElement, { attributes: true });
    observer.observe(document.body, { attributes: true });
    const media = matchMedia('(prefers-color-scheme: dark)');
    media.addEventListener('change', update);
    return () => { observer.disconnect(); media.removeEventListener('change', update); };
  }, []);
  useEffect(() => {
    const allowed = new Set(refs);
    const receive = (event: MessageEvent) => {
      if (event.source !== frame.current?.contentWindow) return;
      const message = reportMessage(event.data);
      if (message?.kind === 'resize' && frame.current) frame.current.style.height = `${conversationHeight(message.height)}px`;
      const data = event.data;
      if (data?.source === 'vibe-wiki-report' && data.type === 'cite' && typeof data.ref === 'string' && allowed.has(data.ref)) {
        window.dispatchEvent(new CustomEvent('finance-open-evidence', { detail: data.ref }));
      }
    };
    window.addEventListener('message', receive);
    return () => window.removeEventListener('message', receive);
  }, [html, refs]);
  return <div ref={host}><ReportFrame ref={frame} title={title} srcDoc={themedConversationHTML(html, colors)} style={{ border: 0, width: '100%', minHeight: 80, display: 'block' }} /></div>;
}
