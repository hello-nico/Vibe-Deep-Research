import type { Root, RootContent, Link } from 'mdast';
import { sourceName } from './financialDisplay.ts';

const MAX_CITATION_TITLE_LENGTH = 48;

function compactCitationTitle(value: string): string {
  const compact = value.replace(/\s+/g, ' ').trim();
  if (compact.length <= MAX_CITATION_TITLE_LENGTH) return compact;
  return compact.slice(0, MAX_CITATION_TITLE_LENGTH - 1).trimEnd() + '…';
}

/**
 * Pick the source text that can sit next to the answer without exposing an
 * opaque reference. Explicit link text wins; URLs fall back to their host;
 * producer names are safe metadata, while the other internal IDs stay hidden.
 */
export function citationTitle(reference: string, explicitTitle?: string): string {
  const explicit = explicitTitle ? sourceName(compactCitationTitle(explicitTitle)) : '';
  const generic = new Set(['来源', '来源资料', '数据来源', '指标依据', '查看依据', '打开原文']);
  if (explicit && !generic.has(explicit) && !webCitationUrl(explicit) && !/^(?:source|claim|evidence|provider|lookup):/.test(explicit)) return explicit;
  const web = webCitationUrl(reference);
  if (web) return new URL(web).hostname.replace(/^www\./, '');
  const provider = /^provider:([^:\s<>]+):/.exec(reference)?.[1];
  return provider ? sourceName(compactCitationTitle(provider)) : '来源';
}

/** Create once per answer: every resolved reference gets a compact source title. */
export function createCitationMention(open: (reference: string) => void) {
  return (reference: string) => {
    // DSH's Markdown renderer puts this field on the native code button. Keep
    // the exact producer reference there so the shared preview can recover the
    // identity even when the visible label is only "来源".
    return { label: citationTitle(reference), title: reference, open: () => open(reference) };
  };
}

/** http(s) locators belong on the control, never as visible prose. */
export function webCitationUrl(value: string): string | null {
  const text = value.trim();
  if (!text) return null;
  try {
    const url = new URL(text);
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return null;
    if (url.username || url.password || url.hostname === '') return null;
    return url.href;
  } catch {
    return null;
  }
}

/** Web pages open in a new tab; producer prefixes wrapping a URL still count as web. */
export function outboundWebUrl(value: string): string | null {
  const text = value.trim();
  const direct = webCitationUrl(text);
  if (direct) return direct;
  const stripped = text.replace(/^(?:lookup|source|evidence|claim|provider):/i, '');
  return stripped === text ? null : webCitationUrl(stripped);
}

/**
 * 产品证据深链：同源 /evidence?ref=…（由 Stock dsh citationUri 单一 Owner 生成）。
 * 返回其中的不透明引用；非同源、路径不符或引用语法非法返回 null（当普通外链处理）。
 */
export function evidenceDeepLinkRef(value: string): string | null {
  if (typeof window === 'undefined') return null;
  let url: URL;
  try { url = new URL(value.trim()); } catch { return null; }
  if (url.origin !== window.location.origin || url.pathname !== '/evidence') return null;
  const ref = url.searchParams.get('ref') || '';
  return citationReference(ref) ? ref : null;
}

export function webCitationView(value: string, explicitTitle?: string): { title: string; text: string; href: string } | null {
  const href = webCitationUrl(value);
  if (!href) return null;
  return { title: citationTitle(href, explicitTitle), text: href, href };
}

const TOKEN = /(?:claim|evidence|source|provider|lookup):[^\s<>\[\]()（）"'\x60,;，。；]+/g;

// Identity comes from the producer; page/block suffixes cannot identify a source.
export function citationReference(value: string): string | null {
  if (!/^(claim|evidence|source|provider|lookup):[^\s<>]+$/.test(value)) return null;
  if (value.startsWith('source:') && !/^source:[^:]+:[^:]+:[a-f0-9]{64}:.+$/.test(value)) return null;
  return value;
}

function citationLink(reference: string, children: Link['children'] = [{ type: 'text', value: '来源' }]): Link {
  const colon = reference.indexOf(':');
  return { type: 'link', url: 'stock-ref://' + reference.slice(0, colon) + '/' + encodeURIComponent(reference.slice(colon + 1)), children };
}

/** Transform Markdown nodes before React renders; never rewrite its DOM or Markdown syntax. */
export function remarkCitationMarks() {
  return (tree: Root) => {
    const visit = (parent: Root | RootContent) => {
      if (!('children' in parent)) return;
      if (parent.type === 'link') {
        const ref = citationReference(parent.url);
        if (ref) parent.url = citationLink(ref).url;
        return;
      }
      if (parent.type === 'linkReference') return;
      const children: RootContent[] = [];
      for (const node of parent.children) {
        if (node.type === 'inlineCode') {
          const ref = citationReference(node.value);
          children.push(ref ? citationLink(ref) : node);
        } else if (node.type === 'text') {
          let at = 0;
          for (const match of node.value.matchAll(TOKEN)) {
            const ref = citationReference(match[0]);
            if (!ref) continue;
            if (match.index > at) children.push({ type: 'text', value: node.value.slice(at, match.index) });
            children.push(citationLink(ref));
            at = match.index + match[0].length;
          }
          if (at < node.value.length) children.push({ type: 'text', value: node.value.slice(at) });
        } else {
          visit(node);
          children.push(node);
        }
      }
      // Only phrasing nodes become links; container structure stays intact.
      parent.children = children as typeof parent.children;
    };
    visit(tree);
  };
}
