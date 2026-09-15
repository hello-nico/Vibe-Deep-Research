import test from 'node:test';
import assert from 'node:assert/strict';
import { feedPageContext, investmentNewsPageContext } from '../src/verticals/finance/lib/feedPageContext.ts';

const snapshot = { kind: 'news' as const, watchCount: 1, loading: false, refreshing: false,
  err: null, staleNote: null, depNote: null,
  rows: [{ code: '000001', name: '测试公司', when: '2026-09-10', title: '标题样例', url: 'https://example.com/news' }],
};
test('助手收到当前列表的标题和来源，刷新生成新快照而不改旧请求上下文', () => {
  const before = feedPageContext(snapshot);
  assert.match(before.context, /标题样例/);
  assert.match(before.context, /https:\/\/example.com\/news/);
  assert.match(before.context, /未读取链接正文/);
  const after = feedPageContext({ ...snapshot, rows: [{ ...snapshot.rows[0]!, title: '更新标题' }] });
  assert.match(after.context, /更新标题/);
  assert.doesNotMatch(after.context, /标题样例/);
  assert.doesNotMatch(before.context, /更新标题/);
});
test('公告上下文独立，空态及刷新失败不冒充已有最新数据', () => {
  const filings = feedPageContext({ ...snapshot, kind: 'filings', rows: [], loading: true });
  assert.equal(filings.key, 'intel:filings');
  assert.match(filings.context, /正在加载/);
  assert.doesNotMatch(filings.context, /标题样例/);
  const stale = feedPageContext({ ...snapshot, refreshing: true, staleNote: '刷新失败，保留快照', depNote: '部分股票未更新' });
  assert.match(stale.context, /刷新失败/);
  assert.match(stale.context, /部分股票未更新/);
  assert.match(stale.context, /不代表刷新后的最新结果/);
  assert.match(stale.context, /标题样例/);
  assert.doesNotMatch(feedPageContext({ ...snapshot, watchCount: 0 }).context, /标题样例/);
});

const newsSnapshot = {
  industryKey: 'ai', industryName: 'AI / 大模型',
  tracks: [{ key: 'ai', name: 'AI / 大模型', count: 1 }, { key: 'semi', name: '半导体', count: 0 }],
  items: [{ time: '2026-09-15', source: '量子位', title: '中文标题', original: 'English title', url: 'https://example.com/ai' }],
  generatedAt: '2026-09-15T14:15:22+08:00', recentDays: 3, sourceCount: 98,
  loading: false, refreshing: false, err: null, staleNote: null,
};
test('Investment News 助手收到当前赛道标题和来源，不含栏目壳', () => {
  const page = investmentNewsPageContext(newsSnapshot);
  assert.equal(page.key, 'intel:investment-news:ai');
  assert.match(page.context, /当前赛道：AI \/ 大模型/);
  assert.match(page.context, /中文标题/);
  assert.match(page.context, /English title/);
  assert.match(page.context, /https:\/\/example.com\/ai/);
  assert.match(page.context, /未读取链接正文/);
  assert.doesNotMatch(page.context, /可选栏目/);
});
test('Investment News 空态与刷新中不冒充已有最新条目', () => {
  const empty = investmentNewsPageContext({ ...newsSnapshot, items: [], generatedAt: null });
  assert.match(empty.context, /尚未抓取资讯/);
  assert.doesNotMatch(empty.context, /中文标题/);
  const stale = investmentNewsPageContext({ ...newsSnapshot, refreshing: true, staleNote: '刷新失败，保留快照' });
  assert.match(stale.context, /刷新失败/);
  assert.match(stale.context, /不代表刷新后的最新结果/);
  assert.match(stale.context, /中文标题/);
});
