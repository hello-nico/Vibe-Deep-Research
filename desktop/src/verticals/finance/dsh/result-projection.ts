import type { ConversationNodeDefinition } from '@deepseek-ai/dsh-client-ui-conversation/client';

interface State { resultId?: string; seq: number }
function reference(value: unknown) {
  return typeof value === 'string' && /^result:[0-9a-f]{32}$/.test(value) ? value : undefined;
}
function resultReference(content: readonly { type: string; text?: string }[]) {
  for (const item of content) {
    if (item.type !== 'text' || !item.text) continue;
    try {
      const value = JSON.parse(item.text);
      const id = reference(value?.research_result);
      if (id) return id;
    } catch {
      // Historical generation results put this field first. DSH may append a
      // spill notice or truncate the remaining rows; never scan arbitrary prose.
      const id = item.text.match(/^\s*\{\s*"research_result"\s*:\s*"(result:[0-9a-f]{32})"\s*[,}]/)?.[1];
      if (id) return id;
    }
  }
}
export const resultDefinition: ConversationNodeDefinition<State> = {
  kind: 'finance-result', target: 'chat',
  match(event) {
    if (event.type === 'tool/call' && ['generate_market_result', 'generate_financial_result',
      'stock_generate_market_result', 'stock_generate_financial_result'].includes(event.data.name))
      return { id: String(event.data.callId), role: 'start' };
    if (event.type === 'tool/result') return { id: String(event.data.message.source.callId), role: 'update' };
    return null;
  },
  start(_context, match) { return { seq: match.event.seq }; },
  update(context, match) {
    if (match.event.type !== 'tool/result') return context.state;
    const result = match.event.data.message.content[0];
    const meta = match.event.data.meta;
    const id = meta && typeof meta === 'object' && !Array.isArray(meta) ? reference(meta.research_result) : undefined;
    return !result || result.isError ? { seq: match.event.seq } : { seq: match.event.seq, resultId: id ?? resultReference(result.content) };
  },
  buildViewNode(context) {
    if (!context.state?.resultId) return null;
    const location = context.start?.location ?? { kind: 'unresolved' as const };
    // Completed results belong after the answer, outside its collapsed tool steps.
    const end = location.kind === 'turn' || location.kind === 'step' ? location.turn.end : undefined;
    return { key: context.key, kind: 'finance-result', id: context.id, target: 'chat',
      anchorSeq: end?.seq ?? context.state.seq, location, visibility: 'visible',
      data: { resultId: context.state.resultId } };
  },
};

export interface MaintenanceData { content: string; rationale: string; question?: string; draftToken?: string }
export const maintenanceDefinition: ConversationNodeDefinition<MaintenanceData> = {
  kind: 'finance-maintenance', target: 'chat',
  match(event) {
    const value = event as unknown as { type: string; data?: { status?: string; questionIdentity?: string; proposal?: { research_blocks?: { content?: string }[] }; draft?: { published?: boolean; draft_token?: string } } };
    if (value.type !== 'stock-research/maintenance' || value.data?.status !== 'awaiting_authorization'
      || !value.data.questionIdentity || value.data.draft?.published !== false || !value.data.draft.draft_token
      || !value.data.proposal?.research_blocks?.[0]?.content) return null;
    return { id: value.data.questionIdentity, role: 'start' };
  },
  start(_context, match) {
    const data = match.event.data as unknown as { question?: string; proposal: { research_blocks: { content: string }[] }; draft?: { draft_token?: string } };
    return { content: data.proposal.research_blocks[0]?.content ?? '', question: data.question,
      rationale: '本次研究整理出一份知识更新草案，尚未发布。请核对内容后再授权发布。',
      draftToken: data.draft?.draft_token };
  },
  update(context) { return context.state; },
  buildViewNode(context) {
    if (!context.state) return null;
    return { key: context.key, kind: 'finance-maintenance', id: context.id, target: 'chat',
      anchorSeq: context.start?.event?.seq ?? 0, location: context.start?.location ?? { kind: 'unresolved' as const },
      visibility: 'visible', data: context.state };
  },
};

export interface TopicCandidateData {
  id: string; question: string; reason: string; objects?: string[]; match_topic_id?: string; status?: string;
}
export const topicCandidateDefinition: ConversationNodeDefinition<TopicCandidateData> = {
  kind: 'finance-topic-candidate', target: 'chat',
  match(event) {
    const value = event as unknown as { type: string; data?: TopicCandidateData };
    if (value.type !== 'stock-research/topic-candidate' || !value.data?.id || !value.data.question) return null;
    return { id: value.data.id, role: 'start' };
  },
  start(_context, match) { return match.event.data as unknown as TopicCandidateData; },
  update(context, match) {
    const next = match.event.data as unknown as TopicCandidateData | undefined;
    return next?.id ? { ...context.state, ...next } : context.state;
  },
  buildViewNode(context) {
    if (!context.state?.id) return null;
    return { key: context.key, kind: 'finance-topic-candidate', id: context.id, target: 'chat',
      anchorSeq: context.start?.event?.seq ?? 0, location: context.start?.location ?? { kind: 'unresolved' as const },
      visibility: 'visible', data: context.state };
  },
};

export const researchStatusDefinition: ConversationNodeDefinition<{ text: string }> = {
  kind: 'finance-research-status', target: 'chat',
  match(event) {
    const value = event as unknown as { type: string; seq: number; data?: { text?: string } };
    return value.type === 'stock-research/status' && typeof value.data?.text === 'string'
      ? { id: String(value.seq), role: 'start' } : null;
  },
  start(_context, match) { return match.event.data as unknown as { text: string }; },
  update(context) { return context.state; },
  buildViewNode(context) {
    return context.state ? { key: context.key, kind: 'finance-research-status', id: context.id, target: 'chat',
      anchorSeq: context.start?.event?.seq ?? 0, location: context.start?.location ?? { kind: 'unresolved' as const },
      visibility: 'visible', data: context.state } : null;
  },
};
