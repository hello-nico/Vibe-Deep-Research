// 个股页交给问助手的页面快照：现金等各节已显示的数字与期间必须进入快照；超长时先保留用户正在看的那一节。
// 起因：DSH 0.2.1 升级验证中，问助手答「当前页未展示资本开支后现金、现金转化率」，而页面上有这些数。
// 根因：CompanyWiki 只登记了「标题 + slug」的目录快照，页面内容（在 CompanyPage 内部状态里）从未交出去。
import assert from 'node:assert/strict';
import test, { before, after } from 'node:test';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { createServer as createHttpServer } from 'node:http';
import { createServer } from 'vite';
import * as React from 'react';
import { Window } from 'happy-dom';
import { companyPageFixture, fixtureData } from './fixtures/company_page.ts';
import { clipSectionedSnapshot, PAGE_SNAPSHOT_LIMIT, type SnapshotSection } from '../src/verticals/finance/assistant/snapshot.ts';

const real = JSON.parse(readFileSync(new URL('./fixtures/t73_real.json', import.meta.url), 'utf8')) as Record<string, any>;
const huaneng = real.huaneng;

let server: Awaited<ReturnType<typeof createServer>>, win: Window, root: ReturnType<typeof import('react-dom/client')['createRoot']>;
let wikiModule: Record<string, any>, pageModule: Record<string, any>, aiModule: Record<string, any>, sessionModule: Record<string, any>, ui: Record<string, any>, router: Record<string, any>, packetModule: Record<string, any>, narrativeModule: Record<string, any>;
let container: HTMLElement;
const previous = { window: globalThis.window, document: globalThis.document, fetch: globalThis.fetch, sessionStorage: globalThis.sessionStorage, requestAnimationFrame: globalThis.requestAnimationFrame, cancelAnimationFrame: globalThis.cancelAnimationFrame, IS_REACT_ACT_ENVIRONMENT: globalThis.IS_REACT_ACT_ENVIRONMENT };
before(async () => {
  win = new Window();
  Object.assign(globalThis, { window: win, document: win.document, sessionStorage: win.sessionStorage, requestAnimationFrame: win.requestAnimationFrame.bind(win), cancelAnimationFrame: win.cancelAnimationFrame.bind(win), IS_REACT_ACT_ENVIRONMENT: true });
  server = await createServer({ configFile: false, root: fileURLToPath(new URL('../', import.meta.url)),
    resolve: { alias: { '@': fileURLToPath(new URL('../src/verticals/finance', import.meta.url)) } },
    server: { middlewareMode: true, hmr: { server: createHttpServer() }, watch: null }, appType: 'custom',
    ssr: { noExternal: ['react-router-dom', 'react-router'], resolve: { conditions: ['module-sync', 'node', 'import', 'development'] } } });
  ui = await server.ssrLoadModule('/src/verticals/finance/pages/CompanyPage.tsx');
  pageModule = ui;
  wikiModule = await server.ssrLoadModule('/src/verticals/finance/pages/CompanyWiki.tsx');
  aiModule = await server.ssrLoadModule('/src/core/ai/pageContext.tsx');
  sessionModule = await server.ssrLoadModule('/src/verticals/finance/dsh/research-session.tsx');
  packetModule = await server.ssrLoadModule('/src/verticals/finance/lib/companyPacket.ts');
  narrativeModule = await server.ssrLoadModule('/src/verticals/finance/lib/companyNarrative.ts');
  router = await server.ssrLoadModule('react-router-dom');
  container = win.document.createElement('div') as unknown as HTMLElement;
  win.document.body.append(container);
  root = (await import('react-dom/client')).createRoot(container);
});
after(async () => { await React.act(async () => root?.unmount()); await server?.close(); win?.happyDOM.abort(); Object.assign(globalThis, previous); });

const squash = (text: string) => text.replace(/\s+/g, '');

/** 华能真实数据包；现金回答句里嵌了现金转化率占位（与线上研究同形态）。 */
function cashFixture() {
  const research = structuredClone(huaneng.research.research);
  research.sections.cash.summary = '经营现金流约为归母净利的{lens:cash_conversion.cash_conversion}，资本开支后现金{lens:cash_after_capex.cash_after_capex}，分红{dividend_paid}取不到';
  research.sections.business.summary = '毛利率只有{gross_margin}，营业收入{revenue}';
  const fixture = companyPageFixture({ research, stale: false, basisVersion: 'v1' });
  fixture.services.data.packet = async () => huaneng.packet;
  fixture.services.data.quote = async () => ({ ...fixtureData.quote!, name: '华能蒙电', price: 5.21, change_pct: 1.2 });
  fixture.services.readScenario = async () => packetModule.scenarioTable(huaneng.scenarioResult);
  fixture.services.readResult = async () => null;
  return fixture;
}

let probe: { page: Record<string, any> | null } = { page: null };
function Probe() { probe.page = aiModule.useCurrentAiPage(); return null; }
async function mountWiki(fixture: ReturnType<typeof companyPageFixture>) {
  globalThis.fetch = async url => String(url).includes('/wiki/pages?') ? Response.json({ items: [], total: 0 }) : Response.json({ items: [] });
  probe = { page: null };
  await React.act(async () => root.render(React.createElement(aiModule.AiPageProvider, null,
    React.createElement(sessionModule.ResearchSessionContext.Provider, { value: { openTaskProcess: () => {} } },
      React.createElement(ui.CompanyPageServicesContext.Provider, { value: fixture.services },
        React.createElement(router.MemoryRouter, { initialEntries: ['/watch/600863'] },
          React.createElement(Probe),
          React.createElement(router.Routes, null, React.createElement(router.Route, { path: '/watch/:symbol', element: React.createElement(wikiModule.CompanyWiki) }))))))));
  await React.act(async () => { await new Promise(resolve => setTimeout(resolve, 20)); });
}

test('问助手读到的个股页：现金一节的回答句、资本开支后现金、现金转化率与期间都在快照里', async () => {
  await mountWiki(cashFixture());
  const page = probe.page!;
  assert.ok(page, '页面已登记给问助手');
  const sent: string = page.snapshotForSend('agent', []);
  // 与登记的 context 同源；不再是只有标题和 slug 的目录行。
  assert.equal(sent, page.context);
  assert.doesNotMatch(sent, /companies\/|商业模式、利润变量、弹性、现金、估值与观察/);
  const cash = sent.split(/\n\n+/).find(part => part.startsWith('【利润是不是真金白银】'))!;
  assert.ok(cash, '现金一节');
  assert.match(cash, /回答：经营现金流约为归母净利的2\.69 倍，资本开支后现金29\.60 亿元，分红暂缺取不到/);
  assert.match(cash, /- 经营现金流：67\.31 亿元（2025 年报）/);
  assert.match(cash, /- 资本开支：37\.71 亿元（2025 年报）/);
  assert.match(cash, /- 现金分红：暂缺/);
  assert.match(cash, /- 剩余（未扣分红）：29\.60 亿元（2025 年报）/);
  assert.match(cash, /- 股息率：4\.22 ?%（2025 年报；年度普通股含税方案每股分红 \/ 当前不复权收盘价；不是当期付款率）/);
  assert.match(cash, /- 归母净利润：24\.93 亿元（2025 年报）/, '第一层关键数带期间');
  assert.match(cash, /- 每股分红：0\.22 元\/股（2025 年报；普通股含税利润分配方案，非当期付款）/);
  // 其他节与页首也在。
  assert.match(sent, /【\S+ 个股页】\n600863 · 高杠杆周期公用事业/);
  for (const heading of ['【它靠什么赚钱】', '【关键变量动一下，利润变多少】', '【现在的价格在赌什么】', '【接下来盯什么】']) assert.ok(sent.includes(heading), heading);
  assert.match(sent, /行情：5\.21 人民币，\+1\.20%（行情 10 月 10 日）/);
  assert.match(sent, /毛利率只有23\.15 ?%，营业收入210\.50 亿元/);
  assert.match(sent, /三档情景：[\s\S]*悲观[\s\S]*中性[\s\S]*乐观/);
  // 不放内部编号、引用身份与未填的占位。
  assert.doesNotMatch(sent, /field_id|source_ref|lens:|driver:|provider:|result:[0-9a-f]{8}|source:[0-9a-f]{8}|basisVersion|leveraged_cyclical|\{|\}/);
  assert.ok(sent.length < PAGE_SNAPSHOT_LIMIT);
});

test('快照与页面所见一致：每节的回答句和第一层关键数（值与期间）逐项能在快照里找到', async () => {
  await mountWiki(cashFixture());
  const sent = squash(probe.page!.snapshotForSend('agent', []));
  for (const element of container.querySelectorAll('[data-company-summary]')) {
    const text = squash(element.textContent!);
    assert.ok(sent.includes(text), `回答句不在快照里：${element.textContent}`);
  }
  const metrics = [...container.querySelectorAll('[data-key-numbers] .metric')];
  assert.ok(metrics.length >= 6, `三节关键数 ${metrics.length}`);
  for (const metric of metrics) {
    const label = metric.querySelector('.metric-label > span')!.textContent!;
    const value = metric.querySelector('.metric-value')!.textContent!;
    assert.ok(sent.includes(squash(`${label}：${value}`)), `关键数不在快照里：${label} ${value}`);
    // 悬停里的期间（页面上收起的口径）也要带上，转成页面同款文字。
    const period = (metric.getAttribute('title') ?? '').split(' · ')[0];
    if (period) assert.ok(sent.includes(squash(narrativeModule.periodLabel(period))), `${label} 缺期间 ${period}`);
  }
  const flows = [...container.querySelectorAll('[data-chart="flow"] [data-flow]')];
  assert.ok(flows.length >= 4, '去向条各项');
  for (const flow of flows) {
    const [, label, number] = /^(.+?)\s*([\d,.]+ 亿元|暂缺)/.exec(flow.textContent!.replace('（整条）', '').trim())!;
    assert.ok(sent.includes(squash(`${label}：${number}`)), `去向条不在快照里：${flow.textContent}`);
  }
});

test('页面还在加载：快照写明「数据正在加载」，不让助手把空当成页面没有', async () => {
  const fixture = cashFixture();
  fixture.services.data.packet = () => new Promise(() => {});
  await mountWiki(fixture);
  const sent: string = probe.page!.snapshotForSend('agent', []);
  assert.match(sent, /【利润是不是真金白银】\n数据正在加载，页面上这一节还没有数字。/);
});

test('viewedCompanySection：视口中线所在的节；中线落在节间空隙时取可见面积最大的', () => {
  const doc = win.document;
  const host = doc.createElement('div');
  doc.body.append(host);
  const make = (id: string, top: number, bottom: number) => {
    const element = doc.createElement('section');
    element.setAttribute('data-company-section', id);
    element.getBoundingClientRect = () => ({ top, bottom, left: 0, right: 0, width: 0, height: bottom - top, x: 0, y: top, toJSON() {} }) as DOMRect;
    host.append(element);
  };
  make('thesis', -900, -300); make('business', -300, 300); make('cash', 300, 700); make('valuation', 700, 1400);
  assert.equal(pageModule.viewedCompanySection(host, 800), 'cash');
  host.replaceChildren(); make('business', -300, 350); make('cash', 420, 900);
  assert.equal(pageModule.viewedCompanySection(host, 800), 'cash', '中线 400 在空隙里：cash 可见 420–800 比 business 可见 0–350 更大');
  host.replaceChildren();
  assert.equal(pageModule.viewedCompanySection(host, 800), undefined);
  host.remove();
});

// ------------------------------------------------------------------ 截断规则（纯函数）

const section = (id: string, title: string, size: number): SnapshotSection => ({ id, title, text: `【${title}】\n${`${title}数据行。`.repeat(Math.ceil(size / (title.length + 4)) + 1).slice(0, size)}` });

test('没超上限：原样按页面顺序拼接，不加说明', () => {
  const sections = [section('thesis', '页首', 200), section('cash', '现金', 300)];
  const clipped = clipSectionedSnapshot(sections, { focus: 'cash' });
  assert.equal(clipped.truncated, false);
  assert.equal(clipped.body, sections.map(item => item.text).join('\n\n'));
});

test('超上限：用户正在看的那一节优先保留，页首次之，放不下的整节省略并写明；总长不超上限且仍按页面顺序', () => {
  const sections = [section('thesis', '页首', 800), section('business', '生意', 6000), section('variables', '变量', 6000), section('cash', '现金', 6000), section('valuation', '估值', 6000)];
  const clipped = clipSectionedSnapshot(sections, { focus: 'cash', keep: ['thesis'] });
  assert.equal(clipped.truncated, true);
  assert.ok(clipped.body.length <= PAGE_SNAPSHOT_LIMIT, `${clipped.body.length}`);
  assert.ok(clipped.body.includes(sections[3]!.text), '正在看的现金一节完整保留');
  assert.ok(clipped.body.includes(sections[0]!.text), '页首保留');
  assert.deepEqual(clipped.omitted.length > 0, true);
  for (const title of clipped.omitted) assert.match(clipped.body, new RegExp(`已省略[^）]*「${title}」`));
  assert.match(clipped.body, /优先保留用户正在看的「现金」/);
  assert.ok(clipped.body.indexOf('【页首】') < clipped.body.indexOf('【现金】'), '输出按页面顺序');
  // 换成看估值：估值完整保留，现金可被省略。
  const other = clipSectionedSnapshot(sections, { focus: 'valuation', keep: ['thesis'] });
  assert.ok(other.body.includes(sections[4]!.text));
  assert.ok(other.body.length <= PAGE_SNAPSHOT_LIMIT);
});

test('正在看的那一节自己就超上限：只截它（行边界、写明被截断），其余整节省略', () => {
  const huge: SnapshotSection = { id: 'cash', title: '现金', text: `【现金】\n${Array.from({ length: 3000 }, (_, i) => `- 第 ${i} 行：数字`).join('\n')}` };
  const clipped = clipSectionedSnapshot([section('thesis', '页首', 500), huge, section('valuation', '估值', 500)], { focus: 'cash', keep: ['thesis'] });
  assert.ok(clipped.body.length <= PAGE_SNAPSHOT_LIMIT);
  assert.deepEqual(clipped.clipped, ['现金']);
  assert.match(clipped.body, /「现金」被截断/);
  assert.ok(clipped.body.includes('【页首】'));
  assert.match(clipped.body, /…\n\n…（页面快照超出/);
});

test('没有正在看的节（取不到）：页首优先，其余按页面顺序填满', () => {
  const sections = [section('thesis', '页首', 500), section('business', '生意', 9000), section('cash', '现金', 9000)];
  const clipped = clipSectionedSnapshot(sections, { keep: ['thesis'] });
  assert.ok(clipped.body.includes('【页首】') && clipped.body.includes('【生意】'));
  assert.deepEqual(clipped.omitted, ['现金']);
  assert.ok(clipped.body.length <= PAGE_SNAPSHOT_LIMIT);
});
