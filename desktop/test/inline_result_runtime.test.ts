import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import test from 'node:test';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';
import { resultDefinition } from '../src/verticals/finance/dsh/result-projection.ts';

const runtimeRoot = fileURLToPath(new URL('../dsh/runtime/', import.meta.url));
const runtimeRequire = createRequire(new URL('../dsh/runtime/package.json', import.meta.url));
const conversationArtifact = `${runtimeRoot}node_modules/@deepseek-ai/dsh-client-ui-conversation/lib/client.js`;
const chatArtifact = `${runtimeRoot}node_modules/@deepseek-ai/dsh-client-ui-chat/lib/client.js`;

// The installed browser bundles register factories rather than exporting Node
// modules. Execute those factories unchanged, exposing only the three private
// chat definitions needed by this projection replay.
function loadInstalledFactory(file: string, exposeChatDefinitions = false): Record<string, any> {
  let registration: { factory(require: (id: string) => unknown): Record<string, any> } | undefined;
  const source = fs.readFileSync(file, 'utf8');
  const returnNeedle = '\t\treturn module.exports;';
  const instrumented = exposeChatDefinitions
    ? source.replace(returnNeedle,
      '\t\texports.__projectionReplay = { assistantDefinition, turnProcessDefinition, chatViewDefinition };\n'
      + returnNeedle)
    : source;
  if (exposeChatDefinitions) {
    assert.notEqual(instrumented, source, 'installed chat factory export boundary changed');
    assert.equal(source.split(returnNeedle).length, 2, 'installed chat factory must have one export boundary');
  }

  const callableStub: any = new Proxy(function stub() { return callableStub; }, {
    get(target, key) {
      if (key === 'prototype') return target.prototype;
      if (key === Symbol.toPrimitive) return () => '';
      return callableStub;
    },
    construct() { return {}; },
  });
  const store = new Proxy({
    notifySubscribers(listeners: Iterable<() => void>) {
      for (const listener of listeners) listener();
    },
  } as Record<PropertyKey, unknown>, {
    get(target, key) { return target[key] ?? callableStub; },
  });
  const adapters = new Map<string, unknown>([
    ['@deepseek-ai/dsh-client-store', store],
    ['@deepseek-ai/dsh-client-ui-primitives', callableStub],
    ['@deepseek-ai/dsh-client-ui-slots', callableStub],
  ]);
  const context = vm.createContext({
    window: { __ModuleLoader__: { load(value: typeof registration) { registration = value; } } },
    console, Buffer, process, setTimeout, clearTimeout, setInterval, clearInterval,
    queueMicrotask, AbortController, AbortSignal, TextEncoder, TextDecoder, URL, URLSearchParams,
  });
  vm.runInContext(instrumented, context, { filename: file });
  assert.ok(registration, `installed factory did not register: ${file}`);
  return registration.factory(id => adapters.get(id) ?? runtimeRequire(id));
}

const { ConversationNodeAssembler } = loadInstalledFactory(conversationArtifact);
const chatRuntime = loadInstalledFactory(chatArtifact, true).__projectionReplay;
assert.ok(ConversationNodeAssembler && chatRuntime?.assistantDefinition
  && chatRuntime.turnProcessDefinition && chatRuntime.chatViewDefinition);

const embeddedId = `result:${'a'.repeat(32)}`;
const separateId = `result:${'b'.repeat(32)}`;

function at(seq: number, type: string, data: Record<string, unknown>, extra: Record<string, unknown> = {}) {
  return { type: 'event', event: { type, seq, time: 1_700_000_000_000 + seq, data, ...extra } };
}

function resultMessage(callId: string, resultId: string) {
  return {
    id: `result-${callId}`, role: 'tool', toolCallId: callId,
    source: { kind: 'tool', callId }, isError: false,
    content: [{ type: 'text', text: JSON.stringify({ research_result: resultId }) }],
  };
}

function assistantMessage(id: string, text: string) {
  return {
    id, role: 'assistant', source: { kind: 'model', provider: 'fixture', model: 'fixture' },
    content: [{ type: 'text', text }],
  };
}

const turnOne = [
  at(1, 'turn/start', { turn: 1 }),
  at(2, 'step/start', { turn: 1, step: 1 }),
  at(3, 'tool/call', { turn: 1, step: 1, callId: 'embedded-call', name: 'generate_market_result', arguments: '{}' }),
  at(4, 'tool/result', { turn: 1, step: 1, message: resultMessage('embedded-call', embeddedId) }, { surfaceOp: 'append' }),
  at(5, 'tool/call', { turn: 1, step: 1, callId: 'separate-call', name: 'generate_financial_result', arguments: '{}' }),
  at(6, 'tool/result', { turn: 1, step: 1, message: resultMessage('separate-call', separateId) }, { surfaceOp: 'append' }),
  at(7, 'step/end', { turn: 1, step: 1 }),
  at(8, 'step/start', { turn: 1, step: 2 }),
  at(9, 'assistant/message', {
    turn: 1, step: 2, stream: [],
    message: assistantMessage('answer-1', `结论\n\n![走势](${embeddedId})`),
  }, { surfaceOp: 'append' }),
  at(10, 'step/end', { turn: 1, step: 2 }),
  at(11, 'turn/end', { turn: 1, reason: { kind: 'completed' } }),
];

const turnTwo = [
  at(12, 'turn/start', { turn: 2 }),
  at(13, 'step/start', { turn: 2, step: 1 }),
  at(14, 'tool/call', { turn: 2, step: 1, callId: 'other-turn-call', name: 'generate_market_result', arguments: '{}' }),
  at(15, 'tool/result', { turn: 2, step: 1, message: resultMessage('other-turn-call', embeddedId) }, { surfaceOp: 'append' }),
  at(16, 'step/end', { turn: 2, step: 1 }),
  at(17, 'step/start', { turn: 2, step: 2 }),
  at(18, 'assistant/message', {
    turn: 2, step: 2, stream: [], message: assistantMessage('answer-2', '另一轮没有嵌入成果。'),
  }, { surfaceOp: 'append' }),
  at(19, 'step/end', { turn: 2, step: 2 }),
  at(20, 'turn/end', { turn: 2, reason: { kind: 'completed' } }),
];

function harness(entries: readonly ReturnType<typeof at>[] = []) {
  const assembler = new ConversationNodeAssembler(
    { entries: () => [chatRuntime.assistantDefinition, chatRuntime.turnProcessDefinition, resultDefinition], fallbackEntry: () => undefined },
    { entries: () => [chatRuntime.chatViewDefinition] },
  );
  assembler.replaceWindow(entries, false);
  assembler.activateTarget('chat');
  const read = () => {
    assembler.flush();
    return assembler.snapshot('chat');
  };
  return { assembler, read };
}

function visibility(snapshot: any, id: string): string | undefined {
  return snapshot.nodes.values().find((node: any) => node.kind === 'finance-result' && node.id === id)?.visibility;
}

test('installed live projection hides an embedded result only after the final turn boundary', () => {
  const value = harness();
  for (const entry of turnOne.slice(0, 7)) value.assembler.append(entry);
  assert.equal(visibility(value.read(), 'embedded-call'), 'visible');
  assert.equal(visibility(value.read(), 'separate-call'), 'visible');

  for (const entry of turnOne.slice(7, 10)) value.assembler.append(entry);
  assert.equal(visibility(value.read(), 'embedded-call'), 'visible');

  value.assembler.append(turnOne[10]);
  const closed = value.read();
  const closedTurn = closed.timeline.turns.get(1);
  assert.equal(closedTurn.data.get('turn-process').answerStep, 2);
  const answer = closedTurn.steps.find((step: any) => step.step === 2).data.get('assistant-step');
  assert.ok(answer.finalNode);
  assert.equal(answer.blocks.find((block: any) => block.kind === 'text').text, `结论\n\n![走势](${embeddedId})`);
  assert.equal(visibility(closed, 'embedded-call'), 'hidden');
  assert.equal(visibility(closed, 'separate-call'), 'visible');

  for (const entry of turnTwo) value.assembler.append(entry);
  assert.equal(visibility(value.read(), 'embedded-call'), 'hidden');
  assert.equal(visibility(value.read(), 'other-turn-call'), 'visible');
});

test('installed cold window replay reaches the same per-turn visibility', () => {
  const snapshot = harness([...turnOne, ...turnTwo]).read();
  assert.equal(snapshot.timeline.turns.get(1).data.get('turn-process').answerStep, 2);
  assert.equal(visibility(snapshot, 'embedded-call'), 'hidden');
  assert.equal(visibility(snapshot, 'separate-call'), 'visible');
  assert.equal(visibility(snapshot, 'other-turn-call'), 'visible');
});
