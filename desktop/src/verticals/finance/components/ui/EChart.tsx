import { useEffect, useRef, useState } from "react";
import * as echarts from "echarts/core";
import { LineChart, BarChart, CandlestickChart } from "echarts/charts";
import {
  GridComponent, TooltipComponent, LegendComponent, MarkLineComponent, DataZoomComponent,
} from "echarts/components";
import { CanvasRenderer } from "echarts/renderers";

// 按需注册：全量 echarts 约 1MB，这里只打包用到的折线 / 柱状与基础组件。
echarts.use([LineChart, BarChart, CandlestickChart, GridComponent, TooltipComponent, LegendComponent, MarkLineComponent, DataZoomComponent, CanvasRenderer]);

interface Props {
  option: echarts.EChartsCoreOption;
  height?: number;
  onReady?: (chart: echarts.ECharts | null, download?: (() => string) | null) => void;
}

type ChartTheme = {
  colors: string[];
  text: string;
  foreground: string;
  grid: string;
  axis: string;
  card: string;
  border: string;
};

const EXPORT_THEME: ChartTheme = {
  colors: ['#f4511e', '#64748b', '#334155'],
  text: '#475569',
  foreground: '#0f172a',
  grid: '#e2e8f0',
  axis: '#cbd5e1',
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
    colors: [
      readThemeColor(element, '--primary', '#f4511e'),
      readThemeColor(element, '--chart-text', '#64748b'),
      readThemeColor(element, '--foreground', '#334155'),
    ],
    text: readThemeColor(element, '--chart-text', '#94a3b8'),
    foreground: readThemeColor(element, '--foreground', '#e2e8f0'),
    grid: readThemeColor(element, '--chart-grid', '#334155'),
    axis: readThemeColor(element, '--chart-axis', '#475569'),
    card: readThemeColor(element, '--card', '#0f172a'),
    border: readThemeColor(element, '--border', '#334155'),
  };
}

function echartsTheme(theme: ChartTheme) {
  const axis = {
    axisLabel: { color: theme.text },
    axisLine: { lineStyle: { color: theme.axis } },
    axisTick: { lineStyle: { color: theme.axis } },
    splitLine: { lineStyle: { color: theme.grid } },
    nameTextStyle: { color: theme.text },
  };
  return {
    color: theme.colors,
    textStyle: { color: theme.foreground },
    title: { textStyle: { color: theme.foreground }, subtextStyle: { color: theme.text } },
    legend: { textStyle: { color: theme.foreground } },
    tooltip: {
      backgroundColor: theme.card,
      borderColor: theme.border,
      textStyle: { color: theme.foreground },
    },
    axisPointer: {
      lineStyle: { color: theme.axis },
      label: { color: theme.foreground, backgroundColor: theme.axis },
    },
    grid: { borderColor: theme.axis },
    categoryAxis: { ...axis },
    valueAxis: { ...axis },
    timeAxis: { ...axis },
    logAxis: { ...axis },
  };
}

function themeKey() {
  if (typeof document === 'undefined') return 'dark';
  if (document.body.classList.contains('vibe-dsh-host')) {
    return document.body.hasAttribute('data-ds-dark-theme') ? 'dark' : 'light';
  }
  return document.documentElement.classList.contains('light') ? 'light' : 'dark';
}

// 轻量 ECharts 容器：初始化 / 跟随窗口 resize / 卸载时 dispose。
// 页面主题由现有 html/body 标记驱动；option 自带的颜色仍覆盖主题默认值。
export function EChart({ option, height = 300, onReady }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const inst = useRef<echarts.ECharts | null>(null);
  const optionRef = useRef(option);
  optionRef.current = option;
  const [activeTheme, setActiveTheme] = useState(themeKey);

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
    const element = ref.current;
    if (!element) return;
    const chart = echarts.init(element, echartsTheme(readChartTheme(element)));
    inst.current = chart;
    const download = () => {
      const exportElement = document.createElement('div');
      const width = Math.max(1, element.clientWidth || 640);
      const chartHeight = Math.max(1, element.clientHeight || height);
      Object.assign(exportElement.style, {
        position: 'fixed', left: '-10000px', top: '-10000px',
        width: `${width}px`, height: `${chartHeight}px`, pointerEvents: 'none',
      });
      document.body.append(exportElement);
      const exportChart = echarts.init(exportElement, echartsTheme(EXPORT_THEME));
      try {
        exportChart.setOption({ ...optionRef.current, animation: false }, true);
        return exportChart.getDataURL({ type: 'png', pixelRatio: 2, backgroundColor: '#fff' });
      } finally {
        exportChart.dispose();
        exportElement.remove();
      }
    };
    onReady?.(chart, download);
    // ResizeObserver 而非 window.resize：侧栏收起/展开改变容器宽度时
    // 并不触发窗口 resize 事件，只监听 window 会让图表保持旧尺寸被裁切
    const ro = new ResizeObserver(() => chart.resize());
    ro.observe(element);
    return () => {
      ro.disconnect();
      onReady?.(null, null);
      chart.dispose();
      if (inst.current === chart) inst.current = null;
    };
  }, [activeTheme, height, onReady]);

  useEffect(() => {
    // notMerge=true：整份替换，避免旧 series 残留（刷新后型号增减时）
    inst.current?.setOption(option, true);
  }, [activeTheme, option, onReady]);

  return <div ref={ref} style={{ height, background: 'hsl(var(--card))' }} />;
}
