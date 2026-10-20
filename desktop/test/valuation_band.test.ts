import assert from 'node:assert/strict';
import test from 'node:test';
import { bandTickGroups } from '../src/verticals/finance/lib/bandTicks.ts';

test('区间带：相距很近的两档合成一个刻度，相距远的分开', () => {
  // 神火 10-20：悲观 5.08、中性 22.08、乐观 22.45，带宽约 (22.45 − 5.08) × 1.16。
  const tiers = [{ name: '中性', price: 22.08 }, { name: '悲观', price: 5.08 }, { name: '乐观', price: 22.45 }];
  const groups = bandTickGroups(tiers, 25.5 * 1.08 - 5.08 * 0.92);
  assert.deepEqual(groups.map(group => group.map(item => item.name)), [['悲观'], ['中性', '乐观']]);
  const spread = bandTickGroups([{ name: '悲观', price: 3.45 }, { name: '中性', price: 5.19 }, { name: '乐观', price: 7.21 }], 7.21 * 1.08 - 3.45 * 0.92);
  assert.equal(spread.length, 3);
});
