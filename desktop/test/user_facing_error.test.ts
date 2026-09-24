import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { assistantSessionErrorMessage } from '../src/verticals/finance/assistant/sessions.ts';
import { citationClickOpensPanel } from '../src/verticals/finance/lib/citationMarks.ts';
import { projectTaskTrajectory } from '../src/verticals/finance/lib/taskTrajectory.ts';
import { userFacingRuntimeError } from '../src/verticals/finance/lib/userFacingError.ts';

test('运行时错误按类别转中文，不转发供应商或 Error: 原文', () => {
  assert.equal(userFacingRuntimeError('Error: DeepSeek search aborted'), '已停止');
  assert.equal(userFacingRuntimeError(Object.assign(new Error('Aborted'), { name: 'AbortError' })), '已停止');
  assert.equal(userFacingRuntimeError('Request timed out'), '请求超时，请重试');
  assert.equal(userFacingRuntimeError('insufficient balance'), '模型额度不足，请稍后再试');
  assert.equal(userFacingRuntimeError('invalid api key'), '模型还没配置好');
  assert.equal(userFacingRuntimeError('fetch failed'), '网络暂时连不上，请重试');
  assert.equal(userFacingRuntimeError('context window exceeded'), '内容太长，这一轮没法继续');
  assert.equal(userFacingRuntimeError('未配置模型'), '未配置模型');
  assert.equal(userFacingRuntimeError('weird_internal_code_XYZ', '这一步没有完成，请重试'), '这一步没有完成，请重试');
  assert.doesNotMatch(userFacingRuntimeError('Error: DeepSeek search aborted'), /DeepSeek|Error:/i);
});

test('通用函数遇 404 不返回会话失效文案', () => {
  const expired = '上次问助手会话已经失效，请再试一次';
  assert.notEqual(userFacingRuntimeError({ status: 404, message: 'missing' }, '无法打开该对话'), expired);
  assert.notEqual(userFacingRuntimeError('session "abc" not found', '无法打开该对话'), expired);
  assert.equal(userFacingRuntimeError({ status: 404, message: 'missing' }, '无法打开该对话'), '无法打开该对话');
  assert.equal(assistantSessionErrorMessage({ status: 404, message: 'session not found' }), expired);
});

test('api key quota 类错误不判为模型还没配置好', () => {
  assert.notEqual(userFacingRuntimeError('api key quota'), '模型还没配置好');
  assert.notEqual(userFacingRuntimeError('missing api key'), '模型还没配置好');
  assert.equal(userFacingRuntimeError('invalid api key'), '模型还没配置好');
});

test('带 metaKey 的引用点击不派发打开依据事件', () => {
  const opened: string[] = [];
  const open = (event: { button: number; metaKey?: boolean; ctrlKey?: boolean }) => {
    if (!citationClickOpensPanel(event)) return;
    opened.push('claim:first');
  };
  open({ button: 0, metaKey: true });
  open({ button: 0, ctrlKey: true });
  assert.deepEqual(opened, []);
  open({ button: 0 });
  assert.deepEqual(opened, ['claim:first']);
  const citations = readFileSync(new URL('../src/verticals/finance/components/ConversationCitations.tsx', import.meta.url), 'utf8');
  assert.match(citations, /if \(!citationClickOpensPanel\(event\)\) return;/);
  assert.match(citations, /finance-open-evidence/);
});

test('问助手会话错误走同一层映射，不再原样返回英文', () => {
  assert.equal(assistantSessionErrorMessage(new Error('Error: DeepSeek search aborted')), '已停止');
  assert.equal(assistantSessionErrorMessage(new Error('session not found')), '上次问助手会话已经失效，请再试一次');
  assert.equal(assistantSessionErrorMessage(new Error('weird_internal_code_XYZ'), '问助手没能启动，请重试'), '问助手没能启动，请重试');
});

test('同一错误文本只告警一次', () => {
  const lines: unknown[][] = [];
  const original = console.warn;
  console.warn = (...args: unknown[]) => { lines.push(args); };
  try {
    const once = `unique-runtime-error-${Date.now()}`;
    assert.equal(userFacingRuntimeError(once), '这一步没有完成，请重试');
    assert.equal(userFacingRuntimeError(once), '这一步没有完成，请重试');
    assert.equal(lines.filter(item => item[0] === '[runtime-error]' && item[1] === once).length, 1);
  } finally {
    console.warn = original;
  }
});

test('工具失败只上屏中文错误，不把原文再显示一遍', () => {
  const snap = projectTaskTrajectory({
    raw: {
      eventNodes: [
        {
          kind: 'tool-result', seq: 1, isError: true,
          call: { name: 'web_search', argsRaw: '{"queries":["铝"]}' },
          content: [{ type: 'text', text: 'Error: DeepSeek search aborted' }],
        },
        { kind: 'turn-error', seq: 2, message: 'Error: DeepSeek search aborted' },
      ],
    },
  });
  assert.equal(snap.steps[0].error, '已停止');
  assert.equal(snap.steps[0].body, undefined);
  assert.equal(snap.steps[1].body, '已停止');
  assert.doesNotMatch(JSON.stringify(snap.steps), /DeepSeek|Error:/i);
});
