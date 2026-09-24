import assert from 'node:assert/strict';
import test from 'node:test';
import { loadFinanceModule } from './load_finance_module.ts';

const { activeTaskKind, reportTaskOutcome, reportTaskTitle } = await loadFinanceModule<typeof import('../src/verticals/finance/lib/reportTasks.ts')>('lib/reportTasks.ts');

test('同一研究页的研究、整理、报告互斥，不影响其他公司', () => {
  const store = { sessions: {
    research: { kind: 'research' as const, slug: 'companies/a', settlement_status: 'running', settlement_updated_at: '2026-09-24T08:00:00Z' },
    report: { kind: 'report' as const, slug: 'companies/b' },
  } };
  const now = Date.parse('2026-09-24T08:01:00Z');
  assert.equal(activeTaskKind(store, 'companies/a', () => false, now), 'research');
  assert.equal(activeTaskKind(store, 'companies/a', id => id === 'research', now), 'research');
  assert.equal(activeTaskKind(store, 'companies/b', id => id === 'report', now), 'report');
  assert.equal(activeTaskKind(store, 'companies/c', () => true, now), null);
  assert.equal(activeTaskKind(store, 'companies/a', () => false, now + 180_001), null);
  assert.equal(activeTaskKind({ sessions: {}, pending: { kind: 'report', slug: 'companies/a', requested_at: '2026-09-24T08:00:55Z' } },
    'companies/a', () => false, now), 'report');
});

test('报告只有保存记录精确对应本任务才显示已生成', () => {
  const binding = { kind: 'report' as const, slug: 'companies/a', input_hash: 'hash', run_status: 'completed' as const, bound_at: '2026-09-24T08:00:00Z' };
  const artifact = { report_id: 'one', created_at: '2026-09-24T08:01:00Z', input_hash: 'hash', session_id: 'task-a' };
  assert.equal(reportTaskOutcome(binding, true, [], 'task-a'), 'running');
  assert.equal(reportTaskOutcome(binding, false, [artifact], 'task-a'), 'generated');
  assert.equal(reportTaskOutcome(binding, false, [artifact], 'older-task'), 'unsaved');
  assert.equal(reportTaskOutcome(binding, false, [], 'task-a'), 'unsaved');
  assert.equal(reportTaskOutcome(binding, false, null, 'task-a'), 'unconfirmed');
});

test('报告任务标题优先使用绑定名称，其次对象名称', () => {
  assert.equal(reportTaskTitle({ slug: 'companies/a', title: '报告生成 · 国电电力' }), '图文报告 · 国电电力');
  assert.equal(reportTaskTitle({ slug: 'companies/a' }, '国电电力'), '图文报告 · 国电电力');
  assert.equal(reportTaskTitle({ slug: 'companies/a' }, '公司研究'), '图文报告 · companies/a');
});
