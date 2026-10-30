// 跟踪页走势的几何：只做排版，不改数值。
import assert from 'node:assert/strict';
import test from 'node:test';
import { trendOf, TREND_H, TREND_W } from '../src/verticals/finance/lib/trendChart.ts';

const series = [['2026-10-01', '100'], ['2026-10-02', '110'], ['2026-10-03', '90'], ['2026-10-04', '105']];

test('观察阈值都在同一纵轴内；空阈值不改变原价格图几何', () => {
  const trend = trendOf(series, { lines: [10, 100, 200] })!;
  assert.equal(trend.linesY.length, 3);
  assert.ok(trend.linesY.every(y => y >= 0 && y <= TREND_H));
  assert.ok(trend.linesY[0]! > trend.linesY[1]! && trend.linesY[1]! > trend.linesY[2]!);
  assert.equal(trendOf(series, { lines: [] })!.points, trendOf(series)!.points);
});

test('走势：点数与序列一致，最后一天是现在的点，提醒日画空心点（最后一天不重复）', () => {
  const trend = trendOf(series, { alertDates: ['2026-10-02', '2026-10-04', '2026-09-01'] })!;
  assert.equal(trend.points.split(' ').length, 4);
  assert.deepEqual(trend.alerts.map(dot => dot.date), ['2026-10-02']);
  assert.equal(trend.end.x, TREND_W - 6);
  assert.equal(trend.lineY, null);
  const ys = trend.points.split(' ').map(point => Number(point.split(',')[1]));
  assert.ok(ys[1]! < ys[0]! && ys[2]! > ys[0]!, '价格高 y 小');
  assert.ok(ys.every(y => y >= 0 && y <= TREND_H));
});

test('跳档线：在走势范围附近时并入纵轴，离得太远（超过一个区间高度）不画', () => {
  const near = trendOf(series, { line: 80 })!;
  assert.ok(near.lineY != null && near.lineY <= TREND_H);
  assert.equal(trendOf(series, { line: 500 })!.lineY, null);
  assert.equal(trendOf(series, { line: null })!.lineY, null);
});

test('不足两个点或数值缺失时不画', () => {
  assert.equal(trendOf([['2026-10-01', '100']]), null);
  assert.equal(trendOf([['2026-10-01', ''], ['2026-10-02', 'x']]), null);
  assert.equal(trendOf([]), null);
});

test('开始盯的位置：序列里第一个不早于开始日的点；开始在序列起点之前、之后都不画', () => {
  assert.ok(trendOf(series, { startedAt: '2026-10-03' })!.startX! > trendOf(series, { startedAt: '2026-10-02' })!.startX!);
  assert.equal(trendOf(series, { startedAt: '2026-09-01' })!.startX, null, '开始在序列之前：从头就在盯');
  assert.equal(trendOf(series, { startedAt: '2026-10-26' })!.startX, null, '开始在最后收盘之后：还没有新收盘');
  assert.equal(trendOf(series)!.startX, null);
});
