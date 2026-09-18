import assert from 'node:assert/strict';
import test from 'node:test';
import { projectTaskTrajectory, toolLabel } from '../src/verticals/finance/lib/taskTrajectory.ts';

test('过程投影保留工具名、参数、结果、耗时和错误，而不是通用标签', () => {
  const snap = projectTaskTrajectory({
    running: true, failed: false, openState: 'open', hasMore: true, raw: {
      runningCalls: [{ callId: 'c1', name: 'wiki_read', argsRaw: '{"slug":"companies/a"}', time: 1 }],
      eventNodes: [
        { kind: 'user', seq: 1, time: 10, content: [{ type: 'text', text: '生成报告' }] },
        { kind: 'assistant', seq: 2, time: 20, blocks: [{ kind: 'text', text: '先读取页面' }], timing: { stepStartTime: 12, completedTime: 20 } },
        { kind: 'tool-result', seq: 3, time: 40, callTime: 25, isError: false, call: { name: 'wiki_read', argsRaw: '{"slug":"companies/a"}' }, content: [{ type: 'text', text: '已钉住快照' }] },
        { kind: 'turn-error', seq: 4, time: 50, message: '模型超时' },
      ],
    },
  });
  assert.equal(toolLabel('wiki_read'), '读取 Wiki');
  assert.equal(snap.runningCalls[0].name, '读取 Wiki');
  assert.match(snap.runningCalls[0].args || '', /companies\/a/);
  assert.equal(snap.steps[0].body, '生成报告');
  assert.equal(snap.steps[1].body, '先读取页面');
  assert.equal(snap.steps[1].durationMs, 8);
  assert.equal(snap.steps[2].title, '读取 Wiki');
  assert.equal(snap.steps[2].body, '已钉住快照');
  assert.match(snap.steps[2].args || '', /companies\/a/);
  assert.equal(snap.steps[2].durationMs, 15);
  assert.equal(snap.steps[3].failed, true);
  assert.equal(snap.steps[3].body, '模型超时');
  assert.equal(snap.hasMore, true);
});
