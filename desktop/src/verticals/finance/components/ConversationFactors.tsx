import { useEffect, useState } from 'react';
import { loadConversationFactors, setFactorStatus, type ConversationFactor } from '../lib/driverCandidates';

/** 「对话里提到的因素」：每项一句为什么，三个胶囊「纳入」「排除」「观察」。纳入只标记，下次研究才算进模型。 */
export function ConversationFactors({ symbol, onResearch, researching }: { symbol: string; onResearch?: () => void; researching?: boolean }) {
  const [items, setItems] = useState<ConversationFactor[]>([]);
  const [excluding, setExcluding] = useState<string | null>(null);
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  const [failed, setFailed] = useState<string | null>(null);
  useEffect(() => {
    const controller = new AbortController();
    setItems([]);
    void loadConversationFactors(symbol, controller.signal).then(value => { if (!controller.signal.aborted) setItems(value); });
    return () => controller.abort();
  }, [symbol]);
  if (!items.length) return null;
  const choose = async (item: ConversationFactor, status: '纳入' | '排除' | '观察') => {
    setBusy(item.id); setFailed(null);
    try {
      const next = await setFactorStatus(symbol, item.id, status, status === '排除' ? reason : undefined);
      setItems(previous => previous.flatMap(row => row.id !== item.id ? [row] : next.status === '排除' ? [] : [{ ...row, ...next }]));
      setExcluding(null); setReason('');
    } catch (error) {
      console.warn('[finance/company-page] factor status failed', error);
      setFailed(item.id);
    } finally { setBusy(null); }
  };
  return <section className="card company-page-section company-page-factors" data-conversation-factors="" aria-label="对话里提到的因素">
    <h3 className="company-page-label">对话里提到的因素</h3>
    {items.map(item => <div key={item.id} className="company-page-factor" data-factor={item.id}>
      <p><b>{item.name}</b><span className="company-page-gap">{item.why}</span></p>
      {item.status === '候选' && <div className="company-page-factor-actions">
        <button type="button" className="btn btn-sm" disabled={busy === item.id} onClick={() => void choose(item, '纳入')}>纳入</button>
        <button type="button" className="btn btn-sm" disabled={busy === item.id} aria-expanded={excluding === item.id} onClick={() => { setExcluding(excluding === item.id ? null : item.id); setReason(''); }}>排除</button>
        <button type="button" className="btn btn-sm" disabled={busy === item.id} onClick={() => void choose(item, '观察')}>观察</button>
      </div>}
      {item.status === '候选' && excluding === item.id && <div className="company-page-factor-reason">
        <input type="text" value={reason} maxLength={60} placeholder="为什么不要它（可不填）" aria-label="排除理由" onChange={event => setReason(event.target.value)} />
        <button type="button" className="btn btn-sm" disabled={busy === item.id} onClick={() => void choose(item, '排除')}>确认排除</button>
      </div>}
      {item.status === '纳入' && <p className="company-page-factor-state" data-factor-state="included">已纳入，下次研究会算进模型{onResearch && <button type="button" className="company-page-link" disabled={researching} onClick={onResearch}>重新研究</button>}</p>}
      {item.status === '观察' && <p className="company-page-factor-state" data-factor-state="watching">已标为观察</p>}
      {failed === item.id && <p className="company-page-gap" role="status">没有保存成功，请稍后重试</p>}
    </div>)}
  </section>;
}
