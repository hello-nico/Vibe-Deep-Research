import { test } from 'node:test';
import assert from 'node:assert/strict';

import { activeRefTuple, refTupleFromRecord, reduceRefResolution, type RefResolution } from '../src/verticals/finance/lib/refResolution.ts';

const TUPLE_A = { document_id: 'doc-a', parse_revision_id: 'rev-1', parsed_content_sha256: 'a'.repeat(64), block_id: 'b1' };

test('引用解析状态机:成功后切走 → 旧元组立即失效;失败不复活旧元组', () => {
  let state: RefResolution | null = null;
  // A 解析成功
  state = reduceRefResolution(state, { type: 'start', ref: 'evidence:a' });
  state = reduceRefResolution(state, { type: 'resolved', ref: 'evidence:a', tuple: TUPLE_A });
  assert.deepEqual(activeRefTuple(state, 'evidence:a'), TUPLE_A);
  // 切到 B:旧 A 元组立即失效(pending,无元组)
  state = reduceRefResolution(state, { type: 'start', ref: 'evidence:b' });
  assert.equal(state!.status, 'pending');
  assert.equal(activeRefTuple(state, 'evidence:b'), null, '解析未完成时不得有生效元组');
  // B 失败:仍是 failed,无元组、有错误态
  state = reduceRefResolution(state, { type: 'failed', ref: 'evidence:b' });
  assert.equal(state!.status, 'failed');
  assert.equal(activeRefTuple(state, 'evidence:b'), null);
  // 返回 A 且本次解析失败:不得复活旧的 A 元组(review 复现路径)
  state = reduceRefResolution(state, { type: 'start', ref: 'evidence:a' });
  assert.equal(state!.status, 'pending');
  assert.equal(activeRefTuple(state, 'evidence:a'), null, '返回旧引用必须重新解析,旧成功结果不生效');
  state = reduceRefResolution(state, { type: 'failed', ref: 'evidence:a' });
  assert.equal(state!.status, 'failed');
  assert.equal(activeRefTuple(state, 'evidence:a'), null);
});

test('引用解析状态机:迟到/过期响应被拒绝,只有当前 pending 引用的响应生效', () => {
  let state: RefResolution | null = null;
  state = reduceRefResolution(state, { type: 'start', ref: 'evidence:a' });
  state = reduceRefResolution(state, { type: 'resolved', ref: 'evidence:a', tuple: TUPLE_A });
  // 切到 B 后,A 的迟到成功响应不得覆盖
  state = reduceRefResolution(state, { type: 'start', ref: 'evidence:b' });
  state = reduceRefResolution(state, { type: 'resolved', ref: 'evidence:a', tuple: TUPLE_A });
  assert.equal(state!.status, 'pending', '过期响应被忽略');
  assert.equal(state!.ref, 'evidence:b');
  // failed 后再来的响应同样忽略
  state = reduceRefResolution(state, { type: 'failed', ref: 'evidence:b' });
  state = reduceRefResolution(state, { type: 'resolved', ref: 'evidence:b', tuple: TUPLE_A });
  assert.equal(state!.status, 'failed', '终态后响应被忽略');
  // 无前置状态的散落响应忽略
  assert.equal(reduceRefResolution(null, { type: 'resolved', ref: 'x', tuple: TUPLE_A }), null);
});

test('引用元组从解析记录提取:顶层与 location 嵌套同一读取规则', () => {
  const tuple = refTupleFromRecord({
    document_id: 'doc', parse_revision_id: 'rev', parsed_content_sha256: 'b'.repeat(64),
    location: { block_id: 'blk:p206:b6', page: 206 },
  });
  assert.deepEqual(tuple, { document_id: 'doc', parse_revision_id: 'rev', parsed_content_sha256: 'b'.repeat(64), block_id: 'blk:p206:b6' });
  const flat = refTupleFromRecord({ document_id: 'd2', parse_revision_id: 'r2', parsed_content_sha256: 'c'.repeat(64), block_id: 'b2' });
  assert.equal(flat.block_id, 'b2');
  const empty = refTupleFromRecord({});
  assert.deepEqual(empty, { document_id: '', parse_revision_id: '', parsed_content_sha256: '', block_id: '' });
});
