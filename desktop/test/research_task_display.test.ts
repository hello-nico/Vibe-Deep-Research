import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { loadFinanceModule } from './load_finance_module.ts';
import { RESULT_EMBED_FALLBACK, embeddableChartResult, listOrEmpty } from '../src/verticals/finance/lib/researchResultEmbed.ts';

const { normalizeResearchTarget, objectHref: researchObjectHref } = await loadFinanceModule<typeof import('../src/verticals/finance/lib/objectRegistry.ts')>('lib/objectRegistry.ts');

test('对象链接：公司用完整 slug，退役行业入口回关注，旧代码目标补交易所后缀', () => {
  assert.equal(normalizeResearchTarget('companies/600585-sh'), 'companies/600585-sh');
  assert.equal(normalizeResearchTarget('companies/600309'), 'companies/600309-sh');
  assert.equal(normalizeResearchTarget('600309'), 'companies/600309-sh');
  assert.equal(researchObjectHref('companies/600585-sh'), '/watch/600585');
  assert.equal(researchObjectHref('companies/600309'), '/watch/600309');
  assert.equal(researchObjectHref('industries/nbs-电力'), '/watch');
  assert.equal(researchObjectHref('industries/电力'), '/watch');
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

test('公司列表使用现行名称回退', () => {
  const wiki = readFileSync(new URL('../src/verticals/finance/pages/Watch.tsx', import.meta.url), 'utf8');
  assert.match(wiki, /quote\?\.name \|\| page\?\.title \|\| symbol/);
  assert.doesNotMatch(wiki, /\/wiki\/pages\/read\?slug=/);
});
