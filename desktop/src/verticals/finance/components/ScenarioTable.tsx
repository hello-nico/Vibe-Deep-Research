import { multipleText, scenarioEarningsText, scenarioPriceText, type ScenarioMode, type ScenarioRow } from '../lib/companyPacket';

/** Three saved scenario prices. The page does not calculate them. */
export function ScenarioTable({ rows, mode = 'per_share', gap }: { rows: ScenarioRow[] | null; mode?: ScenarioMode; gap?: string }) {
  if (!rows?.length) return <p className="company-page-gap" data-scenario="gap">{gap || '三档目标价暂时算不出来'}</p>;
  const earningsLabel = mode === 'total' ? '利润' : '每股收益';
  return <div className="table-wrap company-scenario" data-scenario="table" data-scenario-mode={mode}>
    <table className="data-table">
      <thead><tr><th>情景</th><th>{earningsLabel}</th><th>倍数</th><th>目标价</th></tr></thead>
      <tbody>{rows.map(row => <tr key={row.name}>
        <th scope="row">{row.name}</th>
        <td>{row.earnings ? scenarioEarningsText(row.earnings, mode) : '—'}</td>
        <td>{multipleText(row.multiple) || '—'}</td>
        <td>{scenarioPriceText(row.price)}</td>
      </tr>)}</tbody>
    </table>
  </div>;
}
