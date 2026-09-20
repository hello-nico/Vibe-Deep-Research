import { mentionLabel, rememberMentionLabel } from './library';

const CITE = /(?:引用资料|引用议题|引用材料)：([^\n`]{1,200}?)\s+`((?:document:[a-f0-9]{32}(?:\/[^/?#\s<>]+\/[a-f0-9]{64})?|topic:[a-f0-9]{12}|(?:companies|industries|themes|comparisons)\/[^/\s?#<>]+))`(?:\s+parse_revision_id=\S+\s+parsed_content_sha256=\S+)?/g;

function hasCite(text: string): boolean {
  CITE.lastIndex = 0;
  const found = CITE.test(text);
  CITE.lastIndex = 0;
  return found;
}

function skipParent(node: Node): boolean {
  const parent = node.parentElement;
  if (!parent) return true;
  return Boolean(parent.closest('button, a, textarea, input, [data-research-mention]'));
}

function collectTextNodes(root: ParentNode): Text[] {
  const doc = root.ownerDocument;
  if (!doc) return [];
  const filter = doc.defaultView?.NodeFilter ?? NodeFilter;
  const walker = doc.createTreeWalker(root, filter.SHOW_TEXT, {
    acceptNode(node) {
      if (!node.nodeValue || skipParent(node)) return filter.FILTER_REJECT;
      return hasCite(node.nodeValue) ? filter.FILTER_ACCEPT : filter.FILTER_REJECT;
    },
  });
  const nodes: Text[] = [];
  for (let current = walker.nextNode(); current; current = walker.nextNode()) nodes.push(current as Text);
  return nodes;
}

function mentionButton(doc: Document, title: string, ref: string): HTMLButtonElement {
  rememberMentionLabel(ref, title);
  const button = doc.createElement('button');
  button.type = 'button';
  button.className = 'finance-citation';
  button.dataset.researchMention = 'true';
  button.dataset.ref = ref;
  button.dataset.citationLabel = title;
  button.textContent = mentionLabel(ref, title);
  button.setAttribute('aria-label', `打开资料：${title}`);
  return button;
}

/** Fold serialized 引用资料/议题/材料 tokens into citation chips. Identity stays in data-ref. */
export function markResearchMentions(root: ParentNode): void {
  const doc = root.ownerDocument;
  if (!doc?.defaultView) return;
  for (const node of collectTextNodes(root)) {
    const text = node.nodeValue || '';
    CITE.lastIndex = 0;
    if (!CITE.test(text)) continue;
    CITE.lastIndex = 0;
    const fragment = doc.createDocumentFragment();
    let cursor = 0;
    for (const match of text.matchAll(CITE)) {
      const index = match.index ?? 0;
      if (index > cursor) fragment.append(text.slice(cursor, index));
      fragment.append(mentionButton(doc, match[1]!.replace(/\s+/g, ' ').trim(), match[2]!));
      cursor = index + match[0].length;
    }
    if (cursor < text.length) fragment.append(text.slice(cursor));
    node.replaceWith(fragment);
  }
}
