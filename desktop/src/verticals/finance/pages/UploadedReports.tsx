import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { PageHeader } from '../components/ui/PageHeader';
import { GlassCard } from '../components/ui/GlassCard';
import { Disclaimer } from '../components/ui/Disclaimer';
import { researchRead } from '../lib/research';
import { asResearchErrorMessage, researchUploadSymbol } from '../lib/researchSymbol';
import { useResearchSessions } from '../dsh/research-session';
import { useAiPage } from '../../../core/ai/pageContext';
import { FileText, Upload, RefreshCw, Download, ArrowUpRight } from 'lucide-react';

interface Report { document_id: string; title: string; symbol: string; has_parsed: boolean; extra: { parse_error?: string; evidence_error?: string } }
export function UploadedReports() {
  const [items, setItems] = useState<Report[] | null>(null);
  const [symbol, setSymbol] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const sessions = useResearchSessions();
  const uploadSymbol = researchUploadSymbol(symbol);
  const reload = async () => setItems((await researchRead<{ items: Report[] }>('/documents/uploads?limit=200')).items);
  useEffect(() => { void reload().catch(e => setError(asResearchErrorMessage(e))); }, []);
  const upload = async () => {
    if (!file || !uploadSymbol) { setError('请选择 PDF，并填写研报对应的 6 位 A 股代码'); return; }
    if (file.size > 32 * 1024 * 1024) { setError('研报不能超过 32 MB'); return; }
    setBusy(true); setError(''); setNotice('正在上传并整理研报，请稍候…');
    try {
      const report = await researchRead<Report>(`/documents/uploads?symbol=${encodeURIComponent(uploadSymbol)}&title=${encodeURIComponent(file.name)}`, { method: 'POST', headers: { 'Content-Type': 'application/pdf' }, body: file });
      setNotice(report.has_parsed && !report.extra.evidence_error ? '研报已就绪，可以开始研究。' : '原文件已保存，资料整理尚未完成，请查看下方处理状态。');
      await reload();
    } catch (e) { setNotice(''); setError(asResearchErrorMessage(e)); }
    finally { setBusy(false); }
  };
  useAiPage({ key: 'uploaded-reports', title: '我的研报', context: '已上传研报元数据（本次未附正文）：' + JSON.stringify(items), suggestions: ['阅读研报时应如何区分事实和作者判断？'] });
  return <div><PageHeader title="我的研报" subtitle="收藏有价值的资料，让每一次阅读成为研究的起点" actions={<button className="workspace-action" disabled={busy} onClick={() => void reload().catch(e => setError(asResearchErrorMessage(e)))}><RefreshCw size={14} />刷新列表</button>} />
    {/* 暂时隐藏研报归档入口，待明确用途后恢复。
    <div className="workspace-toolbar"><Link className="workspace-action" to="/my-reports/legacy">研报归档</Link></div>
    */}
    <GlassCard className="mb-6 !p-6"><div className="mb-5 flex items-center gap-3"><span className="rounded-xl bg-primary/10 p-3 text-primary"><Upload size={20} /></span><div><h2 className="font-semibold">添加研报</h2><p className="mt-1 text-xs text-muted-foreground">选择公司与 PDF 文件，开始整理你的研究资料</p></div></div>
      <div className="grid max-w-4xl grid-cols-1 gap-4 sm:grid-cols-[180px_minmax(0,1fr)_auto] sm:items-end">
      <label className="text-xs text-muted-foreground">公司代码<input className="workspace-field mt-2 block h-10 w-full" placeholder="例如 000933" value={symbol} disabled={busy} onChange={e => { setSymbol(e.target.value.trim()); setError(''); setNotice(''); }} /></label>
      <div className="min-w-0"><div className="mb-2 text-xs text-muted-foreground">PDF 研报</div><label className="relative flex h-10 min-w-0 cursor-pointer items-center gap-2 rounded-xl border border-border bg-background/50 px-3 transition-colors hover:border-primary/50 focus-within:ring-2 focus-within:ring-primary">
        <FileText size={16} className="shrink-0 text-primary" /><span className="min-w-0 flex-1 truncate text-sm" title={file?.name}>{file ? file.name : '选择 PDF 文件'}</span>{file && <span className="shrink-0 text-xs text-muted-foreground">{(file.size / 1024 / 1024).toFixed(1)} MB</span>}
        <input className="sr-only" type="file" accept="application/pdf,.pdf" aria-label="选择 PDF 研报" disabled={busy} onChange={e => { setFile(e.target.files?.[0] ?? null); setError(''); setNotice(''); }} />
      </label></div>
      <button className="workspace-action workspace-action-primary" disabled={busy || !file || !uploadSymbol} onClick={() => void upload()}><Upload />{busy ? '正在整理…' : '上传研报'}</button></div>
      <p className="mt-3 text-xs text-muted-foreground">支持 A 股公司研报，单个 PDF 不超过 32 MB。上传后可查看原文并继续提问。</p>
      {error ? <p role="alert" className="mt-3 text-sm text-destructive">{error}</p> : notice ? <p role="status" className="mt-3 text-sm text-muted-foreground">{notice}</p> : null}
    </GlassCard>
    <GlassCard className="!p-6"><h2 className="mb-4 font-semibold">我的资料<span className="ml-2 text-xs font-normal text-muted-foreground">{items?.length ?? 0}</span></h2>{!items ? <p role="status">正在读取研报…</p> : items.length === 0 ? <div className="flex min-h-52 flex-col items-center justify-center text-center"><FileText size={32} strokeWidth={1.25} className="mb-4 text-muted-foreground/50" /><p className="font-medium">收藏第一份研报</p><p className="mt-2 text-sm text-muted-foreground">上传后，你的研报会汇集在这里，随时阅读与继续研究。</p></div> : <div className="divide-y divide-border">{items.map(report => <div key={report.document_id} className="py-5">
      <h2 className="font-medium"><Link className="hover:text-primary" to={`/my-reports/read/${encodeURIComponent(report.document_id)}`}>{report.title}</Link></h2><p className="mt-1 text-xs text-muted-foreground">{report.symbol} · {report.has_parsed ? report.extra.evidence_error ? '正文已解析，证据索引失败' : '正文已解析' : '原件已保存，解析未完成'}</p>
      {(report.extra.parse_error || report.extra.evidence_error) && <p className="mt-2 text-xs text-destructive">{report.extra.parse_error || report.extra.evidence_error}</p>}
      <div className="mt-3 flex flex-wrap gap-2"><a className="workspace-action workspace-action-compact" target="_blank" rel="noreferrer" href={`/finance-research/documents/${report.document_id}/raw`}><Download />下载原件</a>
        {report.has_parsed && <button className="workspace-action workspace-action-compact" disabled={busy} onClick={() => { setBusy(true); void sessions.start(`请研究我上传的研报《${report.title}》，公司 ${report.symbol}，document_id=${report.document_id}。先读取该文档的 revision 与证据 Block，区分作者判断和已核实事实，再按问题推进研究。`).catch(e => setError(String(e))).finally(() => setBusy(false)); }}><ArrowUpRight />开始研究</button>}</div>
    </div>)}</div>}</GlassCard><Disclaimer /></div>;
}
