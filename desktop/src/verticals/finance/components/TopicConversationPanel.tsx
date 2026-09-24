import { useContext, useEffect } from 'react';
import { X } from 'lucide-react';
import { FinanceSlots } from '../dsh/NativeDsh';
import type { FinanceSidePanel } from '../dsh/side-panel';
import { SidePanelResizeHandle } from './layout/SidePanelResize';
import './task-process.css';

export function TopicConversationPanel({ topic, onClose }: {
  topic: Extract<FinanceSidePanel, { kind: 'topic' }>;
  onClose: () => void;
}) {
  const slots = useContext(FinanceSlots);
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => { if (event.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);
  return <div className="finance-topic-panel finance-side-panel">
    <SidePanelResizeHandle />
    <aside role="dialog" aria-label={`议题会话 · ${topic.title}`} className="relative flex w-full flex-col overflow-hidden rounded-2xl border bg-background shadow-lg">
      <header className="flex items-center justify-between gap-3 border-b border-border px-4 py-3">
        <div className="min-w-0"><p className="text-xs text-muted-foreground">议题研究</p><h2 className="truncate text-sm font-semibold">{topic.title}</h2></div>
        <button type="button" aria-label="关闭议题会话" className="rounded-lg p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground" onClick={onClose}><X size={16} /></button>
      </header>
      <div className="finance-topic-native min-h-0 flex-1">
        {slots?.renderSlot('finance.panel.conversation', { sessionId: topic.sessionId, topic })}
      </div>
    </aside>
  </div>;
}
