import type { Root, RootContent, Link } from 'mdast';

/** Create once per answer: repeated sources keep their number across renders. */
export function createCitationMention(open: (reference: string) => void) {
  const numbers = new Map<string, number>();
  return (reference: string) => {
    if (!numbers.has(reference)) numbers.set(reference, numbers.size + 1);
    return { label: String(numbers.get(reference)), title: '查看依据', open: () => open(reference) };
  };
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
