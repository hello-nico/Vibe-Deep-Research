import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { buildDailyReviewSnapshot, buildDirectorySnapshot, buildEventsProbabilitySnapshot, buildFeedListSnapshot, buildIndustryProfileSnapshot, buildWikiPageSnapshot, citedWikiVersionFailure, clipPageSnapshot, formatCompanyFromSnapshot } from '../src/verticals/finance/assistant/snapshot.ts';
import { MARKET_INDEX_IDS, globalIndexObject } from '../src/verticals/finance/lib/pageAssistantObjects.ts';

test('大盘 company: 从快照绑定连板股显示值，无该股写缺口', () => {
  const quotes = [{
    id: 'company:600865.SH', name: '百大集团', symbol: '600865.SH', section: '连板股',
    price: 12.3, change_pct: 10.01, amount: 8.5e8, float_cap: 2.1e9, boards: 3, industry: '零售',
    asOf: '2026-09-18', source: 'eastmoney', fetched_at: '2026-09-18T15:00:00+08:00',
  }];
  const bound = formatCompanyFromSnapshot({ id: 'company:600865.SH', label: '百大集团' }, quotes);
  assert.match(bound, /连板：3 板/);
  assert.match(bound, /现价 12.3/);
  assert.match(bound, /流通市值 21 亿/);
  assert.match(bound, /来源：eastmoney/);
  assert.match(bound, /取数时点：2026-09-18T15:00:00\+08:00/);
  assert.doesNotMatch(bound, /没有对应的宿主读取契约/);
  const missing = formatCompanyFromSnapshot({ id: 'company:000001.SZ', label: '平安银行' }, quotes);
  assert.match(missing, /页面快照中没有该股的显示值/);
  const unlabeled = formatCompanyFromSnapshot({ id: 'company:600865.SH', label: '百大集团' }, [{
    ...quotes[0]!, source: undefined, fetched_at: undefined,
  }]);
  assert.match(unlabeled, /来源：未标注/);
});

test('Topic 绑定契约读取 markdown 或主张/观察/判断，时点 last_touched_at', () => {
  const source = readFileSync(new URL('../src/verticals/finance/assistant/prompt.ts', import.meta.url), 'utf8');
  assert.match(source, /last_touched_at/);
  assert.match(source, /user_claim/);
  assert.match(source, /topic\.markdown/);
  assert.match(source, /item\.version \|\| parsed\.inputHash/);
  assert.match(source, /citedWikiVersionFailure\(expected, hash\)/);
  assert.match(source, /replace\(\/\^【页面快照】\\s\*\/, ''\)/);
  assert.match(source, /if \(!hash\)/);
  assert.match(source, /researchRead<string>\(`\/documents\/\$\{encodeURIComponent\(id\)\}\/parsed/);
  assert.match(source, /error\.status === 409/);
  assert.match(source, /kind === 'company'/);
  assert.match(source, /绑定版本已不在修订列表/);
  assert.doesNotMatch(source, /来源：同花顺|来源：东方财富/);
});

test('大盘快照按块标注信封来源与时点，缺则未标注，不写死来源', () => {
  const snapshot = buildDailyReviewSnapshot({
    reviewDate: '2026-09-18',
    fetchedAt: '2026-09-18T15:05:00+08:00',
    dataReady: true,
    indices: [{ name: '上证指数', price: 3200, change_pct: 0.5, source: 'tencent', fetched_at: '2026-09-18T15:00:00+08:00' }],
    globalIndices: [{ name: '道琼斯', region: '美股', price: 100, change_pct: 0.1, source: 'tencent', fetched_at: '2026-09-18T04:00:00+08:00' }],
    globalDone: true,
    sentiment: {
      breadth: '偏强', speculation: '活跃', up: 3000, down: 2000, source: 'eastmoney', fetched_at: '2026-09-18T15:01:00+08:00',
    },
    emotion: {
      date: '2026-09-18', source: 'eastmoney', fetched_at: '2026-09-18T15:02:00+08:00',
      zt_count: 40, dt_count: 2, max_boards: 5, lianban_count: 12,
      seal_rate: 0.7, break_rate: 0.2, promotion_rate: 0.3,
      lianban_stocks: [{ code: '600865', name: '百大集团', boards: 3, price: 12.3, pct: 10, amount: 1e8 }],
    },
    emoDone: true,
    ovDone: true,
    sectors: [{ name: '银行', pct: 1, net: 2 }],
    sectorsSource: 'eastmoney',
    sectorsFetchedAt: '2026-09-18T15:03:00+08:00',
    turnover: { source: 'eastmoney', updated: '2026-09-18T15:04:00+08:00', stocks: [{ name: '平安银行', code: '000001', price: 10, pct: 1, amount: 2e9 }] },
    toDone: true,
    idxDone: true,
    idxErr: false,
  });
  assert.match(snapshot, /来源 tencent/);
  assert.match(snapshot, /取数时点 2026-09-18T15:00:00\+08:00/);
  assert.match(snapshot, /来源 eastmoney/);
  assert.match(snapshot, /前端按上涨家数占比与涨停家数阈值派生/);
  assert.match(snapshot, /行业板块成分加总，不是交易所公布口径/);
  assert.match(snapshot, /连板股/);
  assert.match(snapshot, /百大集团/);
  assert.doesNotMatch(snapshot, /orchestrator/);
  assert.doesNotMatch(snapshot, /来源 同花顺|来源 东方财富/);
  assert.doesNotMatch(snapshot, /【页面快照】/);
  assert.match(snapshot, /【页面状态】/);
  assert.equal(MARKET_INDEX_IDS['上证指数'], '000001.SH');
  const unlabeled = buildDailyReviewSnapshot({
    reviewDate: '2026-09-18',
    fetchedAt: null,
    dataReady: true,
    indices: [{ name: '上证指数', price: 3200, change_pct: 0.5 }],
    globalIndices: [],
    globalDone: true,
    emoDone: true,
    ovDone: true,
    sectors: [],
    turnover: { stocks: [{ name: '平安银行', code: '000001', price: 10, pct: 1, amount: 2e9 }] },
    toDone: true,
    idxDone: true,
    idxErr: false,
  });
  assert.match(unlabeled, /来源 未标注/);
  assert.match(unlabeled, /取数时点未标注/);
});

test('截断优先保留与 @ 相关段落', () => {
  const long = `${'指数段\n'.repeat(5000)}\n\n【连板股】\n- 百大集团（600865.SH）：连板 3 板\n`;
  const clipped = clipPageSnapshot(long, ['company:600865.SH', '百大集团']);
  assert.equal(clipped.truncated, true);
  assert.match(clipped.body, /百大集团/);
  assert.match(clipped.body, /已截断，优先保留与 @ 对象相关部分/);
});

test('Wiki 绑定指定版本但回包无 hash 则拒绝正文', () => {
  const hash = 'a'.repeat(64);
  assert.equal(citedWikiVersionFailure(hash, undefined), '回包没有内容版本，不能按绑定版本分析。');
  assert.equal(citedWikiVersionFailure(hash, ''), '回包没有内容版本，不能按绑定版本分析。');
  assert.match(citedWikiVersionFailure(hash, 'b'.repeat(64)) || '', /不一致/);
  assert.equal(citedWikiVersionFailure(hash, hash), null);
  assert.equal(citedWikiVersionFailure(undefined, hash), null);
});

test('产业研究快照保留全部问题与 rationale，截断处写明', () => {
  const questions = Array.from({ length: 8 }, (_, i) => ({
    q: `问题${i + 1}`,
    rationale: `解释${i + 1}：页面上展示的判断依据`,
  }));
  const snapshot = buildIndustryProfileSnapshot({
    industry_name: '电子',
    industry_code: '801080.SI',
    status: 'ready',
    card_count: 8,
    companies: ['公司甲'],
    profile_sha256: 'c'.repeat(64),
    core_questions: questions,
  });
  assert.doesNotMatch(snapshot, /【页面快照】/);
  assert.match(snapshot, /核心问题 8 条/);
  assert.match(snapshot, /问题6/);
  assert.match(snapshot, /解释6：页面上展示的判断依据/);
  assert.match(snapshot, /状态 ready/);
  assert.match(snapshot, /研究切入点 8/);
  const huge = buildIndustryProfileSnapshot({
    industry_name: '电子',
    industry_code: '801080.SI',
    core_questions: Array.from({ length: 400 }, (_, i) => ({
      q: `很长的问题标题用来撑满快照上限 ${i} ${'核'.repeat(40)}`,
      rationale: `很长的解释 ${'据'.repeat(80)}`,
    })),
  });
  assert.match(huge, /页面快照已截断/);
});

test('产业研究快照携带 evidence_docs 的已加载标题与可读引用，不编造未加载标题', () => {
  const withTitle = buildIndustryProfileSnapshot({
    industry_name: '电子',
    industry_code: '801080.SI',
    core_questions: [{ q: '需求拐点在哪', rationale: '页面判断依据', evidence_docs: ['a'.repeat(32), 'b'.repeat(32)] }],
  }, { [`${'a'.repeat(32)}`]: '2026 年半导体行业年报' });
  assert.match(withTitle, /2026 年半导体行业年报/);
  assert.match(withTitle, new RegExp(`document:${'a'.repeat(32)}`));
  // 标题尚未取到时如实标"来源研报"，不假装已读到标题。
  assert.match(withTitle, /- 来源研报 `document:b{32}`/);
});

test('Wiki 快照看加载中与缺页，目录不静默丢条目', () => {
  const loading = buildWikiPageSnapshot({
    kind: 'company', title: '长江电力', slug: 'companies/600900-sh', symbol: '600900.SH',
    loadState: 'loading',
  });
  assert.match(loading, /Wiki 正在加载/);
  assert.doesNotMatch(loading, /尚未加载或缺页/);
  const missing = buildWikiPageSnapshot({
    kind: 'company', title: '长江电力', slug: 'companies/600900-sh', symbol: '600900.SH',
    loadState: 'missing',
  });
  assert.match(missing, /Wiki 缺页，尚未发布/);
  const ready = buildWikiPageSnapshot({
    kind: 'industry', title: '电力', slug: 'industries/nbs-power',
    loadState: 'ready',
    page: { input_hash: 'd'.repeat(64), spec: { as_of: '2026-09-18', status: 'accepted', valid_until: '2026-12-31', blocks: [{ kind: 'business' }] } },
    markdown: '经营模式正文',
  });
  assert.match(ready, /观察时点 2026-09-18/);
  assert.match(ready, /状态 accepted/);
  assert.match(ready, /有效至 2026-12-31/);
  assert.match(ready, /经营模式正文/);
  const directory = buildDirectorySnapshot({
    heading: '产业目录 6 项。',
    items: Array.from({ length: 6 }, (_, i) => ({ title: `行业${i + 1}`, id: `id${i + 1}` })),
  });
  assert.match(directory, /行业6/);
  assert.doesNotMatch(directory, /【页面快照】/);
});

test('五页 snapshot builder 与页面组装都不自写【页面快照】', () => {
  const pages = [
    readFileSync(new URL('../src/verticals/finance/pages/CompanyWiki.tsx', import.meta.url), 'utf8'),
    readFileSync(new URL('../src/verticals/finance/pages/IndustryCenter.tsx', import.meta.url), 'utf8'),
    readFileSync(new URL('../src/verticals/finance/pages/IndustryProfiles.tsx', import.meta.url), 'utf8'),
    readFileSync(new URL('../src/verticals/finance/lib/feedPageContext.ts', import.meta.url), 'utf8'),
    readFileSync(new URL('../src/verticals/finance/pages/DailyReview.tsx', import.meta.url), 'utf8'),
  ];
  for (const source of pages) assert.doesNotMatch(source, /【页面快照】/);
  assert.doesNotMatch(
    readFileSync(new URL('../src/verticals/finance/pages/IndustryProfiles.tsx', import.meta.url), 'utf8'),
    /slice\(0,\s*5\)/,
  );
});

test('研究纪律文件保留 shared-research-principles 标记', () => {
  const text = readFileSync(process.env.VRA_RESEARCH_REPO
    ? path.join(process.env.VRA_RESEARCH_REPO, 'dsh/resources/research-discipline.md')
    : new URL('../../../Stock-Research/dsh/resources/research-discipline.md', import.meta.url), 'utf8');
  assert.match(text, /shared-research-principles:start/);
  assert.match(text, /shared-research-principles:end/);
});

test('A股公告/公开新闻快照每行带公司代码，不必靠公司名反查身份', () => {
  const withCode = buildFeedListSnapshot({
    kind: 'filings', watchCount: 1,
    rows: [{ when: '2026-09-20', name: '长江电力', code: '600900.SH', title: '回购实施公告', url: 'https://example.com/a' }],
  });
  assert.match(withCode, /长江电力（600900\.SH）：回购实施公告/);
  const withoutCode = buildFeedListSnapshot({
    kind: 'news', watchCount: 1,
    rows: [{ when: '2026-09-20', name: '长江电力', title: '媒体报道', url: 'https://example.com/b' }],
  });
  assert.doesNotMatch(withoutCode, /（undefined）/);
});

test('事件概率快照携带合约条目与读法护栏，没有 URL 时不编造 @ 引用', () => {
  const snapshot = buildEventsProbabilitySnapshot({
    items: [{ topic: '货币政策', source: 'polymarket', title: '美联储 12 月是否降息', leg: 'Yes', prob: 0.62, settle: '2026-12-18', volume: 120000 }],
    howToRead: ['概率是市场定价，不是预测结论'],
    updated: '2026-09-22T10:00:00+08:00',
    partial: false,
  });
  assert.match(snapshot, /美联储 12 月是否降息/);
  assert.match(snapshot, /概率 62\.0%/);
  assert.match(snapshot, /结算日 2026-12-18/);
  assert.match(snapshot, /怎么读这组数：概率是市场定价，不是预测结论/);
  const empty = buildEventsProbabilitySnapshot({ items: [], howToRead: [], updated: null, partial: false });
  assert.match(empty, /这一轮没取到合约报价/);
});

test('全球指数用取数层 key 开辟独立 market: 身份，与 6 位 A 股代码空间不冲突', () => {
  assert.equal(globalIndexObject({ key: 'sp500', name: '标普500', region: '美国' })?.id, 'market:global:sp500');
  assert.equal(globalIndexObject({ key: '', name: '无 key' }), null);
  assert.equal(globalIndexObject({ key: '带 空格', name: '非法 key' }), null);
});

test('大盘页把全球指数一并注册为可 @ 对象，且行数据表与对象共用同一 id 空间', () => {
  const text = readFileSync(new URL('../src/verticals/finance/pages/DailyReview.tsx', import.meta.url), 'utf8');
  assert.match(text, /globalIndexObject/);
  assert.match(text, /id: `global:\$\{item\.key\}`/);
});

test('资讯雷达「事件概率」有自己的助手上下文，不再落到通用占位文案', () => {
  const text = readFileSync(new URL('../src/verticals/finance/pages/Intel.tsx', import.meta.url), 'utf8');
  assert.match(text, /buildEventsProbabilitySnapshot/);
  assert.match(text, /tab !== 'events'/);
});

test('URL 引用格式化带上页面登记的所属区块与补充说明，Dock→apply 链路不再丢字段', () => {
  // prompt.ts 依赖的 research.ts 用了 TS 参数属性语法，node --test 的原生 TS 剥离跑不动，
  // 不能像其它 snapshot builder 一样直接 import 执行；沿用本文件已有对 prompt.ts 内部函数的源码断言方式。
  const prompt = readFileSync(new URL('../src/verticals/finance/assistant/prompt.ts', import.meta.url), 'utf8');
  assert.match(prompt, /item\.section \? `  所属：\$\{item\.section\}` : ''/);
  assert.match(prompt, /item\.detail \? `  \$\{item\.detail\}` : ''/);
  for (const file of ['dock/FinanceAiDock.tsx'.replace('dock/', 'components/ui/'), 'assistant/apply.ts', 'dsh/research-session.tsx']) {
    const text = readFileSync(new URL(`../src/verticals/finance/${file}`, import.meta.url), 'utf8');
    assert.match(text, /locator/, file);
    assert.match(text, /section/, file);
    assert.match(text, /detail/, file);
  }
});
