import assert from 'node:assert/strict';
import test from 'node:test';
import { createTaskTrajectoryStore, ensureTaskHistory } from '../src/verticals/finance/lib/taskHistory.ts';

test('过程历史加载只打开记录面，不抢回用户当前聊天', async () => {
  let finish!: () => void;
  const history = new Promise<void>(resolve => { finish = resolve; });
  let current = 'chat-A';
  const switches: string[] = [];
  const client = {
    sessions: {
      list: { getSnapshot: () => ({ current, byId: {} }), subscribe: () => () => {} },
      open(id: string) { current = id; switches.push(id); },
      refresh: async () => {},
      scope: () => ({}),
      sessionOf: () => ({ open: () => history }),
    },
  };
  const pending = ensureTaskHistory({
    client,
    sessionId: 'report-task',
    parents: new Map(),
    loadReportTasks: async () => ({ sessions: {} }),
  });
  current = 'chat-B';
  finish();
  await pending;
  assert.equal(current, 'chat-B');
  assert.deepEqual(switches, []);
});

test('过程订阅等待历史就绪，并在关闭和迟到加载时释放读取句柄', async () => {
  let finish!: (value: { face: { subscribe(): () => void }; release(): void }) => void;
  let ready = false, releases = 0, notifications = 0, unsubs = 0;
  let event = () => {};
  const face = { subscribe: () => () => { unsubs++; } };
  const client = {
    sessions: { list: { subscribe: () => () => { unsubs++; }, getSnapshot: () => ({ byId: {} }) } },
    uiConversation: { binding: () => {
      assert.ok(ready, '不可在异步读取就绪前挂空订阅');
      return { activate() {}, target: () => ({ getSnapshot: () => ({}), subscribe: (listener: () => void) => { event = listener; return () => { unsubs++; }; } }) };
    } },
  };
  const store = createTaskTrajectoryStore({
    sessionId: 'child',
    client,
    ensureHistory: (_id, signal) => new Promise(resolve => {
      finish = (value) => { ready = true; resolve(value); };
      signal?.addEventListener('abort', () => { ready = false; }, { once: true });
    }),
    project: () => ({ running: false, failed: false, openState: 'open', steps: [], runningCalls: [], streaming: false }),
    lastTrajectory: new Map(),
  });
  const off = store.subscribe(() => { notifications++; });
  assert.equal(notifications, 0);
  finish({ face, release: () => { releases++; } });
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(notifications, 1);
  event();
  assert.equal(notifications, 2, '历史就绪后必须收到轨迹变化');
  off();
  assert.equal(unsubs, 4);
  assert.equal(releases, 1);
  const lateOff = store.subscribe(() => { notifications++; });
  lateOff();
  finish({ face, release: () => { releases++; } });
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(releases, 2, '关闭后迟到的句柄也必须释放');
  assert.equal(notifications, 2);
});
