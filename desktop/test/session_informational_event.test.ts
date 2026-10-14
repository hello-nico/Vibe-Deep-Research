import assert from 'node:assert/strict';
import test from 'node:test';
import { createRequire } from 'node:module';

const requireRuntime = createRequire(new URL('../dsh/runtime/package.json', import.meta.url));
const runtime = async (name: string) => import(requireRuntime.resolve(`@deepseek-ai/${name}`));
const { Session, SessionId, appendPluginRecord, pluginRecordOf } = await runtime('dsh-session');

test('installed Session preserves informational markers through JSON and restore', () => {
  const id = SessionId('maintenance-audit-test');
  const session = Session.create(id);
  const seq = appendPluginRecord(session,
    'plugin:stock-research/maintenance-assessment',
    { outcome: 'no_material', sourceTurn: 'turn-1' },
  );
  const event = session.snapshotEvents().find((event: any) => event.seq === seq);
  assert.equal(event.ignorable, true);
  assert.equal(session.snapshotEvents()[0].ignorable, true);

  const records = JSON.parse(JSON.stringify(session.snapshotEvents()));
  const header = JSON.parse(JSON.stringify(session.header));
  const restored = Session.fromRestore(id, records, header, 0, 'adopt');
  assert.equal(restored.snapshotEvents()[0].type, 'plugin:stock-research/maintenance-assessment');
  assert.equal(restored.snapshotEvents()[0].ignorable, true);
  assert.deepEqual(pluginRecordOf(restored.snapshotEvents()[0]).data, { outcome: 'no_material', sourceTurn: 'turn-1' });
});

test('plugin records reject invalid names and non-JSON data; core and surface event rules remain enforced', () => {
  const session = Session.create(SessionId('maintenance-marker-validation'));
  const required = session.append('turn/start', { turn: 1 });
  assert.equal(required.ignorable, undefined);
  assert.throws(() => appendPluginRecord(session, 'stock-research/status', {}), /plugin record type/);
  assert.throws(() => appendPluginRecord(session, 'plugin:stock-research/status', { value: undefined }), /JSON/);
  assert.throws(() => (session as any).append('user/message', {
    id: 'user-message-1', role: 'user', content: [], source: { kind: 'user' },
  }, { ignorable: true }), /requires a surfaceOp marker/);
});
