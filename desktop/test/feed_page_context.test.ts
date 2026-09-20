import test from 'node:test';
import assert from 'node:assert/strict';
import { feedPageContext, investmentNewsPageContext } from '../src/verticals/finance/lib/feedPageContext.ts';
import { assistantBindingForPage, assistantIntro, assistantModeHint, assistantPlaceholder } from '../src/verticals/finance/lib/assistantSessions.ts';
import { companyQuoteObject, dailyReviewQuoteObjects, wikiAssistantObject } from '../src/verticals/finance/lib/pageAssistantObjects.ts';

const snapshot = { kind: 'news' as const, watchCount: 1, loading: false, refreshing: false,
  err: null, staleNote: null, depNote: null,
  rows: [{ code: '000001', name: '测试公司', when: '2026-09-10', title: '标题样例', url: 'https://example.com/news' }],
};
test('助手对象登记当前列表身份，不把标题写进整页 context', () => {
  const before = feedPageContext(snapshot);
  assert.equal(before.objects[0]?.label, '标题样例');
  assert.equal(before.objects[0]?.id, 'url:https://example.com/news');
  assert.match(before.context, /未读取链接正文/);
  assert.doesNotMatch(before.context, /标题样例/);
  const after = feedPageContext({ ...snapshot, rows: [{ ...snapshot.rows[0]!, title: '更新标题' }] });
  assert.equal(after.objects[0]?.label, '更新标题');
  assert.notEqual(before.objects[0]?.label, after.objects[0]?.label);
});
test('公告上下文独立，空态及刷新失败不冒充已有最新数据', () => {
  const filings = feedPageContext({ ...snapshot, kind: 'filings', rows: [], loading: true });
  assert.equal(filings.key, 'intel:filings');
  assert.match(filings.context, /正在加载/);
  assert.equal(filings.objects.length, 0);
  const stale = feedPageContext({ ...snapshot, refreshing: true, staleNote: '刷新失败，保留快照', depNote: '部分股票未更新' });
  assert.match(stale.context, /刷新失败/);
  assert.match(stale.context, /部分股票未更新/);
  assert.match(stale.context, /不代表刷新后的最新结果/);
  assert.equal(stale.objects[0]?.label, '标题样例');
  assert.equal(feedPageContext({ ...snapshot, watchCount: 0 }).objects.length, 0);
});

const newsSnapshot = {
  industryKey: 'ai', industryName: 'AI / 大模型',
  tracks: [{ key: 'ai', name: 'AI / 大模型', count: 1 }, { key: 'semi', name: '半导体', count: 0 }],
  items: [{ time: '2026-09-15', source: '量子位', title: '华为云全面面向智能体，推出盘古 5.0', original: 'English title', url: 'https://example.com/huawei-cloud' }],
  generatedAt: '2026-09-15T14:15:22+08:00', recentDays: 3, sourceCount: 98,
  loading: false, refreshing: false, err: null, staleNote: null,
};
test('Investment News 对象绑定当前赛道真实 URL，不含栏目壳', () => {
  const page = investmentNewsPageContext(newsSnapshot);
  assert.equal(page.key, 'intel:investment-news:ai');
  assert.match(page.context, /当前赛道：AI \/ 大模型/);
  assert.equal(page.objects[0]?.label, '华为云全面面向智能体，推出盘古 5.0');
  assert.equal(page.objects[0]?.id, 'url:https://example.com/huawei-cloud');
  assert.equal(page.objects[0]?.source, '量子位');
  assert.match(page.context, /未读取链接正文/);
  assert.doesNotMatch(page.context, /华为云/);
  assert.doesNotMatch(page.context, /可选栏目/);
});
test('Investment News 空态与刷新中不冒充已有最新条目', () => {
  const empty = investmentNewsPageContext({ ...newsSnapshot, items: [], generatedAt: null });
  assert.match(empty.context, /尚未抓取资讯/);
  assert.equal(empty.objects.length, 0);
  const stale = investmentNewsPageContext({ ...newsSnapshot, refreshing: true, staleNote: '刷新失败，保留快照' });
  assert.match(stale.context, /刷新失败/);
  assert.match(stale.context, /不代表刷新后的最新结果/);
  assert.equal(stale.objects[0]?.label, newsSnapshot.items[0]?.title);
});
test('五角色绑定：资讯和大盘不再落到 deep_research，切赛道不换会话键', () => {
  assert.deepEqual(assistantBindingForPage('daily-review'), { plugin: 'market', target: '', bindKey: 'market:daily-review' });
  assert.equal(assistantBindingForPage('intel:investment-news:ai').plugin, 'intel');
  assert.equal(assistantBindingForPage('intel:investment-news:ai').bindKey, 'intel:radar');
  assert.equal(assistantBindingForPage('intel:investment-news:semi').bindKey, 'intel:radar');
  assert.equal(assistantBindingForPage('intel:news').bindKey, 'intel:radar');
  assert.equal(assistantBindingForPage('industry-profile:801080.SI').plugin, 'industry_profile');
  assert.equal(assistantBindingForPage('company-wiki:companies/600900-sh').plugin, 'company_wiki');
  assert.equal(assistantBindingForPage('industry-wiki:industries/nbs-power').plugin, 'industry_wiki');
});
test('问助手开场介绍按页面区分，对象提示不出现已发布版本或当前页', () => {
  assert.match(assistantIntro('market', 'daily-review'), /当日盘面/);
  assert.match(assistantIntro('intel', 'intel:investment-news:ai'), /赛道整理的资讯/);
  assert.match(assistantIntro('intel', 'intel:filings'), /公告列表/);
  assert.match(assistantIntro('industry_wiki', 'industry-wiki:industries/nbs-power'), /这个行业的研究页/);
  assert.match(assistantIntro('industry_profile', 'industry-profile:list'), /产业研究目录/);
  assert.match(assistantIntro('company_wiki', 'company-wiki:list'), /个股研究名单/);
  assert.match(assistantIntro('company_wiki', 'company-wiki:companies/600900-sh'), /这家公司的研究页/);
  const wiki = wikiAssistantObject({ slug: 'companies/600900-sh', title: '长江电力', inputHash: 'a'.repeat(64), section: '个股研究' });
  assert.equal(wiki?.hint, undefined);
  assert.doesNotMatch(JSON.stringify(wiki), /已发布版本|当前页/);
});
test('问助手输入框按 Ask/Agent 各给一句权限说明', () => {
  assert.equal(assistantPlaceholder('ask'), assistantModeHint('ask'));
  assert.match(assistantModeHint('ask'), /只帮你看和解释.*不会改任何内容/);
  assert.match(assistantModeHint('agent'), /可以帮你改和补资料.*维护判断和分析/);
  assert.notEqual(assistantModeHint('ask'), assistantModeHint('agent'));
});
test('大盘可见个股登记为公司行情身份，不把连板数字当版本，也不造涨停榜集合', () => {
  assert.equal(companyQuoteObject({ symbol: '002403', name: '爱仕达' })?.id, 'company:002403.SZ');
  assert.equal(companyQuoteObject({ symbol: '600865', name: '百大集团' })?.id, 'company:600865.SH');
  const objects = dailyReviewQuoteObjects({
    asOf: '2026-09-20',
    lianban: [{ code: '002403', name: '爱仕达' }, { code: '600865', name: '百大集团' }],
    turnover: [{ code: '002403', name: '爱仕达' }, { code: '000001', name: '平安银行' }],
  });
  assert.deepEqual(objects.map(item => item.id), ['company:002403.SZ', 'company:600865.SH', 'company:000001.SZ']);
  assert.equal(objects[0]?.section, '连板股');
  assert.equal(objects[2]?.section, '成交额');
  assert.match(objects[0]?.hint || '', /观察范围 2026-09-20/);
  assert.equal(objects.some(item => item.id.includes('zt') || item.kind === 'limit-up'), false);
});
