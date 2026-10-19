import test from 'node:test';
import assert from 'node:assert/strict';
import { feedPageContext } from '../src/verticals/finance/lib/feedPageContext.ts';
import { ASSISTANT_PLACEHOLDER, assistantIntro } from '../src/verticals/finance/assistant/sessions.ts';
import { assistantBindingForPage } from '../src/verticals/finance/assistant/binding.ts';
import { companyQuoteObject, wikiAssistantObject } from '../src/verticals/finance/lib/pageAssistantObjects.ts';

const snapshot = { kind: 'news' as const, watchCount: 1, loading: false, refreshing: false,
  err: null, staleNote: null, depNote: null,
  rows: [{ code: '000001', name: '测试公司', when: '2026-09-10', title: '标题样例', url: 'https://example.com/news' }],
};
test('助手对象登记当前列表身份，页面快照含列表标题但不冒充已读正文', () => {
  const before = feedPageContext(snapshot);
  assert.equal(before.objects[0]?.label, '标题样例');
  assert.equal(before.objects[0]?.id, 'url:https://example.com/news');
  assert.match(before.context, /当前栏目/);
  assert.doesNotMatch(before.context, /【页面快照】/);
  assert.match(before.context, /标题样例/);
  assert.match(before.context, /@ 后由宿主读取/);
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

test('资讯两栏发送快照按 @ 与 Ask/Agent 裁剪，最多最近 20 条', () => {
  const rows = Array.from({ length: 25 }, (_, i) => ({ code: '000001', name: '测试公司', when: `2026-09-${String(25 - i).padStart(2, '0')}`, title: `标题${i}`, url: `https://example.com/${i}` }));
  for (const kind of ['news', 'filings'] as const) {
    const page = feedPageContext({ ...snapshot, kind, rows });
    const picked = page.objects[3]!;
    for (const mode of ['ask', 'agent'] as const) {
      const selected = page.snapshotForSend(mode, [picked]);
      assert.match(selected, /本栏共 25 条，其余未提供/);
      assert.match(selected, /标题3/);
      assert.doesNotMatch(selected, /标题2|标题4/);
      assert.equal(selected.includes(picked.url!), mode === 'agent');
      const whole = page.snapshotForSend(mode, []);
      assert.match(whole, /共 25 条，以下最近 20 条/);
      assert.match(whole, /标题19/);
      assert.doesNotMatch(whole, /标题20/);
      assert.equal(whole.includes('https://example.com/0'), mode === 'agent');
    }
  }
});
test('五角色绑定：资讯和大盘不再落到 deep_research，切赛道不换会话键', () => {
  assert.equal(assistantBindingForPage('daily-review'), null);
  assert.equal(assistantBindingForPage('intel:news')?.plugin, 'intel');
  assert.equal(assistantBindingForPage('intel:news')?.bindKey, 'intel:radar');
  assert.equal(assistantBindingForPage('industry-profile:801080.SI')?.plugin, 'industry_profile');
  // §9.2 缺口修复：产业研究详情页绑定 Profile 身份供只读叙述，列表页仍不绑定具体对象。
  assert.equal(assistantBindingForPage('industry-profile:801080.SI')?.target, 'profile:sw2:801080.SI');
  assert.equal(assistantBindingForPage('industry-profile:list')?.target, '');
  assert.equal(assistantBindingForPage('company-wiki:companies/600900-sh')?.plugin, 'company_wiki');
  assert.equal(assistantBindingForPage('industry-wiki:industries/nbs-power')?.plugin, 'industry_wiki');
  assert.equal(assistantBindingForPage('home'), null);
  assert.equal(assistantBindingForPage('my-research'), null);
  assert.equal(assistantBindingForPage('my-research:topics:abc'), null);
  // 资料阅读页“就此追问”：每份资料一段问助手对话，按资讯与公告原文的角色解读（M6-B 并排阅读恢复）。
  assert.deepEqual(assistantBindingForPage('document:abc:r-1'), { plugin: 'intel', target: '', bindKey: 'document:abc' });
  assert.equal(assistantBindingForPage('signals'), null);
});
test('问助手开场介绍按页面区分，对象提示不出现已发布版本或当前页', () => {
  assert.match(assistantIntro('intel', 'intel:news'), /选一条新闻/);
  assert.match(assistantIntro('intel', 'intel:filings'), /选一条公告/);
  assert.match(assistantIntro('industry_wiki', 'industry-wiki:industries/nbs-power'), /这个行业怎么赚钱/);
  assert.match(assistantIntro('industry_profile', 'industry-profile:list'), /选一个产业/);
  assert.match(assistantIntro('company_wiki', 'company-wiki:list'), /选一家公司/);
  assert.match(assistantIntro('company_wiki', 'company-wiki:companies/600900-sh'), /另一家公司可以做对比/);
  const wiki = wikiAssistantObject({ slug: 'companies/600900-sh', title: '长江电力', inputHash: 'a'.repeat(64), section: '个股研究' });
  assert.equal(wiki?.hint, undefined);
  assert.doesNotMatch(JSON.stringify(wiki), /已发布版本|当前页/);
});
test('问助手输入框不分模式，只给一句提示', () => {
  assert.equal(ASSISTANT_PLACEHOLDER, '问问这一页的内容，或让它帮你查');
});
test('个股行情登记为公司行情身份，不把裸代码当版本', () => {
  assert.equal(companyQuoteObject({ symbol: '002403', name: '爱仕达' })?.id, 'company:002403.SZ');
  assert.equal(companyQuoteObject({ symbol: '600865', name: '百大集团' })?.id, 'company:600865.SH');
});
