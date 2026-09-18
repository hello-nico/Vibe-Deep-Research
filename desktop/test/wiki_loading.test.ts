import assert from 'node:assert/strict';
import test from 'node:test';
import { createServer } from 'vite';
import { createServer as createHttpServer } from 'node:http';
import { fileURLToPath } from 'node:url';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

test('Wiki 加载卡片按行业和公司对象给出研究块名', async () => {
  const server = await createServer({ configFile: false, root: fileURLToPath(new URL('../', import.meta.url)), server: { middlewareMode: true, hmr: { server: createHttpServer() }, watch: null }, appType: 'custom' });
  try {
    const { wikiLoadingSections } = await server.ssrLoadModule('/src/verticals/finance/components/WikiLoading.tsx');
    assert.deepEqual(wikiLoadingSections('industries/nbs-07'), ['身份', '范围', '经营模式', '行业结构', '关系摘要', '关注点', '资料时间线', '待核验缺口']);
    assert.deepEqual(wikiLoadingSections('companies/600900-sh'), ['身份', '经营', '财务', '估值', '观察窗口', '资料时间线', '关注点', '待核验缺口']);
    assert.deepEqual(wikiLoadingSections('themes/example'), ['标题', '章节', '依据', '时间线']);
    const { ResearchLoading } = await server.ssrLoadModule('/src/verticals/finance/components/ui/ResearchLoading.tsx');
    const profile = renderToStaticMarkup(createElement(ResearchLoading, { title: '正在读取产业研究', sections: ['产业结构', '需求变化'] }));
    assert.match(profile, /产业结构/);
    assert.match(profile, /需求变化/);
    assert.doesNotMatch(profile, /正在更新|data-state|progressbar/);
    const { WikiLoading } = await server.ssrLoadModule('/src/verticals/finance/components/WikiLoading.tsx');
    const creating = renderToStaticMarkup(createElement(WikiLoading, { slug: 'companies/601899-sh', title: '正在创建公司资料页' }));
    assert.match(creating, /正在创建公司资料页/);
    assert.match(creating, /research-loading-scan/);
    assert.match(creating, /经营/);
    assert.match(creating, /财务/);
    const refresh = renderToStaticMarkup(createElement(ResearchLoading, { compact: true, title: '正在更新财务与估值数据', sections: ['财务', '估值'] }));
    assert.match(refresh, /正在更新财务与估值数据/);
    assert.match(refresh, /research-loading-compact/);
    assert.match(refresh, /research-loading-scan/);
    assert.match(refresh, /财务/);
    assert.match(refresh, /估值/);
    assert.doesNotMatch(refresh, /animate-pulse|产业结构|animate-spin|progressbar/);
    const { ResearchRefreshStatus } = await server.ssrLoadModule('/src/verticals/finance/components/ui/ResearchLoading.tsx');
    const chip = renderToStaticMarkup(createElement(ResearchRefreshStatus));
    assert.match(chip, /正在刷新…/);
    assert.match(chip, /research-refresh-status/);
    assert.match(chip, /research-loading-scan/);
    assert.doesNotMatch(chip, /animate-spin|progressbar/);
  } finally { await server.close(); }
});
