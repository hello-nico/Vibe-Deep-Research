// 关注页列表「研究」列：一行文字，进行中带进度，需要时带「重新研究」。
import assert from 'node:assert/strict';
import test from 'node:test';
import { researchCell, companyPageTaskOf, type CompanyPageState } from '../src/verticals/finance/lib/companyPage.ts';

const research = { researchedAt: '2026-10-24T08:00:00', valuation: { grade: '偏高' as const } };
const state = (over: Partial<CompanyPageState> = {}): CompanyPageState => ({ loaded: true, research, new_material: null, ...over });
const record = (status: 'running' | 'interrupted' | 'failed' | 'cancelled' | 'completed', current = 3) => companyPageTaskOf({
  task_id: 't', status, current_step: current, sessions: ['s'], reason: null, created_at: new Date().toISOString(),
  steps: ['收集资料', '读报告', '估值', '保存', '整理', '收尾'].map(label => ({ key: label, label, status: 'pending' })),
});

test('读取中不显示；完成写「日期 研究 · 估值档位」，不带按钮', () => {
  assert.equal(researchCell({ loaded: false, research: null, new_material: null }), null);
  assert.deepEqual(researchCell(state()), { text: '10-24 研究 · 估值偏高', rerun: false });
});

test('研究中写「研究中 · 3/6」带进度（已完成 2 步），没有按钮；接着上次继续同样带进度', () => {
  assert.deepEqual(researchCell(state({ task: record('running') })), { text: '研究中 · 3/6', progress: { done: 2, total: 6 }, rerun: false });
  assert.equal(researchCell(state({ task: record('interrupted', 4) }))!.text, '继续中 · 4/6');
});

test('有新资料、上次没完成、未研究：同一行带「重新研究」', () => {
  assert.deepEqual(researchCell(state({ new_material: { kind: 'report', name: '三季报', date: '2026-10-27' } })), { text: '10-24 研究 · 估值偏高 · 三季报已出', rerun: true, action: '重新研究' });
  assert.deepEqual(researchCell(state({ task: record('failed') })), { text: '未完成', rerun: true, action: '重新研究' });
  assert.deepEqual(researchCell({ loaded: true, research: null, new_material: null }), { text: '未研究', rerun: true, action: '研究' });
  assert.equal(researchCell({ loaded: true, research: null, new_material: null, error: '研究暂不可用' }), null, '读不到时不假装未研究');
});
