import { Component, useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { MarketChart } from './ui/MarketChart';
import { ReportFinancialChart } from './ui/ReportFinancialChart';
import { EChart } from './ui/EChart';
import { ResearchLoading } from './ui/ResearchLoading';
import { EvidenceLink } from './EvidenceCard';
import { resultSourceText, type ResultSource } from '../lib/resultSource';
import { dataCsv, downloadFile, financialNumber, sourceName } from '../lib/financialDisplay';
import type { ECharts } from 'echarts/core';
import { downloadChart } from '../lib/chartDownload';
import { WorkspaceSelect } from './ui/WorkspaceSelect';
import { RESULT_EMBED_FALLBACK, embeddableChartResult, listOrEmpty } from '../lib/researchResultEmbed';

const loadingSections = ['图表', '数据', '来源'];

type Row = Record<string, string | null>;
interface Result {
  result_id: string;
  payload: { title: string; kind: string; chart: string; as_of: string; fetched_at: string; adjustment?: string; basis?: string; series?: string[];
    rows: Row[]; columns: { key: string; label: string; unit: string }[];
    missing: string[]; sources: ResultSource[]; calculations?: { windows: number[]; rounding: string; inputs: Row[] } | [] };
}

export function ResearchResult({ resultId, presentation = 'conversation' }: { resultId: string; presentation?: 'conversation' | 'report' }) {
  const [result, setResult] = useState<Result>();
  const [error, setError] = useState('');
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    setResult(undefined); setError('');
    void fetch('/finance-research/research-results/' + encodeURIComponent(resultId), { signal: controller.signal })
      .then(async response => {
        if (!response.ok) throw new Error(response.status === 404 ? '这份研究成果不存在' : '研究成果暂时无法读取');
        const value = await response.json() as Result;
        if (value.result_id !== resultId || !value.payload) throw new Error('研究成果格式不完整');
        if (!controller.signal.aborted) setResult(value);
      }).catch(reason => { if (!controller.signal.aborted) setError(reason instanceof Error ? reason.message : '读取失败'); });
    return () => controller.abort();
  }, [resultId, retry]);
  if (error) return <div className="rounded-xl border p-5">{error}<button className="ml-3 underline" onClick={() => setRetry(n => n + 1)}>重新读取</button></div>;
  if (!result) return <ResearchLoading title="正在读取研究成果" sections={loadingSections} />;
  return <ResultCard key={resultId} payload={result.payload} sourceKey={resultId} presentation={presentation} />;
}

export class ResultEmbedBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  render() {
    if (this.state.failed) return <p className="mt-3 text-xs text-muted-foreground" role="status">{RESULT_EMBED_FALLBACK}</p>;
    return this.props.children;
  }
}

export function ResultEmbed({ resultId }: { resultId: string }) {
  const [state, setState] = useState<'loading' | 'skip' | 'error' | Result>('loading');
  useEffect(() => {
    const controller = new AbortController();
    setState('loading');
    void fetch('/finance-research/research-results/' + encodeURIComponent(resultId), { signal: controller.signal })
      .then(async response => {
        if (!response.ok) throw new Error(response.status === 404 ? '这份研究成果不存在' : '研究成果暂时无法读取');
        const value = await response.json() as Result;
        if (!value.payload) throw new Error('研究成果格式不完整');
        if (!embeddableChartResult(value.payload.kind)) {
          if (!controller.signal.aborted) setState('skip');
          return;
        }
        if (!controller.signal.aborted) setState(value);
      }).catch(() => { if (!controller.signal.aborted) setState('error'); });
    return () => controller.abort();
  }, [resultId]);
  if (state === 'skip') return null;
  if (state === 'error') return <p className="mt-3 text-xs text-muted-foreground" role="status">{RESULT_EMBED_FALLBACK}</p>;
  if (state === 'loading') return <p className="mt-3 text-xs text-muted-foreground">正在载入成果…</p>;
  return <ResultCard payload={state.payload} sourceKey={state.result_id || resultId} presentation="conversation" />;
}

/** One result's chart / table card; shared by saved results and read-only previews (watchlist). */
export function ResultCard({ payload, sourceKey, presentation = 'conversation' }: { payload: Result['payload']; sourceKey: string; presentation?: 'conversation' | 'report' }) {
  const [table, setTable] = useState(false);
  const [downloadError, setDownloadError] = useState('');
  const [chart, setChart] = useState<ECharts | null>(null);
  const marketDownload = useRef<(() => string) | null>(null);
  const eChartDownload = useRef<(() => string) | null>(null);
  const readyMarket = useCallback((download: (() => string) | null) => { marketDownload.current = download; }, []);
  const readyEChart = useCallback((instance: ECharts | null, download?: (() => string) | null) => {
    setChart(instance);
    eChartDownload.current = download ?? null;
  }, []);
  const [range, setRange] = useState(0);
  const missing = listOrEmpty(payload?.missing);
  const sources = listOrEmpty(payload?.sources);
  const columns = listOrEmpty(payload?.columns);
  const rows = useMemo(() => {
    const all = listOrEmpty(payload?.rows);
    return range ? all.slice(-range) : all;
  }, [payload, range]);
  const option = useMemo(() => {
    const number = (value: string | null | undefined) => value == null ? null : Number(value);
    if (payload?.kind === 'financial') return {
      color: ['#f4511e', '#64748b'], animation: false,
      tooltip: { trigger: 'axis', valueFormatter: (value: number) => financialNumber(value !== 0 && Math.abs(value) < 0.01 ? value.toPrecision(6) : value.toFixed(2)) + ' 亿元' },
      legend: { top: 0 }, grid: { left: 60, right: 20, top: 50, bottom: 40 },
      xAxis: { type: 'category', data: rows.map(row => row.period) }, yAxis: { type: 'value', name: '亿元', axisLabel: { formatter: (value: number) => financialNumber(value) } },
      series: (payload.series ?? []).map(key => ({ name: columns.find(column => column.key === key)?.label ?? key,
        type: 'bar', barMaxWidth: 48, data: rows.map(row => row[key] == null ? null : Number(row[key]) / 100000000) })),
    };
    return {
      animation: false, tooltip: { trigger: 'axis' }, legend: { top: 0 },
      grid: [{ left: 65, right: 25, top: 45, height: '57%' }, { left: 65, right: 25, top: '76%', height: '14%' }],
      xAxis: [0, 1].map(gridIndex => ({ type: 'category', gridIndex, data: rows.map(row => row.trading_day), axisLabel: { show: gridIndex === 1 } })),
      yAxis: [{ scale: true, name: '元' }, { gridIndex: 1, scale: true, name: columns.find(c => c.key === 'volume')?.unit }],
      axisPointer: { link: [{ xAxisIndex: 'all' }] },
      series: [
        payload?.chart === 'candlestick'
          ? { name: '价格', type: 'candlestick', data: rows.map(row => ['open', 'close', 'low', 'high'].map(key => number(row[key]))), itemStyle: { color: '#ef4444', color0: '#16a34a', borderColor: '#ef4444', borderColor0: '#16a34a' } }
          : { name: '收盘', type: 'line', data: rows.map(row => number(row.close)), showSymbol: false },
        ...[5, 10, 20].map(n => ({ name: `${n}日均线`, type: 'line', data: rows.map(row => number(row[`ma${n}`])), showSymbol: false })),
        { name: '成交量', type: 'bar', xAxisIndex: 1, yAxisIndex: 1, data: rows.map(row => number(row.volume)), itemStyle: { color: '#94a3b8' } },
      ],
    };
  }, [rows, payload, columns]);
  return <section className="my-4 w-full min-w-0 rounded-2xl border bg-background p-5" aria-label={payload.title}>
    <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
      <div><h3 className="font-semibold">{payload.title}</h3><p className="text-xs text-muted-foreground">截至 {payload.as_of} · {payload.basis ?? (payload.adjustment === 'forward_adjusted' ? '前复权' : payload.adjustment)}</p></div>
      <div className="flex gap-3"><button aria-pressed={!table} onClick={() => setTable(false)}>图表</button><button aria-pressed={table} onClick={() => setTable(true)}>数据</button><button onClick={() => {
        setDownloadError('');
        if (table) downloadFile(payload.title + '.csv', new Blob([dataCsv(columns, listOrEmpty(payload.rows))], { type: 'text/csv;charset=utf-8' }));
        else if (chart || marketDownload.current) {
          const image = marketDownload.current?.() ?? eChartDownload.current?.() ?? chart!.getDataURL({ type: 'png', pixelRatio: 2, backgroundColor: '#fff' });
          void downloadChart(image, payload.title, [
            `截至 ${payload.as_of} · ${payload.basis ?? (payload.adjustment === 'forward_adjusted' ? '前复权' : payload.adjustment ?? '')}`,
            payload.kind === 'financial' ? '图表单位：亿元；精确数据见 CSV（元）' : `显示范围：${rows[0]?.trading_day ?? ''} 至 ${rows.at(-1)?.trading_day ?? ''}`,
            `来源：${[...new Set(sources.map(source => sourceName(source.title)))].join('、')} · 获取时间 ${new Date(payload.fetched_at).toLocaleString()}`,
          ]).catch(() => setDownloadError('下载失败，请重试。'));
        }
      }}>下载{table ? '数据' : '图表'}</button></div>
    </div>
    {downloadError && <p role="alert">{downloadError}</p>}
    {payload.kind === 'market' && <label className="mb-3 flex flex-wrap items-center gap-3 text-sm">显示范围 <WorkspaceSelect aria-label="显示范围" value={String(range)} onChange={next => setRange(Number(next))} options={[{ value: "0", label: "全部已取数据" }, { value: "20", label: "最近20个交易日" }, { value: "60", label: "最近60个交易日" }]} /></label>}
    {table ? <div className="mt-4 max-h-[60vh] overflow-auto"><table className="w-full whitespace-nowrap text-right text-sm tabular-nums"><thead><tr>{columns.map(column => <th className="p-2" key={column.key}>{column.label}{column.unit && `（${column.unit}）`}</th>)}</tr></thead><tbody>{rows.map(row => <tr className="border-t" key={row.trading_day ?? row.period}>{columns.map(column => <td className="p-2" key={column.key}>{financialNumber(row[column.key], column.unit === '股' ? 0 : column.unit ? 2 : undefined)}</td>)}</tr>)}</tbody></table></div> : payload.kind === 'market' && payload.chart === 'candlestick'
      ? <MarketChart rows={rows} title={payload.title} onReady={readyMarket} />
      : presentation === 'report' && payload.kind === 'financial'
        ? <ReportFinancialChart rows={rows} series={payload.series ?? []} columns={columns} onReady={readyMarket} />
        : <EChart option={option} height={400} onReady={readyEChart} />}
    {missing.map(gap => <p className="text-sm text-muted-foreground" key={gap}>{gap}</p>)}
    {payload.kind === 'market' && <p className="mt-3 text-xs text-muted-foreground">价格与均线显示两位小数，下载数据保留原始精度；改变显示范围不会重新计算。</p>}
    {payload.calculations && !Array.isArray(payload.calculations) && <details className="mt-3 text-sm">
      <summary className="cursor-pointer">均线口径与计算输入</summary>
      <p className="my-2">均线为含当日在内最近 {payload.calculations.windows.join('／')} 个交易日收盘价的算术平均；不足对应天数时不计算。{payload.calculations.rounding}。</p>
      <div className="max-h-64 overflow-auto"><table className="w-full text-right tabular-nums"><thead><tr><th>日期</th><th>收盘价（元）</th></tr></thead><tbody>{payload.calculations.inputs.map(row => <tr key={row.trading_day}><td>{row.trading_day}</td><td>{financialNumber(row.close, 2)}</td></tr>)}</tbody></table></div>
    </details>}
    <div className="conversation-citations mt-3 flex flex-wrap gap-2 text-xs text-muted-foreground">来源：{sources.map((source, index) => <EvidenceLink key={index} reference={`provider:${sourceKey}:${index}`} snapshot={resultSourceText(source, payload.fetched_at)}>{sourceName(source.title)}{source.endpoint?.includes('income-statements') ? ' · 利润表' : source.endpoint?.includes('cash-flow-statements') ? ' · 现金流量表' : ''}</EvidenceLink>)}<span>获取时间 {new Date(payload.fetched_at).toLocaleString()}</span></div>
  </section>;
}
