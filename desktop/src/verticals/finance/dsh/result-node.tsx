import type { Context } from '@deepseek-ai/cordis';
import type { ChatNodeViewProps } from '@deepseek-ai/dsh-client-ui-chat/client';
import type {} from '@deepseek-ai/dsh-client-ui-renderer/client';
import { ResearchResult } from '../components/ResearchResult';
import { maintenanceDefinition, researchStatusDefinition, resultDefinition, type MaintenanceData } from './result-projection';

interface ResultData { resultId: string }
declare module '@deepseek-ai/dsh-client-ui-chat/client' {
  interface ChatNodeDataMap { 'finance-result': ResultData; 'finance-maintenance': MaintenanceData; 'finance-research-status': { text: string } }
}
function ResultNode({ node }: ChatNodeViewProps<'finance-result'>) {
  return <ResearchResult key={node.data.resultId} resultId={node.data.resultId} />;
}
export function installResultNode(ctx: Context) {
  ctx.uiConversation.events.register(resultDefinition);
  ctx.uiConversation.events.register(maintenanceDefinition);
  ctx.uiConversation.events.register(researchStatusDefinition);
  ctx.slots.inject('conversation.chat.node', () => ctx.slots.register({ name: 'conversation.chat.node', key: 'finance-research-status' }, ResearchStatusNode));
  ctx.slots.inject('conversation.chat.node', () => ctx.slots.register({ name: 'conversation.chat.node', key: 'finance-maintenance' }, MaintenanceNode));
  ctx.slots.inject('conversation.chat.node', () => ctx.slots.register({ name: 'conversation.chat.node', key: 'finance-result' }, ResultNode));
}

function ResearchStatusNode({ node }: ChatNodeViewProps<'finance-research-status'>) {
  return <p className="my-2 text-sm text-[var(--text-secondary)]">{node.data.text}</p>;
}

function MaintenanceNode({ node }: ChatNodeViewProps<'finance-maintenance'>) {
  return <details className="my-3 rounded-lg border border-[var(--border)] p-3 text-sm">
    <summary className="cursor-pointer">知识更新草案 · 待核对</summary>
    {node.data.question && <p className="mt-2 break-words">来自研究：{node.data.question}</p>}
    <p className="my-2 text-[var(--text-secondary)]">{node.data.rationale}</p>
    <div className="whitespace-pre-wrap break-words">{node.data.content}</div>
  </details>;
}
