import assert from 'node:assert/strict';
import test, { before, after } from 'node:test';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { createServer as createHttpServer } from 'node:http';
import { createServer } from 'vite';
import * as React from 'react';
import { Window } from 'happy-dom';
import { CompanyPageStore, companyPageStore, companyPageProgress } from '../src/verticals/finance/lib/companyPage.ts';
import { companyPageFixture, fixtureData, fixturePacket, fixturePageResearch, fixtureResearch, fixtureScenario } from './fixtures/company_page.ts';
import type { ReportTaskStore } from '../src/verticals/finance/lib/reportTasks.ts';
import { researchRoute } from '../dsh/finance-ui/research.mjs';

test('名册读取不启动；首次打开并发读取、重复打开都只启动一次', async () => {
  const fixture = companyPageFixture();
  const store = companyPageStore(fixture.services, '600863', '华能蒙电');
  await store.refresh();
  assert.equal(fixture.starts.length, 0);
  await Promise.all([store.refresh(true), store.refresh(true)]);
  await companyPageStore(fixture.services, '600863', '华能蒙电').refresh(true);
  assert.equal(fixture.starts.length, 1);
  assert.equal(store.getSnapshot().task?.sessionId, fixture.task.sessionId);
});
test('已有判断不启动；过期后台更新保留旧版，完成后自动替换，再打开不重复', async () => {
  const fixture = companyPageFixture({ research: fixtureResearch, stale: false, basisVersion: 'v1' });
  const store = new CompanyPageStore(fixture.services, '600863', '华能蒙电');
  await store.refresh(true);
  assert.equal(fixture.starts.length, 0);
  fixture.set({ research: fixtureResearch, stale: true, basisVersion: 'v2' });
  fixture.setTask({ ...fixture.task, status: 'completed' });
  await store.refresh(true);
  assert.equal(fixture.starts.length, 1);
  assert.equal(store.getSnapshot().research, fixtureResearch);
  const newer = { ...fixtureResearch, basisVersion: 'v2', researchedAt: '2026-10-11' };
  fixture.set({ research: newer, stale: false, basisVersion: 'v2' });
  fixture.setTask({ ...fixture.task, status: 'completed' });
  await store.refresh();
  assert.equal(store.getSnapshot().research, newer);
  await store.refresh(true);
  assert.equal(fixture.starts.length, 1);
});
test('接口读取失败不能当作首次打开；已有运行、失败、中止任务均不重复创建', async () => {
  const failedRead = companyPageFixture();
  failedRead.services.readResearch = async () => { throw new Error('fixture outage'); };
  await new CompanyPageStore(failedRead.services, '600863', '华能蒙电').refresh(true);
  assert.equal(failedRead.starts.length, 0);
  for (const status of ['researching', 'failed', 'cancelled', 'partial', 'awaiting_authorization'] as const) {
    const fixture = companyPageFixture({ research: null, stale: false, basisVersion: 'v1' });
    fixture.setTask({ sessionId: status, status, stage: status, startedAt: new Date().toISOString() });
    await new CompanyPageStore(fixture.services, '600863', '华能蒙电').refresh(true);
    assert.equal(fixture.starts.length, 0);
  }
});
test('一天前（含 T7 之前）未成功结束的研究不挡首次打开；仍在运行的老任务照样不重复创建', async () => {
  const old = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString();
  for (const status of ['failed', 'cancelled', 'partial', 'awaiting_authorization', 'unconfirmed', 'settling'] as const) {
    const fixture = companyPageFixture({ research: null, stale: false, basisVersion: 'v1' });
    fixture.setTask({ sessionId: status, status, stage: status, startedAt: old });
    const store = new CompanyPageStore(fixture.services, '600863', '华能蒙电');
    await store.refresh(true); await store.refresh(true);
    assert.equal(fixture.starts.length, 1, status);
  }
  const running = companyPageFixture({ research: null, stale: false, basisVersion: 'v1' });
  running.setTask({ sessionId: 'old-running', status: 'researching', stage: '正在研究', startedAt: old });
  await new CompanyPageStore(running.services, '600863', '华能蒙电').refresh(true);
  assert.equal(running.starts.length, 0);
});
test('启动失败不循环自动重试；任务绑定回读暂未到达时保留进行中状态', async () => {
  const fixture = companyPageFixture();
  fixture.services.startResearch = async () => { fixture.starts.push({ symbol: '600863', name: '', version: '' }); throw new Error('fixture start failure'); };
  const store = new CompanyPageStore(fixture.services, '600863', '华能蒙电');
  await store.refresh(true); await store.refresh(true);
  assert.equal(fixture.starts.length, 1);
  const lag = companyPageFixture();
  const lagStore = new CompanyPageStore(lag.services, '600863', '华能蒙电');
  await lagStore.refresh(true);
  lag.setTask(undefined);
  await lagStore.refresh();
  assert.equal(lagStore.getSnapshot().task?.status, 'researching');
  assert.equal(lag.starts.length, 1);
});
test('公司数据包、资料与个股页研究只读代理范围限定交易所与路径', () => {
  for (const part of ['data-packet', 'documents', 'page-research']) {
    assert.equal(researchRoute('GET', `/wiki/companies/600863.SH/${part}`), true);
    assert.equal(researchRoute('POST', `/wiki/companies/600863.SH/${part}`), false);
    assert.equal(researchRoute('GET', `/wiki/companies/600863/${part}`), false);
    assert.equal(researchRoute('GET', `/wiki/companies/../../${part}`), false);
    assert.equal(researchRoute('PUT', `/wiki/companies/600863.SH/${part}`), false);
    assert.equal(researchRoute('GET', `/wiki/companies/600863.SH/${part}/extra`), false);
  }
  assert.equal(researchRoute('POST', '/wiki/companies/600863.SH/coverage/ensure'), true);
  assert.equal(researchRoute('GET', '/wiki/companies/600863.SH/coverage/ensure'), false);
  assert.equal(researchRoute('POST', '/wiki/companies/600863/coverage/ensure'), false);
});
test('订阅中的任务自动回读完成结果；无订阅停止轮询，不取消 DSH 任务', async t => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const fixture = companyPageFixture();
  const store = new CompanyPageStore(fixture.services, '600863', '华能蒙电');
  const stop = store.subscribe(() => {});
  await store.refresh(true);
  fixture.set({ research: fixtureResearch, stale: false, basisVersion: 'v2' });
  fixture.setTask({ ...fixture.task, status: 'completed' });
  let reads = 0;
  const read = fixture.services.readResearch;
  fixture.services.readResearch = async symbol => { reads++; return read(symbol); };
  t.mock.timers.tick(3000);
  assert.equal(reads, 1);
  await store.refresh();
  assert.equal(reads, 2);
  assert.equal(store.getSnapshot().research, fixtureResearch);
  assert.equal(companyPageProgress(store.getSnapshot()), null);
  stop(); t.mock.timers.reset();
});
test('后台待确认、部分完成、无新增与中止保留各自语义', () => {
  for (const [status, label] of [['awaiting_authorization', '研究草案待确认'], ['partial', '部分内容已整理'], ['no_increment', '没有新增内容'], ['interrupted', '研究已中止']] as const) {
    assert.ok(companyPageProgress({ loaded: true, research: null, stale: false, task: { sessionId: 'state', status, stage: '' } })?.includes(label));
  }
  assert.equal(companyPageProgress({ loaded: true, research: null, stale: false, task: { sessionId: 'state', status: 'skipped', stage: '' } }), '本次研究未整理');
  assert.equal(companyPageProgress({ loaded: true, research: fixtureResearch, stale: false, task: { sessionId: 'state', status: 'skipped', stage: '本次研究未整理' } }), null);
});

let server: Awaited<ReturnType<typeof createServer>>, win: Window, root: ReturnType<typeof import('react-dom/client')['createRoot']>;
let ui: Record<string, any>, serviceModule: Record<string, any>, router: Record<string, any>, sessionModule: Record<string, any>, routeModule: Record<string, any>, watchModule: Record<string, any>;
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
  serviceModule = await server.ssrLoadModule('/src/verticals/finance/lib/companyPageServices.ts');
  routeModule = await server.ssrLoadModule('/src/verticals/finance/pages/CompanyWiki.tsx');
  watchModule = await server.ssrLoadModule('/src/verticals/finance/pages/Watch.tsx');
  router = await server.ssrLoadModule('react-router-dom');
  sessionModule = await server.ssrLoadModule('/src/verticals/finance/dsh/research-session.tsx');
  container = win.document.createElement('div') as unknown as HTMLElement;
  win.document.body.append(container);
  root = (await import('react-dom/client')).createRoot(container);
});
after(async () => { await React.act(async () => root?.unmount()); await server?.close(); win?.happyDOM.abort(); Object.assign(globalThis, previous); });
async function mountPage(fixture: ReturnType<typeof companyPageFixture>) {
  await React.act(async () => root.render(React.createElement(router.MemoryRouter, null,
    React.createElement(ui.CompanyPage, { key: fixture.services, symbol: '600863', name: '华能蒙电（夹具）', services: fixture.services, onTask: () => {} }))));
}
test('页面按方法论模板渲染数据包、情景表、变化悬停、资料与证据墙', async () => {
  const fixture = companyPageFixture({ research: fixtureResearch, stale: false, basisVersion: 'v1' });
  await mountPage(fixture);
  assert.deepEqual([...container.querySelectorAll('[data-company-section]')].map(element => element.getAttribute('data-company-section')), ['thesis', 'business', 'profit_formula', 'variables', 'cash', 'valuation', 'tracking']);
  assert.match(container.textContent!, /71.00 亿元/);
  assert.match(container.textContent!, /18.00 亿元/);
  assert.match(container.textContent!, /4\.56 人民币/);
  assert.equal(container.querySelector('.company-page-price span')?.getAttribute('title'), '行情时点 2026-10-10T09:30:00+08:00');
  assert.match(container.textContent!, /\+1\.20%/);
  assert.match(container.querySelector('[data-company-section="valuation"]')!.textContent!, /4\.28 元\/股/);
  assert.match(container.textContent!, /偏高/);
  assert.match(container.textContent!, /每股收益（TTM）/);
  assert.match(container.textContent!, /机构预测每股收益/);
  assert.match(container.textContent!, /前瞻市盈率/);
  assert.match(container.querySelector('[data-pillar="spread"]')!.textContent!, /71\.00 亿元/);
  assert.match(container.querySelector('[data-falsifier]')!.textContent!, /0 元 · 下一份定期报告/);
  assert.match(container.textContent!, /22.23/);
  assert.match(container.querySelector('[data-scenario="table"] thead')!.textContent!, /情景\s*每股收益\s*倍数\s*目标价/);
  assert.match(container.textContent!, /数量 ×（单价 − 单位成本）/);
  assert.doesNotMatch(container.textContent!, /生成报告|开始研究|历史分位|field_id|packet_field|scenarioRef|basisVersion|valuation_percentile|hithink/);
  assert.equal(container.querySelector('[data-change-hint]')?.getAttribute('title'), '最新定期报告后更新');
  assert.ok([...container.querySelectorAll('details')].every(detail => !detail.open));
  assert.ok(container.querySelector('a[href^="/insights/topics/"]'));
  assert.ok(container.querySelector('a[href^="/my-reports/read/"]'));
  const lead = container.querySelector('[data-company-section="thesis"]')!;
  assert.equal([...lead.querySelectorAll('p')].find(element => element.textContent?.startsWith('研究于 '))?.textContent, '研究于 2026-10-10');
  assert.doesNotMatch(lead.textContent!, /依据版本|aaaaaaaa|T01:00/);
  assert.equal(fixture.starts.length, 0);
  assert.equal(container.querySelector('[data-scenario="table"]')?.textContent?.includes('中性'), true);
});
test('数据包按上海当天读取；当日已有快照不 ensure，缺当日快照每天只 ensure 一次', async t => {
  t.mock.timers.enable({ apis: ['Date'], now: new Date('2026-10-09T16:30:00Z').getTime() });
  const originalFetch = globalThis.fetch;
  const calls: { method: string; path: string; asOf: string | null }[] = [];
  const resetPacketEnsureMemory = serviceModule.resetPacketEnsureMemory as () => void;
  resetPacketEnsureMemory();
  let snapshots = [{ observed_at: '2026-10-10T09:00:00+08:00' }];
  globalThis.fetch = async (input, init) => {
    const url = new URL(String(input), 'http://fixture');
    calls.push({ method: init?.method ?? 'GET', path: url.pathname, asOf: url.searchParams.get('as_of') });
    if (url.pathname.endsWith('/coverage/ensure')) return Response.json({ ok: true });
    if (!url.searchParams.has('as_of')) return Response.json({ detail: 'missing as_of' }, { status: 422 });
    return Response.json({ ...fixturePacket, as_of: url.searchParams.get('as_of'), provider_snapshots: snapshots, lenses: { valuation_percentile: { pe: { status: 'gap', reason: '不可交付' } } } });
  };
  try {
    const services = serviceModule.createCompanyPageServices({ start: async () => { throw new Error('读取数据包不能启动研究'); } });
    const signal = new AbortController().signal;
    const fresh = await services.data.packet('600863', signal);
    assert.equal(fresh.as_of, '2026-10-10');
    assert.equal(calls.filter(call => call.method === 'POST').length, 0);
    snapshots = [{ observed_at: '2026-10-09T09:00:00+08:00' }];
    resetPacketEnsureMemory();
    calls.length = 0;
    // R6：包立即返回，ensure 在后台；两次并发打开只 ensure 一次，完成后通知订阅者。
    let notified = 0;
    const unsubscribe = services.subscribePacket('600863', () => { notified += 1; });
    const [first] = await Promise.all([services.data.packet('600863', signal), services.data.packet('600863', signal)]);
    assert.equal(first.as_of, '2026-10-10');
    await new Promise(resolve => setTimeout(resolve, 20));
    await services.data.packet('600863', signal);
    await new Promise(resolve => setTimeout(resolve, 20));
    unsubscribe();
    assert.equal(calls.filter(call => call.path.endsWith('/coverage/ensure')).length, 1);
    assert.equal(notified, 1);
    assert.ok(calls.every(call => call.method === 'POST' || call.asOf === '2026-10-10'));
    const fixture = companyPageFixture({ research: fixtureResearch, stale: false, basisVersion: 'v1' });
    await mountPage(fixture);
    assert.doesNotMatch(container.textContent!, /历史分位|不可交付/);
    assert.ok(container.querySelector('[data-evidence-ref="claim:fixture-revenue"]'));
  } finally { globalThis.fetch = originalFetch; resetPacketEnsureMemory(); t.mock.timers.reset(); }
});
test('研究缺失仍显示数据包；过期更新期间保留上一版且不设横幅', async () => {
  const missing = companyPageFixture();
  await mountPage(missing);
  assert.match(container.textContent!, /71.00 亿元/);
  assert.match(container.textContent!, /核对利润变量/);
  assert.equal(missing.starts.length, 1);
  assert.doesNotMatch(container.textContent!, /生成报告|开始研究/);
  const stale = companyPageFixture({ research: fixtureResearch, stale: true, basisVersion: 'v2' });
  await mountPage(stale);
  assert.match(container.textContent!, /煤价与电价的价差决定利润/);
  assert.doesNotMatch(container.textContent!, /系统更新了判断/);
});
test('数据包已到时资料可后到；研究接口失败不会显示虚假研究中', async () => {
  const fixture = companyPageFixture();
  let finish!: (value: typeof fixtureData.documents) => void;
  fixture.services.data.documents = () => new Promise(resolve => { finish = resolve; });
  fixture.services.readResearch = async () => { throw new Error('fixture unbound'); };
  await mountPage(fixture);
  assert.match(container.textContent!, /4\.56 人民币/);
  assert.match(container.textContent!, /4.28 元\/股/);
  assert.match(container.textContent!, /18.00 亿元/);
  assert.ok(container.querySelector('[aria-label="正在读取资料"]'));
  assert.match(container.textContent!, /研究暂不可用/);
  assert.equal(container.querySelector('[data-company-progress]'), null);
  await React.act(async () => finish(fixtureData.documents));
  assert.equal(container.querySelector('[aria-label="正在读取资料"]'), null);
});
test('研究正文不渲染未登记组件；利润公式仍显示', async () => {
  const fixture = companyPageFixture({ research: fixtureResearch, stale: false, basisVersion: 'bad' });
  await mountPage(fixture);
  assert.equal(container.querySelector('[data-vibe-block]'), null);
  assert.doesNotMatch(container.textContent!, /正在准备研究组件|<stat>|坏指标/);
  assert.match(container.textContent!, /利润取决于/);
});
test('五类公司共用布局；缺口写原因，不把缺失数补成零', async () => {
  for (const companyType of ['generic', 'commodity_cycle', 'leveraged_cyclical_utility', 'scarce_asset_rent', 'bank'] as const) {
    const fixture = companyPageFixture({ research: { ...fixtureResearch, companyType, sections: { ...fixtureResearch.sections, profit_formula: { summary: `已保存的 ${companyType} 利润公式` } } }, stale: false, basisVersion: companyType });
    await mountPage(fixture);
    assert.match(container.textContent!, new RegExp(`已保存的 ${companyType} 利润公式`));
    const business = container.querySelector('[data-company-section="business"]')!.textContent!;
    assert.match(business, /71.00 亿元/);
    assert.match(container.querySelector('[data-company-section="cash"]')!.textContent!, /暂时取不到现金分红/);
    assert.doesNotMatch(container.querySelector('[data-company-section="cash"]')!.textContent!, /现金分红[\s\S]*0\.00 亿元/);
  }
});
test('冲突两值并列，情景表缺口单独显示', async () => {
  const conflict = { ...fixturePacket, fields: { ...fixturePacket.fields, pe: {
    metric: 'pe', status: 'conflict', value: null, unit: '倍', period: '2026-10-10', reason: 'provider 与同期合并报告不一致，保留两值和出处',
    provider_values: [{ provider: 'hithink', value: 19.8, unit: '倍', period: '2026-10-10' }],
    report_comparisons: [{ consistent: false, report: { value: 18.2, unit: '倍', period: 'FY2025' } }],
  } } };
  const fixture = companyPageFixture({ research: { ...fixtureResearch, valuation: { grade: '合理', conditions: '条件变了就改档。' } }, stale: false, basisVersion: 'v1' });
  fixture.services.data.packet = async () => conflict;
  fixture.services.readScenario = async () => null;
  await mountPage(fixture);
  const valuation = container.querySelector('[data-company-section="valuation"]')!.textContent!;
  assert.match(valuation, /19\.80 倍/);
  assert.match(valuation, /18\.20 倍/);
  assert.match(valuation, /同花顺/);
  assert.match(valuation, /定期报告/);
  assert.match(valuation, /暂时取不到市盈率/);
  assert.doesNotMatch(valuation, /行情来源与定期报告不一致|hithink|provider/);
  assert.match(container.querySelector('[data-scenario="gap"]')!.textContent!, /三档目标价暂时算不出来/);
  assert.equal(fixtureScenario.length, 3);
});
test('情景表读取计算结果回读里的 extra，旧模式名不当成利润模式', async () => {
  const packetModule = await server.ssrLoadModule('/src/verticals/finance/lib/companyPacket.ts');
  const scenarios = [
    { name: '悲观', multiple: '6.5', price: '5.33', earnings: '0.82' },
    { name: '中性', multiple: '7.7', price: '6.314', earnings: '0.82' },
    { name: '乐观', multiple: '8.6', price: '7.32', earnings: '0.85' },
  ];
  const readback = { status: 200, body: { payload: { calculation: { extra: { mode: 'per_share', scenarios } } } } };
  assert.equal(packetModule.scenarioTable(readback)?.mode, 'per_share');
  assert.equal(packetModule.scenarioTable(readback)?.rows[1].price, '6.314');
  assert.equal(packetModule.scenarioTable({ payload: { calculation: { extra: { mode: 'total', scenarios } } } })?.mode, 'total');
  assert.equal(packetModule.scenarioTable({ extra: { mode: 'total_profit', scenarios } })?.mode, 'per_share');
});
test('驱动与镜头按稳定 ID 显示，不存在的 ID 记成缺口；缺口研究仍显示数据包', async () => {
  const packetModule = await server.ssrLoadModule('/src/verticals/finance/lib/companyPacket.ts');
  assert.equal(packetModule.findField(fixturePacket, 'revenue')?.source_ref, 'claim:fixture-revenue');
  assert.equal(packetModule.findField(fixturePacket, 'driver:power_price')?.value, 321);
  assert.equal(packetModule.findField(fixturePacket, 'lens:peer_comparison.pe')?.value, 12.5);
  assert.equal(packetModule.findField(fixturePacket, 'lens:single_quarters.2026Q1.revenue')?.value, 2500000000);
  assert.equal(packetModule.findField(fixturePacket, 'lens:ttm_profit.ttm_profit')?.value, 3600000000);
  assert.equal(packetModule.findField(fixturePacket, 'lens:missing.revenue'), undefined);
  const cited = companyPageFixture({ research: {
    ...fixtureResearch,
    pillars: [{ id: 'cited', text: '驱动和镜头可以引用。', fieldIds: ['driver:power_price', 'lens:peer_comparison.pe', 'lens:single_quarters.2026Q1.revenue', 'lens:missing.revenue'] }],
    falsifiers: [{ text: '滚动利润变弱。', fieldId: 'lens:ttm_profit.ttm_profit', window: '下一份定期报告' }],
  }, stale: false, basisVersion: 'cited' });
  await mountPage(cited);
  const pillar = container.querySelector('[data-pillar="cited"]')!.textContent!;
  assert.match(pillar, /321\.00 元\/兆瓦时/);
  assert.match(pillar, /12\.50 倍/);
  assert.match(pillar, /25\.00 亿元/);
  assert.match(pillar, /暂时取不到相关指标/);
  assert.doesNotMatch(pillar, /这项数据/);
  assert.doesNotMatch(pillar, /lens:missing|driver:power_price/);
  assert.match(container.querySelector('[data-falsifier]')!.textContent!, /36\.00 亿元/);
  const gap = companyPageFixture({
    research: { companyType: 'bank', gapNote: '核心字段 net_profit_attributable 暂不可用', researchedAt: '2026-10-12T08:00:00+00:00' },
    stale: false, basisVersion: 'a'.repeat(64),
  });
  await mountPage(gap);
  assert.match(container.querySelector('[data-company-section="thesis"]')!.textContent!, /核心字段 net_profit_attributable 暂不可用/);
  assert.match(container.textContent!, /71\.00 亿元/);
  assert.equal(container.querySelector('[data-valuation-grade]'), null);
  assert.equal(container.querySelector('[data-scenario]'), null);
});
test('缺口说明不显示五档和情景表；利润模式情景表用利润列', async () => {
  const noted = companyPageFixture({ research: { ...fixtureResearch, gapNote: '营业收入暂时取不到，这次不写判断。', thesis: undefined, valuation: { grade: '偏高', scenarioRef: fixtureResearch.valuation?.scenarioRef } }, stale: false, basisVersion: 'gap' });
  await mountPage(noted);
  assert.match(container.querySelector('[data-company-section="thesis"]')!.textContent!, /营业收入暂时取不到，这次不写判断。/);
  assert.equal(container.querySelector('[data-valuation-grade]'), null);
  assert.equal(container.querySelector('[data-scenario]'), null);
  assert.match(container.textContent!, /71.00 亿元/);
  const profit = companyPageFixture({ research: fixtureResearch, stale: false, basisVersion: 'profit' });
  profit.services.readScenario = async () => ({ mode: 'total', rows: [{ name: '中性', multiple: '19', price: '26.81', earnings: '32000000000' }] });
  await mountPage(profit);
  const table = container.querySelector('[data-scenario="table"]')!;
  assert.equal(table.getAttribute('data-scenario-mode'), 'total');
  assert.match(table.querySelector('thead')!.textContent!, /利润/);
  assert.doesNotMatch(table.querySelector('thead')!.textContent!, /每股收益/);
  assert.match(table.textContent!, /320\.00 亿元/);
});
test('真实路由挂夹具：工具栏、页内、返回关注显示同一进度；重新打开不重复', async () => {
  const fixture = companyPageFixture();
  globalThis.fetch = async url => String(url).includes('/wiki/pages?') ? Response.json({ items: [], total: 0 }) : Response.json({ items: [] });
  const roster = await server.ssrLoadModule('/src/verticals/finance/lib/researchRoster.ts');
  const local = await server.ssrLoadModule('/src/verticals/finance/lib/localService.ts');
  const original = local.localService.clientResearch;
  local.localService.clientResearch = async () => ({ symbols: ['600863'] });
  await roster.hydrateRoster();
  const opened: string[] = [];
  try {
    await React.act(async () => root.render(React.createElement(sessionModule.ResearchSessionContext.Provider, { value: { openTaskProcess: (task: { sessionId: string }) => opened.push(task.sessionId) } },
      React.createElement(ui.CompanyPageServicesContext.Provider, { value: fixture.services },
        React.createElement(router.MemoryRouter, { initialEntries: ['/watch/600863'] }, React.createElement(router.Routes, null,
          React.createElement(router.Route, { path: '/watch', element: React.createElement(watchModule.Watch) }),
          React.createElement(router.Route, { path: '/watch/:symbol', element: React.createElement(routeModule.CompanyWiki) })))))));
    assert.equal(container.querySelectorAll('[data-company-progress="toolbar"]').length, 1);
    assert.equal(container.querySelectorAll('[data-company-progress="page"]').length, 1);
    await React.act(async () => (container.querySelector('[data-company-progress="toolbar"] button') as HTMLButtonElement).click());
    assert.deepEqual(opened, ['fixture-session']);
    await React.act(async () => [...container.querySelectorAll('button')].find(button => button.textContent === '关注')!.click());
    // 关注列表里同一进度只以状态点出现一次，说明文字相同。
    const dots = [...container.querySelectorAll('[role="img"][aria-label]')].map(element => element.getAttribute('aria-label'));
    assert.equal(dots.length, 1);
    assert.equal(dots[0], '核对利润变量');
    await React.act(async () => [...container.querySelectorAll('button')].find(button => button.textContent === '600863')!.click());
    assert.equal(fixture.starts.length, 1);
    assert.equal(container.querySelector('iframe'), null);
    assert.doesNotMatch(container.textContent!, /图文报告|生成报告|开始研究/);
  } finally { local.localService.clientResearch = original; }
});
test('默认读取接入 Backend GET；后台启动沿用 DSH 身份，不导航', async () => {
  const calls: unknown[][] = [];
  const originalFetch = globalThis.fetch;
  const requested: string[] = [];
  globalThis.fetch = async (url, init) => {
    assert.equal(init?.method ?? 'GET', 'GET');
    requested.push(String(url));
    return Response.json(String(url) === '/finance-report-tasks' ? { sessions: {} } : fixturePageResearch);
  };
  try {
    const sessions = { taskRunning: () => false, start: async (...args: unknown[]) => { calls.push(args); return { sessionId: 'background', status: 'started' }; } };
    const services = serviceModule.createCompanyPageServices(sessions);
    assert.deepEqual(await services.readResearch('600863'), { ...fixturePageResearch, task: undefined });
    assert.deepEqual(requested, ['/finance-research/wiki/companies/600863.SH/page-research', '/finance-report-tasks']);
    assert.equal(calls.length, 0);
    await services.startResearch('600863', '华能蒙电', 'v1');
    assert.equal(calls.length, 1);
    assert.deepEqual(calls[0]![2], { navigate: false, task: { kind: 'research', slug: 'companies/600863-sh', symbol: '600863', title: '公司研究 · 华能蒙电' } });
    const source = readFileSync(new URL('../src/verticals/finance/pages/CompanyWiki.tsx', import.meta.url), 'utf8');
    assert.doesNotMatch(source, /WikiReader|WikiViewTabs|\/wiki\/reports|\/wiki\/pages\/ensure/);
  } finally { globalThis.fetch = originalFetch; }
});

test('任务只合并同公司最新 DSH 研究绑定：保存 completed、执行 completed 与其他终态不混淆', async () => {
  const originalFetch = globalThis.fetch;
  const bindings: ReportTaskStore = { sessions: {
    old: { kind: 'research', slug: 'companies/600863-sh', bound_at: '2026-10-09T01:00:00Z', settlement_status: 'completed' },
    current: { kind: 'research', slug: 'companies/600863-sh', bound_at: '2026-10-10T01:00:00Z', run_status: 'completed' },
    report: { kind: 'report', slug: 'companies/600863-sh', bound_at: '2026-10-11T01:00:00Z', run_status: 'running' },
    other: { kind: 'research', slug: 'companies/000001-sz', bound_at: '2026-10-11T01:00:00Z', run_status: 'running' },
  } };
  let running = false;
  globalThis.fetch = async url => Response.json(String(url) === '/finance-report-tasks' ? bindings : { ...fixturePageResearch, task: { sessionId: 'forged-backend-task', status: 'researching', stage: '伪造进度' } });
  try {
    const services = serviceModule.createCompanyPageServices({ taskRunning: () => running });
    const binding = bindings.sessions.current;
    for (const [settlement, runStatus, isRunning, expected] of [
      ['completed', 'completed', false, 'completed'],
      [undefined, 'completed', false, 'unconfirmed'],
      ['running', 'completed', false, 'settling'],
      ['partial', 'completed', false, 'partial'],
      ['awaiting_authorization', 'completed', false, 'awaiting_authorization'],
      ['failed', 'completed', false, 'failed'],
      ['completed', 'failed', false, 'failed'],
      ['completed', 'cancelled', false, 'cancelled'],
      ['completed', 'running', true, 'researching'],
    ] as const) {
      binding.settlement_status = settlement;
      binding.settlement_updated_at = new Date().toISOString();
      binding.run_status = runStatus;
      running = isRunning;
      const result = await services.readResearch('600863');
      assert.equal(result.task.sessionId, 'current');
      assert.equal(result.task.status, expected);
      assert.equal(result.task.stage, companyPageProgress({ loaded: true, research: fixtureResearch, stale: false, task: { ...result.task, stage: '' } }) ?? '');
    }
  } finally { globalThis.fetch = originalFetch; }
});

test('DSH 保存完成事件补读一次研究并替换旧版；重复事件不再补读，最后退订释放事件与轮询', { timeout: 5000 }, async t => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const originalFetch = globalThis.fetch;
  const listeners = new Set<() => void>();
  const newer = { ...fixtureResearch, researchedAt: '2026-10-11T01:00:00Z', basisVersion: 'c'.repeat(64) };
  const bindings: ReportTaskStore = { sessions: { current: { kind: 'research', slug: 'companies/600863-sh', run_status: 'running', bound_at: new Date().toISOString() } } };
  let pageReads = 0, starts = 0;
  const stops: (() => void)[] = [];
  globalThis.fetch = async url => {
    if (String(url) === '/finance-report-tasks') return Response.json(bindings);
    pageReads++;
    return Response.json({ research: pageReads <= 2 ? fixtureResearch : newer, stale: pageReads <= 2, basisVersion: newer.basisVersion });
  };
  try {
    const services = serviceModule.createCompanyPageServices({
      taskRunning: () => bindings.sessions.current.run_status === 'running',
      subscribeSessionList: (listener: () => void) => { listeners.add(listener); return () => listeners.delete(listener); },
      start: async () => { starts++; throw new Error('已有运行任务不能重复创建'); },
    });
    const store = new CompanyPageStore(services, '600863', '华能蒙电');
    let finish!: () => void;
    const completed = new Promise<void>(resolve => { finish = resolve; });
    stops.push(store.subscribe(() => { if (store.getSnapshot().research?.basisVersion === newer.basisVersion) finish(); }));
    stops.push(store.subscribe(() => {}));
    assert.equal(listeners.size, 1);
    await store.refresh(true);
    assert.deepEqual(store.getSnapshot().research, fixtureResearch);
    assert.equal(store.getSnapshot().task?.status, 'researching');
    bindings.sessions.current.run_status = 'completed';
    bindings.sessions.current.settlement_status = 'completed';
    listeners.forEach(listener => listener());
    await completed;
    assert.equal(pageReads, 3);
    assert.deepEqual(store.getSnapshot().research, newer);
    assert.equal(store.getSnapshot().task?.status, 'completed');
    assert.equal(starts, 0);
    listeners.forEach(listener => listener());
    await store.refresh();
    assert.equal(pageReads, 4);
    t.mock.timers.tick(3000);
    assert.equal(pageReads, 4);
    stops.shift()!();
    assert.equal(listeners.size, 1);
    stops.shift()!();
    assert.equal(listeners.size, 0);
  } finally { stops.forEach(stop => stop()); globalThis.fetch = originalFetch; }
});

test('Backend 404/503、无效回包或任务投影失败显示研究暂不可用，不当未研究、不启动', async () => {
  const originalFetch = globalThis.fetch;
  let starts = 0;
  try {
    for (const failure of ['404', '503', 'malformed', 'tasks'] as const) {
      globalThis.fetch = async url => {
        if (failure === 'tasks' && String(url) === '/finance-report-tasks') return Response.json({ detail: 'fixture task outage' }, { status: 503 });
        if (String(url) === '/finance-report-tasks') return Response.json({ sessions: {} });
        if (failure === 'malformed') return Response.json({ items: [] });
        if (failure === 'tasks') return Response.json({ research: null, stale: false, basisVersion: 'a'.repeat(64) });
        return Response.json({ detail: 'fixture backend outage' }, { status: Number(failure) });
      };
      const services = serviceModule.createCompanyPageServices({
        taskRunning: () => false, subscribeSessionList: () => () => {},
        start: async () => { starts++; return { sessionId: 'unexpected', status: 'started' }; },
      });
      const fixture = companyPageFixture();
      fixture.services.readResearch = services.readResearch;
      fixture.services.startResearch = services.startResearch;
      await mountPage(fixture);
      assert.match(container.textContent!, /研究暂不可用/);
      assert.equal(container.querySelector('[data-company-progress]'), null);
      assert.equal(starts, 0);
    }
  } finally { globalThis.fetch = originalFetch; }
});

test('完成后的补读失败保留旧判断并显示研究暂不可用，不重新启动', async () => {
  const originalFetch = globalThis.fetch;
  const bindings: ReportTaskStore = { sessions: { current: { kind: 'research', slug: 'companies/600863-sh', run_status: 'running', bound_at: new Date().toISOString() } } };
  let pageReads = 0, starts = 0;
  globalThis.fetch = async url => {
    if (String(url) === '/finance-report-tasks') return Response.json(bindings);
    pageReads++;
    return pageReads === 3 ? Response.json({ detail: 'fixture readback outage' }, { status: 503 }) : Response.json(fixturePageResearch);
  };
  try {
    const services = serviceModule.createCompanyPageServices({
      taskRunning: () => bindings.sessions.current.run_status === 'running',
      start: async () => { starts++; throw new Error('补读故障不能重新研究'); },
    });
    const fixture = companyPageFixture();
    fixture.services.readResearch = services.readResearch;
    fixture.services.startResearch = services.startResearch;
    await mountPage(fixture);
    bindings.sessions.current.run_status = 'completed';
    bindings.sessions.current.settlement_status = 'completed';
    const model = await server.ssrLoadModule('/src/verticals/finance/lib/companyPage.ts');
    await React.act(async () => model.companyPageStore(fixture.services, '600863', '华能蒙电（夹具）').refresh());
    assert.equal(pageReads, 3);
    assert.match(container.querySelector('[data-company-section="thesis"]')!.textContent!, /煤价与电价的价差决定利润.*研究暂不可用/);
    assert.equal(starts, 0);
  } finally { globalThis.fetch = originalFetch; }
});

test('接通后首次打开只在研究缺失或过期时，每个 basisVersion 触发一次', async () => {
  const originalFetch = globalThis.fetch;
  let response = { research: null as typeof fixtureResearch | null, stale: false, basisVersion: 'a'.repeat(64) };
  let starts = 0;
  globalThis.fetch = async url => Response.json(String(url) === '/finance-report-tasks' ? { sessions: {} } : response);
  try {
    const services = serviceModule.createCompanyPageServices({ taskRunning: () => false, start: async () => { starts++; return { sessionId: `fixture-${starts}`, status: 'started' }; } });
    const store = new CompanyPageStore(services, '600863', '华能蒙电');
    await store.refresh();
    assert.equal(starts, 0);
    await Promise.all([store.refresh(true), store.refresh(true)]);
    assert.equal(starts, 1);
    response = { research: fixtureResearch, stale: false, basisVersion: 'b'.repeat(64) };
    await store.refresh(true);
    assert.equal(starts, 1);
    response = { ...response, stale: true };
    await store.refresh(true);
    assert.equal(starts, 2);
    response = { ...response, stale: false };
    await store.refresh(true);
    response = { ...response, stale: true };
    await store.refresh(true);
    assert.equal(starts, 2);
  } finally { globalThis.fetch = originalFetch; }
});
test('数据包未到时估值节保留骨架；读取失败时不把缺口写成零', async () => {
  const pending = companyPageFixture({ research: null, stale: false, basisVersion: 'v1' });
  pending.services.data.packet = () => new Promise(() => {});
  await mountPage(pending);
  const valuation = container.querySelector('[data-company-section="valuation"]');
  assert.ok(valuation, '数据包未到时估值节保留并显示骨架');
  assert.ok(valuation!.querySelector('[role="status"]'));
  const failed = companyPageFixture({ research: null, stale: false, basisVersion: 'v1' });
  failed.services.data.packet = async () => { throw new Error('fixture packet outage'); };
  await mountPage(failed);
  assert.match(container.querySelector('[data-company-section="valuation"]')!.textContent!, /数据暂时取不到/);
  assert.doesNotMatch(container.textContent!, /0\.00 倍/);
});
