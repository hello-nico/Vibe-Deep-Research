import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { cancelResearchRun, disposeReportRuntime, loadReportTasks, startReportRun, startResearchRun } from '../dsh/finance-ui/host-state.mjs';
import { legacyCompanySymbol, researchSkipReasonText, researchSkipSummary, researchTaskStatus, RESEARCH_SETTLEMENT_MS, type ReportTaskBinding } from '../src/verticals/finance/lib/reportTasks.ts';

test('只有旧顶层公司研究标题从深度对话历史移入任务记录', () => {
  assert.equal(legacyCompanySymbol('公司研究 · 600011 · 华能国际'), '600011');
  assert.equal(legacyCompanySymbol('公司研究 · 华能国际'), undefined);
  assert.equal(legacyCompanySymbol('普通深度对话 · 600011'), undefined);
});

test('研究与整理状态由同一纯函数判定，含重启宽限和整理超时', () => {
  const now = Date.parse('2026-09-24T12:00:00Z');
  const binding: ReportTaskBinding = { kind: 'research', slug: 'companies/600011-sh',
    bound_at: new Date(now - 1000).toISOString(), run_status: 'running' };
  assert.equal(researchTaskStatus(binding, true, null, now), 'researching');
  assert.equal(researchTaskStatus(binding, false, null, now), 'researching');
  assert.equal(researchTaskStatus({ ...binding, bound_at: new Date(now - 16_000).toISOString() }, false, null, now), 'interrupted');
  assert.equal(researchTaskStatus({ ...binding, run_status: 'failed' }, false, null, now + 20_000), 'failed');
  assert.equal(researchTaskStatus({ ...binding, run_status: 'cancelled' }, false, null, now + 20_000), 'cancelled');
  const completed = { ...binding, run_status: 'completed' as const };
  assert.equal(researchTaskStatus(completed, false, null, now), 'unconfirmed');
  const started_at = new Date(now - RESEARCH_SETTLEMENT_MS + 1).toISOString();
  assert.equal(researchTaskStatus(binding, false, { display_status: 'running', started_at }, now), 'settling');
  assert.equal(researchTaskStatus(completed, false, { display_status: 'running', started_at }, now), 'settling');
  assert.equal(researchTaskStatus(completed, false, { display_status: 'running', started_at }, now + 1), 'interrupted');
  assert.equal(researchTaskStatus({ ...completed, settlement_status: 'running', settlement_updated_at: started_at }, false, null, now), 'settling');
  for (const status of ['awaiting_authorization', 'no_increment', 'partial', 'failed', 'cancelled', 'interrupted', 'skipped'] as const) {
    assert.equal(researchTaskStatus(completed, false, { display_status: status }, now), status);
  }
  assert.equal(researchTaskStatus(completed, false, { display_status: 'completed' }, now), 'unconfirmed');
  assert.equal(researchTaskStatus({ ...completed, settlement_status: 'skipped' }, false, null, now), 'skipped');
  assert.equal(researchSkipReasonText('no_material'), '没有可整理的新材料');
  assert.equal(researchSkipReasonText('snapshot_too_large'), '本轮材料过多，未自动整理');
  assert.equal(researchSkipReasonText('ingest_timeout'), '年报入库未完成');
  assert.equal(researchSkipSummary('no_material'), '本次没有整理：没有可整理的新材料');
  assert.equal(researchSkipSummary('unknown'), '本次没有整理');
});

test('公司任务首请求前绑定研究身份，同公司去重，不把模型失败记成完成', async t => {
  const previous = process.env.DSH_HOME;
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'company-task-'));
  process.env.DSH_HOME = home;
  t.after(async () => {
    await disposeReportRuntime();
    if (previous === undefined) delete process.env.DSH_HOME;
    else process.env.DSH_HOME = previous;
    fs.rmSync(home, { recursive: true, force: true });
  });
  const starts: { pending: any; request: any; finish: (value: unknown) => void }[] = [];
  const host = { session: { id: 'host-company' } };
  const ctx = {
    agentDefaultModel: { currentSelection: () => ({ provider: 'test', model: 'model' }) },
    agents: { get: (id: string) => id === host.session.id ? host : null,
      create: async () => ({ agent: host, dispose: async () => {} }) },
    subagents: { start: async (_provider: string, request: any) => {
      const pending = loadReportTasks().pending;
      let finish!: (value: unknown) => void;
      const result = new Promise(resolve => { finish = resolve; });
      starts.push({ pending, request, finish });
      return { id: `research-${starts.length}`, result, dispose: async () => {} };
    } },
  };
  const input = { slug: 'companies/600011-sh', symbol: '600011.SH', prompt: '研究公司', title: '公司研究 · 华能国际' };
  const [first, duplicate] = await Promise.all([startResearchRun(ctx, input), startResearchRun(ctx, input)]);
  assert.equal(first.session_id, duplicate.session_id);
  assert.equal(duplicate.status, 'running');
  assert.equal(starts.length, 1);
  assert.equal(starts[0]?.pending.kind, 'research');
  assert.equal(starts[0]?.pending.slug, input.slug);
  assert.equal(starts[0]?.pending.title, input.title);
  assert.deepEqual(starts[0]?.pending.model_selection, { provider: 'test', model: 'model' });
  assert.equal(starts[0]?.request.parent.session.id, host.session.id);
  assert.equal(starts[0]?.request.maxDepth, 1);
  assert.match(starts[0]?.request.persona, /company_research/);
  assert.doesNotMatch(starts[0]?.request.persona, /deep_research/);
  assert.equal(loadReportTasks().sessions[first.session_id].kind, 'research');
  assert.equal(loadReportTasks().sessions[first.session_id].title, input.title);
  await assert.rejects(startReportRun(ctx, { slug: input.slug, input_hash: 'a'.repeat(64), prompt: '生成报告' }), /公司研究进行中/);
  starts[0]?.finish({ stopReason: 'error' });
  await new Promise(resolve => setTimeout(resolve, 0));
  const report = await startReportRun(ctx, { slug: input.slug, input_hash: 'a'.repeat(64), prompt: '生成报告' });
  assert.equal(report.status, 'started');
  assert.equal(starts[1]?.pending.kind, 'report');
  assert.equal(starts[1]?.request.parent.session.id, host.session.id);
  await assert.rejects(startResearchRun(ctx, input), /图文报告生成中/);
  starts[1]?.finish({ stopReason: 'completed' });
  await new Promise(resolve => setTimeout(resolve, 0));
  assert.equal(loadReportTasks().sessions[first.session_id].run_status, 'failed');
  assert.throws(() => cancelResearchRun(first.session_id), /没有可中止/);
});

test('会话存在判断识别 DSH 0.1.7 的 session.v4 文件，不把锁文件当会话', async () => {
  const { persistedSessionExists } = await import('../dsh/finance-ui/host-state.mjs');
  const fs = await import('node:fs');
  const os = await import('node:os');
  const path = await import('node:path');
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'dsh-home-'));
  const previous = process.env.DSH_HOME;
  process.env.DSH_HOME = home;
  try {
    const dir = (id: string) => { const d = path.join(home, 'sessions', 'ws', id); fs.mkdirSync(d, { recursive: true }); return d; };
    const ids = ['session-00000000-0000-4000-8000-000000000001', 'session-00000000-0000-4000-8000-000000000002', 'session-00000000-0000-4000-8000-000000000003', 'session-00000000-0000-4000-8000-000000000004'];
    fs.writeFileSync(path.join(dir(ids[0]!), 'session.v4.jsonl.zstd'), '');
    fs.writeFileSync(path.join(dir(ids[1]!), 'session.jsonl.zstd'), '');
    fs.writeFileSync(path.join(dir(ids[2]!), 'session.jsonl'), '');
    fs.writeFileSync(path.join(dir(ids[3]!), 'session.lock'), '');
    assert.deepEqual(ids.map(id => persistedSessionExists(id)), [true, true, true, false]);
    assert.equal(persistedSessionExists('session-00000000-0000-4000-8000-000000000009'), false);
  } finally {
    if (previous === undefined) delete process.env.DSH_HOME; else process.env.DSH_HOME = previous;
    fs.rmSync(home, { recursive: true, force: true });
  }
});
