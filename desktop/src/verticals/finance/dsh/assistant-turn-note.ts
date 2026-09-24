import { askNoteContent, askNoteTitle, visibleUserPrompt } from '../lib/taskTrajectory.ts';
import type { FinanceSidePanel } from './side-panel';

export function assistantTurnNote(input: {
  panel: FinanceSidePanel | null;
  sessionId: string;
  turnClosed: boolean;
  failed: boolean;
  users: readonly { content: readonly { type: string; text?: string }[] }[];
  closing: { status: string; blocks: readonly { kind: string; text?: string }[]; time: number } | null | undefined;
}): { title: string; content: string } | null {
  if (input.panel?.kind !== 'assistant' || input.panel.sessionId !== input.sessionId || !input.turnClosed || input.failed || input.closing?.status !== 'settled') return null;
  const question = visibleUserPrompt(input.users.flatMap(user => user.content.filter(block => block.type === 'text').map(block => block.text || '')).join('\n'));
  const answer = input.closing.blocks.filter(block => block.kind === 'text').map(block => block.text || '').join('\n').trim();
  if (!question || !answer) return null;
  return { title: askNoteTitle(question), content: askNoteContent({ question, answer, pageName: input.panel.pageName, finishedAt: input.closing.time }) };
}
