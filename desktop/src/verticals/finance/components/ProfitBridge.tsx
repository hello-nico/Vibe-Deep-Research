import { yiText } from '../lib/companyNarrative';
import { signedYi, type ReconBridge } from '../lib/quarterRecon';
import './profit-bridge.css';

interface Row { key: string; name: string; from: number; to: number; kind: 'total' | 'up' | 'down'; value: string }

/** 利润桥瀑布图：上季单季净利润 → 各项增减 → 本季；横向条形，刻度共享，零基线可见。 */
export function ProfitBridge({ bridge }: { bridge: ReconBridge }) {
  let running = bridge.start;
  const rows: Row[] = [{ key: 'start', name: '上季', from: 0, to: bridge.start, kind: 'total', value: yiText(bridge.start) }];
  bridge.steps.forEach((step, index) => {
    rows.push({ key: `step-${index}`, name: step.name, from: running, to: running + step.impact, kind: step.impact >= 0 ? 'up' : 'down', value: signedYi(step.impact) });
    running += step.impact;
  });
  rows.push({ key: 'end', name: '本季', from: 0, to: bridge.end, kind: 'total', value: yiText(bridge.end) });
  const points = rows.flatMap(row => [row.from, row.to, 0]);
  const low = Math.min(...points), span = (Math.max(...points) - low) || 1;
  const at = (value: number) => ((value - low) / span) * 100;
  return <ol className="profit-bridge" data-profit-bridge="" aria-label="单季净利润从上季到本季的变化">
    {rows.map(row => {
      const left = at(Math.min(row.from, row.to)), width = Math.max(Math.abs(at(row.to) - at(row.from)), 0.6);
      return <li key={row.key} className="profit-bridge-row" data-bridge-kind={row.kind}>
        <span className="profit-bridge-name" title={row.name}>{row.name}</span>
        <span className="profit-bridge-track" style={{ ['--zero' as string]: `${at(0)}%` }}>
          <span className="profit-bridge-bar" style={{ left: `${left}%`, width: `${width}%` }} />
        </span>
        <span className="profit-bridge-value">{row.value}</span>
      </li>;
    })}
  </ol>;
}
