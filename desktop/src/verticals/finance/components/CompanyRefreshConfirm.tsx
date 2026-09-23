import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { CircleAlert, Check, ExternalLink, RefreshCw, X } from 'lucide-react';
import './refresh-confirm.css';

type Proposal = {
  proposal_id: string; version: number; status: string;
  items: { item_id: string; label: string; description?: string;
    args?: { source?: { url?: string; title?: string; published_at?: string } };
    receipt?: { status?: string; result?: { status?: string; updated_fields?: number; added_sources?: number }; error?: { code: string; message: string } } }[];
};
type CheckRecord = {
  check_id: string; target_version: string; status: 'checking' | 'unchanged' | 'pending' | 'failed' | 'completed';
  checked_at?: string; recent?: boolean; source?: { url?: string; title?: string; published_at?: string };
  changes?: { kind: string; items: { metric?: string; period?: string; value?: string | number; unit?: string }[] }[];
  failed_sources?: string[]; error?: { code: string; message: string }; proposal?: Proposal;
};
type Busy = 'prepare' | 'confirm' | 'reject' | 'read' | null;
async function request<T>(body: Record<string, unknown>): Promise<T> {
  const response = await fetch('/finance-maintenance-refresh', {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body),
  });
  const value = await response.json();
  if (!response.ok) throw Object.assign(new Error(value.detail || '刷新没有成功，请重试'), { code: value.code || 'request_failed' });
  return value as T;
}

export function CompanyRefreshConfirm({ slug, version, title, onUpdated }: {
  slug: string; version?: string; title: string; onUpdated: () => void;
}) {
  return <RefreshConfirm page="company" slug={slug} version={version} title={title} onUpdated={onUpdated} />;
}

export function IndustryRefreshConfirm({ slug, version, title, onUpdated }: {
  slug: string; version?: string; title: string; onUpdated: () => void;
}) {
  return <RefreshConfirm page="industry" slug={slug} version={version} title={title} onUpdated={onUpdated} />;
}

function RefreshConfirm({ page, slug, version, title, onUpdated }: {
  page: 'company' | 'industry'; slug: string; version?: string; title: string; onUpdated: () => void;
}) {
  const [check, setCheck] = useState<CheckRecord | null>(null);
  const [proposal, setProposal] = useState<Proposal | null>(null);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState<Busy>(null);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState<{ title: string; detail: string } | null>(null);
  const [uncertain, setUncertain] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  const initiatedRef = useRef(false);
  const acceptCheck = (value: CheckRecord, announce: boolean) => {
    setCheck(value);
    if (value.proposal) {
      setProposal(value.proposal);
      if (value.proposal.status === 'open' && announce) setOpen(true);
    } else setProposal(null);
    if (announce && value.status === 'unchanged') {
      const time = value.checked_at ? new Date(value.checked_at).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' }) : '';
      setNotice({ title: page === 'industry' && value.source ? '统计来源已收录' : '暂无新增资料',
        detail: time ? `最近检查于 ${time}，现有资料保持原样。` : '现有资料保持原样。' });
    }
    if (announce && value.status === 'failed')
      setNotice({ title: '这次未能检查完', detail: '资料保持原样。可稍后重新点击“刷新资料”重试。' });
  };
  useEffect(() => {
    let active = true;
    setCheck(null); setProposal(null); setOpen(false); initiatedRef.current = false;
    void request<CheckRecord | null>({ operation: 'current', page, slug }).then(value => {
      if (active && !initiatedRef.current && value && value.target_version === version) acceptCheck(value, false);
    }).catch(() => { /* Existing page remains usable if check history is unavailable. */ });
    return () => { active = false; };
  }, [page, slug, version]);
  useEffect(() => {
    if (check?.status !== 'checking') return;
    let active = true;
    const poll = () => { void request<CheckRecord>({ operation: 'read_check', check_id: check.check_id }).then(value => {
      if (active) acceptCheck(value, initiatedRef.current && value.status !== 'checking');
    }).catch(() => { if (active) setNotice({ title: '暂时无法读取检查结果', detail: '检查仍可能在后台进行，请稍后重试。' }); }); };
    const timer = window.setInterval(poll, 2500);
    return () => { active = false; window.clearInterval(timer); };
  }, [check?.check_id, check?.status]);
  useEffect(() => {
    if (!open) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const id = window.setTimeout(() => dialogRef.current?.focus(), 0);
    return () => { window.clearTimeout(id); document.body.style.overflow = previousOverflow; };
  }, [open]);
  const close = () => {
    if (busy) return;
    setOpen(false);
    triggerRef.current?.focus();
  };
  const prepare = async () => {
    setBusy('prepare'); setError(''); setNotice(null);
    try {
      initiatedRef.current = true;
      const value = await request<CheckRecord>({ operation: 'prepare', page, slug, version });
      acceptCheck(value, value.status !== 'checking'); setUncertain(false);
    } catch (err) {
      const message = err instanceof Error ? err.message : '刷新没能开始，请重试';
      setNotice({ title: '资料检查未完成', detail: message });
    }
    finally { setBusy(null); }
  };
  const choose = async (approve: boolean) => {
    if (!proposal) return;
    setBusy(approve ? 'confirm' : 'reject'); setError('');
    if (approve) { setOpen(false); triggerRef.current?.focus(); }
    try {
      const value = await request<Proposal>({ operation: 'confirm', page, proposal_id: proposal.proposal_id, version: proposal.version, approve });
      setProposal(value); setUncertain(false);
      const wrote = value.items[0]?.receipt?.status === 'success';
      if (wrote) setCheck(previous => previous ? { ...previous, status: 'completed' } : previous);
      if (wrote) {
        if (approve) setNotice({ title: '资料已更新', detail: '刷新结果已记录。' });
        onUpdated();
      } else if (approve && value.status === 'partial') {
        setNotice({ title: '资料未能更新', detail: '现有资料保持原样，可重新检查。' });
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : '结果还在确认中，请稍后查看');
      if (approve) {
        setUncertain(true);
        setNotice({ title: '刷新结果确认中', detail: '稍后点“查看刷新结果”，先不要重复刷新。' });
      }
    }
    finally { setBusy(null); }
  };
  const readBack = async () => {
    if (!proposal) return;
    setBusy('read'); setError('');
    try {
      const value = await request<Proposal>({ operation: 'read', page, proposal_id: proposal.proposal_id });
      setProposal(value);
      setUncertain(value.status === 'open');
      if (value.items[0]?.receipt?.status === 'success') onUpdated();
    }
    catch (err) {
      const message = err instanceof Error ? err.message : '暂时查不到结果';
      if (open) setError(message);
      else setNotice({ title: '暂时查不到刷新结果', detail: message });
    }
    finally { setBusy(null); }
  };
  const statusText: Record<string, string> = {
    completed: '资料已更新', rejected: '已取消刷新',
    partial: '请查看刷新结果', executing: '正在更新资料', unknown: '结果确认中',
  };
  const pending = proposal && ['open', 'executing', 'unknown'].includes(proposal.status);
  const isChecking = busy === 'prepare' || check?.status === 'checking';
  const isUpdating = busy === 'confirm' || proposal?.status === 'executing';
  const source = page === 'industry' ? check?.source || proposal?.items[0]?.args?.source : undefined;
  const result = proposal?.items[0]?.receipt?.result;
  const receiptError = proposal?.items[0]?.receipt?.error;
  const modalTitle = busy === 'confirm' ? '正在更新资料' : busy === 'reject' ? '正在取消刷新' : proposal?.status === 'open'
    ? (page === 'industry' ? '确认添加统计来源' : '确认刷新财务与估值数据')
    : statusText[proposal?.status || ''] || '查看刷新结果';
  const resultText = page === 'industry'
    ? result?.added_sources ? `已向资料时间线追加 ${result.added_sources} 条统计来源。` : '没有新增统计来源，页面保持原样。'
    : result?.status === 'unavailable' ? '这次没取到新数据，页面保持原样。'
      : `已更新 ${result?.updated_fields ?? 0} 项数据。${check?.failed_sources?.length ? `未能检查：${check.failed_sources.join('、')}，原值保留。` : ''}`;
  const onDialogKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (event.key === 'Escape') { event.stopPropagation(); close(); return; }
    if (event.key !== 'Tab') return;
    const controls = Array.from(dialogRef.current?.querySelectorAll<HTMLElement>('button:not(:disabled), a[href]') || []);
    if (!controls.length) { event.preventDefault(); return; }
    const first = controls[0]!;
    const last = controls[controls.length - 1]!;
    if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
    else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
  };
  return <>
    <button ref={triggerRef} type="button" className={`workspace-action refresh-trigger${isChecking || isUpdating ? ' is-loading' : ''}`} disabled={!!busy || check?.status === 'checking' || (!pending && !version)}
      aria-busy={isChecking || isUpdating}
      onClick={() => { if (uncertain) { void readBack(); return; } if (pending) { setOpen(true); return; } void prepare(); }}>
      <RefreshCw className={isChecking || isUpdating ? 'animate-spin' : ''} />
      {isChecking ? '正在检查资料…'
        : busy === 'confirm' ? '正在更新资料…' : uncertain ? '查看刷新结果'
          : proposal?.status === 'executing' ? '查看刷新进度' : proposal?.status === 'unknown' ? '查看刷新结果'
            : proposal?.status === 'open' ? '继续确认刷新' : '刷新资料'}
    </button>
    {notice && createPortal(<div role="alert" className="refresh-notice">
      <span className="refresh-notice-icon"><CircleAlert aria-hidden="true" size={17} /></span>
      <div><strong>{notice.title}</strong><p>{notice.detail}</p></div>
      <button type="button" aria-label="关闭提示" onClick={() => setNotice(null)}><X size={16} /></button>
    </div>, document.body)}
    {open && proposal && createPortal(<div className="refresh-dialog-backdrop" onMouseDown={event => { if (event.target === event.currentTarget) close(); }}>
      <div ref={dialogRef} role="dialog" aria-modal="true" aria-labelledby="refresh-dialog-title" tabIndex={-1}
        className="refresh-dialog" onKeyDown={onDialogKeyDown}>
        <header className="refresh-dialog-header">
          <div><p className="refresh-dialog-kicker">{page === 'industry' ? '行业资料 · 来源更新' : '公司资料 · 数据更新'}</p>
            <h2 id="refresh-dialog-title">{modalTitle}</h2>
            <p className="refresh-dialog-subtitle">{title}</p></div>
          <button type="button" className="refresh-dialog-close" aria-label="关闭" disabled={!!busy} onClick={close}><X size={18} /></button>
        </header>
        {proposal.status === 'open' && busy !== 'confirm' && busy !== 'reject' ? <div className="refresh-dialog-body">
          <p className="refresh-dialog-lead">{page === 'industry' ? '本次将在资料时间线中追加以下来源：' : '本次检查发现以下数据变化：'}</p>
          <div className="refresh-source-card">
            <span className="refresh-source-label">{page === 'industry' ? '国家统计局 · 行业统计（表 3）' : '财务与估值数据'}</span>
            {source?.url ? <a href={source.url} target="_blank" rel="noreferrer" className="refresh-source-title">{source.title || proposal.items[0]?.label}<ExternalLink size={15} /></a>
              : <strong className="refresh-source-title">{proposal.items[0]?.label}</strong>}
            {source?.published_at && <span className="refresh-source-date">发布于 {source.published_at.replace(/^(\d{4})(\d{2})(\d{2})$/, '$1-$2-$3')}</span>}
          </div>
          {page === 'company' && !!check?.changes?.length && <div className="refresh-changes">{check.changes.map(group => <div key={group.kind}><strong>{group.kind === 'financial_facts' ? '财务' : '估值'}</strong><ul>{group.items.map((item, index) => <li key={`${item.metric}-${item.period}-${index}`}>{item.metric} · {item.period || '当前'}：{item.value} {item.unit}</li>)}</ul></div>)}</div>}
          {!!check?.failed_sources?.length && <p className="refresh-dialog-scope">未能检查：{check.failed_sources.join('、')}。这些数据将保留原值。</p>}
          <p className="refresh-dialog-scope">{page === 'industry' ? '只追加来源链接，研究内容保持不变。' : '只更新数据，研究内容和原文资料保持不变。'}</p>
        </div> : <div className="refresh-dialog-body" role="status" aria-live="polite">
          {busy === 'reject' ? <p className="refresh-dialog-state"><RefreshCw className="animate-spin" />正在取消…</p>
            : busy === 'read' ? <p className="refresh-dialog-state"><RefreshCw className="animate-spin" />正在查询结果…</p>
              : busy === 'confirm' || proposal.status === 'executing' ? <p className="refresh-dialog-state"><RefreshCw />资料更新中，可继续浏览本页。</p>
                : <><p className="refresh-dialog-state">{['unknown', 'partial'].includes(proposal.status) ? <CircleAlert /> : <Check />}{statusText[proposal.status] || '请查看刷新结果'}</p>
                {result && <p className="refresh-dialog-detail">{resultText}</p>}
                {receiptError && <p className="refresh-dialog-detail text-destructive">{receiptError.message}</p>}</>}
        </div>}
        {error && <p role="alert" className="refresh-dialog-error">{error}</p>}
        <footer className="refresh-dialog-footer">
          {busy ? <span className="refresh-dialog-wait">正在处理…</span>
            : proposal.status === 'open' ? <><button type="button" className="workspace-action" onClick={() => void choose(false)}>取消</button>
              <button type="button" className="workspace-action workspace-action-primary" onClick={() => void choose(true)}>{page === 'industry' ? '确认添加来源' : '确认刷新'}</button></>
              : <><button type="button" className="workspace-action" onClick={close}>关闭</button>
                {['executing', 'unknown', 'partial'].includes(proposal.status) && <button type="button" className="workspace-action workspace-action-primary" onClick={() => void readBack()}>查看结果</button>}</>}
        </footer>
      </div>
    </div>, document.body)}
  </>;
}
