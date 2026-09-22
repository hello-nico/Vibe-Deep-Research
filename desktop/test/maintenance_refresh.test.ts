import assert from 'node:assert/strict';
import { test } from 'node:test';
import { companyRefreshRequest } from '../dsh/finance-ui/maintenance.mjs';

test('refresh facade fixes scope and records only an actual boolean choice for its frozen proposal', async () => {
  const calls: { route: string; body: any }[] = [];
  const proposal = { proposal_id: 'maint-' + 'a'.repeat(24), version: 1, origin: 'refresh_button', role: 'company_wiki', source_session: 'button-session', source_turn: 'button-turn', items: [{ item_id: 'refresh-company', action: 'timeline_refresh', args: { scope: 'api' } }] };
  const backend = async (route: string, body?: any) => { calls.push({ route, body }); return proposal; };
  await companyRefreshRequest({ operation: 'prepare', slug: 'companies/600900-sh', version: 'a'.repeat(64), origin: 'agent', action: 'fact_admission' }, undefined, backend);
  assert.equal(calls[0].body.origin, 'refresh_button');
  assert.equal(calls[0].body.items[0].action, 'timeline_refresh');
  assert.deepEqual(calls[0].body.items[0].args, { slug: 'companies/600900-sh', scope: 'api' });
  calls.length = 0;
  await companyRefreshRequest({ operation: 'confirm', proposal_id: proposal.proposal_id, version: 1, approve: false }, undefined, backend);
  assert.equal(calls.length, 2);
  assert.deepEqual(calls[1].body.selections, [{ item_id: 'refresh-company', decision: 'reject' }]);
  assert.equal(calls[1].body.source_session, 'button-session');
  calls.length = 0;
  await assert.rejects(companyRefreshRequest({ operation: 'confirm', proposal_id: proposal.proposal_id, version: 'v0', approve: true }, undefined, backend), /变化/);
  assert.equal(calls.length, 1);
  await assert.rejects(companyRefreshRequest({ operation: 'confirm', proposal_id: proposal.proposal_id, version: 1, approve: 'yes' }, undefined, backend), /变化/);
  await assert.rejects(companyRefreshRequest({ operation: 'read', proposal_id: proposal.proposal_id }, undefined, async () => ({ ...proposal, origin: 'agent' })), /只能处理/);
  await assert.rejects(companyRefreshRequest({ operation: 'read', proposal_id: proposal.proposal_id }, undefined, async () => ({ ...proposal, items: [{ ...proposal.items[0], args: { scope: 'sources' } }] })), /只能处理/);
});
