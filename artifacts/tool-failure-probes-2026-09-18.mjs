// Read-only audit: real DSH ToolRuntime, synthetic HTTP; no services or model calls.
import assert from 'node:assert/strict';
import { researchFixture } from '/Users/apple/ts/src/Stock-Research/dsh/test/research-fixture.mjs';
import { requestBackend } from '/Users/apple/ts/src/Stock-Research/dsh/dist/research-backend.mjs';
import { DEEP_RESEARCH_TOOLS, MY_RESEARCH_TOOLS, SETTLEMENT_TOOLS, REPORT_TOOLS } from '/Users/apple/ts/src/Stock-Research/dsh/dist/native-research-tools.mjs';
const rows = [];
const originalFetch = globalThis.fetch;
const record = (name, evidence) => rows.push({ name, evidence });
try {
  record('scope_inventory', { deep: DEEP_RESEARCH_TOOLS, topic: MY_RESEARCH_TOOLS, settlement: SETTLEMENT_TOOLS, report: REPORT_TOOLS, union: new Set([...MY_RESEARCH_TOOLS, ...REPORT_TOOLS, ...SETTLEMENT_TOOLS]).size });
  globalThis.fetch = async () => new Response('<html>proxy error</html>', { status: 200 });
  assert.deepEqual(await requestBackend('/audit'), {});
  record('non_json_200', { returned: {}, error: false });
  globalThis.fetch = async () => new Response('upstream unavailable', { status: 503 });
  try { await requestBackend('/audit'); } catch (e) { record('non_json_503', { message: e.message }); }
  globalThis.fetch = async () => Response.json({ detail: { code: 'rate_limited' } }, { status: 429, headers: { 'Retry-After': '60' } });
  try { await requestBackend('/audit'); } catch (e) { record('structured_429', { message: e.message, ownProperties: Object.keys(e), retryAfter: e.retryAfter ?? null }); }
  const host = await researchFixture();
  try {
    globalThis.fetch = async () => Response.json({ symbol: '600900.SH', channel_statuses: [{ channel: 'company_news', status: 'unavailable', code: 'provider_timeout', message: 'Timed out' }], warnings: ['partial coverage'], candidates: [] });
    const result = await host.call('observe_radar', { symbol: '600900.SH', asOf: '2026-09-18' });
    record('radar_failure_projection', result.content);
    assert.equal(JSON.stringify(result.content).includes('provider_timeout'), false);
    const operations = [];
    globalThis.fetch = async (_url, init) => {
      operations.push(JSON.parse(init.body).operation_id);
      return Response.json({ result_id: 'result:' + '0'.repeat(32), payload: { kind: 'market', title: 'audit', as_of: '2026-09-18', rows: [{ date: '2026-09-18', close: 1 }], missing: [], sources: [] } });
    };
    const args = { symbol: '600900.SH', as_of: '2026-09-18', window_start: '2026-08-01' };
    await host.call('generate_market_result', args, { callId: 'first' });
    await host.call('generate_market_result', args, { callId: 'retry' });
    assert.notEqual(operations[0], operations[1]);
    record('result_retry_identity', { sameArgumentsNewCallProducesNewOperation: true });
  } finally { await host.dispose(); }
  const report = await researchFixture({ role: 'wiki_report' });
  try {
    for (const prefix of ['companies', 'themes', 'comparisons']) {
      const slug = `${prefix}/audit`;
      report.state.reportTask = { slug, inputHash: 'a'.repeat(64) };
      globalThis.fetch = async () => Response.json({ spec: { slug }, markdown: '# audit', input_hash: 'a'.repeat(64), published: true });
      try { record(`report_read_${prefix}`, await report.call('wiki_read', { slug })); }
      catch (e) { record(`report_read_${prefix}`, { error: e.message }); }
    }
  } finally { await report.dispose(); }
  const topicId = 'topic:0123456789ab';
  const topic = await researchFixture({ role: 'my_research', boundTopicId: topicId });
  topic.state.boundTopicId = topicId;
  try {
    const versions = [];
    globalThis.fetch = async (_url, init) => {
      versions.push(JSON.parse(init.body).expected_revision);
      return Response.json({ detail: { code: 'topic_revision_conflict', current_revision: 9 } }, { status: 409 });
    };
    for (let i = 0; i < 2; i++) {
      try { await topic.call('topic_attach_radar_card', { topicId, cardId: 'x'.repeat(32), expectedRevision: 2 }); } catch {}
    }
    assert.deepEqual(versions, [2, 9]);
    record('topic_conflict_retry', { modelExpectedRevision: 2, transmittedVersions: versions, interveningRead: false });
  } finally { await topic.dispose(); }
} finally { globalThis.fetch = originalFetch; }
console.log(JSON.stringify({ mode: 'synthetic HTTP with real DSH ToolRuntime; no live acceptance', rows }, null, 2));
