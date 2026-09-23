import assert from 'node:assert/strict';
import test from 'node:test';
import { ensureTaskHistory } from '../src/verticals/finance/lib/taskHistory.ts';

test('report child history retains the exact parent address without changing navigation', async () => {
  const address = { parentSessionId: 'parent', childSessionId: 'child', mode: 'continuable' as const };
  let selected = 'main-chat';
  let target: unknown;
  let releases = 0;
  const face = { getSnapshot: () => ({ openState: 'open' as const }) };
  const binding = { sessionId: 'child', session: face };
  const client = {
    sessions: {
      refresh: async () => {},
      refreshProjections: async (parent: string) => { assert.equal(parent, 'parent'); },
      subagentAddress: (id: string) => id === 'child' ? address : undefined,
      list: { getSnapshot: () => ({ current: selected, byId: {} }), subscribe: () => () => {} },
      retain(value: unknown, options: { source: string }) {
        target = value;
        assert.equal(options.source, 'taskProcess');
        return { binding, ready: Promise.resolve(binding), release: () => { releases++; } };
      },
    },
  };
  const result = await ensureTaskHistory({
    client,
    sessionId: 'child',
    parents: new Map([['child', 'parent']]),
    loadReportTasks: async () => { throw new Error('known parent should not query task catalog'); },
  });
  assert.deepEqual(target, address);
  assert.equal(selected, 'main-chat');
  result.release();
  assert.equal(releases, 1);
});
