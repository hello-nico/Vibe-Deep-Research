import assert from 'node:assert/strict';
import test from 'node:test';
import { assistantTurnNote } from '../src/verticals/finance/dsh/assistant-turn-note.ts';
import { askNoteContent, askNoteTitle } from '../src/verticals/finance/lib/taskTrajectory.ts';

const panel = { kind: 'assistant' as const, sessionId: 's1', pageName: '资讯雷达' };
const users = [{ content: [{ type: 'text', text: '当前页面：资讯雷达\n用户问题：\n这条消息影响哪些公司' }] }];
const closing = { status: 'settled', blocks: [{ kind: 'text', text: '回答正文，见依据。' }], time: new Date('2026-09-23T10:00:00+08:00').getTime() };
const input = { panel, sessionId: 's1', turnClosed: true, failed: false, users, closing };

test('原生已完成轮次只在对应问助手面板生成保存内容', () => {
  const note = assistantTurnNote(input);
  assert.deepEqual(note, {
    title: '问助手 · 这条消息影响哪些公司',
    content: ['## 问题', '这条消息影响哪些公司', '## 回答', '回答正文，见依据。', '', '---', '来源：资讯雷达 · 2026/09/23 10:00'].join('\n'),
  });
  assert.equal(assistantTurnNote({ ...input, panel: { kind: 'topic', sessionId: 's1', topicId: 'topic:1', title: '议题', judgment: '', questions: [], fresh: true } }), null);
  assert.equal(assistantTurnNote({ ...input, sessionId: 'other' }), null);
});

test('运行、失败、中止、空回答和缺问题的轮次不显示保存', () => {
  assert.equal(assistantTurnNote({ ...input, turnClosed: false }), null);
  assert.equal(assistantTurnNote({ ...input, failed: true }), null);
  assert.equal(assistantTurnNote({ ...input, closing: { ...closing, status: 'interrupted' } }), null);
  assert.equal(assistantTurnNote({ ...input, closing: { ...closing, blocks: [] } }), null);
  assert.equal(assistantTurnNote({ ...input, users: [] }), null);
});

test('保存标题与来源沿用既有格式', () => {
  assert.equal(askNoteTitle('长'.repeat(60)), `问助手 · ${'长'.repeat(40)}`);
  assert.equal(askNoteContent({ question: 'q', answer: 'a', pageName: '公司研究' }),
    ['## 问题', 'q', '## 回答', 'a', '', '---', '来源：公司研究'].join('\n'));
});
