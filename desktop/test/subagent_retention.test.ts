import assert from 'node:assert/strict';
import test from 'node:test';
import { createRequire } from 'node:module';

const requireRuntime = createRequire(new URL('../dsh/runtime/package.json', import.meta.url));
const cordis = await import(requireRuntime.resolve('@deepseek-ai/cordis'));
const { Context } = cordis;
let sessionController: any;
(globalThis as any).window = {
  __ModuleLoader__: {
    load({ factory }: any) {
      sessionController = factory((name: string) => {
        if (name === '@deepseek-ai/cordis') return cordis;
        if (name === '@deepseek-ai/dsh-client-store') {
          return {
            notifySubscribers(listeners: Set<() => void>) {
              for (const listener of [...listeners]) listener();
            },
            createSnapshotStore(initial: any) {
              let snapshot = initial;
              const listeners = new Set<() => void>();
              return {
                getSnapshot: () => snapshot,
                set(value: any) { snapshot = value; for (const listener of listeners) listener(); },
                subscribe(listener: () => void) { listeners.add(listener); return () => listeners.delete(listener); },
              };
            },
          };
        }
        if (name === '@deepseek-ai/dsh-api-gateway/client') {
          return {
            isRemoteFailure: () => false,
            RemoteJournalStream: class {
              options: any;
              constructor(_remote: any, options: any) { this.options = options; }
              async open() {
                this.options.publish({
                  type: 'replace', entries: [], hasMore: false,
                  page: { records: [], hasMore: false, projections: undefined },
                });
              }
              restart() {}
              async dispose() {}
            },
            RemoteSnapshotStream: class {
              start() {}
              restart() {}
              async dispose() {}
            },
            RemoteStreamCarrierError: class extends Error {},
          };
        }
        throw new Error(`unexpected client bundle dependency: ${name}`);
      });
    },
  },
};
await import(`${requireRuntime.resolve('@deepseek-ai/dsh-api-session-controller/client')}?subagent-retention-test`);
delete (globalThis as any).window;

const mainSummary = (sessionId: string) => ({
  sessionId,
  cwd: '/tmp/project',
  running: false,
  blank: false,
  updatedAt: 1,
});

test('native child retention validates exact catalog address and preserves navigation', async (t) => {
  const catalogs = new Map<string, any>([
    ['parent', {
      parentAvailable: true,
      entries: [{
        kind: 'child', id: 'child', mode: 'continuable', label: '报告生成',
        activity: 'running', hasChildren: false,
      }, {
        kind: 'child', id: 'selected-child', mode: 'continuable', label: '已打开子任务',
        activity: 'inactive', hasChildren: false,
      }],
    }],
  ]);
  let cancelCalls = 0;
  const remote = {
    $host: { home: undefined },
    $on: () => () => {},
    $stream: () => {
      const controller = new AbortController();
      return {
        signal: controller.signal,
        restart() {},
        async dispose() { controller.abort(); },
        async *[Symbol.asyncIterator]() {
          yield {
            generation: 0,
            value: { type: 'baseline', value: { queues: {}, jobs: {}, projections: {} } },
            accept() {},
          };
        },
      };
    },
    session: {
      list: async () => ({ ok: true, value: { items: [mainSummary('main-a'), mainSummary('main-b')] } }),
      cancel: async () => { cancelCalls += 1; return { ok: true, value: {} }; },
    },
    subagents: {
      list: async (parentSessionId: string) => ({
        ok: true,
        value: catalogs.get(parentSessionId) ?? { parentAvailable: false, entries: [] },
      }),
      interruptByParent: async () => { cancelCalls += 1; return { ok: true, value: {} }; },
    },
    commands: {},
  } as any;
  const ctx = new Context();
  ctx.reflect.provide('remote', remote);
  ctx.reflect.provide('typert', { contexts: { registerClient() {} } });
  sessionController.apply(ctx);
  const sessions = (ctx as any).sessions;
  t.after(async () => { await ctx.fiber.dispose(); });

  await sessions.refresh();
  const address = { parentSessionId: 'parent', childSessionId: 'child', mode: 'continuable' };

  assert.throws(() => sessions.retainSubagent(address), /not a healthy catalog child/);
  await sessions.refreshSubagents('parent');
  assert.throws(() => sessions.retainSubagent({ ...address, parentSessionId: 'wrong-parent' }), /not a healthy catalog child/);
  assert.throws(() => sessions.retainSubagent({ ...address, mode: 'ephemeral' }), /not a healthy catalog child/);

  sessions.manager.completedNotifications.add('child');
  sessions.open('main-a');
  const first = sessions.retainSubagent(address);
  const second = sessions.retainSubagent(address);
  assert.equal(sessions.manager.selected, 'main-a');
  assert.equal(sessions.manager.completedNotifications.has('child'), true);
  assert.strictEqual(first.binding, second.binding);
  assert.equal(first.binding.session.getSnapshot().running, true);
  assert.deepEqual(first.binding.session.getSnapshot().subagent?.address, address);
  assert.strictEqual(sessions.binding('child'), first.binding);

  sessions.open('main-b');
  assert.equal(sessions.manager.selected, 'main-b');
  assert.strictEqual(sessions.binding('child'), first.binding);
  sessions.clear();

  await sessions.refreshSubagents('parent');
  await sessions.refresh();
  assert.strictEqual(sessions.binding('child'), first.binding);

  first.dispose();
  assert.strictEqual(sessions.binding('child'), second.binding);
  assert.deepEqual(sessions.subagentAddress('child'), address);
  assert.equal(cancelCalls, 0);

  second.dispose();
  assert.equal(sessions.binding('child'), undefined);
  assert.equal(sessions.subagentAddress('child'), undefined);
  assert.equal(cancelCalls, 0);
  second.dispose();
  assert.equal(sessions.binding('child'), undefined);
  assert.equal(cancelCalls, 0);

  const selectedAddress = {
    parentSessionId: 'parent', childSessionId: 'selected-child', mode: 'continuable',
  };
  sessions.openSubagent(selectedAddress);
  const selectedHold = sessions.retainSubagent(selectedAddress);
  selectedHold.dispose();
  assert.deepEqual(sessions.subagentAddress('selected-child'), selectedAddress);

  sessions.open('main-a');
  const existingNavigationHold = sessions.retainSubagent(selectedAddress);
  existingNavigationHold.dispose();
  assert.deepEqual(sessions.subagentAddress('selected-child'), selectedAddress);
  sessions.clear();

  catalogs.set('parent', {
    parentAvailable: true,
    entries: catalogs.get('parent').entries.filter((entry: any) => entry.id !== 'child'),
  });
  await sessions.refreshSubagents('parent');
  assert.throws(() => sessions.open('child'), /unknown session child/);
});
