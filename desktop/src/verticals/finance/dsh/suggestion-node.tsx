import type { ChatNodeViewProps } from '@deepseek-ai/dsh-client-ui-chat/client';
import { useEffect, useState } from 'react';
import { ArrowUpRight } from 'lucide-react';
import './suggestion.css';
import { userFacingRuntimeError } from '../lib/userFacingError';
import { hydrateWatch, loadWatch } from '../lib/watchlist';
import { normalizeMarketSymbol } from '../lib/marketSymbol';
import {
  followSuggestedCompany,
  SuggestionChoiceNeeded,
  sendSuggestedQuestion,
  startSuggestedIndicator,
} from './suggestion-actions';
import { chainPath, createUserChain, defaultChainServices } from '../lib/chainPage';
import { researchRead } from '../lib/research';
import type { ChainSuggestion, CompanySuggestion, IndicatorSuggestion, QuestionSuggestion } from './result-projection';
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
      <span className="finance-suggest-status">{status === 'busy' ? '关注中' : status === 'done' ? '已关注' : '关注'}</span>
    </button>
    {error && <p role="alert" className="mt-2 text-xs text-destructive">{error}</p>}
  </li>;
}

/** 路由后才知道完整观察身份；显式点击登记，由 Backend 对 topic/key 幂等。 */
function IndicatorItem({ item }: { item: IndicatorSuggestion }) {
  const [status, setStatus] = useState<'idle' | 'busy' | 'done'>('idle');
  const [error, setError] = useState('');
  const run = async () => {
    if (status !== 'idle') return;
    setStatus('busy'); setError('');
    try { await startSuggestedIndicator(`${item.name}：${item.reason}`, item.tracking_item); setStatus('done'); }
    catch (cause) {
      setStatus('idle');
      setError(cause instanceof SuggestionChoiceNeeded ? '已有相近研究，未保存' : userFacingRuntimeError(cause, '没成功'));
    }
  };
  return <li>
    <button type="button" className="finance-suggest-row" aria-label={`开始观察 ${item.name}`} title={item.reason} disabled={status !== 'idle'} onClick={() => void run()}>
      <span className="finance-suggest-text">开始观察：{item.name}<small className="finance-suggest-why" data-observe-why="">{item.reason}</small></span>
      <span className="finance-suggest-status">{status === 'busy' ? '保存中' : status === 'done' ? '已在观察' : '开始观察'}</span>
    </button>
    {error && <p role="alert" className="mt-2 text-xs text-muted-foreground" data-observe-error="">{error}</p>}
  </li>;
}

/** 建这条产业链：点一下以已关注公司为底建链并进入；已建的显示「查看」（含重新打开的对话）。 */
function ChainItem({ item }: { item: ChainSuggestion }) {
  const [chainId, setChainId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  useEffect(() => {
    let live = true;
    researchRead<{ items?: { id: string; public_chain_id: string }[] }>('/wiki/user-chains').then(
      value => { const found = value.items?.find(row => row.public_chain_id === item.public_chain_id); if (live && found) setChainId(found.id); }, () => undefined);
    return () => { live = false; };
  }, [item.public_chain_id]);
  // 对话面板不一定在路由树里，沿用对象跳转事件进入链页。
  const open = (id: string) => window.dispatchEvent(new CustomEvent('finance-object-navigate', { detail: chainPath(id) }));
  const run = async () => {
    if (busy) return;
    if (chainId) { open(chainId); return; }
    setBusy(true); setError('');
    try { const id = await createUserChain(item.public_chain_id, defaultChainServices); setChainId(id); open(id); }
    catch (cause) { setError(userFacingRuntimeError(cause, '没成功')); }
    finally { setBusy(false); }
  };
  return <li>
    <button type="button" className="finance-suggest-row" aria-label={`${chainId ? '查看' : '建'}产业链 ${item.name}`} title={item.reason} disabled={busy} onClick={() => void run()}>
      <span className="finance-suggest-text">{item.name}<small className="finance-suggest-why" data-chain-why="">{item.reason}</small></span>
      <span className="finance-suggest-status">{busy ? '新建中' : chainId ? '查看' : '建这条产业链'}</span>
    </button>
    {error && <p role="alert" className="mt-2 text-xs text-muted-foreground" data-chain-error="">{error}</p>}
  </li>;
}

export function Suggest({ data, actions }: { data: VibeSuggest; actions?: SuggestActions }) {
  if (!data.items.length) return null;
  const title = data.type === 'question' ? '相关问题' : data.type === 'indicator' ? '开始观察' : data.type === 'chain' ? '产业链' : '相关公司';
  return <section className="finance-suggest" aria-label={title}>
    <p className="finance-suggest-title">{title}</p>
    <ul>
      {data.type === 'question' && data.items.map(item => actions
        ? <QuestionItem key={item.text} actions={actions} item={item} />
        : <li key={item.text} className="finance-suggest-row"><span className="finance-suggest-text" title={item.text}>{item.text}</span></li>)}
      {data.type === 'company' && data.items.map(item => actions
        ? <CompanyItem key={item.symbol} item={item} />
        : <li key={item.symbol} className="finance-suggest-row"><span className="finance-suggest-text" title={item.reason}>{item.symbol} · {item.reason}</span></li>)}
      {data.type === 'indicator' && data.items.map(item => actions
        ? <IndicatorItem key={item.tracking_item.tracking_key} item={item} />
        : <li key={item.tracking_item.tracking_key} className="finance-suggest-row"><span className="finance-suggest-text" title={item.reason}>{item.name} · {item.reason}</span></li>)}
      {data.type === 'chain' && data.items.map(item => actions
        ? <ChainItem key={item.public_chain_id} item={item} />
        : <li key={item.public_chain_id} className="finance-suggest-row"><span className="finance-suggest-text" title={item.reason}>{item.name} · {item.reason}</span></li>)}
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
