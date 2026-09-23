import { useEffect, useId, useLayoutEffect, useRef, useState, type KeyboardEvent, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { Ellipsis } from 'lucide-react';
import { workspaceSelectMenuBox } from '../../lib/workspaceSelect';
import './workspace-more-menu.css';

export type WorkspaceMoreAction = { id: string; label: string; onSelect: () => void; icon?: ReactNode; disabled?: boolean };

export function WorkspaceMoreMenu({ actions }: { actions: readonly WorkspaceMoreAction[] }) {
  const menuId = useId();
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const [box, setBox] = useState<{ top: number; left: number; minWidth: number; maxHeight: number }>();
  const enabled = actions.map((action, index) => action.disabled ? -1 : index).filter(index => index >= 0);
  const place = () => {
    const trigger = triggerRef.current;
    if (!trigger) return;
    const rect = trigger.getBoundingClientRect();
    setBox(workspaceSelectMenuBox(rect, { width: window.innerWidth, height: window.innerHeight }, {
      height: menuRef.current?.scrollHeight || 180,
      width: menuRef.current?.scrollWidth || 180,
      align: 'end',
    }));
  };
  const close = (restore = true) => {
    setOpen(false);
    if (restore) triggerRef.current?.focus();
  };
  const reveal = (last = false) => {
    if (!enabled.length) return;
    setActive(last ? enabled[enabled.length - 1]! : enabled[0]!);
    setBox(undefined);
    setOpen(true);
  };
  const choose = (index: number) => {
    const action = actions[index];
    if (!action || action.disabled) return;
    close();
    action.onSelect();
  };
  const move = (delta: number) => {
    if (!enabled.length) return;
    const at = enabled.indexOf(active);
    setActive(enabled[(at + delta + enabled.length) % enabled.length]!);
  };
  const onKeyDown = (event: KeyboardEvent<HTMLElement>) => {
    if (event.key === 'Escape') { event.preventDefault(); close(); return; }
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      if (!open) reveal(event.key === 'ArrowUp');
      else move(event.key === 'ArrowDown' ? 1 : -1);
    } else if (open && (event.key === 'Enter' || event.key === ' ')) {
      event.preventDefault(); choose(active);
    } else if (open && (event.key === 'Home' || event.key === 'End')) {
      event.preventDefault(); setActive(enabled[event.key === 'Home' ? 0 : enabled.length - 1]!);
    }
  };
  useLayoutEffect(() => {
    if (!open) return;
    place();
    menuRef.current?.querySelector<HTMLElement>(`[data-action-index="${active}"]`)?.focus();
  }, [open, active]);
  useEffect(() => {
    if (!open) return;
    const onPointer = (event: PointerEvent) => {
      const target = event.target as Node | null;
      if (!triggerRef.current?.contains(target) && !menuRef.current?.contains(target)) close(false);
    };
    document.addEventListener('pointerdown', onPointer);
    window.addEventListener('resize', place);
    window.addEventListener('scroll', place, true);
    return () => {
      document.removeEventListener('pointerdown', onPointer);
      window.removeEventListener('resize', place);
      window.removeEventListener('scroll', place, true);
    };
  }, [open]);
  return <>
    <button ref={triggerRef} type="button" className="workspace-action workspace-more-trigger"
      aria-haspopup="menu" aria-expanded={open} aria-controls={menuId}
      onClick={() => open ? close() : reveal()} onKeyDown={onKeyDown}>
      <Ellipsis size={16} />更多
    </button>
    {open && createPortal(<div ref={menuRef} id={menuId} role="menu" aria-label="更多操作"
      className="workspace-select-menu workspace-more-menu" style={{ ...box, visibility: box ? 'visible' : 'hidden' }}
      onKeyDown={onKeyDown}>
      {actions.map((action, index) => <button key={action.id} type="button" role="menuitem"
        data-action-index={index} data-active={active === index ? 'true' : undefined}
        className="workspace-select-option workspace-more-option" tabIndex={active === index ? 0 : -1}
        disabled={action.disabled} onMouseEnter={() => { if (!action.disabled) setActive(index); }}
        onClick={() => choose(index)}>{action.icon}<span className="workspace-select-option-label">{action.label}</span></button>)}
    </div>, document.body)}
  </>;
}
