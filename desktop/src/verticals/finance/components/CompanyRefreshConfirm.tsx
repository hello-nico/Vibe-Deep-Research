import { useEffect, useState } from 'react';
import { ResearchLoading } from './ui/ResearchLoading';

type Proposal = {
  proposal_id: string; version: number; status: string;
  items: { item_id: string; label: string; description?: string; execution_status?: string; receipt?: { status?: string; result?: { status?: string; updated_fields?: number }; error?: { code: string; message: string } } }[];
};
async function request(body: Record<string, unknown>): Promise<Proposal> {
  const response = await fetch('/finance-maintenance-refresh', {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body),
  });
  const value = await response.json();
  if (!response.ok) throw new Error(value.detail || '维护请求失败');
  return value;
}

export function CompanyRefreshConfirm({ slug, version, title, onUpdated }: {
  slug: string; version?: string; title: string; onUpdated: () => void;
}) {
  const key = `finance-company-refresh:${slug}`;
  const [proposal, setProposal] = useState<Proposal | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  useEffect(() => {
    let active = true;
    const id = sessionStorage.getItem(key);
    if (id) void request({ operation: 'read', proposal_id: id }).then(value => { if (active) setProposal(value); })
      .catch(err => { if (active) setError(err.message); });
    return () => { active = false; };
  }, [key]);
  const prepare = async () => {
    setBusy(true); setError('');
    try {
      const value = await request({ operation: 'prepare', slug, version });
      sessionStorage.setItem(key, value.proposal_id); setProposal(value);
    } catch (err) { setError(err instanceof Error ? err.message : '未能准备刷新'); }
    finally { setBusy(false); }
  };
  const choose = async (approve: boolean) => {
    if (!proposal) return;
    setBusy(true); setError('');
    try {
      const value = await request({ operation: 'confirm', proposal_id: proposal.proposal_id, version: proposal.version, approve });
      setProposal(value);
      if (value.status === 'completed' || value.status === 'partial') onUpdated();
    } catch (err) { setError(err instanceof Error ? err.message : '结果尚未确认，请回查记录'); }
    finally { setBusy(false); }
  };
  const readBack = async () => {
    if (!proposal) return;
    setBusy(true); setError('');
    try { setProposal(await request({ operation: 'read', proposal_id: proposal.proposal_id })); }
    catch (err) { setError(err instanceof Error ? err.message : '回查失败'); }
    finally { setBusy(false); }
  };
  const statusText: Record<string, string> = {
    open: '请确认本次刷新', completed: '刷新动作已完成', rejected: '已取消，未刷新资料',
    partial: '部分完成，请查看逐项结果', executing: '正在刷新，可回查结果', unknown: '执行结果待核实，请先回查记录',
  };
  const canPrepare = !proposal || ['completed', 'rejected', 'partial'].includes(proposal.status);
  return <div className="flex max-w-md flex-col items-end gap-2">
    {canPrepare && <button className="workspace-action" disabled={busy || !version} onClick={() => void prepare()}>{busy ? '准备中…' : '刷新资料'}</button>}
    {proposal && <div className="rounded-xl border border-border bg-background p-3 text-sm" role="group" aria-label="公司资料刷新确认">
      <p className="font-medium">{title} · {statusText[proposal.status] || '请查看维护结果'}</p>
      {proposal.items.map(item => <div key={item.item_id} className="mt-2">
        <p>{item.label}</p><p className="text-xs text-muted-foreground">{item.description}</p>
        {item.receipt?.result && <p className="text-xs">{item.receipt.result.status === 'unavailable' ? '未获取新数据，已有内容和日期保留' : `${item.receipt.result.status === 'partial' ? '部分更新' : '已更新'} ${item.receipt.result.updated_fields ?? 0} 项接口数据`}</p>}
        {item.receipt?.error && <p className="text-xs text-destructive">{item.receipt.error.message}</p>}
      </div>)}
      <div className="mt-3 flex gap-2">
        {proposal.status === 'open' && <>
          <button className="workspace-action workspace-action-primary" disabled={busy} onClick={() => void choose(true)}>{busy ? '处理中…' : '确认刷新'}</button>
          <button className="workspace-action" disabled={busy} onClick={() => void choose(false)}>取消</button>
        </>}
        <button className="workspace-action" disabled={busy} onClick={() => void readBack()}>回查记录</button>
      </div>
    </div>}
    {error && <p role="alert" className="text-xs text-destructive">{error}</p>}
    {busy && <ResearchLoading compact title="正在处理资料刷新" sections={['财务', '估值']} />}
  </div>;
}
