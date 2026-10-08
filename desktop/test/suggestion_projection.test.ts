import assert from 'node:assert/strict';
import test from 'node:test';
import { isUnboundDeepResearchSession, suggestionDefinition, topicCandidateDefinition } from '../src/verticals/finance/dsh/result-projection.ts';

const base = { id: 'suggestion-1', question: '铝价如何传导？', consumer: 'deep_research' as const };
const events = [
  { ...base, type: 'question' as const, items: [{ text: '电价如何影响成本？' }] },
  { ...base, id: 'suggestion-2', type: 'company' as const, items: [{ symbol: '600011.SH', reason: '电价敏感' }] },
  { ...base, id: 'suggestion-3', type: 'indicator' as const, items: [{ name: '铝电价差', reason: '决定利润弹性', tracking_item: {
    tracking_key: 'spread', hypothesis: '价差决定弹性', baseline: { as_of: '2026-10-08', known_at: '2026-10-08T10:00:00+08:00', basis_refs: ['result:' + 'a'.repeat(32)] },
    observables: ['铝价'], conditions: { strengthen: ['扩大'], weaken: ['缩小'], overturn: ['关系失效'] }, next_source: '行情', last_assessment: null,
  } }] },
];

test('三类推荐事件都投影为各自卡片数据', () => {
  for (const data of events) {
    const event = { type: 'stock-research/suggestion', seq: 10, data };
    assert.deepEqual(suggestionDefinition.match(event as never), { id: data.id, role: 'start' });
    assert.deepEqual(suggestionDefinition.start({} as never, { event } as never, {} as never), data);
  }
});

test('推荐只在所属 turn.end 后显示并锚定到回答末尾', () => {
  const data = events[0];
  const view = (end?: { seq: number }) => suggestionDefinition.buildViewNode?.({
    key: 'finance-suggestion:suggestion-1', id: data.id, state: data,
    start: { location: { kind: 'turn', turn: { end } } },
  } as never);
  assert.equal(view(), null);
  assert.equal(view({ seq: 14 })?.anchorSeq, 14);
  assert.deepEqual(view({ seq: 14 })?.data, data);
});

test('推荐严格隔离 consumer，旧候选拒绝带 deep_research 标记的事件', () => {
  assert.equal(suggestionDefinition.match({ type: 'stock-research/suggestion', seq: 1, data: { ...events[0], consumer: 'my_research' } } as never), null);
  assert.equal(suggestionDefinition.match({ type: 'stock-research/suggestion', seq: 1, data: { ...events[0], consumer: undefined } } as never), null);
  const candidate = { id: 'candidate-1', question: '继续研究吗', reason: '有变化' };
  assert.equal(topicCandidateDefinition.match({ type: 'stock-research/topic-candidate', seq: 1, data: { ...candidate, consumer: 'deep_research' } } as never), null);
  assert.deepEqual(topicCandidateDefinition.match({ type: 'stock-research/topic-candidate', seq: 1, data: candidate } as never), { id: 'candidate-1', role: 'start' });
});

test('历史候选只在无入口绑定的深度对话隐藏', () => {
  assert.equal(isUnboundDeepResearchSession('deep-1', {}, {}, {}), true);
  assert.equal(isUnboundDeepResearchSession('topic-1', { 'topic-1': {} }, {}, {}), false);
  assert.equal(isUnboundDeepResearchSession('assistant-1', {}, { 'assistant-1': {} }, {}), false);
  assert.equal(isUnboundDeepResearchSession('task-1', {}, {}, { 'task-1': {} }), false);
});
