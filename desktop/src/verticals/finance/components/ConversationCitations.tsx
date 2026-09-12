import type { HTMLAttributes } from 'react';
import { EvidenceLink } from './EvidenceCard';
import './conversation-citations.css';

/** Citation presentation for a conversation surface, including native DSH tokens.
 * The author owns placement; this component never moves or infers references.
 * EvidenceProvider supplies the shared preview and detail panel.
 */
export function ConversationCitations({ className = '', ...props }: HTMLAttributes<HTMLElement>) {
  return <section {...props} className={`conversation-citations ${className}`} />;
}

export function ConversationCitation({ reference, number, snapshot }: { reference: string; number: number; snapshot?: string }) {
  return <EvidenceLink reference={reference} snapshot={snapshot} citationNumber={number}>{number}</EvidenceLink>;
}
