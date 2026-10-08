import { fromMarkdown } from 'mdast-util-from-markdown';
import type { Nodes } from 'mdast';
import type { ReactNode } from 'react';

export const INLINE_RESULT_RENDERER = Symbol.for('vibe.finance.inline-result');
type Renderer = (reference: string) => ReactNode;
const host = globalThis as typeof globalThis & { [INLINE_RESULT_RENDERER]?: Renderer };

export function resultReference(value: unknown): value is string {
  return typeof value === 'string' && /^result:[0-9a-f]{32}$/.test(value);
}

/** C1 markers are standalone image paragraphs, not prose or code examples. */
export function inlineResultReferences(markdown: string): Set<string> {
  const references = new Set<string>();
  const visit = (node: Nodes) => {
    if (node.type === 'paragraph') {
      const children = node.children.filter(child => child.type !== 'text' || child.value.trim() !== '');
      const image = children.length === 1 ? children[0] : undefined;
      if (image?.type === 'image' && resultReference(image.url)) references.add(image.url);
    }
    if ('children' in node) node.children.forEach(visit);
  };
  visit(fromMarkdown(markdown));
  return references;
}

export function registerInlineResultRenderer(render: Renderer) {
  const registered: Renderer = reference => resultReference(reference) ? render(reference) : null;
  host[INLINE_RESULT_RENDERER] = registered;
  return () => { if (host[INLINE_RESULT_RENDERER] === registered) delete host[INLINE_RESULT_RENDERER]; };
}
