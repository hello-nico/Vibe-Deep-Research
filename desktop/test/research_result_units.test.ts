import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import test from 'node:test';
import * as React from 'react';
import { Window } from 'happy-dom';
import ts from 'typescript';
import * as display from '../src/verticals/finance/lib/financialDisplay.ts';
import * as embed from '../src/verticals/finance/lib/researchResultEmbed.ts';

// Render the actual card and click its tabs; only canvas charts and unrelated
// source/download controls are replaced, so the chart option remains observable.
const require = createRequire(import.meta.url);
const source = readFileSync(new URL('../src/verticals/finance/components/ResearchResult.tsx', import.meta.url), 'utf8');
const compiled = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX },
}).outputText;
const exports: Record<string, any> = {};
new Function('exports', 'require', compiled)(exports, (id: string) => {
  if (id === 'react' || id === 'react/jsx-runtime') return require(id);
  if (id.endsWith('/financialDisplay')) return display;
  if (id.endsWith('/researchResultEmbed')) return embed;
  if (id.endsWith('/EChart')) return { EChart: ({ option }: any) => React.createElement('div', {
    'data-chart': 'echart', 'data-unit': option.yAxis[0].name, 'data-series': option.series[0].type,
  }) };
  if (id.endsWith('/MarketChart')) return { MarketChart: () => React.createElement('div', { 'data-chart': 'market' }) };
  if (id.endsWith('/WorkspaceSelect')) return { WorkspaceSelect: () => null };
  if (id.endsWith('/ReportFinancialChart')) return { ReportFinancialChart: () => null };
  if (id.endsWith('/ResearchLoading')) return { ResearchLoading: () => null };
  if (id.endsWith('/EvidenceCard')) return { EvidenceLink: () => null };
  if (id.endsWith('/resultSource')) return { resultSourceText: () => '' };
  if (id.endsWith('/chartDownload')) return { downloadChart: () => Promise.resolve() };
  throw new Error(`Unexpected card dependency: ${id}`);
});

function payload(unit: string, external = true, chart = 'line') {
  const row = { trading_day: '2026-10-08', open: '100', high: '110', low: '90', close: '105', ma5: '102' };
  return {
    title: '保存的行情', kind: 'market', chart, as_of: '2026-10-08', fetched_at: '2026-10-09T00:00:00Z',
    ...(external ? { external_series_id: 'cmdty:LME.AL', unit, basis: `保存的来源口径；单位：${unit}` } : { adjustment: 'forward_adjusted' }),
    columns: [{ key: 'trading_day', label: '日期', unit: '' }, { key: 'close', label: '收盘', unit }, { key: 'ma5', label: '5日均线', unit }],
    rows: [row], missing: [], sources: [],
    calculations: { windows: [5, 10, 20], rounding: '小数点后6位', inputs: [row] },
  };
}

async function renderCard(value: ReturnType<typeof payload>, check: (container: HTMLElement) => Promise<void>) {
  const win = new Window();
  const previous = { window: globalThis.window, document: globalThis.document, IS_REACT_ACT_ENVIRONMENT: globalThis.IS_REACT_ACT_ENVIRONMENT };
  Object.assign(globalThis, { window: win, document: win.document, IS_REACT_ACT_ENVIRONMENT: true });
  const { createRoot } = await import('react-dom/client');
  const container = win.document.createElement('div');
  win.document.body.append(container);
  const root = createRoot(container);
  try {
    await React.act(async () => root.render(React.createElement(exports.ResultCard, { payload: value, sourceKey: 'fixture' })));
    await check(container as unknown as HTMLElement);
  } finally {
    await React.act(async () => root.unmount());
    win.happyDOM.abort();
    Object.assign(globalThis, previous);
  }
}

async function showData(container: HTMLElement) {
  const button = [...container.querySelectorAll('button')].find(node => node.textContent === '数据');
  assert.ok(button);
  await React.act(async () => button.click());
}

for (const [unit, chart] of [['美元/吨', 'candlestick'], ['元/吨', 'line'], ['%', 'line']]) {
  test(`外部行情${chart}价格轴、数据与计算输入使用保存单位 ${unit}`, async () => {
    await renderCard(payload(unit, true, chart), async container => {
      assert.equal(container.querySelector('[data-chart]')?.getAttribute('data-chart'), 'echart');
      assert.equal(container.querySelector('[data-chart]')?.getAttribute('data-unit'), unit);
      assert.equal(container.querySelector('[data-chart]')?.getAttribute('data-series'), chart === 'line' ? 'line' : 'candlestick');
      assert.match(container.textContent || '', new RegExp(`保存的来源口径；单位：${unit}`));
      assert.ok(container.textContent?.includes(`收盘价（${unit}）`));
      await showData(container);
      const headers = [...container.querySelectorAll('th')].map(node => node.textContent);
      assert.ok(headers.includes(`收盘（${unit}）`));
      assert.ok(headers.includes(`5日均线（${unit}）`));
      assert.ok(headers.includes(`收盘价（${unit}）`));
      assert.ok(container.textContent?.includes('105.00'));
    });
  });
}

for (const chart of ['candlestick', 'line']) {
  test(`A 股${chart}仍显示元，并保留既有图表路径`, async () => {
    await renderCard(payload('元', false, chart), async container => {
      const node = container.querySelector('[data-chart]');
      assert.equal(node?.getAttribute('data-chart'), chart === 'candlestick' ? 'market' : 'echart');
      if (chart === 'line') assert.equal(node?.getAttribute('data-unit'), '元');
      assert.match(container.textContent || '', /前复权/);
      assert.ok(container.textContent?.includes('收盘价（元）'));
      await showData(container);
      assert.ok([...container.querySelectorAll('th')].some(node => node.textContent === '收盘（元）'));
    });
  });
}

test('价格轴优先采用收盘列单位，缺失时采用成果单位', async () => {
  const value = { ...payload('美元/吨'), unit: '错误的顶层单位' };
  await renderCard(value, async container => {
    assert.equal(container.querySelector('[data-chart]')?.getAttribute('data-unit'), '美元/吨');
  });
  value.unit = '美元/吨';
  value.columns = value.columns.filter(column => column.key !== 'close');
  await renderCard(value, async container => {
    assert.equal(container.querySelector('[data-chart]')?.getAttribute('data-unit'), '美元/吨');
    assert.ok(container.textContent?.includes('收盘价（美元/吨）'));
  });
});
