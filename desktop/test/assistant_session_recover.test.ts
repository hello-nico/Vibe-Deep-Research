import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import {
  AssistantBindingError,
  assistantSessionErrorMessage,
  isMissingAssistantSession,
} from '../src/verticals/finance/assistant/sessions.ts';

test('问助手不把 session not found 原文露给界面', () => {
  assert.equal(isMissingAssistantSession(new AssistantBindingError(404, 'session not found')), true);
  assert.equal(isMissingAssistantSession({ status: 404 }), true);
  assert.equal(isMissingAssistantSession(new Error('session "abc" not found')), true);
  assert.equal(assistantSessionErrorMessage(new Error('session not found')), '上次问助手会话已经失效，请再试一次');
  assert.doesNotMatch(assistantSessionErrorMessage(new Error('session not found')), /session not found/i);
  assert.doesNotMatch(assistantSessionErrorMessage({ status: 404, message: 'session not found' }), /sessionnotfound|session not found/i);
});

test('失效绑定会新开会话，不再要求旧条目是 blank', () => {
  const apply = readFileSync(new URL('../src/verticals/finance/assistant/apply.ts', import.meta.url), 'utf8');
  assert.match(apply, /isMissingAssistantSession\(error\)/);
  assert.doesNotMatch(apply, /list\.byId\[reusable\]\?\.blank/);
  assert.match(apply, /await withSession\(reusable/);
});
