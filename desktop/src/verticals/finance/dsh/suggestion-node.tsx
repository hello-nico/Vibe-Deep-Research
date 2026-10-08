import type { ChatNodeViewProps } from '@deepseek-ai/dsh-client-ui-chat/client';
import { useEffect, useState } from 'react';
import { userFacingRuntimeError } from '../lib/userFacingError';
import { hydrateWatch, loadWatch } from '../lib/watchlist';
import { normalizeMarketSymbol } from '../lib/marketSymbol';
import {
  followSuggestedCompany,
  sendSuggestedQuestion,
  startSuggestedIndicator,
  SuggestionChoiceNeeded,
} from './suggestion-actions';
import type { CompanySuggestion, IndicatorSuggestion, QuestionSuggestion } from './result-projection';

type Props = Pick<ChatNodeViewProps<'finance-suggestion'>, 'node' | 'inputActions' | 'useInput' | 'useSession'>;

function QuestionItem({ item, inputActions, useInput, useSession }: Props & { item: QuestionSuggestion }) {
  const draft = useInput(value => value.draft);
  const phase = useInput(value => value.phase);
  const running = useSession(value => value.running);
  const [sent, setSent] = useState(false);
  const blocked = running || phase !== 'plain' || Boolean(draft.trim());
  return <li className="rounded-xl border border-border bg-card p-3">
    <p className="leading-6">{item.text}</p>
    <button type="button" className="workspace-action mt-2" disabled={blocked || sent} onClick={() => {
      if (sendSuggestedQuestion(item.text, { draft, phase }, inputActions, running)) setSent(true);
    }}>{sent ? '已发出' : '继续问'}</button>
  </li>;
}

function CompanyItem({ item }: { item: CompanySuggestion }) {
  const [status, setStatus] = useState<'idle' | 'busy' | 'done'>('idle');
  const [error, setError] = useState('');
  // Already-watched companies show as done; the watch list is product Client data, read here rather than by the plugin.
  useEffect(() => {
    let live = true;
    const code = normalizeMarketSymbol(item.symbol);
    hydrateWatch().catch(() => undefined).then(() => {
      if (live && code && loadWatch().includes(code)) setStatus(current => current === 'idle' ? 'done' : current);
    });
    return () => { live = false; };
  }, [item.symbol]);
  const run = async () => {
    if (status !== 'idle') return;
    setStatus('busy'); setError('');
    try { await followSuggestedCompany(item.symbol); setStatus('done'); }
    catch (cause) { setStatus('idle'); setError(userFacingRuntimeError(cause, '关注失败')); }
  };
  return <li className="rounded-xl border border-border bg-card p-3">
    <p className="font-medium">{item.symbol}</p>
    <p className="mt-1 leading-6 text-muted-foreground">{item.reason}</p>
    <button type="button" className="workspace-action mt-2" disabled={status !== 'idle'} onClick={() => void run()}>{status === 'busy' ? '关注中…' : status === 'done' ? '已关注' : '关注'}</button>
    {error && <p role="alert" className="mt-2 text-xs text-destructive">{error}</p>}
  </li>;
}

function IndicatorItem({ item, question }: { item: IndicatorSuggestion; question: string }) {
  const [status, setStatus] = useState<'idle' | 'busy' | 'done'>('idle');
  const [error, setError] = useState('');
  const [choices, setChoices] = useState<{ topic_id: string; title: string }[]>([]);
  const run = async (topicId?: string) => {
    if (status === 'busy' || status === 'done') return;
    setStatus('busy'); setError('');
    try {
      await startSuggestedIndicator(question, item.tracking_item, topicId);
      setChoices([]); setStatus('done');
    } catch (cause) {
      setStatus('idle');
      if (cause instanceof SuggestionChoiceNeeded) setChoices(cause.candidates);
      else setError(userFacingRuntimeError(cause, '开始观察失败'));
    }
  };
  return <li className="rounded-xl border border-border bg-card p-3">
    <p className="font-medium">{item.name}</p>
    <p className="mt-1 leading-6 text-muted-foreground">{item.reason}</p>
    {choices.length > 0 && <div className="mt-2 flex flex-wrap gap-2">
      <p className="w-full text-xs text-muted-foreground">选择要继续观察的研究：</p>
      {choices.map(choice => <button key={choice.topic_id} type="button" className="workspace-action" disabled={status === 'busy'} onClick={() => void run(choice.topic_id)}>{choice.title}</button>)}
    </div>}
    {choices.length === 0 && <button type="button" className="workspace-action mt-2" disabled={status !== 'idle'} onClick={() => void run()}>{status === 'busy' ? '处理中…' : status === 'done' ? '已开始观察' : '开始观察'}</button>}
    {error && <p role="alert" className="mt-2 text-xs text-destructive">{error}</p>}
  </li>;
}

export function SuggestionNode(props: Props) {
  const { node } = props;
  const title = node.data.type === 'question' ? '可以继续追问' : node.data.type === 'indicator' ? '值得继续观察' : '相关公司';
  return <section className="my-3 rounded-2xl border border-primary/20 bg-primary/[0.04] p-3.5 text-sm">
    <p className="mb-2 font-medium">{title}</p>
    <ul className="space-y-2">
      {node.data.type === 'question' && node.data.items.map(item => <QuestionItem key={item.text} {...props} item={item} />)}
      {node.data.type === 'company' && node.data.items.map(item => <CompanyItem key={item.symbol} item={item} />)}
      {node.data.type === 'indicator' && node.data.items.map(item => <IndicatorItem key={item.tracking_item.tracking_key} item={item} question={node.data.question} />)}
    </ul>
  </section>;
}
