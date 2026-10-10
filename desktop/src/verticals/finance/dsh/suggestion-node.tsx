import type { ChatNodeViewProps } from '@deepseek-ai/dsh-client-ui-chat/client';
import { useEffect, useState } from 'react';
import { ArrowUpRight } from 'lucide-react';
import './suggestion.css';
import { userFacingRuntimeError } from '../lib/userFacingError';
import { hydrateWatch, loadWatch } from '../lib/watchlist';
import { normalizeMarketSymbol } from '../lib/marketSymbol';
import {
  followSuggestedCompany,
  sendSuggestedQuestion,
} from './suggestion-actions';
import type { CompanySuggestion, QuestionSuggestion } from './result-projection';
import type { VibeSuggest } from './vibe';

type Props = Pick<ChatNodeViewProps<'finance-suggestion'>, 'node' | 'inputActions' | 'useInput' | 'useSession'>;

export type SuggestActions = Pick<Props, 'inputActions' | 'useInput' | 'useSession'>;

function QuestionItem({ item, actions }: { item: QuestionSuggestion; actions: SuggestActions }) {
  const { inputActions, useInput, useSession } = actions;
  const draft = useInput(value => value.draft);
  const phase = useInput(value => value.phase);
  const running = useSession(value => value.running);
  const [sent, setSent] = useState(false);
  const blocked = running || phase !== 'plain' || Boolean(draft.trim());
  return <li>
    <button type="button" className="finance-suggest-row" aria-label={item.text} title={item.text} disabled={blocked || sent} onClick={() => {
      if (sendSuggestedQuestion(item.text, { draft, phase }, inputActions, running)) setSent(true);
    }}><span className="finance-suggest-text">{item.text}</span>{sent ? <span className="finance-suggest-status">已发出</span> : <ArrowUpRight className="finance-suggest-arrow" size={15} aria-hidden="true" />}</button>
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
  return <li>
    <button type="button" className="finance-suggest-row" aria-label={`关注 ${item.symbol}`} title={item.reason} disabled={status !== 'idle'} onClick={() => void run()}>
      <span className="finance-suggest-text"><span className="finance-suggest-symbol">{item.symbol}</span> · {item.reason}</span>
      <span className="finance-suggest-status">{status === 'busy' ? '关注中…' : status === 'done' ? '已关注' : '关注'}</span>
    </button>
    {error && <p role="alert" className="mt-2 text-xs text-destructive">{error}</p>}
  </li>;
}

export function Suggest({ data, actions }: { data: VibeSuggest; actions?: SuggestActions }) {
  if (!data.items.length) return null;
  const title = data.type === 'question' ? '相关问题' : '相关公司';
  return <section className="finance-suggest" aria-label={title}>
    <p className="finance-suggest-title">{title}</p>
    <ul>
      {data.type === 'question' && data.items.map(item => actions
        ? <QuestionItem key={item.text} actions={actions} item={item} />
        : <li key={item.text} className="finance-suggest-row"><span className="finance-suggest-text" title={item.text}>{item.text}</span></li>)}
      {data.type === 'company' && data.items.map(item => actions
        ? <CompanyItem key={item.symbol} item={item} />
        : <li key={item.symbol} className="finance-suggest-row"><span className="finance-suggest-text" title={item.reason}>{item.symbol} · {item.reason}</span></li>)}
    </ul>
  </section>;
}

/** Historical tool events remain readable, without reinstating their actions. */
export function SuggestionNode({ node }: Props) {
  if (node.data.type === 'indicator') return <section className="my-3 rounded-xl border border-border bg-card p-3.5 text-sm">
    <p className="mb-2 font-medium">曾建议观察</p>
    {node.data.items.map(item => <p key={item.tracking_item.tracking_key}>{item.name} · {item.reason}</p>)}
  </section>;
  return <Suggest data={node.data} />;
}
