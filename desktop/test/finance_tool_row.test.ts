import assert from 'node:assert/strict';
import test from 'node:test';
import { FINANCE_TOOL_NAMES, toolLabel, toolStepTitle } from '../src/verticals/finance/lib/taskTrajectory.ts';
import { financeToolRowModel } from '../src/verticals/finance/dsh/tool-row-model.ts';

test('Finance tool view covers product tools without replacing DSH browser tools', () => {
  for (const name of ['today', 'wiki_read', 'calculate_metrics', 'topic_update', 'note_list', 'note_read']) {
    assert.ok(FINANCE_TOOL_NAMES.includes(name), name);
  }
  for (const name of ['web_search', 'web_fetch', 'stock_search_external']) {
    assert.ok(!FINANCE_TOOL_NAMES.includes(name), name);
  }
});

test('tool titles share product terms and never expose result or document identities', () => {
  assert.equal(toolLabel('topic_get'), '读取议题');
  assert.equal(toolLabel('topic_list_links'), '列出议题关联');
  assert.equal(toolLabel('note_read'), '读取研究记录');
  assert.equal(toolLabel('read_hard_relations'), '读取对象关系');
  assert.equal(toolLabel('stage_extraction'), '暂存事实候选');
  assert.equal(toolLabel('wiki_schema_graph'), '读取关系类型');
  assert.equal(toolStepTitle('wiki_read', JSON.stringify({ slug: 'companies/600309-sh' })), '读取研究页 · companies/600309-sh');
  assert.equal(toolStepTitle('calculate_metrics', JSON.stringify({ operation: 'yoy' })), '计算 · 同比');
  for (const value of ['result:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa', 'document:abc', 'a'.repeat(64), 'r-legacy-abcd']) {
    assert.equal(toolStepTitle('generate_market_result', JSON.stringify({ symbol: value })), '生成行情成果');
  }
});

test('settled failures expose a Chinese summary and keep the raw error in details', () => {
  const model = financeToolRowModel('wiki_read', {
    kind: 'tool-result', call: { name: 'wiki_read', argsRaw: JSON.stringify({ slug: 'companies/600309-sh' }) },
    callTime: 1000, time: 2500, content: [{ type: 'text', text: 'fetch failed' }], isError: true,
  } as never);
  assert.equal(model.title, '读取研究页 · companies/600309-sh');
  assert.equal(model.state, 'error');
  assert.equal(model.result, '网络暂时连不上，请重试');
  assert.equal(model.rawError, 'fetch failed');
  assert.equal(model.elapsed, '1.5 秒');
});
