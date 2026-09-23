import { useEffect, useLayoutEffect, useRef, useState, type DragEvent } from 'react';
import { createPortal } from 'react-dom';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { FileText, LayoutGrid, List, MoreHorizontal, Upload } from 'lucide-react';
import { PageHeader } from '../components/ui/PageHeader';
import { Disclaimer } from '../components/ui/Disclaimer';
import { GlassCard } from '../components/ui/GlassCard';
import { DashboardPanel, DashboardTable } from '../components/ui/DashboardPanel';
import { DashboardCard } from '../components/IndustryDashboardCard';
import { WorkspaceSelect } from '../components/ui/WorkspaceSelect';
import { useAiPage } from '../../../core/ai/pageContext';
import { asResearchErrorMessage } from '../lib/researchSymbol';
import { prefGet, prefSet } from '../lib/prefs';
import { workspaceSelectMenuBox } from '../lib/workspaceSelect';
import { cn } from '@/lib/utils';
import {
  LIBRARY_BATCH_MAX, LIBRARY_CONCURRENCY, LIBRARY_MAX_BYTES,
  libraryCiteFromItem, libraryFileKind, libraryKindFromItem, libraryNeedsRetry, librarySizeLabel, libraryStatusLabel, librarySummary, libraryUploadError,
  hideLibraryDocument, listLibraryDocuments, mapPool, renameLibraryDocument, requestLibraryCite, retryLibraryDocument, uploadLibraryFile,
  type LibraryDocument,
} from '../lib/library';
import './library-page.css';

const VIEW_KEY = 'vr-library-view';
const TYPE_FILTERS = [
  { value: 'all', label: '全部类型' }, { value: 'pdf', label: 'PDF' }, { value: 'text', label: 'TXT' }, { value: 'markdown', label: 'MD' },
] as const;
const STATUS_FILTERS = [
  { value: 'all', label: '全部状态' }, { value: 'ready', label: '可引用' }, { value: 'processing', label: '处理中' }, { value: 'failed', label: '失败' },
] as const;

interface QueueItem { id: string; name: string; status: 'pending' | 'uploading' | 'saved' | 'failed'; detail: string }

export function UploadedReports() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const [query, setQuery] = useState('');
  const [type, setType] = useState<(typeof TYPE_FILTERS)[number]['value']>('all');
  const [status, setStatus] = useState<(typeof STATUS_FILTERS)[number]['value']>('all');
  const [view, setView] = useState<'grid' | 'list'>(() => prefGet(VIEW_KEY) === 'list' ? 'list' : 'grid');
  const [items, setItems] = useState<LibraryDocument[] | null>(null);
  const [total, setTotal] = useState(0);
  const [offset, setOffset] = useState(0);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);
  const [uploadOpen, setUploadOpen] = useState(false);
  const [symbol, setSymbol] = useState('');
  const [queue, setQueue] = useState<QueueItem[]>([]);
  const [dropActive, setDropActive] = useState(false);
  const [menuId, setMenuId] = useState('');
  const [renameId, setRenameId] = useState('');
  const [renameTitle, setRenameTitle] = useState('');
  const [hideId, setHideId] = useState('');
  const [hiding, setHiding] = useState(false);
  const [retryingId, setRetryingId] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);

  const changeView = (next: 'grid' | 'list') => { setView(next); void prefSet(VIEW_KEY, next); };
  const openItem = (id: string) => {
    navigate(`/my-reports/read/${encodeURIComponent(id)}?from=${encodeURIComponent('/my-reports')}`);
  };

  const load = async (nextOffset = 0, append = false, signal?: AbortSignal) => {
    const page = await listLibraryDocuments({ limit: 50, offset: nextOffset, query, contentType: type, status, signal });
    setTotal(page.total);
    setOffset(page.offset);
    setItems(current => append ? [...(current || []), ...page.items] : page.items);
  };

  useEffect(() => {
    const doc = params.get('doc');
    if (!doc) return;
    navigate(`/my-reports/read/${encodeURIComponent(doc)}?from=${encodeURIComponent('/my-reports')}`, { replace: true });
  }, [navigate, params]);

  useEffect(() => {
    const controller = new AbortController();
    setItems(null); setError('');
    void load(0, false, controller.signal).catch(err => { if (!controller.signal.aborted) setError(asResearchErrorMessage(err)); });
    return () => controller.abort();
  }, [query, type, status]);

  const processing = Boolean(items?.some(item => !item.has_parsed && !item.extra.parse_error && item.extra.process_status !== 'failed'));
  useEffect(() => {
    if (!processing) return;
    const timer = window.setInterval(() => { void load(0, false).catch(() => undefined); }, 5000);
    return () => window.clearInterval(timer);
  }, [processing, query, type, status]);

  useAiPage({
    key: 'uploaded-reports', title: '我的资料',
    context: '已上传资料元数据（本次未附正文）：' + JSON.stringify((items || []).map(item => ({ title: item.title, id: item.document_id, type: item.extra.content_type, status: item.extra.process_status }))),
    suggestions: ['阅读资料时应如何区分事实和作者判断？', '这些资料分别适合回答什么问题？'],
  });

  const enqueue = (files: File[]) => {
    const chosen = files.slice(0, LIBRARY_BATCH_MAX);
    if (!chosen.length) return;
    setUploadOpen(true);
    setQueue(current => [
      ...current,
      ...chosen.map(file => ({ id: `${file.name}:${file.size}:${file.lastModified}`, name: file.name, status: 'pending' as const, detail: libraryFileKind(file) ? librarySizeLabel(file.size) : '格式不受支持' })),
    ]);
    void runUploads(chosen);
  };

  const runUploads = async (files: File[]) => {
    setBusy(true); setError(''); setNotice('将保存到我的资料。');
    await mapPool(files, LIBRARY_CONCURRENCY, async file => {
      const id = `${file.name}:${file.size}:${file.lastModified}`;
      const fail = (detail: string) => setQueue(current => current.map(item => item.id === id ? { ...item, status: 'failed', detail } : item));
      if (file.size > LIBRARY_MAX_BYTES) { fail('文件不能超过 32 MB'); return; }
      if (!libraryFileKind(file)) { fail('仅支持 PDF、TXT 或 Markdown'); return; }
      setQueue(current => current.map(item => item.id === id ? { ...item, status: 'uploading', detail: '正在保存…' } : item));
      try {
        const saved = await uploadLibraryFile(file, symbol);
        setQueue(current => current.map(item => item.id === id ? { ...item, status: 'saved', detail: saved.has_parsed ? '已保存到我的资料，可引用' : '已保存到我的资料，正文尚未就绪' } : item));
      } catch (err) {
        fail(libraryUploadError(err));
      }
    });
    setBusy(false);
    try { await load(0, false); } catch (err) { setError(asResearchErrorMessage(err)); }
  };

  const cite = (targets: LibraryDocument[]) => {
    const pending = targets.filter(item => !item.has_parsed);
    const result = requestLibraryCite(targets.map(libraryCiteFromItem));
    if (result.status === 'inserted') {
      void navigate('/');
      setNotice(pending.length
        ? '资料已经保存；正文尚未就绪的资料发送前请先移除或等待处理完成。'
        : '资料已经保存。');
      return;
    }
    if (result.status === 'queued') {
      void navigate('/');
      setNotice('资料已经保存。正在打开对话。');
      return;
    }
    setNotice('无法放入当前输入框。引用已保留，请打开深度对话后再次引用，或用 @ 选择同一份资料。');
  };

  const retry = (item: LibraryDocument) => {
    setMenuId('');
    setRetryingId(item.document_id);
    setNotice('正在重试处理…');
    void retryLibraryDocument(item.document_id)
      .then(saved => {
        setNotice(saved.has_parsed ? '已重新处理，可引用正文。' : '已重新提交处理，请稍后查看状态。');
        return load(0, false);
      })
      .catch(err => setError(asResearchErrorMessage(err)))
      .finally(() => setRetryingId(''));
  };

  const onDrop = (event: DragEvent) => {
    event.preventDefault(); setDropActive(false);
    enqueue(Array.from(event.dataTransfer.files || []));
  };

  const empty = items && items.length === 0 && !query && type === 'all' && status === 'all';

  return <div className="library-page">
    <PageHeader title="我的资料" subtitle="上传 PDF、TXT 或 Markdown，阅读原文并用 @ 引用到深度对话。"
      actions={<button className="workspace-action workspace-action-primary" onClick={() => setUploadOpen(true)}><Upload size={14} />上传资料</button>} />
    <div className="mb-4 flex flex-wrap items-center gap-2">
      <input className="workspace-field min-w-0 flex-1" value={query} placeholder="搜索资料" aria-label="搜索资料" onChange={event => setQuery(event.target.value)} />
      <WorkspaceSelect aria-label="按类型筛选" value={type} onChange={setType} options={TYPE_FILTERS} />
      <WorkspaceSelect aria-label="按处理状态筛选" value={status} onChange={setStatus} options={STATUS_FILTERS} />
      <div role="tablist" aria-label="资料视图" className="flex shrink-0 rounded-full border border-border p-0.5">
        {([['grid', LayoutGrid, '卡片'], ['list', List, '列表']] as const).map(([id, Icon, label]) => (
          <button key={id} type="button" role="tab" aria-label={label} aria-selected={view === id} className={cn('rounded-full p-2 text-muted-foreground', view === id && 'bg-muted text-foreground')} onClick={() => changeView(id)}>
            <Icon size={16} />
          </button>
        ))}
      </div>
    </div>
    <p className="mb-3 text-[11px] text-muted-foreground">{items === null ? '正在读取资料…' : `共 ${total} 份`}</p>
    {error ? <p role="alert" className="text-sm text-destructive">{error}</p> : notice ? <p role="status" className="text-sm text-muted-foreground">{notice}</p> : null}
    {items === null ? <GlassCard><p role="status" className="py-12 text-center text-sm text-muted-foreground">正在读取资料…</p></GlassCard>
      : empty ? <label className="library-empty library-drop" data-active={dropActive} onDragOver={event => { event.preventDefault(); setDropActive(true); }} onDragLeave={() => setDropActive(false)} onDrop={onDrop}>
        <FileText size={32} strokeWidth={1.25} className="mb-4 text-muted-foreground/50" />
        <p className="font-medium">把第一份资料放到这里</p>
        <p className="mt-2 text-sm text-muted-foreground">支持 PDF、UTF-8 的 TXT / MD，单个不超过 32 MB。也可点击上传。</p>
        <input ref={fileRef} className="sr-only" type="file" multiple accept=".pdf,.txt,.md,application/pdf,text/plain,text/markdown" onChange={event => { enqueue(Array.from(event.target.files || [])); event.target.value = ''; }} />
        <button type="button" className="workspace-action workspace-action-primary mt-4" onClick={() => fileRef.current?.click()}>选择文件</button>
      </label>
      : items.length === 0 ? <GlassCard><p className="py-12 text-center text-sm text-muted-foreground">没有符合条件的资料。试试其他关键词，或清空类型和状态筛选。</p></GlassCard>
      : view === 'grid' ? <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">{items.map(item => (
        <DashboardCard
          key={item.document_id}
          title={item.title || '未命名资料'}
          description={librarySummary(item)}
          footer={item.has_parsed ? '打开资料' : '正文尚未就绪'}
          icon={FileText}
          onClick={() => openItem(item.document_id)}
        />
      ))}</div>
      : <DashboardPanel title="资料总览" icon={FileText} count={total}>
        <DashboardTable columns={['名称', '类型', '状态', '时间', '']}>
          {items.map(item => (
            <tr key={item.document_id} className="border-b border-border/30">
              <td className="px-2 py-2.5">
                <button type="button" className="text-left hover:text-primary" onClick={() => openItem(item.document_id)}>
                  <span className="block font-medium">{item.title || '未命名资料'}</span>
                  <span className="mt-0.5 block max-w-xl truncate text-xs text-muted-foreground">{librarySummary(item)}</span>
                </button>
              </td>
              <td className="px-2 py-2.5 text-xs text-muted-foreground">{libraryKindFromItem(item)}</td>
              <td className="px-2 py-2.5 text-xs text-muted-foreground">{libraryStatusLabel(item)}</td>
              <td className="px-2 py-2.5 font-mono text-xs text-muted-foreground">{item.created_at ? new Date(item.created_at).toLocaleString('zh-CN', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : ''}</td>
              <td className="px-2 py-2.5">
                <LibraryMenu item={item} open={menuId === item.document_id} retrying={retryingId === item.document_id} onToggle={() => setMenuId(current => current === item.document_id ? '' : item.document_id)} onClose={() => setMenuId('')} onCite={() => { setMenuId(''); cite([item]); }} onRetry={() => retry(item)} onRename={() => { setRenameId(item.document_id); setRenameTitle(item.title || ''); setMenuId(''); }} onHide={() => { setHideId(item.document_id); setMenuId(''); }} />
              </td>
            </tr>
          ))}
        </DashboardTable>
      </DashboardPanel>}
    {items && items.length < total && <div className="pt-3"><button className="workspace-action" disabled={busy} onClick={() => { const next = offset + 50; void load(next, true).catch(err => setError(asResearchErrorMessage(err))); }}>加载更多（{items.length}/{total}）</button></div>}
    {uploadOpen && <div className="library-modal-backdrop" role="dialog" aria-label="上传资料" onClick={() => !busy && setUploadOpen(false)}>
      <div className="library-modal" onClick={event => event.stopPropagation()}>
        <div className="mb-4 flex items-start justify-between gap-3"><div><h2 className="font-semibold">上传资料</h2><p className="mt-1 text-xs text-muted-foreground">一次最多 10 个文件，最多同时处理 4 个。开始上传后即保存到我的资料。</p></div><button className="workspace-action workspace-action-compact" onClick={() => setUploadOpen(false)} aria-label="关闭">关闭</button></div>
        <label className="text-xs text-muted-foreground">公司代码（可选）<input className="workspace-field mt-2 block h-10 w-full" placeholder="例如 000933" value={symbol} disabled={busy} onChange={event => setSymbol(event.target.value)} /></label>
        <label className="library-drop mt-4" data-active={dropActive} onDragOver={event => { event.preventDefault(); setDropActive(true); }} onDragLeave={() => setDropActive(false)} onDrop={onDrop}>
          <p className="text-sm">拖入 PDF / TXT / MD，或选择文件</p>
          <input className="sr-only" type="file" multiple accept=".pdf,.txt,.md,application/pdf,text/plain,text/markdown" disabled={busy} onChange={event => { enqueue(Array.from(event.target.files || [])); event.target.value = ''; }} />
          <span className="workspace-action workspace-action-primary mt-3">选择文件</span>
        </label>
        {queue.length > 0 && <div className="library-queue">{queue.map(item => <div key={item.id} className="library-queue-item"><span className="truncate">{item.name}</span><span className={item.status === 'failed' ? 'text-destructive' : 'text-muted-foreground'}>{item.status === 'uploading' ? '处理中' : item.detail}</span></div>)}</div>}
      </div>
    </div>}
    {renameId && <div className="library-modal-backdrop" role="dialog" aria-label="修改标题" onClick={() => setRenameId('')}>
      <form className="library-modal" onClick={event => event.stopPropagation()} onSubmit={event => {
        event.preventDefault();
        void renameLibraryDocument(renameId, renameTitle.trim()).then(() => { setRenameId(''); void load(0, false); }).catch(err => setError(asResearchErrorMessage(err)));
      }}>
        <h2 className="mb-3 font-semibold">修改显示标题</h2>
        <p className="mb-3 text-xs text-muted-foreground">只改显示名称，文件内容和历史引用不变。</p>
        <input className="workspace-field h-10 w-full" value={renameTitle} onChange={event => setRenameTitle(event.target.value)} />
        <div className="mt-4 flex justify-end gap-2"><button type="button" className="workspace-action" onClick={() => setRenameId('')}>取消</button><button className="workspace-action workspace-action-primary" disabled={!renameTitle.trim()}>保存</button></div>
      </form>
    </div>}
    {hideId && <div className="library-modal-backdrop" role="dialog" aria-label="从我的资料移除" onClick={() => !hiding && setHideId('')}>
      <div className="library-modal" onClick={event => event.stopPropagation()}>
        <h2 className="mb-3 font-semibold">从我的资料移除</h2>
        <p className="mb-4 text-sm text-muted-foreground">只从「我的资料」列表移除。原文件和历史引用会保留，旧对话仍可打开。</p>
        <div className="flex justify-end gap-2">
          <button type="button" className="workspace-action" disabled={hiding} onClick={() => setHideId('')}>取消</button>
          <button type="button" className="workspace-action workspace-action-primary" disabled={hiding} onClick={() => {
            setHiding(true);
            void hideLibraryDocument(hideId)
              .then(() => { setHideId(''); setNotice('已从我的资料移除，原文件和历史引用会保留。'); return load(0, false); })
              .catch(err => setError(asResearchErrorMessage(err)))
              .finally(() => setHiding(false));
          }}>{hiding ? '正在移除…' : '从我的资料移除'}</button>
        </div>
      </div>
    </div>}
    <Disclaimer />
  </div>;
}

function LibraryMenu({
  item, open, retrying, onToggle, onClose, onCite, onRetry, onRename, onHide,
}: {
  item: LibraryDocument;
  open: boolean;
  retrying: boolean;
  onToggle: () => void;
  onClose: () => void;
  onCite: () => void;
  onRetry: () => void;
  onRename: () => void;
  onHide: () => void;
}) {
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const [box, setBox] = useState<{ top: number; left: number; minWidth: number }>();
  const place = () => {
    const trigger = triggerRef.current;
    const menu = menuRef.current;
    if (!trigger) return;
    setBox(workspaceSelectMenuBox(trigger.getBoundingClientRect(), { width: window.innerWidth, height: window.innerHeight }, {
      height: menu?.scrollHeight || 220,
      width: Math.max(menu?.scrollWidth || 0, 176),
      align: 'end',
    }));
  };
  useLayoutEffect(() => { if (open) place(); }, [open]);
  useEffect(() => {
    if (!open) return;
    const onPointer = (event: PointerEvent) => {
      const target = event.target as Node | null;
      if (triggerRef.current?.contains(target) || menuRef.current?.contains(target)) return;
      onClose();
    };
    const onKey = (event: KeyboardEvent) => { if (event.key === 'Escape') onClose(); };
    document.addEventListener('pointerdown', onPointer);
    document.addEventListener('keydown', onKey);
    window.addEventListener('resize', place);
    window.addEventListener('scroll', place, true);
    return () => {
      document.removeEventListener('pointerdown', onPointer);
      document.removeEventListener('keydown', onKey);
      window.removeEventListener('resize', place);
      window.removeEventListener('scroll', place, true);
    };
  }, [open, onClose]);
  return <>
    <button ref={triggerRef} type="button" className="workspace-action workspace-action-compact" aria-label="更多操作" aria-expanded={open} aria-haspopup="menu" onClick={event => { event.stopPropagation(); onToggle(); }}><MoreHorizontal size={14} /></button>
    {open && createPortal(
      <div ref={menuRef} role="menu" className="library-menu" style={{ ...box, visibility: box ? 'visible' : 'hidden' }} onClick={event => event.stopPropagation()}>
        <Link role="menuitem" to={`/my-reports/read/${encodeURIComponent(item.document_id)}?from=${encodeURIComponent('/my-reports')}`}>阅读</Link>
        <button type="button" role="menuitem" onClick={onCite}>引用到对话</button>
        {libraryNeedsRetry(item) && <button type="button" role="menuitem" disabled={retrying} onClick={onRetry}>{retrying ? '正在重试…' : '重试处理'}</button>}
        <a role="menuitem" href={`/finance-research/documents/${item.document_id}/raw`} target="_blank" rel="noreferrer">下载原件</a>
        <button type="button" role="menuitem" onClick={onRename}>修改标题</button>
        <button type="button" role="menuitem" onClick={onHide}>从我的资料移除</button>
      </div>,
      document.body,
    )}
  </>;
}
