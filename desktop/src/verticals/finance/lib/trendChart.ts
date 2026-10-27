/** 跟踪页价格走势的几何：把日线收盘序列、跳档价、提醒日换成 SVG 坐标。只做排版，不改数值。 */
export const TREND_W = 300;
export const TREND_H = 64;
const PAD = 6;
const toNumber = (value: string | undefined) => { const parsed = value == null || value === '' ? NaN : Number(value); return Number.isFinite(parsed) ? parsed : null; };

export interface Trend {
  points: string; end: { x: number; y: number };
  /** 跳档线的 y；没有跳档价或离走势区间太远（超过一个区间高度）时为 null。 */
  lineY: number | null;
  /** 开始盯的位置：序列里第一个不早于开始日的点；开始在序列之前或之后（还没有收盘）时为 null。 */
  startX: number | null;
  alerts: { x: number; y: number; date: string }[];
}

export function trendOf(series: readonly (readonly string[])[], opts: { line?: number | null; alertDates?: readonly string[]; startedAt?: string | null } = {}): Trend | null {
  const rows = series.flatMap(row => { const value = toNumber(row[1]); return row[0] && value != null ? [{ date: row[0], value }] : []; });
  if (rows.length < 2) return null;
  const values = rows.map(row => row.value);
  let low = Math.min(...values), high = Math.max(...values);
  const span = high - low || Math.abs(high) * 0.02 || 1;
  const line = opts.line ?? null;
  const lineIn = line != null && line >= low - span && line <= high + span;
  if (lineIn) { low = Math.min(low, line); high = Math.max(high, line); }
  const range = high - low || 1;
  const x = (index: number) => PAD + index / (rows.length - 1) * (TREND_W - 2 * PAD);
  const y = (value: number) => TREND_H - PAD - (value - low) / range * (TREND_H - 2 * PAD);
  const round = (value: number) => Math.round(value * 10) / 10;
  const dots = new Set(opts.alertDates ?? []);
  const last = rows.length - 1;
  const from = opts.startedAt ? rows.findIndex(row => row.date >= opts.startedAt!) : -1;
  return {
    points: rows.map((row, index) => `${round(x(index))},${round(y(row.value))}`).join(' '),
    end: { x: round(x(last)), y: round(y(rows[last]!.value)) },
    lineY: lineIn ? round(y(line!)) : null,
    startX: from > 0 ? round(x(from)) : null,
    alerts: rows.flatMap((row, index) => dots.has(row.date) && index !== last ? [{ x: round(x(index)), y: round(y(row.value)), date: row.date }] : []),
  };
}
