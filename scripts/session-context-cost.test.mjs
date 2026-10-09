import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { project, summarize, audit } from './session-context-cost.mjs';

const usage = { inputTokens: 10, cacheReadTokens: 20, cacheWriteTokens: 0, outputTokens: 5, totalTokens: 35 };
const forbidden = () => { throw new Error('正文或参数被访问'); };
test('只投影用量与返回长度，不访问对话、提示词或工具参数', () => {
  for (const type of ['user/message', 'system/message', 'request/header', 'request/context'])
    assert.equal(project({ type, data: { get content() { return forbidden(); }, get header() { return forbidden(); } } }), null);
  const selected = project({ type: 'assistant/message', data: { turn: 1, step: 1, usage, get message() { return forbidden(); } } });
  assert.deepEqual(selected.usage, usage);
  assert.deepEqual(project({ type: 'tool/call', data: { callId: 'x', name: 'read_research_result', get arguments() { return forbidden(); } } }),
    { type: 'call', id: 'x', name: 'read_research_result' });
  const result = project({ type: 'tool/result', data: { message: { toolCallId: 'x', content: [{ type: 'text', text: '私密😀' }, { type: 'image' }] } } });
  assert.equal(result.chars, 4);
  assert.ok(!JSON.stringify(result).includes('私密'));
  assert.equal(result.nonTextParts, 1);
});
test('分别计算输入缓存与上下文，每步最终用量不重复相加，耗时覆盖工具等待', () => {
  const result = summarize([
    { type: 'step/start', turn: 1, step: 1, time: 100 }, { type: 'usage', turn: 1, step: 1, usage },
    { type: 'usage', turn: 1, step: 1, usage }, { type: 'step/end', turn: 1, step: 1, time: 300 },
    { type: 'step/start', turn: 1, step: 2, time: 400 }, { type: 'usage', turn: 1, step: 2, usage },
    { type: 'step/end', turn: 1, step: 2, time: 700 },
    { type: 'call', id: 'x', name: 'generate_market_result' }, { type: 'result', id: 'x', chars: 100, nonTextParts: 0 },
    { type: 'result', id: 'y', chars: 30, nonTextParts: 0 },
  ]);
  assert.equal(result.totals.totalTokens, 70);
  assert.equal(result.totals.uncachedInputTokens, 20);
  assert.equal(result.totals.cacheReadTokens, 40);
  assert.equal(result.totals.maxContextTokens, 30);
  assert.equal(result.totals.elapsedMs, 600);
  assert.equal(result.tools[1].name, '(unmatched)');
});
test('缺失用量或损坏记录不能当作零成本通过', () => {
  assert.throws(() => project({ type: 'assistant/message', data: { usage: { inputTokens: 1 } } }));
  const result = summarize([{ type: 'step/start', turn: 1, step: 1, time: 100 }, { type: 'malformed' }]);
  assert.equal(result.totals.stepsWithUsage, 0);
  assert.equal(result.totals.elapsedMs, null);
  assert.equal(result.perStep[0].contextTokens, null);
  assert.equal(result.totals.malformed, 1);
});
test('按唯一会话读取最高日志版本，不重复统计、不泄露正文，前缀歧义拒绝', async () => {
  const home = mkdtempSync(join(tmpdir(), 'session-cost-'));
  try {
    const dir = join(home, 'sessions', 'workspace', 'session-abcdef12-1111');
    mkdirSync(dir, { recursive: true });
    const records = [{ type: 'step/start', time: 1, data: { turn: 1, step: 1 } },
      { type: 'assistant/message', data: { turn: 1, step: 1, usage, message: 'NEVER_OUTPUT' } },
      { type: 'step/end', time: 3, data: { turn: 1, step: 1 } }];
    writeFileSync(join(dir, 'session.jsonl'), 'invalid\n');
    writeFileSync(join(dir, 'session.v4.jsonl'), records.map(r => JSON.stringify(r)).join('\n'));
    const result = await audit(home, 'session-abcdef12');
    assert.equal(result.totals.totalTokens, 35);
    assert.ok(!JSON.stringify(result).includes('NEVER_OUTPUT'));
    mkdirSync(join(home, 'sessions', 'workspace', 'session-abcdef12-2222'));
    writeFileSync(join(home, 'sessions', 'workspace', 'session-abcdef12-2222', 'session.jsonl'), '');
    await assert.rejects(audit(home, 'session-abcdef12'), /不唯一/);
    await assert.rejects(audit(home, 'session-00000000'), /没有匹配/);
  } finally { rmSync(home, { recursive: true }); }
});
