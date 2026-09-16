import assert from 'node:assert/strict';
import test from 'node:test';
import { resultDefinition as definition } from '../src/verticals/finance/dsh/result-projection.ts';

// These tests exercise the native event projection, not a copied renderer.
const id = 'result:' + 'a'.repeat(32);
const result = (content: unknown[], isError = false, callId = 'call-1', seq = 8) => ({ event: { type: 'tool/result', seq, data: {
  message: { source: { callId }, content: [{ isError, content }] },
} } });
const project = (event: ReturnType<typeof result>) => definition.update({ state: { seq: 3 } } as never, event as never);
const call = (name: string, callId = 'call-1') => ({ type: 'tool/call', seq: 4, data: { name, callId } });

test('only result generation calls create display nodes', () => {
  assert.deepEqual(definition.match(call('generate_market_result') as never), { id: 'call-1', role: 'start' });
  assert.deepEqual(definition.match(call('generate_financial_result', 'call-2') as never), { id: 'call-2', role: 'start' });
  assert.equal(definition.match(call('read_research_result', 'call-read') as never), null);
  assert.equal(definition.match(call('calculate_market_result', 'call-calculate') as never), null);
  assert.deepEqual(definition.match(call('stock_generate_market_result') as never), { id: 'call-1', role: 'start' });
  assert.deepEqual(definition.match(call('stock_generate_financial_result', 'call-2') as never), { id: 'call-2', role: 'start' });
  assert.equal(definition.match(call('stock_read_research_result', 'call-read') as never), null);
});

test('only successful structured results produce a card', () => {
  assert.deepEqual(project(result([{ type: 'text', text: JSON.stringify({ research_result: id }) }])), { seq: 8, resultId: id });
  for (const text of ['null', 'ordinary prose', '{"research_result":"result:invalid"}'])
    assert.equal(project(result([{ type: 'text', text }]))?.resultId, undefined);
  assert.equal(project(result([{ type: 'text', text: JSON.stringify({ research_result: id }) }], true))?.resultId, undefined);
});

test('completion moves the same immutable reference outside folded steps', () => {
  const state = { seq: 8, resultId: id };
  const view = (end?: { seq: number }) => definition.buildViewNode({ state, key: 'finance-result:call-1', id: 'call-1',
    start: { location: { kind: 'step', turn: { end } } } } as never);
  assert.equal(view()?.anchorSeq, 8);
  assert.equal(view({ seq: 12 })?.anchorSeq, 12);
  assert.deepEqual(view({ seq: 12 })?.data, { resultId: id });
  assert.equal(definition.buildViewNode({ state: { seq: 3 } } as never), null);
});

test('separate generation calls preserve each result reference', () => {
  const secondId = 'result:' + 'b'.repeat(32);
  assert.equal(project(result([{ type: 'text', text: JSON.stringify({ research_result: id }) }], false, 'call-1')).resultId, id);
  assert.equal(project(result([{ type: 'text', text: JSON.stringify({ research_result: secondId }) }], false, 'call-2', 9)).resultId, secondId);
});

test('durable presentation metadata survives spilled tool text', () => {
  const event = result([{ type: 'text', text: 'truncated output' }]);
  Object.assign(event.event.data, { meta: { research_result: id } });
  assert.equal(project(event)?.resultId, id);
});

test('historical generation prefix survives spill notices and truncated rows', () => {
  for (const text of [JSON.stringify({ research_result: id, rows: [] }) + '\n\n(Omitted 485 bytes. Full formatted result stored at: /tmp/result.txt)',
    `{"research_result":"${id}","rows":[{"close":"7.`])
    assert.equal(project(result([{ type: 'text', text }]))?.resultId, id);
  for (const text of [`Explanation {"research_result":"${id}"}`, `{"nested":{"research_result":"${id}"}} trailing`])
    assert.equal(project(result([{ type: 'text', text }]))?.resultId, undefined);
});
