import assert from 'node:assert/strict';
import test from 'node:test';
import { loadFinanceModule } from './load_finance_module.ts';

const { statusBadges } = await loadFinanceModule<typeof import('../src/verticals/finance/lib/objectStatus.ts')>('lib/objectStatus.ts');

test('预览卡状态徽标：只在需要处理时出现，按可操作程度排序', () => {
  assert.deepEqual(statusBadges(undefined), []);
  assert.deepEqual(statusBadges({ slug: 'companies/600585-sh', existence: 'published', refresh: { state: 'none' }, maintenance: { pending: 0 }, drafts: { pending: 0 }, report: { exists: true, stale: false } }), []);
  assert.deepEqual(statusBadges({ slug: 'x', existence: 'building' }), ['建立中']);
  assert.deepEqual(statusBadges({ slug: 'x', existence: 'published', drafts: { pending: 1 }, maintenance: { pending: 2 }, refresh: { state: 'candidate' }, report: { exists: true, stale: true } }),
    ['草案待确认', '待确认维护', '有新资料', '报告已过期']);
  // 没有报告不算“报告已过期”；某一来源读取失败（null）不产生徽标。
  assert.deepEqual(statusBadges({ slug: 'x', existence: 'published', report: { exists: false, stale: true }, drafts: null, refresh: null }), []);
});
