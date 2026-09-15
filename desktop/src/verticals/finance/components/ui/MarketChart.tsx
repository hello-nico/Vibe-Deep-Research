import { useEffect, useRef, useState } from 'react';
import { init, dispose, registerIndicator, type Chart, type Crosshair } from 'klinecharts';
import { financialNumber } from '../../lib/financialDisplay';
import { marketBarSpace } from '../../lib/marketChartLayout';

// Draw saved Backend averages. Never recalculate them from the visible window.
registerIndicator({ name: 'SAVED_MA', shortName: '均线', precision: 2,
  figures: [5, 10, 20].map(n => ({ key: `ma${n}`, title: `MA${n}: `, type: 'line' })),
  calc: data => data.map(row => ({ ma5: row.ma5, ma10: row.ma10, ma20: row.ma20 })),
});
registerIndicator({ name: 'SAVED_VOLUME', shortName: '成交量', precision: 0, shouldFormatBigNumber: true,
  figures: [{ key: 'volume', title: '成交量: ', type: 'bar' }],
  calc: data => data.map(row => ({ volume: row.volume })),
});

const MA_COLORS = ['#FF9600', '#935EBD', '#1677FF'] as const;

type ChartTheme = {
  text: string;
  grid: string;
  axis: string;
  foreground: string;
  card: string;
  border: string;
};

const EXPORT_THEME: ChartTheme = {
  text: '#475569',
  grid: '#e2e8f0',
  axis: '#cbd5e1',
  foreground: '#0f172a',
  card: '#ffffff',
  border: '#cbd5e1',
};

function readThemeColor(element: HTMLElement, token: string, fallback: string) {
  const value = getComputedStyle(element).getPropertyValue(token).trim();
  if (!value) return fallback;
  return value.includes('(') ? value : `hsl(${value})`;
}

function readChartTheme(element: HTMLElement): ChartTheme {
  return {
    text: readThemeColor(element, '--chart-text', '#94a3b8'),
    grid: readThemeColor(element, '--chart-grid', '#334155'),
    axis: readThemeColor(element, '--chart-axis', '#475569'),
    foreground: readThemeColor(element, '--foreground', '#e2e8f0'),
    card: readThemeColor(element, '--card', '#0f172a'),
    border: readThemeColor(element, '--border', '#334155'),
  };
}

function chartStyles(theme: ChartTheme) {
  return {
    grid: {
      horizontal: { color: theme.grid },
      vertical: { color: theme.grid },
    },
    candle: {
      bar: {
        upColor: '#dc2626', downColor: '#16a34a',
        upBorderColor: '#dc2626', downBorderColor: '#16a34a',
        upWickColor: '#dc2626', downWickColor: '#16a34a',
      },
      tooltip: {
        showRule: 'none' as const,
        rect: { color: theme.card, borderColor: theme.border },
        title: { color: theme.text },
        legend: { color: theme.foreground },
      },
    },
    indicator: {
      tooltip: {
        showRule: 'none' as const,
        title: { color: theme.text },
        legend: { color: theme.foreground },
      },
    },
    xAxis: {
      axisLine: { color: theme.axis },
      tickLine: { color: theme.axis },
      tickText: { color: theme.text },
    },
    yAxis: {
      axisLine: { color: theme.axis },
      tickLine: { color: theme.axis },
      tickText: { color: theme.text },
    },
    separator: { color: theme.axis, activeBackgroundColor: theme.card },
    crosshair: {
      horizontal: {
        line: { color: theme.axis },
        text: { color: theme.foreground, borderColor: theme.axis, backgroundColor: theme.card },
      },
      vertical: {
        line: { color: theme.axis },
        text: { color: theme.foreground, borderColor: theme.axis, backgroundColor: theme.card },
      },
    },
  };
}

function themeKey() {
  if (typeof document === 'undefined') return 'dark';
  if (document.body.classList.contains('vibe-dsh-host')) {
    return document.body.hasAttribute('data-ds-dark-theme') ? 'dark' : 'light';
  }
  return document.documentElement.classList.contains('light') ? 'light' : 'dark';
}

function formatVolume(value: string | number | null | undefined) {
  if (value == null || value === '') return '—';
  const number = Number(value);
  if (!Number.isFinite(number)) return '—';
  return Math.abs(number) >= 1e8 ? financialNumber((number / 1e8).toFixed(2)) + '亿'
    : Math.abs(number) >= 1e4 ? financialNumber((number / 1e4).toFixed(2)) + '万'
    : financialNumber(value);
}

function rowTimestamp(row: Record<string, string | null>) {
  return Date.parse(String(row.trading_day) + 'T00:00:00+08:00');
}

function QuoteLine({ row }: { row: Record<string, string | null> | null }) {
  if (!row) return null;
  return (
    <p className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted-foreground">
      <span>{row.trading_day} 行情 · 1天</span>
      <span>开 {financialNumber(row.open, 2)}</span>
      <span>高 {financialNumber(row.high, 2)}</span>
      <span>低 {financialNumber(row.low, 2)}</span>
      <span>收 {financialNumber(row.close, 2)}</span>
      {row.volume != null && <span>成交量 {formatVolume(row.volume)}</span>}
      {[5, 10, 20].map((n, i) => (
        <span key={n} style={{ color: MA_COLORS[i] }}>MA{n}: {financialNumber(row[`ma${n}`], 2)}</span>
      ))}
    </p>
  );
}

export function MarketChart({ rows, title, onReady }: {
  rows: Record<string, string | null>[]; title: string; onReady: (download: (() => string) | null) => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const chartRef = useRef<Chart | null>(null);
  const [quote, setQuote] = useState(() => rows.at(-1) ?? null);
  const [activeTheme, setActiveTheme] = useState(themeKey);
  useEffect(() => { setQuote(rows.at(-1) ?? null); }, [rows]);
  useEffect(() => {
    const sync = () => setActiveTheme(themeKey());
    const observer = typeof MutationObserver === 'undefined' ? null : new MutationObserver(sync);
    if (observer) {
      observer.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });
      observer.observe(document.body, { attributes: true, attributeFilter: ['class', 'data-ds-dark-theme'] });
    }
    return () => observer?.disconnect();
  }, []);
  useEffect(() => {
    const chart = chartRef.current;
    const element = ref.current;
    if (!chart || !element) return;
    chart.setStyles(chartStyles(readChartTheme(element)));
  }, [activeTheme]);
  useEffect(() => {
    const element = ref.current;
    if (!element || rows.length === 0) {
      chartRef.current = null;
      onReady(null);
      return;
    }
    const chart = init(element, { locale: 'zh-CN', timezone: 'Asia/Shanghai',
      formatter: { formatBigNumber: value => formatVolume(value) },
      thousandsSeparator: { sign: ',', format: value => financialNumber(value) },
      styles: chartStyles(readChartTheme(element)),
    });
    if (!chart) return;
    chartRef.current = chart;
    const byTime = new Map(rows.map(row => [rowTimestamp(row), row]));
    chart.setDataLoader({ getBars: ({ type, callback }) => callback(type === 'init' ? rows.map(row => ({
      timestamp: rowTimestamp(row),
      open: Number(row.open), high: Number(row.high), low: Number(row.low), close: Number(row.close),
      ...(row.volume == null ? {} : { volume: Number(row.volume) }),
      ...Object.fromEntries([5, 10, 20].map(n => [`ma${n}`, row[`ma${n}`] == null ? undefined : Number(row[`ma${n}`])])),
    })) : [], false) });
    chart.setSymbol({ ticker: title, pricePrecision: 2, volumePrecision: 0 });
    chart.setPeriod({ type: 'day', span: 1 });
    chart.createIndicator({ name: 'SAVED_MA', paneId: 'candle_pane' });
    if (rows.some(row => row.volume != null)) chart.createIndicator('SAVED_VOLUME');
    const fit = () => {
      if (element.clientWidth < 40) return;
      chart.resize();
      chart.setBarSpace(marketBarSpace(element.clientWidth, rows.length));
    };
    fit();
    const frame = requestAnimationFrame(fit);
    const observer = new ResizeObserver(fit);
    observer.observe(element);
    chart.subscribeAction('onCrosshairChange', data => {
      const stamp = (data as Crosshair).kLineData?.timestamp;
      setQuote((stamp != null ? byTime.get(stamp) : undefined) ?? rows.at(-1) ?? null);
    });
    onReady(() => {
      chart.setStyles(chartStyles(EXPORT_THEME));
      try {
        return chart.getConvertPictureUrl(true, 'png', '#ffffff');
      } finally {
        chart.setStyles(chartStyles(readChartTheme(element)));
      }
    });
    return () => {
      cancelAnimationFrame(frame);
      onReady(null);
      observer.disconnect();
      if (chartRef.current === chart) chartRef.current = null;
      dispose(element);
    };
  }, [rows, title, onReady]);
  return (
    <div className="w-full min-w-0">
      <QuoteLine row={quote} />
      <div ref={ref} className="mt-2 w-full min-w-0 overflow-hidden" style={{ height: 400, background: 'hsl(var(--card))' }} role="img" aria-label={`${title} K线、均线及成交量；完整数字可在数据标签查看`} />
    </div>
  );
}
