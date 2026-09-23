import type { Context } from '@deepseek-ai/cordis';
import type { ChatNodeViewProps } from '@deepseek-ai/dsh-client-ui-chat/client';
import type {} from '@deepseek-ai/dsh-client-ui-renderer/client';
import { ResearchResult } from '../components/ResearchResult';
import { WikiDraftPublish } from '../components/WikiDraftPublish';
import { maintenanceDefinition, researchStatusDefinition, resultDefinition, topicCandidateDefinition, type MaintenanceData, type TopicCandidateData } from './result-projection';
import { adoptCandidate, CANDIDATE_CHANGED, CandidateChoiceNeeded, disposeCandidate, loadCandidate, type TopicCandidate } from '../lib/memory';
import type { ResearchTopicRouteCandidate } from '../lib/research';
import { useEffect, useState } from 'react';

interface ResultData { resultId: string }
declare module '@deepseek-ai/dsh-client-ui-chat/client' {
  interface ChatNodeDataMap {
    'finance-result': ResultData; 'finance-maintenance': MaintenanceData;
    'finance-research-status': { text: string }; 'finance-topic-candidate': TopicCandidateData;
  }
}
function ResultNode({ node }: Pick<ChatNodeViewProps<'finance-result'>, 'node'>) {
  return <ResearchResult key={node.data.resultId} resultId={node.data.resultId} />;
}
export function installResultNode(ctx: Context) {
  ctx.uiConversation.events.register(resultDefinition);
  ctx.uiConversation.events.register(maintenanceDefinition);
  ctx.uiConversation.events.register(researchStatusDefinition);
  ctx.uiConversation.events.register(topicCandidateDefinition);
  ctx.slots.inject('conversation.chat.node', () => ctx.slots.register({ name: 'conversation.chat.node', key: 'finance-research-status' }, ResearchStatusNode));
  ctx.slots.inject('conversation.chat.node', () => ctx.slots.register({ name: 'conversation.chat.node', key: 'finance-maintenance' }, MaintenanceNode));
  ctx.slots.inject('conversation.chat.node', () => ctx.slots.register({ name: 'conversation.chat.node', key: 'finance-topic-candidate' }, TopicCandidateNode));
  ctx.slots.inject('conversation.chat.node', () => ctx.slots.register({ name: 'conversation.chat.node', key: 'finance-result' }, ResultNode));
}

function ResearchStatusNode({ node }: Pick<ChatNodeViewProps<'finance-research-status'>, 'node'>) {
  return <p className="my-2 text-sm text-[var(--text-secondary)]">{node.data.text}</p>;
}

function MaintenanceNode({ node }: Pick<ChatNodeViewProps<'finance-maintenance'>, 'node'>) {
  return <details className="my-3 rounded-lg border border-[var(--border)] p-3 text-sm">
    <summary className="cursor-pointer">知识更新草案 · 待核对</summary>
    {node.data.question && <p className="mt-2 break-words">来自研究：{node.data.question}</p>}
    <p className="my-2 text-[var(--text-secondary)]">{node.data.rationale}</p>
    <div className="whitespace-pre-wrap break-words">{node.data.content}</div>
    {node.data.draftToken && <WikiDraftPublish draftToken={node.data.draftToken} />}
  </details>;
}

function TopicCandidateNode({ node }: Pick<ChatNodeViewProps<'finance-topic-candidate'>, 'node'>) {
  const [status, setStatus] = useState(node.data.status || 'open');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState('');
  const [editing, setEditing] = useState(false);
  const [question, setQuestion] = useState(node.data.question);
  const [choices, setChoices] = useState<ResearchTopicRouteCandidate[]>([]);
  const apply = (item: TopicCandidate) => {
    setStatus(item.status || 'open');
    setQuestion(item.question);
    setChoices([]);
  };
  useEffect(() => {
    let active = true;
    const reload = () => { void loadCandidate(node.data.id).then(item => { if (active && item?.status) apply(item); }).catch(() => {}); };
    reload();
    const onChange = (event: Event) => {
      const id = (event as CustomEvent<{ id?: string }>).detail?.id;
      if (!id || id === node.data.id) reload();
    };
    window.addEventListener(CANDIDATE_CHANGED, onChange);
    return () => { active = false; window.removeEventListener(CANDIDATE_CHANGED, onChange); };
  }, [node.data.id]);
  const run = async (action: 'adopt' | 'ignore', topicId?: string) => {
    if (busy || status !== 'open') return;
    setBusy(action); setError('');
    try {
      const payload = { ...node.data, question: question.trim() || node.data.question };
      const next = action === 'adopt' ? await adoptCandidate(payload, topicId) : await disposeCandidate(node.data.id, 'ignored');
      apply(next);
    } catch (err) {
      if (err instanceof CandidateChoiceNeeded) setChoices(err.candidates);
      else setError(err instanceof Error ? err.message : '操作失败');
    } finally { setBusy(''); }
  };
  return <div className="my-3 rounded-lg border border-[var(--border)] p-3 text-sm">
    <p className="font-medium">建议持续研究：{question}</p>
    <p className="mt-2 text-[var(--text-secondary)]">{node.data.reason}</p>
    {node.data.match_topic_id && <p className="mt-1 text-xs">可复用已有议题</p>}
    {editing && status === 'open' && <textarea className="workspace-field mt-2 min-h-16 w-full" value={question} onChange={event => setQuestion(event.target.value)} />}
    {choices.length > 0 && <div className="mt-3 space-y-2">
      <p className="text-xs">选择要继续的议题：</p>
      {choices.map(item => <button key={item.topic_id} type="button" className="workspace-action" disabled={Boolean(busy)} onClick={() => void run('adopt', item.topic_id)}>{item.title}</button>)}
    </div>}
    {status === 'open' ? <div className="mt-3 flex flex-wrap gap-2">
      <button type="button" className="workspace-action" disabled={Boolean(busy)} onClick={() => void run('adopt')}>{busy === 'adopt' ? '采用中…' : (editing ? '保存并采用' : '采用')}</button>
      <button type="button" className="workspace-action" disabled={Boolean(busy)} onClick={() => setEditing(value => !value)}>{editing ? '取消编辑' : '编辑后采用'}</button>
      <button type="button" className="workspace-action" disabled={Boolean(busy)} onClick={() => void run('ignore')}>{busy === 'ignore' ? '处理中…' : '忽略'}</button>
    </div> : <p className="mt-2 text-xs">{status === 'adopted' ? '已采用，可在我的研究中打开议题' : '已忽略'}</p>}
    {error && <p role="alert" className="mt-2 text-xs text-destructive">{error}</p>}
  </div>;
}
