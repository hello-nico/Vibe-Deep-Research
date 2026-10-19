import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
const originalFetch = globalThis.fetch;
globalThis.fetch = async (url, init) => String(url).endsWith('/health')
  ? new Response(JSON.stringify({ api: { version: 1, min_client: 1 } }), { status: 200 })
  : originalFetch(url, init);
import { cancelResearchRun, disposeReportRuntime, loadReportTasks, startReportRun, startResearchRun } from '../dsh/finance-ui/host-state.mjs';
import { legacyCompanySymbol } from '../src/verticals/finance/lib/reportTasks.ts';

test('只有旧顶层公司研究标题从深度对话历史移入任务记录', () => {
  assert.equal(legacyCompanySymbol('公司研究 · 600011 · 华能国际'), '600011');
  assert.equal(legacyCompanySymbol('公司研究 · 华能国际'), undefined);
  assert.equal(legacyCompanySymbol('普通深度对话 · 600011'), undefined);
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
    on: () => () => {},
    agentDefaultModel: { currentSelection: () => ({ provider: 'test', model: 'model' }) },
    agents: { get: (id: string) => id === host.session.id ? host : null,
      create: async () => ({ agent: host, dispose: async () => {} }) },
    subagents: { startActivation: async ({ provider: _provider, request, delivery }: any) => {
      assert.equal(delivery, 'caller');
      const pending = loadReportTasks().pending;
      let finish!: (value: unknown) => void;
      const result = new Promise(resolve => { finish = resolve; });
      starts.push({ pending, request, finish });
      return { childId: `research-${starts.length}`, result, dispose: async () => { finish({ stopReason: 'aborted' }); } };
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
  assert.equal(starts[0]?.request.persona, undefined);
  assert.equal(starts[0]?.request.toolFilter, undefined);
  assert.equal(loadReportTasks().sessions[first.session_id].kind, 'research');
  assert.equal(loadReportTasks().sessions[first.session_id].title, input.title);
  await assert.rejects(startReportRun(ctx, { slug: input.slug, input_hash: 'a'.repeat(64), prompt: '生成报告' }), /公司研究进行中/);
  starts[0]?.finish({ stopReason: 'error' });
  await new Promise(resolve => setTimeout(resolve, 30));
  assert.equal(starts.length, 2);
  starts[1]?.finish({ stopReason: 'error' });
  await new Promise(resolve => setTimeout(resolve, 30));
  assert.equal(loadReportTasks().sessions[first.session_id].run_status, 'failed');
  const report = await startReportRun(ctx, { slug: input.slug, input_hash: 'a'.repeat(64), prompt: '生成报告' });
  assert.equal(report.status, 'started');
  assert.equal(starts[2]?.pending.kind, 'report');
  assert.equal(starts[2]?.request.parent.session.id, host.session.id);
  await assert.rejects(startResearchRun(ctx, input), /图文报告生成中/);
  starts[2]?.finish({ stopReason: 'completed' });
  await new Promise(resolve => setTimeout(resolve, 0));
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
