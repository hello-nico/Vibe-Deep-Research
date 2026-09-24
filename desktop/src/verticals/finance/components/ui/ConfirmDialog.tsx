import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import '../refresh-confirm.css';

type ConfirmOptions = { title: string; body?: ReactNode; kicker?: string; confirmLabel?: string; cancelLabel?: string };

/** Product confirm dialog (same look as the refresh confirmation). `ask` resolves true on confirm. */
export function useConfirm(): [ReactNode, (options: ConfirmOptions) => Promise<boolean>] {
  const [request, setRequest] = useState<(ConfirmOptions & { resolve: (ok: boolean) => void }) | null>(null);
  const dialog = useRef<HTMLDivElement>(null);
  const ask = useCallback((options: ConfirmOptions) => new Promise<boolean>(resolve => setRequest({ ...options, resolve })), []);
  const finish = useCallback((ok: boolean) => { setRequest(current => { current?.resolve(ok); return null; }); }, []);
  useEffect(() => {
    if (!request) return;
    dialog.current?.querySelector<HTMLButtonElement>('[data-confirm]')?.focus();
    const key = (event: KeyboardEvent) => { if (event.key === 'Escape') { event.stopPropagation(); finish(false); } };
    window.addEventListener('keydown', key, true);
    return () => window.removeEventListener('keydown', key, true);
  }, [request, finish]);
  const element = request && createPortal(<div className="refresh-dialog-backdrop" onMouseDown={event => { if (event.target === event.currentTarget) finish(false); }}>
    <div ref={dialog} role="alertdialog" aria-modal="true" aria-labelledby="confirm-dialog-title" className="refresh-dialog confirm-dialog">
      <header className="refresh-dialog-header">
        <div>{request.kicker && <p className="refresh-dialog-kicker">{request.kicker}</p>}<h2 id="confirm-dialog-title">{request.title}</h2></div>
        <button type="button" className="refresh-dialog-close" aria-label="关闭" onClick={() => finish(false)}><X size={18} /></button>
      </header>
      {request.body && <div className="refresh-dialog-body"><div className="refresh-dialog-lead">{request.body}</div></div>}
      <footer className="refresh-dialog-footer">
        <div className="flex gap-2">
          <button type="button" className="workspace-action" onClick={() => finish(false)}>{request.cancelLabel || '取消'}</button>
          <button type="button" data-confirm className="workspace-action workspace-action-primary" onClick={() => finish(true)}>{request.confirmLabel || '确定'}</button>
        </div>
      </footer>
    </div>
  </div>, document.body);
  return [element, ask];
}
