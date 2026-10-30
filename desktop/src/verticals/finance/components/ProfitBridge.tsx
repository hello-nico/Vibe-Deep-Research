import { bridgeSummary, signedYi, type ReconBridge } from '../lib/quarterRecon';
import './profit-bridge.css';

/** 同一中线，增加向右、减少向左；输入仍为原利润桥的科目影响，不改计算。 */
export function ProfitBridge({ bridge }: { bridge: ReconBridge }) {
  const rows = [...bridge.steps].sort((a, b) => Math.abs(b.impact) - Math.abs(a.impact));
  const max = Math.max(...rows.map(row => Math.abs(row.impact)), 0) || 1;
  return <section className="profit-bridge" data-profit-bridge="" aria-label="单季净利润从上季到本季的变化">
    <p className="profit-bridge-summary">{bridgeSummary(bridge)}</p>
    <div className="profit-bridge-row profit-bridge-axis" aria-hidden="true"><span /><span><span>减少</span><span>增加</span></span><span /></div>
    <ol>{rows.map((row, index) => {
      const width = Math.abs(row.impact) / max * 50;
      return <li key={index} className="profit-bridge-row" data-bridge-kind={row.impact >= 0 ? 'up' : 'down'}>
        <span className="profit-bridge-name" title={row.name}>{row.name}</span>
        <span className="profit-bridge-track">
          <span className="profit-bridge-bar" style={{ left: `${row.impact >= 0 ? 50 : 50 - width}%`, width: `${width}%` }} />
        </span>
        <span className="profit-bridge-value">{signedYi(row.impact)}</span>
      </li>;
    })}</ol>
  </section>;
}
