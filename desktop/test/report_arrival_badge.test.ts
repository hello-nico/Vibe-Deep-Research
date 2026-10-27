// 财报到达自动重研：研究行文字（跟踪页仍在引用）、档位升降判断与「已看」本机存储。
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
    trigger: 'report_arrival', trigger_period: '2026Q3', report_period: '2026Q3', ...over };
}
const info = (grade: string | null, previousGrade: string | null, researchedAt: string | null = '2026-10-26T01:30:00Z') => ({ grade, previousGrade, researchedAt });

test('报告名用中文', () => {
  assert.deepEqual(['2026Q1', '2026H1', '2026Q3', 'FY2025', null, 'x'].map(lib.reportName), ['一季报', '半年报', '三季报', '年报', '定期报告', '定期报告']);
});

test('三种文字：进行中、档位变了、没变；上一版为空与旧研究不比较', () => {
  assert.equal(lib.researchRowLine(record({ status: 'running', current_step: 2 })), '神火股份三季报已披露，正在按新报告重新研究');
  assert.equal(lib.researchRowLine(record({ status: 'interrupted' })), '神火股份三季报已披露，正在按新报告重新研究');
  assert.equal(lib.researchRowLine(record(), info('明显高估', '偏高')), '已按三季报更新：估值偏高→估值明显高估', '升档');
  assert.equal(lib.researchRowLine(record(), info('合理', '偏高')), '已按三季报更新：估值偏高→估值合理', '降档');
  assert.equal(lib.researchRowLine(record(), info('偏高', '偏高')), '已按三季报更新：估值判断没变');
  assert.equal(lib.researchRowLine(record(), info('偏高', null)), '已按三季报更新：估值偏高', 'previousGrade 为 null：没有可比的上一版');
  assert.equal(lib.researchRowLine(record(), info('偏高', '合理', '2026-10-25T01:30:00Z')), '已按三季报更新：估值偏高', '保存早于任务开始：不是这次研究的结果');
  assert.equal(lib.researchRowLine(record(), null), '已按三季报更新', '读不到档位');
  assert.equal(lib.researchRowLine(record({ status: 'failed', reason: '最新定期报告还没入库' })), '最新定期报告还没入库');
  assert.equal(lib.researchRowLine(record({ trigger: null }), info('合理', '偏高')), '完成，估值合理', '手动研究仍是原句');
});

test('已看存本机，坏数据当没有', () => {
  win.localStorage.clear();
  assert.equal(lib.seenArrivals().size, 0);
  lib.markArrivalsSeen(['a', 'b']); lib.markArrivalsSeen(['b', 'c']);
  assert.deepEqual([...lib.seenArrivals()], ['a', 'b', 'c']);
  win.localStorage.setItem('finance.reportArrivalSeen', '{坏');
  assert.equal(lib.seenArrivals().size, 0);
});
