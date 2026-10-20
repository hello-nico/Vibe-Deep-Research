// 个股页「我的看法」：用户说过或写过的看法，在论点下面和系统判断并列；匹配规则、推断排除、超过 2 条、无看法、读取失败。
import assert from 'node:assert/strict';
import test, { before, after } from 'node:test';
import { createServer as createHttpServer } from 'node:http';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';
import * as React from 'react';
import { Window } from 'happy-dom';
import { companyPageFixture, fixtureData } from './fixtures/company_page.ts';

let server: Awaited<ReturnType<typeof createServer>>, win: Window, root: ReturnType<typeof import('react-dom/client')['createRoot']>, container: HTMLElement;
let lib: Record<string, any>, companyModule: Record<string, any>, router: Record<string, any>;
const previous = { window: globalThis.window, document: globalThis.document, fetch: globalThis.fetch, sessionStorage: globalThis.sessionStorage, IS_REACT_ACT_ENVIRONMENT: globalThis.IS_REACT_ACT_ENVIRONMENT };
type Docs = { soul?: any; recent?: any };
let docs: Docs = {}, memoryReads = 0;
before(async () => {
  win = new Window();
  Object.assign(globalThis, { window: win, document: win.document, sessionStorage: win.sessionStorage, requestAnimationFrame: win.requestAnimationFrame.bind(win), cancelAnimationFrame: win.cancelAnimationFrame.bind(win), IS_REACT_ACT_ENVIRONMENT: true,
    fetch: async (url: string) => {
      const parsed = new URL(String(url), 'http://x');
      if (parsed.pathname.endsWith('/wiki/research-memory')) {
        memoryReads += 1;
        const doc = docs[parsed.searchParams.get('kind') as 'soul' | 'recent'];
        return doc ? Response.json(doc) : Response.json({ detail: 'x' }, { status: 503 });
      }
      return Response.json({ detail: 'x' }, { status: 404 });
    } });
  server = await createServer({ configFile: false, root: fileURLToPath(new URL('../', import.meta.url)),
    resolve: { alias: { '@': fileURLToPath(new URL('../src/verticals/finance', import.meta.url)) } },
    server: { middlewareMode: true, hmr: { server: createHttpServer() }, watch: null }, appType: 'custom',
    ssr: { noExternal: ['react-router-dom', 'react-router'], resolve: { conditions: ['module-sync', 'node', 'import', 'development'] } } });
  lib = await server.ssrLoadModule('/src/verticals/finance/lib/companyOpinion.ts');
  companyModule = await server.ssrLoadModule('/src/verticals/finance/pages/CompanyPage.tsx');
  router = await server.ssrLoadModule('react-router-dom');
  container = win.document.createElement('div') as unknown as HTMLElement;
  win.document.body.append(container);
  root = (await import('react-dom/client')).createRoot(container);
});
after(async () => { await React.act(async () => root?.unmount()); await server?.close(); win?.happyDOM.abort(); Object.assign(globalThis, previous); });

const doc = (kind: string, entries: any[]) => ({ kind, version: 1, title: '', entries });
const entry = (id: string, text: string, extra: Record<string, unknown> = {}) => ({ id, stance: 'stated', text, ...extra });
const h = React.createElement;
const settle = async () => { await React.act(async () => { await new Promise(resolve => setTimeout(resolve, 30)); }); };
async function open(symbol = '000933', name = '神火股份') {
  const fixture = companyPageFixture({ research: null, stale: false, basisVersion: 'v' });
  fixture.services.data.quote = async () => ({ ...fixtureData.quote!, price: 52.67 });
  await React.act(async () => root.render(null));
  await React.act(async () => root.render(h(router.MemoryRouter, null, h(companyModule.CompanyPage, { key: symbol, symbol, name, services: fixture.services }))));
  await settle();
}
const lines = () => [...container.querySelectorAll('[data-opinion]')].map(node => node.textContent);

test('匹配规则：公司名、去掉「股份」的简称、6 位代码都算；stated 与 corrected 算，inferred 不算；别家与同义词不算', () => {
  const items = [
    entry('a', '认为神火的煤炭业务会继续拖累利润'), entry('b', '神火股份的氧化铝成本我不看好', { stance: 'corrected' }),
    entry('c', '000933 的分红我比较在意'), entry('d', '神火可能会被低估', { stance: 'inferred' }),
    entry('e', '云铝的电价更有优势'), entry('f', '那家做铝的公司我不太看好'), entry('g', '回答先给结论'),
  ].map(item => ({ ...item, kind: 'soul' }));
  const ids = (name: string, symbol: string) => lib.opinionsFor(items, { name, symbol }).map((item: any) => item.id);
  assert.deepEqual(ids('神火股份', '000933.SZ'), ['a', 'b', 'c']);
  assert.deepEqual(ids('神火', '000933'), ['a', 'b', 'c'], '页面名已是简称时同样认');
  assert.deepEqual(ids('云铝股份', '000807.SZ'), ['e']);
  assert.deepEqual(ids('长江电力', '600900.SH'), []);
});

test('页面：论点下面出现「我的看法：原句」加灰字来源与日期；对话里说的与自己填写分开写；系统判断不被改动', async () => {
  docs = {
    soul: doc('soul', [entry('b', '认为神火的煤炭业务会继续拖累利润', { source_session: 's1', updated_at: '2026-10-14T08:00:00Z' }), entry('x', '回答先给结论')]),
    recent: doc('recent', [entry('d', '神火股份我打算拿到明年', { updated_at: '2026-10-10T08:00:00Z' }), entry('i', '神火可能被低估', { stance: 'inferred', updated_at: '2026-10-18T08:00:00Z' })]),
  };
  await open();
  const lead = container.querySelector('[data-company-section="thesis"]')!;
  assert.ok(lead.querySelector('[data-company-opinion]'), '看法在论点区块里，论点下面');
  assert.deepEqual(lines(), ['我的看法：认为神火的煤炭业务会继续拖累利润对话里说的 · 10月14日', '我的看法：神火股份我打算拿到明年自己填写 · 10月10日'], '时间倒序；推断的不出现');
  assert.equal(container.querySelector('[data-opinion-more]'), null);
  assert.doesNotMatch(lead.querySelector('[data-company-opinion]')!.textContent!, /对错|正确|买入|卖出|建议/);
  const css = readFileSync(new URL('../src/verticals/finance/components/company-opinion.css', import.meta.url), 'utf8');
  assert.doesNotMatch(css, /brand|border|box-shadow|background/, '灰字正文，不描边、不用橙色、无底色');
});

test('超过 2 条：只列最近 2 条，其余收成「另有 N 条」并链到设置', async () => {
  docs = { soul: doc('soul', [1, 2, 3, 4].map(n => entry(`s${n}`, `神火第${n}条看法`, { updated_at: `2026-10-0${n}T08:00:00Z` }))), recent: doc('recent', []) };
  await open();
  assert.deepEqual([...container.querySelectorAll('[data-opinion]')].map(node => node.getAttribute('data-opinion')), ['s4', 's3']);
  const more = container.querySelector('[data-opinion-more]')!;
  assert.equal(more.textContent, '另有 2 条');
  assert.equal(more.getAttribute('href'), '/settings');
});

test('没有看法整行不出现；别家的看法不串；记忆读取失败不出现、不报错（一份失败用另一份）', async () => {
  docs = { soul: doc('soul', [entry('a', '回答先给结论'), entry('e', '云铝的电价更有优势')]), recent: doc('recent', []) };
  await open();
  assert.equal(container.querySelector('[data-company-opinion]'), null);
  assert.ok(container.querySelector('[data-company-section="thesis"]'), '论点区块照常');
  docs = {};
  await open();
  assert.equal(container.querySelector('[data-company-opinion]'), null);
  assert.equal(container.querySelector('[role="alert"]'), null);
  docs = { recent: doc('recent', [entry('r', '神火的煤炭业务会继续拖累利润')]) };
  await open();
  assert.deepEqual(lines(), ['我的看法：神火的煤炭业务会继续拖累利润自己填写']);
  assert.deepEqual(await lib.loadOpinions({ name: '神火', symbol: '000933' }, async () => { throw new Error('down'); }), [], '纯函数层两份都读不到返回空');
});

test('另一家公司换页后不残留上一家的看法', async () => {
  docs = { soul: doc('soul', [entry('a', '神火的煤炭业务会继续拖累利润')]), recent: doc('recent', []) };
  await open('000933', '神火股份');
  assert.equal(lines().length, 1);
  await open('600863', '华能蒙电');
  assert.equal(container.querySelector('[data-company-opinion]'), null);
});
