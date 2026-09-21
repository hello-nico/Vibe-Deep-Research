import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { buildDailyReviewSnapshot, buildDirectorySnapshot, buildIndustryProfileSnapshot, buildWikiPageSnapshot, citedWikiVersionFailure, clipPageSnapshot, formatCompanyFromSnapshot } from '../src/verticals/finance/assistant/snapshot.ts';
import { MARKET_INDEX_IDS } from '../src/verticals/finance/lib/pageAssistantObjects.ts';

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
  const text = readFileSync(new URL('../../../Stock-Research/dsh/resources/research-discipline.md', import.meta.url), 'utf8');
  assert.match(text, /shared-research-principles:start/);
  assert.match(text, /shared-research-principles:end/);
});
