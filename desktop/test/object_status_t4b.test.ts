import assert from 'node:assert/strict';
import test from 'node:test';
import { loadFinanceModule } from './load_finance_module.ts';
import { createServer } from 'vite';
import { createServer as createHttpServer } from 'node:http';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { fileURLToPath } from 'node:url';

const status = await loadFinanceModule<typeof import('../src/verticals/finance/lib/objectStatus.ts')>('lib/objectStatus.ts');
const pending = await loadFinanceModule<typeof import('../src/verticals/finance/lib/pendingResearch.ts')>('lib/pendingResearch.ts');
const tasks = await loadFinanceModule<typeof import('../src/verticals/finance/lib/reportTasks.ts')>('lib/reportTasks.ts');

test('徽标排序与去处映射', () => {
  const row = { slug: 'companies/600900-sh', existence: 'building' as const, drafts: { pending: 1, latest: { draft_id: 'draft-123', status: 'pending' as const, created_at: '2026-09-24' } }, maintenance: { pending: 1 }, refresh: { state: 'candidate' as const }, report: { exists: true, stale: true } };
  assert.deepEqual(status.statusBadges(row), ['建立中', '草案待确认', '待确认维护', '有新资料', '报告已过期']);
  assert.equal(status.badgeHref(row.slug, '草案待确认', row), '/my-research?tab=tasks&draft=draft-123');
  assert.equal(status.badgeHref(row.slug, '有新资料', row), '/research?company=companies%2F600900-sh&refresh=confirm');
  assert.equal(status.badgeHref('industries/nbs-电力', '报告已过期', row), '/sectors/%E7%94%B5%E5%8A%9B?view=report');
  assert.equal(status.badgeHref(row.slug, '检查资料中', row), undefined);
});

test('徽标最多显示两项，余项在 +N 悬停信息中可读', async () => {
  const server = await createServer({ configFile: false, root: fileURLToPath(new URL('../', import.meta.url)),
    server: { middlewareMode: true, hmr: { server: createHttpServer() }, watch: null }, appType: 'custom' });
  try {
    const { ObjectStatusBadges } = await server.ssrLoadModule('/src/verticals/finance/components/ui/ObjectStatusBadges.tsx');
    const html = renderToStaticMarkup(createElement(ObjectStatusBadges, { slug: 'companies/600900-sh', badges: ['建立中', '有新资料', '报告已过期', '待确认维护'] }));
    assert.match(html, />\+2<\/span>/);
    assert.match(html, /title="报告已过期、待确认维护"/);
    assert.doesNotMatch(html, />报告已过期<\/button>/);
  } finally { await server.close(); }
});

test('状态读取超过 50 个对象时分批，缓存与单项预览共用', async () => {
  const original = globalThis.fetch;
  const batches: string[][] = [];
  globalThis.fetch = async (_input, init) => {
    const slugs = (JSON.parse(String(init?.body)) as { slugs: string[] }).slugs;
    batches.push(slugs);
    return new Response(JSON.stringify({ objects: slugs.map(slug => ({ slug, existence: 'published' })) }), { status: 200, headers: { 'content-type': 'application/json' } });
  };
  try {
    const slugs = Array.from({ length: 101 }, (_, i) => `companies/${String(i).padStart(6, '0')}-sh`);
    const rows = await status.loadObjectStatuses(slugs);
    assert.equal(rows.size, 101);
    assert.deepEqual(batches.map(batch => batch.length), [50, 50, 1]);
    await status.loadObjectBadges(slugs[0]!);
    assert.equal(batches.length, 3);
  } finally { globalThis.fetch = original; }
});

test('台账状态与失效原因决定任务文案，待处理计数排除已失效', () => {
  assert.equal(tasks.researchDraftStatus('pending'), 'awaiting_authorization');
  assert.equal(tasks.researchDraftStatus('published'), 'published');
  assert.equal(tasks.researchDraftStatus('invalid'), 'invalid');
  assert.equal(pending.draftInvalidReason('expired'), '超过 24 小时未确认');
  assert.equal(pending.draftInvalidReason('base_changed'), '研究页已更新');
  assert.equal(pending.draftInvalidReason('discarded'), '已放弃');
  const now = Date.parse('2026-09-24T12:00:00Z');
  const items = pending.pendingItems([{ slug: 'companies/600900-sh', refresh: { state: 'candidate', checked_at: '2026-09-24T11:00:00Z' }, maintenance: { pending: 1 } }], [
    { draft_id: 'draft-a', slug: 'companies/600900-sh', status: 'pending', created_at: '2026-09-24T10:00:00Z', updated_at: '2026-09-24T10:00:00Z' },
    { draft_id: 'draft-b', slug: 'companies/600900-sh', status: 'invalid', invalid_reason: 'base_changed', created_at: '2026-09-23T10:00:00Z', updated_at: '2026-09-24T09:00:00Z' },
    { draft_id: 'draft-c', slug: 'companies/600900-sh', status: 'invalid', invalid_reason: 'expired', created_at: '2026-09-01T10:00:00Z', updated_at: '2026-09-10T10:00:00Z' },
  ], now);
  assert.equal(items.length, 4);
  assert.equal(pending.pendingCount(items), 3);
  assert.ok(items.some(item => item.label === '草案已失效 · 研究页已更新'));
});
