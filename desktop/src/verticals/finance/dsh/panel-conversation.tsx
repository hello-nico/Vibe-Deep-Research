import { useEffect, useState, type ReactNode } from 'react';
import type { Context } from '@deepseek-ai/cordis';
import type { SessionReference } from '@deepseek-ai/dsh-api-session-controller/client';
import type { PropsRenderFactories, PropsRuntime, SessionProviderComponent } from '@deepseek-ai/dsh-client-ui-slots';
import type { ConversationViewsProps } from '@deepseek-ai/dsh-client-ui-conversation/client';
import { loadReportTasks } from '../lib/reportTasks';
import { taskPanelTarget } from './task-panel-target';

function FixedChatView({ renderSlot }: ConversationViewsProps) {
  return <>{renderSlot('conversation.session', { view: 'chat' })}</>;
}

// This is the same embedded Conversation factory used by DSH's subagent sidebar.
function PanelChat({ sessionId, useSession, useConversation, useSessions, renderFactorySlot }: PropsRuntime<'finance.panel.chat'> & PropsRenderFactories) {
  const session = useSession(value => value);
  const conversation = useConversation(value => value);
  const summaryBlank = useSessions(state => state.byId[sessionId]?.blank);
  const blank = !conversation.activeTargets.size && (session.blank || session.awaitingFirstTurn) && !session.running;
  const settling = blank && session.openState === 'loading' && summaryBlank !== true;
  return renderFactorySlot('conversation.content', {
    variant: 'embedded', phase: settling ? 'settling' : blank ? 'hero' : 'active', hero: blank && !settling,
  }, { slots: { views: FixedChatView } });
}

type PanelSeatProps = {
  sessionId: string;
  parentSessionId?: string;
  SessionProvider: SessionProviderComponent;
  renderSlot(name: string, owner: object): ReactNode;
};

export function installPanelConversation(ctx: Context) {
  type NativeSessionId = Parameters<typeof ctx.sessions.subagentAddress>[0];
  const id = (value: string) => value as NativeSessionId;
  function PanelSeat({ sessionId, parentSessionId, SessionProvider, renderSlot }: PanelSeatProps) {
    const [reference, setReference] = useState<SessionReference | null>(null);
    const [error, setError] = useState('');
    useEffect(() => {
      let active = true;
      const controller = new AbortController();
      let retained: SessionReference | undefined;
      setReference(null);
      setError('');
      void (async () => {
        await ctx.sessions.refresh().catch(() => {});
        const parent = parentSessionId || ctx.sessions.subagentAddress(id(sessionId))?.parentSessionId
          || ctx.sessions.list.getSnapshot().byId[id(sessionId)]?.parentId
          || (await loadReportTasks().catch(() => null))?.host_session_id;
        if (parent) await ctx.sessions.refreshProjections(id(parent)).catch(() => {});
        if (!active) return;
        const address = ctx.sessions.subagentAddress(id(sessionId));
        const catalog = parent ? ctx.sessions.list.getSnapshot().projectionsBySession[id(parent)]?.values.subagentCatalog || [] : [];
        const target = taskPanelTarget(sessionId, parent, address, catalog);
        retained = ctx.sessions.retain(typeof target === 'string' ? id(target) : {
          parentSessionId: id(target.parentSessionId), childSessionId: id(target.childSessionId), mode: target.mode,
        }, { source: 'taskProcess', signal: controller.signal });
        await retained.ready;
        if (active) setReference(retained);
      })().catch(() => {
        retained?.release();
        retained = undefined;
        if (active) setError('执行记录读取失败，请稍后重试');
      });
      return () => {
        active = false;
        controller.abort();
        retained?.release();
      };
    }, [sessionId, parentSessionId]);
    if (error) return <p role="alert" className="p-4 text-sm text-destructive">{error}</p>;
    if (!reference) return <p role="status" className="p-4 text-sm text-muted-foreground">正在读取执行记录…</p>;
    return <SessionProvider session={reference}>{renderSlot('finance.panel.chat', {})}</SessionProvider>;
  }
  ctx.slots.inject('finance.panel.conversation', () => ctx.slots.register({
    name: 'finance.panel.conversation',
    children: { 'finance.panel.chat': { kind: 'single', scope: 'session' } },
  }, PanelSeat));
  ctx.slots.inject('finance.panel.chat', () => ctx.slots.register({ name: 'finance.panel.chat' }, PanelChat));
}

declare module '@deepseek-ai/dsh-api-session-controller/client' {
  interface SessionReferenceSourceMap { taskProcess: unknown }
}

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface SlotMap {
    'finance.panel.conversation': {
      kind: 'single'; scope: 'root';
      owner: { sessionId: string; parentSessionId?: string };
    };
    'finance.panel.chat': { kind: 'single'; scope: 'session' };
  }
}
