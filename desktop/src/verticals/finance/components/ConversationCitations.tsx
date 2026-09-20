import { useEffect, useRef, type HTMLAttributes } from 'react';
import { EvidenceLink } from './EvidenceCard';
import { decodeEvidenceLink, loadEvidence } from '../lib/evidence';
import { citationReference, citationTitle, webCitationUrl } from '../lib/citationMarks';
import { markResearchMentions } from '../lib/researchMentions';
import './conversation-citations.css';

const GENERIC_CITATION_TITLES = new Set(['来源', '来源资料', '数据来源', '指标依据', '查看依据', '打开原文', 'tencent', 'hithink', 'sina']);

function meaningfulCitationTitle(value: string | undefined): string | null {
  const title = value?.replace(/\s+/g, ' ').trim() || '';
  return title && !GENERIC_CITATION_TITLES.has(title) && !/^(?:source|claim|evidence|provider|lookup):/.test(title) ? title : null;
}

function citationReferenceFromNode(node: HTMLElement): string | null {
  const candidates = [
    node.dataset.evidenceRef?.trim() || '',
    node instanceof HTMLAnchorElement ? node.getAttribute('href')?.trim() || '' : '',
    node.getAttribute('title')?.trim() || '',
  ];
  for (const raw of candidates) {
    const reference = decodeEvidenceLink(raw) ?? citationReference(raw);
    if (reference && !webCitationUrl(reference)) return reference;
  }
  return null;
}

function existingCitationTitle(node: HTMLElement): string | null {
  return meaningfulCitationTitle(node.dataset.citationLabel) ?? meaningfulCitationTitle(node.textContent || undefined);
}

function setCitationTitle(node: HTMLElement, reference: string, title: string): void {
  const label = citationTitle(reference, title);
  node.dataset.citationLabel = label;
  if (!node.children.length && node.textContent !== label) node.textContent = label;
  node.setAttribute('aria-label', `查看依据：${label}`);
  node.removeAttribute('title');
}

function internalCitationNodes(root: HTMLElement): HTMLElement[] {
  return [...root.querySelectorAll<HTMLElement>('button[data-evidence-ref], a[data-internal-citation][data-evidence-ref]')]
    .filter(node => !node.dataset.webCitation && citationReferenceFromNode(node) !== null);
}

function hydrateCitationTitles(root: HTMLElement, attempted: Set<string>, resolved: Map<string, string>, signal: AbortSignal): void {
  for (const node of internalCitationNodes(root)) {
    const reference = citationReferenceFromNode(node);
    if (!reference || existingCitationTitle(node)) continue;
    const knownTitle = resolved.get(reference);
    if (knownTitle) {
      setCitationTitle(node, reference, knownTitle);
      continue;
    }
    if (attempted.has(reference)) continue;
    attempted.add(reference);
    void loadEvidence(reference, signal).then(result => {
      // A claim's related evidence describes its support, not the claim's
      // title. Never promote the first related source into the正文 label.
      if (signal.aborted || result.related.length || !meaningfulCitationTitle(result.title)) return;
      resolved.set(reference, result.title);
      for (const current of internalCitationNodes(root)) {
        if (citationReferenceFromNode(current) === reference && !existingCitationTitle(current)) {
          setCitationTitle(current, reference, result.title);
        }
      }
    }).catch(() => {
      // The reference is already marked attempted; a failed read must not
      // create a retry loop while the conversation DOM is still streaming.
    });
  }
}

/**
 * Stamp native DSH links/buttons with a readable source label without moving them.
 * External links retain browser navigation; stock-ref links use the shared
 * evidence panel when the delegated click handler below sees them.
 */
export function markWebCitations(root: ParentNode): void {
  for (const node of root.querySelectorAll<HTMLAnchorElement>('a[href]')) {
    if (typeof HTMLAnchorElement !== 'undefined' && !(node instanceof HTMLAnchorElement)) continue;
    const rawHref = node.getAttribute('href') || '';
    const internal = decodeEvidenceLink(rawHref);
    if (internal) {
      const label = citationTitle(internal, node.textContent?.trim());
      node.dataset.internalCitation = 'true';
      delete node.dataset.webCitation;
      node.dataset.evidenceRef = internal;
      node.dataset.citationLabel = label;
      node.removeAttribute('title');
      node.setAttribute('aria-label', `查看依据：${label}`);
      continue;
    }
    const href = webCitationUrl(rawHref);
    if (!href) continue;
    const visibleText = node.textContent?.trim() || '';
    const metadataCandidate = node.getAttribute('title')?.trim() || node.getAttribute('aria-label')?.trim() || '';
    const metadataTitle = /^(?:查看依据|打开原文)(?:\s|：|$)/.test(metadataCandidate) ? '' : metadataCandidate;
    const explicitTitle = node.dataset.citationTitle || (!webCitationUrl(visibleText) ? visibleText : metadataTitle) || visibleText;
    const label = citationTitle(href);
    const previewTitle = meaningfulCitationTitle(explicitTitle);
    node.dataset.webCitation = 'true';
    node.dataset.evidenceRef = href;
    node.dataset.citationLabel = label;
    if (previewTitle && previewTitle !== label && !webCitationUrl(previewTitle)) node.dataset.citationTitle = previewTitle;
    else delete node.dataset.citationTitle;
    if (!node.children.length && node.textContent !== label) node.textContent = label;
    node.removeAttribute('title');
    node.target = '_blank';
    node.rel = 'noopener noreferrer';
    node.setAttribute('aria-label', `打开原文：${label}`);
  }
  for (const node of root.querySelectorAll<HTMLButtonElement>('code button[title], code button[data-evidence-ref]')) {
    // Capture DSH's exact identity before removing its native tooltip.
    // Subsequent passes read data-evidence-ref, never the visible label.
    const rawTitle = node.dataset.evidenceRef || node.getAttribute('title')?.trim() || '';
    const internal = citationReference(rawTitle);
    const href = internal ? null : webCitationUrl(rawTitle);
    if (!internal && !href) continue;
    const reference = internal ?? href!;
    const label = internal
      ? meaningfulCitationTitle(node.dataset.citationLabel) || meaningfulCitationTitle(node.textContent?.trim()) || citationTitle(reference)
      : citationTitle(reference);
    const previewTitle = node.dataset.citationTitle || meaningfulCitationTitle(node.textContent?.trim());
    node.dataset.evidenceRef = reference;
    node.dataset.citationLabel = label;
    if (href && previewTitle && previewTitle !== label && !webCitationUrl(previewTitle)) node.dataset.citationTitle = previewTitle;
    else delete node.dataset.citationTitle;
    if (!node.children.length && node.textContent !== label) node.textContent = label;
    node.removeAttribute('title');
    if (internal) {
      node.dataset.internalCitation = 'true';
      delete node.dataset.webCitation;
      node.setAttribute('aria-label', `查看依据：${label}`);
    } else {
      node.dataset.webCitation = 'true';
      delete node.dataset.internalCitation;
      node.setAttribute('aria-label', `打开原文：${label}`);
    }
  }
}

/** Citation presentation for a conversation surface, including native DSH tokens.
 * The author owns placement; this component never moves or infers references.
 * EvidenceProvider supplies the shared preview and detail panel.
 */
export function ConversationCitations({ className = '', ...props }: HTMLAttributes<HTMLElement>) {
  const root = useRef<HTMLElement>(null);
  useEffect(() => {
    const node = root.current;
    if (!node) return;
    const controller = new AbortController();
    const attempted = new Set<string>();
    const resolved = new Map<string, string>();
    const stamp = () => {
      markWebCitations(node);
      markResearchMentions(node);
      hydrateCitationTitles(node, attempted, resolved, controller.signal);
    };
    stamp();
    const observer = new MutationObserver(stamp);
    observer.observe(node, { subtree: true, childList: true });
    const onClick = (event: MouseEvent) => {
      const target = event.target instanceof Element ? event.target : null;
      const mention = target?.closest('[data-research-mention]');
      if (mention instanceof HTMLElement && node.contains(mention) && mention.dataset.ref) {
        event.preventDefault();
        window.dispatchEvent(new CustomEvent('finance-open-research-mention', { detail: mention.dataset.ref }));
        return;
      }
      const anchor = target?.closest('a[data-internal-citation]');
      if (!(anchor instanceof HTMLAnchorElement) || !node.contains(anchor)) return;
      event.preventDefault();
      window.dispatchEvent(new CustomEvent('finance-open-evidence', { detail: anchor.dataset.evidenceRef }));
    };
    node.addEventListener('click', onClick);
    return () => { controller.abort(); observer.disconnect(); node.removeEventListener('click', onClick); };
  }, []);
  return <section {...props} ref={root} className={`conversation-citations ${className}`} />;
}

export function ConversationCitation({ reference, number: _number, snapshot }: { reference: string; number: number; snapshot?: string }) {
  const label = citationTitle(reference);
  const web = webCitationUrl(reference);
  if (web) {
    return <a href={web} target="_blank" rel="noopener noreferrer" data-web-citation="true" data-evidence-ref={web} data-citation-label={label} aria-label={`打开原文：${label}`}>{label}</a>;
  }
  return <EvidenceLink reference={reference} snapshot={snapshot} citationLabel={label}>{label}</EvidenceLink>;
}
