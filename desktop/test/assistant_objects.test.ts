import assert from 'node:assert/strict';
import test from 'node:test';
import { documentObject } from '../src/verticals/finance/lib/assistantObjects.ts';

test('就此追问只插入 document 身份，不发送页面快照', () => {
  const ready = documentObject({
    documentId: 'a'.repeat(32),
    title: '年报',
    parseRevisionId: 'r1',
    parsedContentSha256: 'b'.repeat(64),
    ready: true,
  });
  assert.equal(ready.kind, 'document');
  assert.equal(ready.id, `document:${'a'.repeat(32)}/r1/${'b'.repeat(64)}`);
  assert.equal(ready.ready, true);
  assert.doesNotMatch(JSON.stringify(ready), /excerpt|页面快照|整页/);
  const unread = documentObject({ documentId: 'c'.repeat(32), title: '未解析' });
  assert.equal(unread.kind, 'document');
  assert.equal(unread.id, `document:${'c'.repeat(32)}`);
  assert.equal(unread.ready, false);
});
