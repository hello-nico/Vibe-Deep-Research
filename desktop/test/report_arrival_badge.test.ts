// 财报到达只提醒：报告期比较、只读读取与「已看」本机存储。
import assert from 'node:assert/strict';
import test, { before, after } from 'node:test';
import { fileURLToPath } from 'node:url';
import { createServer as createHttpServer } from 'node:http';
import { createServer } from 'vite';
import * as React from 'react';
import { Window } from 'happy-dom';

let server: Awaited<ReturnType<typeof createServer>>, win: Window, root: ReturnType<typeof import('react-dom/client')['createRoot']>, container: HTMLElement;
let lib: Record<string, any>, router: Record<string, any>;
const previous = { window: globalThis.window, document: globalThis.document, fetch: globalThis.fetch, localStorage: (globalThis as any).localStorage, IS_REACT_ACT_ENVIRONMENT: globalThis.IS_REACT_ACT_ENVIRONMENT };
before(async () => {
  win = new Window();
  Object.assign(globalThis, { window: win, document: win.document, localStorage: win.localStorage, IS_REACT_ACT_ENVIRONMENT: true });
  server = await createServer({ configFile: false, root: fileURLToPath(new URL('../', import.meta.url)),
    resolve: { alias: { '@': fileURLToPath(new URL('../src/verticals/finance', import.meta.url)) } },
    server: { middlewareMode: true, hmr: { server: createHttpServer() }, watch: null }, appType: 'custom',
    ssr: { noExternal: ['react-router-dom', 'react-router'], resolve: { conditions: ['module-sync', 'node', 'import', 'development'] } } });
  lib = await server.ssrLoadModule('/src/verticals/finance/lib/reportArrival.ts');
  router = await server.ssrLoadModule('react-router-dom');
  container = win.document.createElement('div') as unknown as HTMLElement;
  win.document.body.append(container);
  root = (await import('react-dom/client')).createRoot(container);
});
after(async () => { await React.act(async () => root?.unmount()); await server?.close(); win?.happyDOM.abort(); Object.assign(globalThis, previous); });

const STEPS = ['fetch', 'read_report', 'key_variables', 'valuation', 'save', 'settle'];
function record(over: Record<string, unknown> = {}) {
  return { task_id: 'task:a1', symbol: '000933.SZ', title: '公司研究 · 神火股份', status: 'completed', current_step: 6,
    steps: STEPS.map(key => ({ key, label: key, status: 'done', outputs: {} })), sessions: [], reason: null,
    created_at: '2026-10-26T01:00:00Z', updated_at: '2026-10-26T02:00:00Z', finished_at: '2026-10-26T02:00:00Z',
    report_period: '2026Q3', ...over };
}

test('报告名用中文', () => {
  assert.deepEqual(['2026Q1', '2026H1', '2026Q3', 'FY2025', null, 'x'].map(lib.reportName), ['一季报', '半年报', '三季报', '年报', '定期报告', '定期报告']);
});

test('提醒直接投影 Backend 新资料：不再比较报告期，报告和公告同一文案', () => {
  const reminder = lib.reportArrival('600011.SH', { kind: 'report', name: '三季报', date: '2026-10-27' }, '华能国际');
  assert.equal(reminder.text, '三季报已出');
  assert.equal(reminder.id, 'material:600011.SH:report:三季报:2026-10-27');
  assert.equal(lib.reportArrival('600011.SH', null), null);
  assert.equal(lib.reportArrival('600011.SH', { kind: 'announcement', name: '减值公告', date: '2026-10-28' }).text, '减值公告已出');
});

test('读取新报告全程只读，不按日历或完成时间猜测；研究更新到新一期后提醒消失', async () => {
  const methods: string[] = [];
  let material: { kind: string; name: string; date: string } | null = { kind: 'report', name: '三季报', date: '2026-10-27' };
  globalThis.fetch = (async (url, init) => {
    methods.push(init?.method || 'GET');
    const path = String(url);
    if (path.includes('/page-research')) return Response.json({ new_material: material, research: { report_period: '2026Q3' } });
    if (path.startsWith('/finance-research-tasks')) return Response.json({ items: [record({ symbol: '600011.SH', report_period: '2026Q3' })] });
    throw new Error(`unexpected ${path}`);
  }) as typeof fetch;
  try {
    assert.equal((await lib.readReportArrival('600011')).text, '三季报已出');
    material = null;
    assert.equal(await lib.readReportArrival('600011.SH'), null);
    assert.equal(await lib.readReportArrival('600011'), null);
    assert.ok(methods.every(method => method === 'GET'));
  } finally { globalThis.fetch = previous.fetch; }
});

test('已看存本机，坏数据当没有', () => {
  win.localStorage.clear();
  assert.equal(lib.seenArrivals().size, 0);
  lib.markArrivalsSeen(['a', 'b']); lib.markArrivalsSeen(['b', 'c']);
  assert.deepEqual([...lib.seenArrivals()], ['a', 'b', 'c']);
  win.localStorage.setItem('finance.reportArrivalSeen', '{坏');
  assert.equal(lib.seenArrivals().size, 0);
});
