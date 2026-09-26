import assert from 'node:assert/strict';
import test from 'node:test';
import { companyResearchStep, COMPANY_RESEARCH_STEPS } from '../src/verticals/finance/lib/companyResearchProgress.ts';
import { emptyTaskTrajectory, toolStepTitle } from '../src/verticals/finance/lib/taskTrajectory.ts';

test('公司研究从最新工具推断步骤，未知工具不沿用旧步骤', () => {
  assert.equal(COMPANY_RESEARCH_STEPS.length, 5);
  for (const [tool, step] of [['wiki_read', 0], ['source_ingest_periodic_report', 1], ['stage_extraction', 2], ['calculate_metrics', 3]] as const) {
    assert.equal(companyResearchStep({ ...emptyTaskTrajectory, runningCalls: [{ id: '1', name: toolStepTitle(tool) }] }), step);
  }
  const steps = [{ id: '1', kind: 'tool', title: '读取研究页 · 公司' }, { id: '2', kind: 'tool', title: '未知调用' }];
  assert.equal(companyResearchStep({ ...emptyTaskTrajectory, steps: steps.slice(0, 1) }), 0);
  assert.equal(companyResearchStep({ ...emptyTaskTrajectory, steps }), null);
  assert.equal(companyResearchStep(emptyTaskTrajectory), null);
});

test('行情工具完成后进入纯文字结论时，不继续高亮第四步', () => {
  const steps = [{ id: '1', kind: 'tool', title: toolStepTitle('calculate_market_result') },
    { id: '2', kind: 'assistant', title: '模型输出', body: '第五步：形成研究结论' }];
  assert.equal(companyResearchStep({ ...emptyTaskTrajectory, steps: steps.slice(0, 1) }), 3);
  assert.equal(companyResearchStep({ ...emptyTaskTrajectory, steps }), null);
  assert.equal(companyResearchStep({ ...emptyTaskTrajectory, steps,
    runningCalls: [{ id: '3', name: toolStepTitle('source_read_blocks') }] }), 2);
});
