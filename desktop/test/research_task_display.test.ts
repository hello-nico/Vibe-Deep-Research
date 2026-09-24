import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { loadFinanceModule } from './load_finance_module.ts';
import { RESULT_EMBED_FALLBACK, embeddableChartResult, listOrEmpty } from '../src/verticals/finance/lib/researchResultEmbed.ts';

const { isBareCompanyCode, normalizeResearchTarget, researchObjectHref, wikiPageTitle } = await loadFinanceModule<typeof import('../src/verticals/finance/lib/researchObject.ts')>('lib/researchObject.ts');

test('对象链接：公司用完整 slug，行业走行业页，旧代码目标补交易所后缀', () => {
  assert.equal(normalizeResearchTarget('companies/600585-sh'), 'companies/600585-sh');
  assert.equal(normalizeResearchTarget('companies/600309'), 'companies/600309-sh');
  assert.equal(normalizeResearchTarget('600309'), 'companies/600309-sh');
  assert.equal(researchObjectHref('companies/600585-sh'), '/research?company=companies%2F600585-sh');
  assert.equal(researchObjectHref('companies/600309'), '/research?company=companies%2F600309-sh');
  assert.equal(researchObjectHref('industries/nbs-电力'), '/sectors/%E7%94%B5%E5%8A%9B');
  assert.equal(researchObjectHref('industries/电力'), '/sectors/%E7%94%B5%E5%8A%9B');
  assert.equal(researchObjectHref(''), undefined);
});

test('company_data 成果不渲染卡片且缺字段不抛错', () => {
  assert.equal(embeddableChartResult('market'), true);
  assert.equal(embeddableChartResult('financial'), true);
  assert.equal(embeddableChartResult('company_data'), false);
  assert.deepEqual(listOrEmpty(undefined), []);
  assert.doesNotThrow(() => listOrEmpty(undefined).map(item => item));
  const card = readFileSync(new URL('../src/verticals/finance/components/ResearchResult.tsx', import.meta.url), 'utf8');
  assert.match(card, /embeddableChartResult\(value\.payload\.kind\)/);
  assert.match(card, /listOrEmpty\(payload\?\.missing\)/);
  assert.doesNotMatch(card, /payload\.missing\.map/);
});

test('错误边界兜底只影响这一张成果', () => {
  const card = readFileSync(new URL('../src/verticals/finance/components/ResearchResult.tsx', import.meta.url), 'utf8');
  assert.match(card, /class ResultEmbedBoundary/);
  assert.match(card, /getDerivedStateFromError/);
  assert.match(card, /RESULT_EMBED_FALLBACK/);
  assert.equal(RESULT_EMBED_FALLBACK, '这份成果暂时无法显示');
});

test('公司名取不到时先用研究页标题，再回退代码', () => {
  assert.equal(isBareCompanyCode('600585', '600585'), true);
  assert.equal(isBareCompanyCode('海螺水泥', '600585'), false);
  assert.equal(wikiPageTitle({ spec: { title: '海螺水泥' } }, '600585'), '海螺水泥');
  assert.equal(wikiPageTitle(null, '600585'), '600585');
  const wiki = readFileSync(new URL('../src/verticals/finance/pages/CompanyWiki.tsx', import.meta.url), 'utf8');
  assert.match(wiki, /isBareCompanyCode\(target\.title, target\.symbol\)/);
  assert.match(wiki, /wikiPageTitle\(page, target\.symbol\)/);
  assert.match(wiki, /\/wiki\/pages\/read\?slug=/);
  const mine = readFileSync(new URL('../src/verticals/finance/pages/MyResearch.tsx', import.meta.url), 'utf8');
  assert.match(mine, /skipped: '未整理'/);
  assert.match(mine, /openRegisteredObject/);
  assert.match(mine, /researchSkipSummary/);
});
