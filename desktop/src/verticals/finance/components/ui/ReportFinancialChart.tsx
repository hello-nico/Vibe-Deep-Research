import { useEffect, useRef } from 'react';
import { financialNumber } from '../../lib/financialDisplay';

/** Lieflat Basics C2 paired rungs, adapted to signed financial values and product colors. */
export function ReportFinancialChart({ rows, series, columns, onReady }: {
  rows: Record<string, string | null>[];
  series: string[];
  columns: { key: string; label: string }[];
  onReady: (download: (() => string) | null) => void;
}) {
  const ref = useRef<SVGSVGElement>(null);
  useEffect(() => {
    onReady(() => {
      const svg = ref.current!.cloneNode(true) as SVGSVGElement;
      svg.setAttribute('width', String(ref.current!.viewBox.baseVal.width));
      svg.setAttribute('height', '365');
      svg.removeAttribute('style');
      const exportColors: Record<string, string> = {
        'hsl(var(--card))': '#ffffff',
        'hsl(var(--chart-text))': '#475569',
        'hsl(var(--chart-axis))': '#cbd5e1',
        'hsl(var(--foreground) / 0.72)': '#334155',
      };
      svg.querySelectorAll<SVGElement>('[fill], [stroke]').forEach(node => {
        for (const attribute of ['fill', 'stroke'] as const) {
          const value = node.getAttribute(attribute);
          if (value && exportColors[value]) node.setAttribute(attribute, exportColors[value]);
        }
      });
      return 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(new XMLSerializer().serializeToString(svg));
    });
    return () => onReady(null);
  }, [onReady]);
  const values = rows.flatMap(row => series.map(key => row[key] == null ? null : Number(row[key]) / 1e8));
  const finite = values.filter((value): value is number => value !== null && Number.isFinite(value));
  const max = Math.max(1, ...finite.map(Math.abs));
  const unit = 10 ** Math.floor(Math.log10(max / 30));
  const step = Math.ceil(max / (unit * 40)) * unit;
  const low = Math.min(0, ...finite), high = Math.max(0, ...finite);
  const extent = high - low || 1;
  const y = (value: number) => 70 + (high - value) / extent * 220;
  const width = Math.max(640, rows.length * Math.max(100, series.length * 54));
  const group = (width - 100) / Math.max(1, rows.length);
  const colors = ['#f4511e', 'hsl(var(--chart-text))', 'hsl(var(--foreground) / 0.72)'];
  return <div className="overflow-x-auto">
    <svg ref={ref} xmlns="http://www.w3.org/2000/svg" viewBox={`0 0 ${width} 365`} style={{ width: '100%', minWidth: 560, background: 'hsl(var(--card))' }} role="img" aria-label="财务对比，单位亿元；精确值可切换数据查看">
      <rect width={width} height="365" fill="hsl(var(--card))" />
      <g fontFamily="sans-serif" fontSize="12" fill="hsl(var(--chart-text))">
        {series.map((key, index) => <text key={key} x={50 + index * 180} y="25" fill={colors[index % colors.length]}>{columns.find(c => c.key === key)?.label ?? key}</text>)}
        <line x1="40" x2={width - 20} y1={y(0)} y2={y(0)} stroke="hsl(var(--chart-axis))" />
        {rows.map((row, i) => <g key={row.period ?? i}>
          {series.map((key, j) => {
            const raw = row[key];
            const value = raw == null ? null : Number(raw) / 1e8;
            const x = 50 + group * (i + .5) + (j - (series.length - 1) / 2) * 42;
            if (value == null || !Number.isFinite(value)) return <text key={key} x={x} y={y(0) - 10} textAnchor="middle">—</text>;
            const count = Math.ceil(Math.abs(value) / step);
            return <g key={key} fill={colors[j % colors.length]} stroke={colors[j % colors.length]}>
              <title>{columns.find(c => c.key === key)?.label}: {financialNumber(raw)} 元</title>
              {Array.from({ length: count }, (_, k) => {
                const fraction = Math.min(1, Math.abs(value) / step - k);
                const lineY = y(Math.sign(value) * Math.min(Math.abs(value), (k + .5) * step));
                return <line key={k} x1={x - 13 * fraction} x2={x + 13 * fraction} y1={lineY} y2={lineY} strokeWidth="1.5" />;
              })}
              <text x={x} y={y(value) + (value < 0 ? 17 : -10)} stroke="none" textAnchor="middle" fontSize="11">{financialNumber(value.toFixed(2))}</text>
            </g>;
          })}
          <text x={50 + group * (i + .5)} y="325" textAnchor="middle">{row.period}</text>
        </g>)}
        <text x="50" y="352" fill="hsl(var(--chart-text))">单位：亿元 · 每条完整横线 = {financialNumber(step)} 亿元；末条按比例显示</text>
      </g>
    </svg>
  </div>;
}
