import assert from 'node:assert/strict';
import test from 'node:test';
import { reportProgress, REPORT_STEPS } from '../src/verticals/finance/lib/reportProgress.ts';
import { emptyTaskTrajectory, toolStepTitle } from '../src/verticals/finance/lib/taskTrajectory.ts';

const tool = (id: string, name: string) => ({ id, kind: 'tool', title: toolStepTitle(name) });
const text = (id: string) => ({ id, kind: 'assistant', title: '模型输出', body: '正在组织图文' });

test('报告进度按真实工具调用推进，读完研究页后的文字输出是组织图文', () => {
  assert.equal(REPORT_STEPS.length, 5);
  assert.deepEqual(reportProgress(emptyTaskTrajectory), { step: 0, label: '读取报告方法' });
  assert.equal(reportProgress({ ...emptyTaskTrajectory, runningCalls: [{ id: '1', name: toolStepTitle('read_research_method') }] }).step, 1);
  const read = [tool('1', 'read_research_method'), tool('2', 'wiki_read')];
  assert.deepEqual(reportProgress({ ...emptyTaskTrajectory, steps: read }), { step: 2, label: '读取研究页' });
  assert.deepEqual(reportProgress({ ...emptyTaskTrajectory, steps: [...read, text('3')] }), { step: 3, label: '组织图文' });
  assert.equal(reportProgress({ ...emptyTaskTrajectory, steps: [...read, text('3')], runningCalls: [{ id: '4', name: toolStepTitle('wiki_report_publish') }] }).step, 4);
});

test('保存被检查退回后再写内容时显示“按检查结果修改”；议题报告的读取同样算读取研究页', () => {
  const retried = [tool('1', 'read_research_method'), tool('2', 'topic_report_snapshot'), text('3'), tool('4', 'wiki_report_publish'), text('5')];
  assert.deepEqual(reportProgress({ ...emptyTaskTrajectory, steps: retried }), { step: 3, label: '按检查结果修改' });
  assert.equal(reportProgress({ ...emptyTaskTrajectory, steps: retried.slice(0, 2) }).step, 2);
});
