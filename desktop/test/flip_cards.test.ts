// Contract and DOM tests; fake API responses do not establish live product acceptance.
import assert from 'node:assert/strict';
import test, { before, after } from 'node:test';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { createServer as createHttpServer } from 'node:http';
import { createServer } from 'vite';
import * as React from 'react';
import { Window } from 'happy-dom';

const fixture = JSON.parse(readFileSync(new URL('./fixtures/tracking_variables.json', import.meta.url), 'utf8'));
let server: Awaited<ReturnType<typeof createServer>>, win: Window, root: ReturnType<typeof import('react-dom/client')['createRoot']>, container: HTMLElement;
let flip: any, stream: any, valuation: any, prefs: any, recon: any, desk: any, tracking: any, router: any, pageContext: any;
const previous = { window: globalThis.window, document: globalThis.document, fetch: globalThis.fetch, localStorage: globalThis.localStorage, IS_REACT_ACT_ENVIRONMENT: globalThis.IS_REACT_ACT_ENVIRONMENT };
before(async () => {
  win = new Window();
  Object.assign(globalThis, { window: win, document: win.document, localStorage: win.localStorage, IS_REACT_ACT_ENVIRONMENT: true });
  server = await createServer({ configFile: false, root: fileURLToPath(new URL('../', import.meta.url)),
    resolve: { alias: { '@': fileURLToPath(new URL('../src/verticals/finance', import.meta.url)) } },
    server: { middlewareMode: true, hmr: { server: createHttpServer() }, watch: null }, appType: 'custom',
    ssr: { noExternal: ['react-router-dom', 'react-router'], resolve: { conditions: ['module-sync', 'node', 'import', 'development'] } } });
  const load = (path: string) => server.ssrLoadModule('/src/verticals/finance/' + path);
  [flip, stream, valuation, prefs, recon, desk, tracking] = await Promise.all([
    load('lib/flipCards.ts'), load('lib/feedStream.ts'), load('lib/valuationToday.ts'), load('lib/prefs.ts'),
    load('lib/reconResult.ts'), load('pages/VariableDesk.tsx'), load('pages/Tracking.tsx'),
  ]);
  router = await server.ssrLoadModule('react-router-dom');
  pageContext = await server.ssrLoadModule('/src/core/ai/pageContext.tsx');
  container = win.document.createElement('div') as unknown as HTMLElement;
  win.document.body.append(container);
  root = (await import('react-dom/client')).createRoot(container);
});
after(async () => { await React.act(async () => root?.unmount()); await server?.close(); win?.happyDOM.abort(); Object.assign(globalThis, previous); });

const value = (patch: Record<string, unknown> = {}) => ({ symbol: '000933.SZ', status: 'sourced', reason: null,
  as_of: '2026-11-06', close: '25.33', prices: [{ var_id: 'cmdty:SHFE.AL', name: '沪铝', unit: '元/吨', value: '23180', date: '2026-11-05' }],
  research: { grade: '偏低', base_grade: '偏低', researched_at: '2026-10-26T09:00:05Z' },
  grade_base: '合理', grade: '合理', changed_on: '2026-11-04', history: [], targets: null, near: null, ...patch });
const input = (item = value()) => ({ valuations: [item], names: { '000933.SZ': '神火股份' } });
const near = { var_id: 'cmdty:SHFE.AL', name: '沪铝', unit: '元/吨', value: '23500', gap_pct: '1.4', to_grade: '合理' };

test('档位变化卡只用 Backend 档位、连续日期和 key，回到研究档或 gap 不出卡', () => {
  const card = flip.flipCards(input())[0];
  assert.equal(card.text, '神火股份现在估值合理（研究时偏低）');
  assert.equal(card.key, 'valuation:000933.SZ:2026-11-04:偏低>合理');
  assert.equal(card.date, '2026-11-04');
  assert.match(card.involved, /股价 25.33，沪铝 23,180/);
  assert.deepEqual(flip.flipCards(input(value({ grade: '偏低' }))), []);
  assert.deepEqual(flip.flipCards(input(value({ status: 'gap' }))), []);
  assert.doesNotMatch(JSON.stringify(stream.flipStream(card)), /跳档价/);
  assert.equal(flip.flipCards(input(value({ prices: [] })))[0].involved, '神火股份 · 股价 25.33');
});

test('接近提醒只在档位未变时出现，不置顶；跟踪只画 near', () => {
  const item = value({ grade: '偏低', near });
  const card = flip.flipCards(input(item))[0];
  assert.equal(card.kind, 'near');
  assert.equal(card.text, '沪铝距 23,500 元/吨 只差 1.4%，越过后神火股份估值变为合理');
  assert.equal(stream.flipStream(card).pinned, false);
  assert.equal(flip.flipCards(input(value({ near })))[0].kind, 'changed');
  assert.equal(flip.flipLines(input(item))[0].text, card.text);
  assert.deepEqual(flip.flipLines(input()), []);
  const nextDay = flip.flipCards(input({ ...item, as_of: '2026-11-09' }))[0];
  assert.equal(nextDay.key, card.key, '交易日变化不重新点亮同一接近提醒');
  assert.equal(nextDay.date, '2026-11-09');
});

test('连续首日未知时显示判定日并按日期排序，仍不置顶，key 保留 null', () => {
  const card = stream.flipStream(flip.flipCards(input(value({ changed_on: null })))[0]);
  assert.equal(card.date, '2026-11-06');
  assert.equal(card.key, 'valuation:000933.SZ:null:偏低>合理');
  assert.equal(card.pinned, false);
  const older = { ...card, key: 'older', type: '公告', date: '2026-11-05' };
  const shown = stream.streamOf([older, card], '全部', '2026-11-06');
  assert.deepEqual(shown.map((row: any) => row.key), [card.key, 'older']);
  assert.equal(shown[0].pinned, false);
});

test('三天置顶：第 0、2 天置顶，第 3 天到期；取消、新 key、财报与日期排序', () => {
  const card = stream.flipStream(flip.flipCards(input())[0]);
  for (const [today, pinned] of [['2026-11-04', true], ['2026-11-06', true], ['2026-11-07', false]])
    assert.equal(stream.streamOf([card], '全部', today)[0].pinned, pinned);
  assert.equal(stream.streamOf([card], '全部', '2026-11-06', [card.key])[0].pinned, false);
  const fresh = { ...card, key: card.key + ':new', date: '2026-11-06' };
  assert.equal(stream.streamOf([fresh], '全部', '2026-11-06', [card.key])[0].pinned, true);
  const report = { ...card, type: '财报', key: 'report', date: '2026-11-05', pinned: true };
  const filing = { ...card, type: '公告', key: 'filing', date: '2026-11-06', pinned: false };
  assert.deepEqual(stream.streamOf([report, filing, card], '全部', '2026-11-06').map((x: any) => x.key), [card.key, 'filing', 'report']);
  assert.equal(stream.streamOf([report], '全部', '2026-11-06')[0].pinned, false);
});

test('取消记录去重、最多 200 条，JSON 超限时先丢最旧；页首明确研究时和收盘时点', () => {
  const keys = Array.from({ length: 200 }, (_, i) => `valuation:${i}`);
  assert.deepEqual(prefs.addUnpinned(keys, 'new'), [...keys.slice(1), 'new']);
  assert.equal(prefs.addUnpinned(keys, keys[0]).length, 200);
  const bounded = prefs.addUnpinned(Array.from({ length: 199 }, (_, i) => `${i}:${'x'.repeat(100)}`), 'new');
  assert.ok(JSON.stringify(bounded).length <= 16384);
  assert.equal(bounded.at(-1), 'new');
  assert.equal(valuation.valuationLabel(value(), '偏低'), '估值合理（研究时偏低，11-06收盘）');
  assert.equal(valuation.valuationLabel(value({ grade: '偏低' }), '偏低'), '估值偏低');
  assert.equal(valuation.valuationLabel(value({ status: 'gap' }), '偏低'), '估值偏低（研究时）');
});

test('财报变化只写研究时，今天不同才补；gap 与未变化文案不补', () => {
  const card = { symbol: '000933.SZ', date: '2026-10-24', period: '2026Q3' };
  const info = { grade: '偏低', previousGrade: '合理', researchedAt: '2026-10-26' };
  assert.equal(recon.reconResult(card, undefined, info, null, value()).text, '研究时估值从合理变为偏低，现在合理');
  assert.equal(recon.reconResult(card, undefined, info, null, value({ status: 'gap' })).text, '研究时估值从合理变为偏低');
  assert.equal(recon.reconResult(card, undefined, { ...info, previousGrade: '偏低' }, null, value()).text, '估值没变（偏低）');
});

test('取消置顶只认共享 Client 偏好，浏览器旧值不能静默重新写回', async () => {
  win.localStorage.setItem('finance.feed-unpinned', JSON.stringify(['local-only']));
  const methods: string[] = [];
  globalThis.fetch = (async (_url, init) => { methods.push(init?.method ?? 'GET'); return Response.json({ prefs: {} }); }) as typeof fetch;
  await prefs.hydratePrefs();
  assert.equal(prefs.prefGet('finance.feed-unpinned'), '[]');
  assert.deepEqual(methods, ['GET']);
});

const h = React.createElement;
async function render(element: React.ReactElement) {
  await React.act(async () => root.render(null));
  await React.act(async () => root.render(h(router.MemoryRouter, null, h(pageContext.AiPageProvider, {}, element))));
  await React.act(async () => {});
}

test('估值请求未返回时财报先显示研究结论，返回后再补现在档位', async () => {
  let release!: () => void;
  const pending = new Promise<void>(resolve => { release = resolve; });
  globalThis.fetch = (async url => {
    const path = String(url);
    if (path.includes('/tracking/valuation-today')) { await pending; return Response.json({ items: [value()] }); }
    if (path.includes('/page-research')) return Response.json({ previousGrade: '合理', research: { researchedAt: '2026-10-26', valuation: { grade: '偏低' } } });
    if (path.includes('/client/watch')) return Response.json({ symbols: ['000933'] });
    if (path.includes('/client/prefs')) return Response.json({ prefs: {} });
    return Response.json({ items: [] });
  }) as typeof fetch;
  try {
    await render(h(desk.VariableDesk, { load: async () => fixture, loadFlips: async () => [],
      loadRecon: async () => [{ symbol: '000933.SZ', company: '神火股份', period: '2026Q3', date: '2026-10-24', headline: '三季报已出', details: [] }],
      loadResults: recon.loadReconResults, loadEvents: async () => [], loadFilings: async () => ({ rows: [], hidden: 0 }) }));
    assert.equal(container.querySelector('[data-recon-result]')!.textContent, '研究时估值从合理变为偏低');
    await React.act(async () => release());
    assert.equal(container.querySelector('[data-recon-result]')!.textContent, '研究时估值从合理变为偏低，现在合理');
  } finally { release(); }
});

test('取消置顶立即生效，写失败恢复；成功刷新后保持，新 key 仍可置顶', async () => {
  let remote: string | undefined, fail = true, release!: () => void;
  let pending = new Promise<void>(resolve => { release = resolve; });
  globalThis.fetch = (async (_url, init) => {
    if (init?.method === 'POST') {
      await pending;
      if (fail) return Response.json({ message: 'failed' }, { status: 500 });
      remote = JSON.parse(String(init.body)).value;
    }
    return Response.json({ prefs: remote ? { 'finance.feed-unpinned': remote } : {} });
  }) as typeof fetch;
  const today = stream.shanghaiToday();
  const item = value({ changed_on: today, as_of: today });
  const props = { load: async () => fixture, loadFlips: async () => flip.flipCards(input(item)),
    loadRecon: async () => [], loadResults: async () => ({}), loadEvents: async () => [], loadFilings: async () => ({ rows: [], hidden: 0 }) };
  await render(h(desk.VariableDesk, props));
  const button = () => [...container.querySelectorAll('button')].find(b => b.textContent === '取消置顶') as HTMLButtonElement;
  assert.ok(button() && !button().disabled);
  await React.act(async () => button().click());
  assert.equal(container.querySelector('.variable-card-pinned'), null, '写请求未完成就回普通流');
  await React.act(async () => release());
  assert.ok(container.querySelector('.variable-card-pinned'));
  assert.match(container.textContent!, /取消置顶没有保存，已恢复/);
  assert.equal(remote, undefined);
  fail = false;
  pending = Promise.resolve();
  await React.act(async () => button().click());
  assert.equal(container.querySelector('.variable-card-pinned'), null);
  assert.deepEqual(JSON.parse(remote!), [valuation.valuationKey(item)]);
  await render(h(desk.VariableDesk, props));
  assert.equal(container.querySelector('.variable-card-pinned'), null, '从 Client 偏好重新读回');
  await render(h(desk.VariableDesk, { ...props, loadFlips: async () => flip.flipCards(input({ ...item, grade: '偏高' })) }));
  assert.ok(container.querySelector('.variable-card-pinned'), '新档位 key 不受旧取消记录影响');
  assert.doesNotMatch(container.textContent!, /跳档价/);
});

test('跟踪页只用接口 near 画线；估值接口失败时保留走势', async () => {
  let ok = true;
  globalThis.fetch = (async url => {
    const path = String(url);
    if (path.includes('/tracking/valuation-today')) return ok ? Response.json({ items: [value({ grade: '偏低', near })] }) : Response.json({}, { status: 503 });
    if (path.includes('/tracking/items')) return Response.json({ as_of: fixture.as_of, muted: [], items: fixture.variables.filter((v: any) => v.series).map((v: any) => ({ ...v, id: `price:${v.var_id}`, kind: 'price', source: 'research', started_at: '2026-09-15', cards: [], flips: [], muted_at: null })) });
    if (path.includes('/wiki/pages')) return Response.json({ items: [{ slug: 'companies/000933-sz', title: '神火股份' }], total: 1 });
    if (path.includes('client')) return Response.json({ symbols: ['000933'] });
    return Response.json({ items: [] });
  }) as typeof fetch;
  await render(h(tracking.Tracking));
  const row = () => container.querySelector('[data-variable-row="cmdty:SHFE.AL"]')!;
  await React.act(async () => (row().querySelector('button.tracking-row') as HTMLButtonElement).click());
  assert.match(row().querySelector('[data-flip-line]')!.textContent!, /只差 1.4%/);
  assert.equal(row().querySelectorAll('.tracking-trend-flip').length, 1);
  ok = false;
  await render(h(tracking.Tracking));
  if (row().querySelector('button.tracking-row')!.getAttribute('aria-expanded') !== 'true')
    await React.act(async () => (row().querySelector('button.tracking-row') as HTMLButtonElement).click());
  assert.equal(row().querySelector('[data-flip-line]'), null);
  assert.ok(row().querySelector('[data-trend] svg'));
});
