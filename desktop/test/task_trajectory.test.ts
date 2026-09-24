import assert from 'node:assert/strict';
import test from 'node:test';
import { projectTaskTrajectory, stableTaskTrajectory, toolLabel, visibleProcessPrompt } from '../src/verticals/finance/lib/taskTrajectory.ts';

test('模型请求前的失败由原生 Chat 终态节点回读，且不会重复展示', () => {
  const error = { kind: 'turn-error', seq: 10, time: 50, message: '未配置模型' };
  const terminal = { nodes: { values: () => [{ kind: 'turn-error', data: error }] } };
  const snap = projectTaskTrajectory({ openState: 'open', raw: { eventNodes: [] }, terminal });
  assert.equal(snap.failed, true);
  assert.equal(snap.steps[0].body, '未配置模型');
  assert.equal(projectTaskTrajectory({ raw: { eventNodes: [error] }, terminal }).steps.length, 1);
});

test('报告任务用户提示不把内部生成指令整段展示', () => {
  assert.equal(visibleProcessPrompt('为 Wiki 页 companies/a 生成一份交互图文报告。这是一次受限的报告生成任务。'), '按当前研究页生成图文报告');
  assert.equal(visibleProcessPrompt('普通用户问题'), '普通用户问题');
});

test('无序 Chat 失败节点按原生 seq 合入过程，后续输出仍在错误之后', () => {
  const snap = projectTaskTrajectory({
    raw: { eventNodes: [{ kind: 'user', seq: 1 }, { kind: 'assistant', seq: 3 }] },
    terminal: { nodes: { values: () => [
      { kind: 'turn-error', data: { kind: 'turn-error', seq: 4, message: '后续失败' } },
      { kind: 'turn-error', data: { kind: 'turn-error', seq: 2, message: '早期失败' } },
    ] } },
  });
  assert.deepEqual(snap.steps.map(step => step.id), ['1', '2', '3', '4']);
});

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
  assert.equal(toolLabel('wiki_read'), '读取研究页');
  assert.match(snap.runningCalls[0].name, /读取研究页/);
  assert.match(snap.runningCalls[0].args || '', /companies\/a/);
  assert.equal(snap.steps[0].body, '生成报告');
  assert.equal(snap.steps[1].body, '先读取页面');
  assert.equal(snap.steps[1].durationMs, 8);
  assert.match(snap.steps[2].title, /读取研究页 · companies\/a/);
  assert.equal(snap.steps[2].body, '已钉住快照');
  assert.match(snap.steps[2].args || '', /companies\/a/);
  assert.equal(snap.steps[2].durationMs, 15);
  assert.equal(snap.steps[3].failed, true);
  assert.equal(snap.steps[3].body, '模型超时');
  assert.equal(snap.hasMore, true);
});

test('未识别的轨迹事件不产生步骤', () => {
  const snap = projectTaskTrajectory({
    raw: {
      eventNodes: [
        { kind: 'turn', seq: 1, content: [{ type: 'text', text: '轮次头' }] },
        { kind: 'step', seq: 2, blocks: [{ kind: 'text', text: '步骤头' }] },
        { kind: 'request', seq: 3 },
        { kind: 'user', seq: 4, content: [{ type: 'text', text: '问题' }] },
        { kind: 'assistant', seq: 5, blocks: [{ kind: 'text', text: '回答' }] },
      ],
    },
  });
  assert.deepEqual(snap.steps.map(step => step.kind), ['user', 'assistant']);
  assert.equal(snap.steps.some(step => step.title === '执行记录'), false);
});

test('web_search 使用中文工具名', () => {
  assert.equal(toolLabel('web_search'), '网页搜索');
  const snap = projectTaskTrajectory({
    raw: {
      runningCalls: [{ callId: 'c1', name: 'web_search', argsRaw: '{"queries":["铝"]}', time: 1 }],
      eventNodes: [
        { kind: 'tool-result', seq: 1, call: { name: 'web_search', argsRaw: '{"queries":["铝"]}' }, content: [{ type: 'text', text: 'ok' }] },
      ],
    },
  });
  assert.match(snap.runningCalls[0].name, /网页搜索/);
  assert.match(snap.steps[0].title, /网页搜索/);
});

test('同名计算步骤按算子与窗口起止区分标题', () => {
  const snap = projectTaskTrajectory({
    raw: {
      runningCalls: [
        { callId: 'c1', name: 'calculate_metrics', argsRaw: '{"operation":"yoy","quantities":[{"slot":"current"},{"slot":"prior"}]}', time: 1 },
        { callId: 'c2', name: 'calculate_market_result', argsRaw: '{"result_id":"result:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa","windows":[{"window_start":"2026-01-02","window_end":"2026-01-31"}]}', time: 2 },
      ],
      eventNodes: [
        { kind: 'tool-result', seq: 1, call: { name: 'calculate_metrics', argsRaw: '{"operation":"market_window","window_start":"2026-06-01","window_end":"2026-09-15"}' }, content: [{ type: 'text', text: 'ok' }] },
        { kind: 'tool-result', seq: 2, call: { name: 'calculate_metrics', argsRaw: '{"operation":"yoy"}' }, content: [{ type: 'text', text: 'ok2' }] },
      ],
    },
  });
  assert.match(snap.runningCalls[0].name, /计算 · 同比/);
  assert.match(snap.runningCalls[1].name, /2026-01-02→2026-01-31/);
  assert.match(snap.steps[0].title, /计算 · 区间涨跌/);
  assert.match(snap.steps[0].title, /2026-06-01→2026-09-15/);
  assert.notEqual(snap.steps[0].title, snap.steps[1].title);
});

test('重新打开过程面板：加载中的空投影沿用旧步骤且反复读取返回同一对象', () => {
  const loaded = projectTaskTrajectory({ openState: 'ready', raw: { eventNodes: [{ kind: 'user', seq: 1, content: '研究' }] } });
  const cold = projectTaskTrajectory({ openState: 'cold', raw: undefined });
  const first = stableTaskTrajectory(loaded, cold);
  assert.equal(first.steps.length, 1);
  assert.equal(first.openState, 'cold');
  // useSyncExternalStore 要求内容未变时返回同一引用，否则无限重渲染（React #185）。
  assert.equal(stableTaskTrajectory(first, projectTaskTrajectory({ openState: 'cold', raw: undefined })), first);
  assert.equal(stableTaskTrajectory(loaded, projectTaskTrajectory({ openState: 'ready', raw: { eventNodes: [{ kind: 'user', seq: 1, content: '研究' }] } })), loaded);
});
