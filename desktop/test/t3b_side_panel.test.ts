import assert from 'node:assert/strict';
import test from 'node:test';
import { selectSidePanel, topicOpeningQuestions } from '../src/verticals/finance/dsh/side-panel.ts';

const topic = { kind: 'topic' as const, sessionId: 'topic-1', topicId: 'topic:1', title: '议题', judgment: '待核验', questions: [], fresh: true };
const assistant = { kind: 'assistant' as const, sessionId: 'assistant-1', pageName: '资讯雷达' };
const task = { kind: 'task' as const, task: { kind: 'knowledge' as const, sessionId: 'task-1', title: '知识整理' } };

test('统一面板后开替换先开，关闭清空，与主区相同会话不重复挂载', () => {
  assert.equal(selectSidePanel(null, topic, 'main-1'), topic);
  assert.equal(selectSidePanel(topic, assistant, 'main-1'), assistant);
  assert.equal(selectSidePanel(assistant, task, 'main-1'), task);
  assert.equal(selectSidePanel(task, null, 'main-1'), null);
  assert.equal(selectSidePanel(task, topic, 'topic-1'), null);
  assert.equal(selectSidePanel(topic, assistant, 'assistant-1'), null);
});

test('议题开场问题去空去重并取前三条，保持原顺序', () => {
  assert.deepEqual(topicOpeningQuestions(['  第一个  ', '', '第二个', '第一个', '第三个', '第四个']), ['第一个', '第二个', '第三个']);
  assert.deepEqual(topicOpeningQuestions(undefined), []);
});
