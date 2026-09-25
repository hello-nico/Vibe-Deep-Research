import assert from 'node:assert/strict';
import test from 'node:test';
import { defaultTaskPanelStage, isMissingSessionError, taskPanelTarget, taskProcessMissing } from '../src/verticals/finance/dsh/task-panel-target.ts';
import type { TaskProcessRef } from '../src/verticals/finance/dsh/research-session.tsx';

test('task panel retains an exact child address when the host directory knows its mode', () => {
  const address = { parentSessionId: 'host', childSessionId: 'child', mode: 'one-shot' as const };
  assert.deepEqual(taskPanelTarget('child', 'host', address), address);
  assert.deepEqual(taskPanelTarget('child', 'host', undefined, [{ id: 'child', mode: 'continuable' }]), {
    parentSessionId: 'host', childSessionId: 'child', mode: 'continuable',
  });
});

test('task panel falls back to the session id without a trustworthy address', () => {
  assert.equal(taskPanelTarget('child', undefined, undefined), 'child');
  assert.equal(taskPanelTarget('child', 'host', undefined, [{ id: 'child', mode: 'unknown' }]), 'child');
  assert.equal(taskPanelTarget('child', 'host', { parentSessionId: 'other', childSessionId: 'child', mode: 'one-shot' }), 'child');
});

test('cleared task process is distinct from a temporary history failure', () => {
  assert.equal(taskProcessMissing('child', 'host', undefined, [], false), true);
  assert.equal(taskProcessMissing('child', undefined, undefined, [], false), true);
  assert.equal(taskProcessMissing('child', 'host', { parentSessionId: 'host', childSessionId: 'other', mode: 'one-shot' }, [], false), true);
  assert.equal(taskProcessMissing('child', 'host', { parentSessionId: 'host', childSessionId: 'child', mode: 'one-shot' }, [], false), false);
  assert.equal(taskProcessMissing('child', 'host', undefined, [{ id: 'child', mode: 'continuable' }], false), false);
  assert.equal(isMissingSessionError({ code: 'session/not-found' }), true);
  assert.equal(isMissingSessionError(new Error('sessions.retain: unknown session child')), true);
  assert.equal(isMissingSessionError(new Error('network unavailable')), false);
});

test('research panel initially shows the running stage and otherwise starts at research', () => {
  const task: TaskProcessRef = { sessionId: 'research', settlementSessionId: 'settlement', kind: 'research', title: '公司研究' };
  assert.equal(defaultTaskPanelStage(task, id => id === 'settlement'), 'settlement');
  assert.equal(defaultTaskPanelStage(task, id => id === 'research'), 'research');
  assert.equal(defaultTaskPanelStage(task, () => false), 'research');
});
