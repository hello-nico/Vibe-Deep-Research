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
let chartOption: any;
let volumeAxis: any;
let downloaded: Blob | undefined;
new Function('exports', 'require', compiled)(exports, (id: string) => {
  if (id === 'react' || id === 'react/jsx-runtime') return require(id);
  if (id.endsWith('/financialDisplay')) return { ...display, downloadFile: (_name: string, blob: Blob) => { downloaded = blob; } };
  if (id.endsWith('/researchResultEmbed')) return embed;
  if (id.endsWith('/EChart')) return { EChart: ({ option }: any) => {
    chartOption = option;
    return React.createElement('div', {
      'data-chart': 'echart', 'data-unit': option.yAxis[0].name, 'data-series': option.series[0].type,
    });
  } };
  if (id === 'klinecharts') return { init: (element: HTMLElement) => {
    assert.equal(element.getAttribute('k-line-chart-id'), 'saved-chart');
    return { getIndicators: (filter: any) => {
      assert.equal(filter.name, 'SAVED_VOLUME');
      return [{ paneId: 'volume_pane', yAxisId: 'volume_axis' }];
    }, overrideYAxis: (axis: any) => { volumeAxis = axis; } };
  } };
  if (id.endsWith('/MarketChart')) return { MarketChart: ({ onReady }: any) => {
    React.useEffect(() => { onReady(() => 'saved-chart-image'); return () => onReady(null); }, [onReady]);
    return React.createElement('div', { 'data-chart': 'market', 'k-line-chart-id': 'saved-chart' });
  } };
  if (id.endsWith('/WorkspaceSelect')) return { WorkspaceSelect: () => null };
  if (id.endsWith('/ReportFinancialChart')) return { ReportFinancialChart: () => null };
  if (id.endsWith('/ResearchLoading')) return { ResearchLoading: () => null };
  if (id.endsWith('/EvidenceCard')) return { EvidenceLink: ({ snapshot }: any) => React.createElement('a', { 'data-snapshot': snapshot }) };
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
  chartOption = undefined; volumeAxis = undefined; downloaded = undefined;
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

for (const external of [true, false]) {
  test(`${external ? '外部' : 'A 股'}成交量轴最多三刻度，数值紧凑且未知单位留空`, async () => {
    const value = payload(external ? '美元/吨' : '元', external);
    value.columns.push({ key: 'volume', label: '成交量', unit: '单位未确认' });
    Object.assign(value.rows[0], { volume: '245678' });
    await renderCard(value, async container => {
      const axis = chartOption.yAxis[1];
      assert.equal(axis.name, '');
      assert.ok((axis.max - axis.min) / axis.interval + 1 <= 3);
      assert.equal(axis.axisLabel.formatter(20000), '2.0万');
      assert.equal(axis.axisLabel.formatter(100000000), '1.0亿');
      await showData(container);
      assert.ok([...container.querySelectorAll('th')].some(node => node.textContent === '成交量'));
      assert.ok(!container.textContent?.includes('单位未确认'));
    });
  });
}

test('A 股 K 线只覆盖成交量轴，保留原有组件与价格数据', async () => {
  const value = payload('元', false, 'candlestick');
  const saved = structuredClone(value);
  await renderCard(value, async () => {
    assert.equal(volumeAxis.paneId, 'volume_pane');
    assert.equal(volumeAxis.id, 'volume_axis');
    const ticks = volumeAxis.createTicks({ defaultTicks: Array.from({ length: 6 }, (_, n) => ({ value: n * 10000, coord: n * 12, text: String(n * 10000) })) });
    assert.ok(ticks.length <= 3);
    assert.ok(ticks.every((tick: any, index: number) => !index || tick.coord - ticks[index - 1].coord >= 24));
    assert.equal(ticks.at(-1).text, '5.0万');
    assert.deepEqual(value, saved);
  });
});

test('已知成交量单位保持不变，无成交量时不显示空坐标轴', async () => {
  const value = payload('元/吨');
  value.columns.push({ key: 'volume', label: '成交量', unit: '手' });
  Object.assign(value.rows[0], { volume: '12345' });
  await renderCard(value, async () => { assert.equal(chartOption.yAxis[1].name, '手'); assert.equal(chartOption.yAxis[1].show, true); });
  delete (value.rows[0] as any).volume;
  await renderCard(value, async () => { assert.equal(chartOption.yAxis[1].show, false); });
});

test('收盘与三条均线的曲线、图例颜色逐一对应且互不重复', async () => {
  for (const chart of ['line', 'candlestick']) await renderCard(payload('元/吨', true, chart), async () => {
    const lines = chartOption.series.filter((series: any) => series.type === 'line');
    const colors = lines.map((series: any) => {
      assert.equal(series.lineStyle.color, series.itemStyle.color);
      return series.itemStyle.color;
    });
    assert.equal(new Set(colors).size, lines.length);
    if (chart === 'line') {
      const close = lines.find((series: any) => series.name === '收盘');
      const ma = lines.find((series: any) => series.name === '20日均线');
      assert.notEqual(close.itemStyle.color, ma.itemStyle.color);
    }
  });
});

test('缺失说明按类型转为用户话且去重，原文保留在 CSV 与来源依据', async () => {
  const value = payload('美元/吨');
  const raw = ['来源有 14 条开高低不一致的日线；对应开高低缺失，保留真实收盘值', '开高低数据不完整，仅展示收盘走势',
    'volume unavailable', 'turnover unavailable', '均线输入缺失', 'internal_provider_gap'];
  value.missing = raw;
  (value.sources as any[]).push({ title: '固定来源' });
  const saved = structuredClone(value);
  await renderCard(value, async container => {
    for (const original of raw) assert.ok(!container.textContent?.includes(original));
    assert.equal(container.querySelectorAll('p').length > 0, true);
    const explanations = [...container.querySelectorAll('p')].map(node => node.textContent);
    assert.equal(explanations.filter(text => text === '部分日期缺少开高低数据，图中只显示收盘价。').length, 1);
    for (const text of ['部分日期缺少成交量，图中只显示已有数据。', '部分日期缺少成交额，表中只显示已有数据。',
      '部分日期的数据不足，暂不显示对应均线。', '部分数据暂不可用，图表显示已有数据，详情可查看来源依据。']) assert.ok(explanations.includes(text));
    const snapshot = container.querySelector('[data-snapshot]')?.getAttribute('data-snapshot');
    for (const original of raw) assert.ok(snapshot?.includes(original));
    await showData(container);
    const button = [...container.querySelectorAll('button')].find(node => node.textContent === '下载数据');
    assert.ok(button);
    await React.act(async () => button.click());
    assert.ok(downloaded);
    const csv = await downloaded.text();
    for (const original of raw) assert.ok(csv.includes(original));
    assert.ok(csv.includes('"105"'));
    assert.deepEqual(value, saved);
  });
});
