import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { marketBarSpace } from '../src/verticals/finance/lib/marketChartLayout.ts';

const read = (p: string) => readFileSync(new URL(`../src/${p}`, import.meta.url), 'utf8');

test('窄容器按宽度压缩K线柱距，宽容器不会把柱子拉得过宽', () => {
  assert.equal(marketBarSpace(0, 40), 4);
  assert.ok(marketBarSpace(360, 40) < marketBarSpace(720, 40));
  assert.equal(marketBarSpace(2000, 10), 30);
});

test('行情图把读数放到图外，并在容器尺寸变化时重算柱距', () => {
  const chart = read('verticals/finance/components/ui/MarketChart.tsx');
  assert.match(chart, /showRule: 'none'/);
  assert.match(chart, /chartStyles\(readChartTheme\(element\)\)/);
  assert.match(chart, /--chart-text/);
  assert.match(chart, /data-ds-dark-theme/);
  assert.match(chart, /getConvertPictureUrl\(true, 'png', '#ffffff'\)/);
  assert.match(chart, /w-full min-w-0/);
  assert.match(chart, /ResizeObserver\(fit\)/);
  assert.match(chart, /setBarSpace\(marketBarSpace/);
  assert.match(chart, /onCrosshairChange/);
  const result = read('verticals/finance/components/ResearchResult.tsx');
  assert.match(result, /mb-3 flex flex-wrap items-center gap-3 text-sm">显示范围/);
  assert.match(result, /WorkspaceSelect/);
  assert.match(result, /w-full min-w-0 rounded-2xl/);
  const dsh = read('verticals/finance/dsh/native-dsh.css');
  assert.doesNotMatch(dsh, /#dsh-conversation table/);
});

test('财务报告图复用页面主题，并把导出颜色固定为白底可读色', () => {
  const chart = read('verticals/finance/components/ui/ReportFinancialChart.tsx');
  assert.match(chart, /hsl\(var\(--card\)\)/);
  assert.match(chart, /hsl\(var\(--chart-text\)\)/);
  assert.match(chart, /hsl\(var\(--chart-axis\)\)/);
  assert.match(chart, /exportColors/);
  assert.match(chart, /'hsl\(var\(--card\)\)': '#ffffff'/);
});

test('对话财务图由 EChart 提供主题默认值和白底导出', () => {
  const chart = read('verticals/finance/components/ui/EChart.tsx');
  assert.match(chart, /echarts\.init\(element, echartsTheme\(readChartTheme\(element\)\)\)/);
  assert.match(chart, /legend: \{ textStyle: \{ color: theme\.foreground \} \}/);
  assert.match(chart, /categoryAxis: \{ \.\.\.axis \}/);
  assert.match(chart, /valueAxis: \{ \.\.\.axis \}/);
  assert.doesNotMatch(chart, /^    xAxis:/m);
  assert.match(chart, /splitLine: \{ lineStyle: \{ color: theme\.grid \} \}/);
  assert.match(chart, /\{ \.\.\.optionRef\.current, animation: false \}/);
  assert.match(chart, /getDataURL\(\{ type: 'png', pixelRatio: 2, backgroundColor: '#fff' \}\)/);
  assert.match(chart, /onReady\?\.\(chart, download\)/);
  const result = read('verticals/finance/components/ResearchResult.tsx');
  assert.match(result, /eChartDownload/);
  assert.match(result, /onReady=\{readyEChart\}/);
});
