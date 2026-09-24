import { useEffect, useState, useSyncExternalStore, type ReactNode } from 'react';
import type { Context } from '@deepseek-ai/cordis';
import type { SessionReference } from '@deepseek-ai/dsh-api-session-controller/client';
import type { PropsRenderFactories, PropsRuntime, SessionProviderComponent } from '@deepseek-ai/dsh-client-ui-slots';
import type { ConversationViewsProps } from '@deepseek-ai/dsh-client-ui-conversation/client';
import { loadReportTasks } from '../lib/reportTasks';
import { taskPanelTarget } from './task-panel-target';
import type { FinanceSidePanel } from './side-panel';
import { SaveNoteButton } from '../components/ui/SaveNoteButton';
import { assistantTurnNote } from './assistant-turn-note';

function FixedChatView({ renderSlot }: ConversationViewsProps) {
  return <>{renderSlot('conversation.session', { view: 'chat' })}</>;
}

// This is the same embedded Conversation factory used by DSH's subagent sidebar.
function PanelChat({ sessionId, topic, assistant, useSession, useConversation, useChat, useSessions, inputActions, renderFactorySlot }: PropsRuntime<'finance.panel.chat'> & PropsRenderFactories) {
  const session = useSession(value => value);
  const conversation = useConversation(value => value);
  const summaryBlank = useSessions(state => state.byId[sessionId]?.blank);
  const blank = !conversation.activeTargets.size && (session.blank || session.awaitingFirstTurn) && !session.running;
  const settling = blank && session.openState === 'loading' && summaryBlank !== true;
  const hasAssistant = useChat(value => value.nodes.values().some(node => node.kind === 'assistant-step'));
  const showTopicOpening = Boolean(topic?.fresh && !hasAssistant && !settling);
  return <div className={`conversation-citations ${topic ? 'finance-topic-chat' : assistant ? 'finance-assistant-native' : 'finance-panel-chat'}`}>
    {showTopicOpening && topic && <div className="finance-topic-opening">
      <h3>{topic.title}</h3>
      <p>{topic.judgment}</p>
      {topic.questions.length > 0 && <div className="finance-topic-questions">{topic.questions.map(question => <button type="button" key={question} onClick={() => {
        inputActions.setDraft(question);
        inputActions.submit();
      }}>{question}</button>)}</div>}
    </div>}
    {renderFactorySlot('conversation.content', {
      variant: 'embedded', phase: topic || assistant ? 'active' : settling ? 'settling' : blank ? 'hero' : 'active', hero: !topic && !assistant && blank && !settling,
    }, { slots: { views: FixedChatView } })}
  </div>;
}

type PanelSeatProps = {
  sessionId: string;
  parentSessionId?: string;
  topic?: Extract<FinanceSidePanel, { kind: 'topic' }>;
  assistant?: boolean;
  SessionProvider: SessionProviderComponent;
  renderSlot(name: string, owner: object): ReactNode;
};

export function installPanelConversation(ctx: Context, activePanel: () => FinanceSidePanel | null) {
  type NativeSessionId = Parameters<typeof ctx.sessions.subagentAddress>[0];
  const id = (value: string) => value as NativeSessionId;
  function PanelSeat({ sessionId, parentSessionId, topic, assistant, SessionProvider, renderSlot }: PanelSeatProps) {
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
        const parent = topic || assistant ? undefined : parentSessionId || ctx.sessions.subagentAddress(id(sessionId))?.parentSessionId
          || ctx.sessions.list.getSnapshot().byId[id(sessionId)]?.parentId
          || (await loadReportTasks().catch(() => null))?.host_session_id;
        if (parent) await ctx.sessions.refreshProjections(id(parent)).catch(() => {});
        if (!active) return;
        const address = ctx.sessions.subagentAddress(id(sessionId));
        const catalog = parent ? ctx.sessions.list.getSnapshot().projectionsBySession[id(parent)]?.values.subagentCatalog || [] : [];
        const target = topic || assistant ? sessionId : taskPanelTarget(sessionId, parent, address, catalog);
        retained = ctx.sessions.retain(typeof target === 'string' ? id(target) : {
          parentSessionId: id(target.parentSessionId), childSessionId: id(target.childSessionId), mode: target.mode,
        }, { source: topic || assistant ? 'financePanel' : 'taskProcess', signal: controller.signal });
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
    }, [sessionId, parentSessionId, topic, assistant]);
    if (error) return <p role="alert" className="p-4 text-sm text-destructive">{error}</p>;
    if (!reference) return <p role="status" className="p-4 text-sm text-muted-foreground">{topic || assistant ? '正在打开对话…' : '正在读取执行记录…'}</p>;
    return <SessionProvider session={reference}>{renderSlot('finance.panel.chat', { topic, assistant })}</SessionProvider>;
  }
  ctx.slots.inject('finance.panel.conversation', () => ctx.slots.register({
    name: 'finance.panel.conversation',
    children: { 'finance.panel.chat': { kind: 'single', scope: 'session' } },
  }, PanelSeat));
  ctx.slots.inject('finance.panel.chat', () => ctx.slots.register({ name: 'finance.panel.chat' }, PanelChat));
  type ChatHook = PropsRuntime<'conversation.chat.assistant-actions'>['useChat'];
  function SaveAssistantTurn({ sessionId, turn, useChat }: { sessionId: string; turn: number; useChat: ChatHook }) {
    const usersSource = useChat(value => value.nodes.turnDataSource(turn, 'user'));
    const users = useSyncExternalStore(usersSource.subscribe, usersSource.getSnapshot, usersSource.getSnapshot);
    const errorsSource = useChat(value => value.nodes.turnDataSource(turn, 'turn-error'));
    const errors = useSyncExternalStore(errorsSource.subscribe, errorsSource.getSnapshot, errorsSource.getSnapshot);
    const tailsSource = useChat(value => value.nodes.turnDataSource(turn, 'turn-tail'));
    const tails = useSyncExternalStore(tailsSource.subscribe, tailsSource.getSnapshot, tailsSource.getSnapshot);
    const closing = [...tails].reverse().find(tail => tail.closing)?.closing;
    const note = assistantTurnNote({ panel: activePanel(), sessionId, turnClosed: true, failed: errors.length > 0, users, closing });
    return note && <span className="finance-turn-save"><SaveNoteButton kind="问助手" title={note.title} content={note.content} /></span>;
  }
  // DSH's own seat for per-answer actions (copy / feedback row); only the assistant panel adds 「保存为记录」.
  function SaveAssistantAction({ sessionId, messageId, useChat }: PropsRuntime<'conversation.chat.assistant-actions'>) {
    const turn = useChat(value => {
      for (const node of value.nodes.values()) {
        if (node.kind !== 'turn-tail') continue;
        const tail = node.data as { turn: number; closing?: { finalNode: { messageId?: string } } | null };
        if (tail.closing?.finalNode.messageId === messageId) return tail.turn;
      }
      return -1;
    });
    const panel = activePanel();
    if (turn < 0 || panel?.kind !== 'assistant' || panel.sessionId !== sessionId) return null;
    return <SaveAssistantTurn sessionId={sessionId} turn={turn} useChat={useChat} />;
  }
  ctx.slots.inject('conversation.chat.assistant-actions', () => ctx.slots.register({
    name: 'conversation.chat.assistant-actions', id: 'finance-assistant-save', order: 60,
  }, SaveAssistantAction));
}

declare module '@deepseek-ai/dsh-api-session-controller/client' {
  interface SessionReferenceSourceMap { taskProcess: unknown; financePanel: unknown }
}

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface SlotMap {
    'finance.panel.conversation': {
      kind: 'single'; scope: 'root';
      owner: { sessionId: string; parentSessionId?: string; topic?: Extract<FinanceSidePanel, { kind: 'topic' }>; assistant?: boolean };
    };
    'finance.panel.chat': { kind: 'single'; scope: 'session'; owner: { topic?: Extract<FinanceSidePanel, { kind: 'topic' }>; assistant?: boolean } };
  }
}
