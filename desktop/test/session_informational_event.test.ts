import assert from 'node:assert/strict';
import test from 'node:test';
import { createRequire } from 'node:module';

const requireRuntime = createRequire(new URL('../dsh/runtime/package.json', import.meta.url));
const runtime = async (name: string) => import(requireRuntime.resolve(`@deepseek-ai/${name}`));
const {
  Session, SessionId, SessionLogOffset, decodeStorageRecord, packChunkRuns,
} = await runtime('dsh-session');
const { PersistenceCoordinator } = await runtime('dsh-session-persistence');

const HEADER = {
  version: 0, id: 'maintenance-audit-test', createdAt: 1, isSeeded: false,
};

function reader(events: any[]) {
  const ctx = {
    sessions: { list: () => [] },
    effect: () => {},
    on: () => () => {},
    logger: { warn: () => {} },
  };
  const backend = {
    name: 'controlled-session-reader',
    locate: () => undefined,
    async loadStored() {
      return {
        meta: HEADER, inheritedEventCount: 0, events: structuredClone(events), revision: 'r1',
      };
    },
  };
  return new PersistenceCoordinator(ctx, backend, {
    preparedSessionCacheSize: 1, writeBatchMaxDelayMs: 1,
  });
}

test('installed Session preserves explicit informational markers through storage encoding and cold reads', async () => {
  const session = Session.create(SessionId(HEADER.id));
  const event = (session as any).append(
    'stock-research/maintenance-assessment',
    { outcome: 'no_material', sourceTurn: 'turn-1' },
    { ignorable: true },
  );
  assert.equal(event.ignorable, true);
  assert.equal(session.snapshotEvents()[0].ignorable, true);

  const records = packChunkRuns(session.snapshotEvents());
  const replayed = records.flatMap((record: unknown) => decodeStorageRecord(JSON.parse(JSON.stringify(record))));
  assert.equal(replayed[0].ignorable, true);

  const loaded = await reader(replayed).readFrom(SessionId(HEADER.id), SessionLogOffset(0));
  assert.equal(loaded.events[0].type, 'stock-research/maintenance-assessment');
  assert.equal(loaded.events[0].ignorable, true);
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

test('actual persistence catalog still rejects an unknown required event', async () => {
  const requiredUnknown = [{
    type: 'stock-research/unknown-required', seq: 0, time: 1, data: { audit: true },
  }];
  await assert.rejects(
    reader(requiredUnknown).readFrom(SessionId(HEADER.id), SessionLogOffset(0)),
    /unknown to this harness and not marked ignorable/,
  );
});
