// 动态资讯接 Jev：驱动与方向句、改写合并与新进展标记、公告「查看全部」。Backend 回包按 Stock 接口形态，真实标题取自三份 eval 的样本。
import assert from 'node:assert/strict';
import test, { before, after } from 'node:test';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { createServer as createHttpServer } from 'node:http';
import { createServer } from 'vite';
import * as React from 'react';
import { Window } from 'happy-dom';

const real = JSON.parse(readFileSync(new URL('./fixtures/t73_real.json', import.meta.url), 'utf8'));
const shenhuo = real.shenhuo;
const RESULT = `result:${'a'.repeat(32)}`;
const previous = { window: globalThis.window, document: globalThis.document, sessionStorage: (globalThis as any).sessionStorage, IS_REACT_ACT_ENVIRONMENT: (globalThis as any).IS_REACT_ACT_ENVIRONMENT };
let win: Window, server: any, root: any, container: HTMLElement, modules: Record<string, any>;
before(async () => {
  win = new Window();
  Object.assign(globalThis, { window: win, document: win.document, sessionStorage: win.sessionStorage, IS_REACT_ACT_ENVIRONMENT: true });
  server = await createServer({ configFile: false, root: fileURLToPath(new URL('../', import.meta.url)),
    resolve: { alias: { '@': fileURLToPath(new URL('../src/verticals/finance', import.meta.url)) } },
    server: { middlewareMode: true, hmr: { server: createHttpServer() }, watch: null }, appType: 'custom',
    ssr: { noExternal: ['react-router-dom', 'react-router'], resolve: { conditions: ['module-sync', 'node', 'import', 'development'] } } });
  modules = {
    jev: await server.ssrLoadModule('/src/verticals/finance/lib/feedJev.ts'),
    factor: await server.ssrLoadModule('/src/verticals/finance/lib/feedFactor.ts'),
    narrative: await server.ssrLoadModule('/src/verticals/finance/lib/companyNarrative.ts'),
    api: await server.ssrLoadModule('/src/verticals/finance/lib/api.ts'),
    intel: await server.ssrLoadModule('/src/verticals/finance/pages/Intel.tsx'),
    page: await server.ssrLoadModule('/src/core/ai/pageContext.tsx'),
    watch: await server.ssrLoadModule('/src/verticals/finance/lib/watchlist.ts'),
    router: await server.ssrLoadModule('react-router-dom'),
  };
  container = win.document.createElement('div') as unknown as HTMLElement;
  win.document.body.append(container);
  root = (await import('react-dom/client')).createRoot(container);
});
after(async () => { await React.act(async () => root?.unmount()); await server?.close(); win?.happyDOM.abort(); Object.assign(globalThis, previous); });

const model = () => modules.narrative.parseSensitivity(shenhuo.sensitivityResult);

test('Jev 驱动句：碰到X：对利润偏正面 / 偏负面 / 影响不明；有价格模型且有每步影响时保留数值半句；不写利好、利空', () => {
  const { jevFactorText, DIRECTION_TEXT } = modules.jev;
  assert.deepEqual(DIRECTION_TEXT, { positive: '对利润偏正面', negative: '对利润偏负面', unclear: '影响不明' });
  assert.equal(jevFactorText({ driver: '发电量', direction: 'negative', p: 0.9 }), '碰到发电量：对利润偏负面');
  assert.equal(jevFactorText({ driver: '净息差', direction: 'unclear' }), '碰到净息差：影响不明');
  assert.equal(jevFactorText({ driver: '沪铝', direction: 'positive' }, model()), '碰到沪铝：对利润偏正面；每 +1,000 元/吨，净利润 +9.96 亿元');
  assert.equal(jevFactorText({ driver: '氧化铝', direction: 'negative' }, model()), '碰到氧化铝：对利润偏负面；每 +100 元/吨，净利润 -1.92 亿元');
  assert.equal(jevFactorText({ driver: '煤炭售价', direction: 'positive' }, model()), '碰到煤炭售价：对利润偏正面', '该驱动没有每步影响就不写数');
  assert.equal(jevFactorText({ driver: '发电量', direction: 'positive' }, model()), '碰到发电量：对利润偏正面', '不是模型里的变量不写数');
  for (const bad of [null, undefined, { driver: '', direction: 'positive' }, { driver: '沪铝', direction: 'sideways' }]) assert.equal(jevFactorText(bad as any, model()), '');
  for (const direction of ['positive', 'negative', 'unclear']) assert.doesNotMatch(jevFactorText({ driver: '沪铝', direction } as any), /利好|利空|买入|卖出|建议/);
});

const h = React.createElement;
const rows = (symbol: string, items: Record<string, unknown>[]) => items.map((item, index) => ({ symbol, source: '证券时报', published_at: `2026-10-19T0${index}:00:00+00:00`, url: `https://example.test/${symbol}/${index}`, ...item }));
async function open(sub: 'news' | 'filings', fetchImpl: (url: string) => Response | Promise<Response>) {
  globalThis.fetch = (async (input: unknown) => fetchImpl(String(input))) as typeof fetch;
  modules.api.clearFeedCache();
  modules.factor.clearFactorModels();
  modules.watch.replaceWatchCache(['000933', '600900']);
  await React.act(async () => root.render(null));
  await React.act(async () => root.render(h(modules.router.MemoryRouter, null, h(modules.page.AiPageProvider, {}, h(modules.intel.Intel, { sub })))));
  await React.act(async () => { await new Promise(resolve => setTimeout(resolve, 80)); });
}
const researchRoutes = (url: string) => {
  if (url.includes('/market/quotes')) return Response.json({ quotes: [], missing: [] });
  if (url.includes('000933.SZ/page-research')) return Response.json({ research: { sensitivity: { resultRef: RESULT } } });
  if (url.includes('600900.SH/page-research')) return Response.json({ research: null });
  if (url.includes(`/research-results/${RESULT}`)) return Response.json(shenhuo.sensitivityResult);
  return Response.json({ items: [] });
};

test('资讯页：Backend 给了 Jev 的驱动与方向就写那一句（价格模型保留数值半句）；改写合并显示“另有 N 篇相似报道，已合并为这一条”，新进展加标记；没给的退回关键词句', async () => {
  const items = [
    ...rows('000933.SZ', [
      { title: '沪铝价格回落，神火股份电解铝利润收窄', factor: { driver: '沪铝', direction: 'negative', p: 0.97 }, also: 2 },
      { title: '神火股份：三季报净利润同比增长114.54%', follow_up: true },
      { title: '氧化铝价格大幅回落', },
    ]),
    ...rows('600900.SH', [{ title: '长江电力：前三季度发电量同比降4.28%', factor: { driver: '发电量', direction: 'negative', p: 0.9 } }]),
  ];
  await open('news', url => url.includes('/feed/news') ? Response.json({ items, filtered: 3 }) : researchRoutes(url));
  const notes = [...container.querySelectorAll('[data-feed-factor]')].map(node => node.textContent);
  assert.deepEqual(notes.sort(), ['碰到发电量：对利润偏负面', '碰到氧化铝：每 +100 元/吨，净利润 -1.92 亿元', '碰到沪铝：对利润偏负面；每 +1,000 元/吨，净利润 +9.96 亿元'].sort());
  const also = container.querySelector('[data-feed-also]')!;
  assert.equal(also.textContent, '另有 2 篇相似报道，已合并为这一条');
  assert.equal(also.getAttribute('title'), '另有 2 篇相似报道，已合并为这一条');
  assert.equal(container.querySelectorAll('[data-feed-also]').length, 1);
  assert.equal(container.querySelector('[data-feed-followup]')!.textContent, '新进展');
  assert.equal(container.querySelectorAll('[data-feed-followup]').length, 1);
  assert.doesNotMatch(container.textContent!, /利好|利空|买入|卖出|过滤|已过滤/);
});

test('资讯标题行不写正在加载', async () => {
  await open('news', url => url.includes('/feed/news') ? Response.json({ items: [] }) : researchRoutes(url));
  assert.doesNotMatch(container.textContent!, /共 0 条新闻（近期）正在加载/);
});

test('公告：默认不含 Jev 判为例行的，出现“查看全部（另有 N 条例行）”；点开后带 all=1 重取，例行的加“例行”标记，按钮改成“只看重要的”', async () => {
  const urls: string[] = [];
  const important = rows('000933.SZ', [{ title: '神火股份：2026年第三季度报告', document_id: null }]);
  const routine = rows('000933.SZ', [{ title: '神火股份：独立董事关于第八届董事会会议的意见', document_id: null, routine: true, published_at: '2026-10-18T00:00:00+00:00' }]);
  await open('filings', url => {
    if (url.includes('/feed/announcements')) {
      urls.push(url);
      return url.includes('all=1') ? Response.json({ items: [...important, ...routine], filtered: 1, hidden: 1 }) : Response.json({ items: important, filtered: 1, hidden: 1 });
    }
    return researchRoutes(url);
  });
  const button = () => container.querySelector('[data-show-all]') as HTMLButtonElement;
  assert.equal(button().textContent, '查看全部（另有 1 条例行）');
  assert.match(container.textContent!, /第三季度报告/);
  assert.doesNotMatch(container.textContent!, /独立董事关于第八届董事会/);
  assert.equal(container.querySelector('[data-feed-routine]'), null);
  assert.ok(!urls.some(url => url.includes('all=1')));
  await React.act(async () => button().click());
  await React.act(async () => { await new Promise(resolve => setTimeout(resolve, 80)); });
  assert.ok(urls.some(url => url.includes('all=1')), '点了才带 all=1');
  assert.match(container.textContent!, /独立董事关于第八届董事会/);
  assert.equal(container.querySelectorAll('[data-feed-routine]').length, 1);
  assert.equal(button().textContent, '只看重要的');
  await React.act(async () => button().click());
  await React.act(async () => { await new Promise(resolve => setTimeout(resolve, 80)); });
  assert.doesNotMatch(container.textContent!, /独立董事关于第八届董事会/);
});

test('公告没有被隐藏的（或 Backend 没开 Jev）：不出现“查看全部”，页面和以前一样', async () => {
  await open('filings', url => url.includes('/feed/announcements')
    ? Response.json({ items: rows('000933.SZ', [{ title: '神火股份：2026年第三季度报告', document_id: null }]), filtered: 0 })
    : researchRoutes(url));
  assert.equal(container.querySelector('[data-show-all]'), null);
  assert.match(container.textContent!, /第三季度报告/);
});
