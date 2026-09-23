import assert from 'node:assert/strict';
import test from 'node:test';
import { createRequire } from 'node:module';

const requireRuntime = createRequire(new URL('../dsh/runtime/package.json', import.meta.url));
const runtime = async (name: string) => import(requireRuntime.resolve(`@deepseek-ai/${name}`));
const { Session, SessionId } = await runtime('dsh-session');

test('installed Session preserves informational markers through JSON and restore', () => {
  const id = SessionId('maintenance-audit-test');
  const session = Session.create(id);
  const event = (session as any).append(
    'stock-research/maintenance-assessment',
    { outcome: 'no_material', sourceTurn: 'turn-1' },
    { ignorable: true },
  );
  assert.equal(event.ignorable, true);
  assert.equal(session.snapshotEvents()[0].ignorable, true);

  const records = JSON.parse(JSON.stringify(session.snapshotEvents()));
  const header = JSON.parse(JSON.stringify(session.header));
  const restored = Session.fromRestore(id, records, header, 0, 'adopt');
  assert.equal(restored.snapshotEvents()[0].type, 'stock-research/maintenance-assessment');
  assert.equal(restored.snapshotEvents()[0].ignorable, true);
});

test('append rejects invalid markers, preserves required-by-default, and surface events still require SurfaceIntent', () => {
  const session = Session.create(SessionId('maintenance-marker-validation'));
  const required = session.append('turn/start', { turn: 1 });
  assert.equal(required.ignorable, undefined);
  assert.throws(() => (session as any).append('turn/end', { turn: 1 }, { ignorable: false }), /invalid ignorable marker/);
  assert.throws(() => (session as any).append('turn/end', { turn: 1 }, { ignorable: 'yes' }), /invalid ignorable marker/);
  assert.throws(() => (session as any).append('user/message', {
    id: 'user-message-1', role: 'user', content: [], source: { kind: 'user' },
  }, { ignorable: true }), /requires a surfaceOp marker/);
});
