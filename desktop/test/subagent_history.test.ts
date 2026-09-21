import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import { createRequire, registerHooks } from 'node:module';
import { pathToFileURL } from 'node:url';

const requireRuntime = createRequire(new URL('../dsh/runtime/package.json', import.meta.url));
const runtimeEntry = requireRuntime.resolve('@deepseek-ai/dsh-api-session-controller');
assert.match(runtimeEntry.replaceAll('\\', '/'), /\/lib\/index\.js$/);
assert.match(
  fs.readFileSync(runtimeEntry, 'utf8'),
  /address\.kind === "session" && observation\.header\.cwd === void 0/,
);
registerHooks({
  load(url, context, nextLoad) {
    const result = nextLoad(url, context);
    if (!url.startsWith(pathToFileURL(runtimeEntry).href)) return result;
    const raw = result.source ?? fs.readFileSync(runtimeEntry);
    const source = typeof raw === 'string' ? raw : Buffer.from(raw).toString('utf8');
    return {
      format: result.format ?? 'module',
      shortCircuit: true,
      source: source.replace(
        'export { ApiSessionNotFound, SessionController, SessionController as default, SessionFileReferences, SessionSkillCatalog, buildModelCatalog };',
        'export { ApiSessionNotFound, SessionController, SessionController as default, SessionFileReferences, SessionSkillCatalog, buildModelCatalog, SessionHistoryController };',
      ),
    };
  },
});
const { SessionHistoryController } = await import(pathToFileURL(runtimeEntry).href);
assert.equal(typeof SessionHistoryController, 'function');

const address = {
  kind: 'subagent', parentSessionId: 'parent', childSessionId: 'child', mode: 'continuable',
} as const;
const events = [
  { type: 'turn/start', seq: 0, time: 1, data: { turn: 1 } },
  { type: 'user/message', seq: 1, time: 2, data: { content: 'first' }, surfaceOp: 'append' },
  { type: 'assistant/message', seq: 2, time: 3, data: { content: 'answer' }, surfaceOp: 'append' },
  { type: 'user/message', seq: 3, time: 4, data: { content: 'second' }, surfaceOp: 'append' },
] as any[];

function harness(overrides: any = {}) {
  let observationDisposals = 0;
  let promotions = 0;
  const listeners = new Map<string, Set<Function>>();
  const historyDisposers: Array<() => void> = [];
  const observedModes: string[] = [];
  const ctx = {
    sessionQuery: {
      async observeSession(_id: string, options: any) {
        observedModes.push(options.projectionMode);
        const observation = {
          header: {
            version: 0, id: 'child', createdAt: 1, isSeeded: false,
            origin: 'subagent', parentSession: 'parent',
          },
          events,
          cursor: 3,
          inheritedEventCount: 0,
          projections: { asOfSeq: 3, values: { subagent: { seq: 0, mode: 'continuable' } } },
          source: 'prepared',
          retain() { return { [Symbol.dispose]() {} }; },
          [Symbol.dispose]() { observationDisposals += 1; },
          ...overrides,
        };
        return observation;
      },
    },
    effect(run: () => () => void) { historyDisposers.push(run()); },
    on(name: string, listener: Function) {
      const bucket = listeners.get(name) ?? new Set();
      bucket.add(listener);
      listeners.set(name, bucket);
      return () => bucket.delete(listener);
    },
  };
  const controller = new SessionHistoryController(ctx as any, () => { promotions += 1; });
  return {
    controller,
    observedModes,
    get observationDisposals() { return observationDisposals; },
    get promotions() { return promotions; },
    get listenerCount() { return [...listeners.values()].reduce((sum, bucket) => sum + bucket.size, 0); },
    closeHistory: () => { for (const dispose of historyDisposers) dispose(); },
  };
}

async function errorCode(promise: Promise<unknown>) {
  await assert.rejects(promise, (error: any) => error?.code !== undefined);
  try {
    await promise;
  } catch (error: any) {
    return error.code;
  }
  throw new Error('expected rejection');
}

test('no-cwd direct child supports cold page, pagination and follow without promotion', async () => {
  for (const mode of ['one-shot', 'continuable'] as const) {
    const childAddress = { ...address, mode };
    const state = harness({
      projections: { asOfSeq: 3, values: { subagent: { seq: 0, mode } } },
    });
    const signal = new AbortController().signal;
    const tail = await state.controller.page({ address: childAddress, throughSeq: 3, maxMessages: 1 }, signal);
    assert.equal(tail.hasMore, true);
    assert.deepEqual(tail.records.map((record: any) => record.event.seq), [3]);

    const previous = await state.controller.page({ address: childAddress, throughSeq: 3, beforeSeq: 3, maxMessages: 1 }, signal);
    assert.equal(previous.hasMore, true);
    assert.deepEqual(previous.records.map((record: any) => record.event.seq), [2]);

    const abort = new AbortController();
    const follower = state.controller.follow({ address: childAddress, maxMessages: 2 }, abort.signal);
    const opening = await follower.next();
    assert.equal(opening.done, false);
    assert.equal(opening.value?.type, 'snapshot');
    assert.equal(opening.value?.header.cwd, undefined);
    assert.equal(opening.value?.cursor, 3);
    assert.equal(state.promotions, 0);
    assert.equal(state.listenerCount, 2);

    abort.abort();
    assert.equal((await follower.next()).done, true);
    assert.equal(state.listenerCount, 0);
    assert.equal((state.controller as any).closeFollowers.size, 0);
    assert.deepEqual(state.observedModes, ['all', 'all', 'all']);
    assert.equal(state.observationDisposals, 3);
    state.closeHistory();
  }
});

test('ordinary no-cwd session stays unavailable', async () => {
  const state = harness({
    header: { version: 0, id: 'child', createdAt: 1, isSeeded: false },
  });
  const ordinary = { kind: 'session', sessionId: 'child' } as const;
  assert.equal(await errorCode(state.controller.page({ address: ordinary, throughSeq: 3 }, new AbortController().signal)), 'session/not-found');
  assert.equal(state.observationDisposals, 1);
  state.closeHistory();
});

test('no-cwd child still enforces origin, parent, mode and descriptor identity', async () => {
  const cases = [
    [{ header: { version: 0, id: 'child', createdAt: 1, isSeeded: false, parentSession: 'parent' } }, 'subagent/unauthorized'],
    [{ header: { version: 0, id: 'child', createdAt: 1, isSeeded: false, origin: 'subagent', parentSession: 'other' } }, 'subagent/unauthorized'],
    [{ projections: { asOfSeq: 3, values: { subagent: { seq: 0, mode: 'ephemeral' } } } }, 'subagent/unauthorized'],
    [{ projections: { asOfSeq: 3, values: { subagent: null } } }, 'subagent/catalog-diagnostic'],
    [{ projections: { asOfSeq: 3, values: {} } }, 'subagent/catalog-diagnostic'],
    [{ inheritedEventCount: 2, projections: { asOfSeq: 3, values: { subagent: { seq: 1, mode: 'continuable' } } } }, 'subagent/catalog-diagnostic'],
  ] as const;
  for (const [overrides, expected] of cases) {
    const state = harness(overrides);
    assert.equal(await errorCode(state.controller.page({ address, throughSeq: 3 }, new AbortController().signal)), expected);
    assert.equal(state.observationDisposals, 1);
    state.closeHistory();
  }
});
