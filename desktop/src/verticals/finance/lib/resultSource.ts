import { financialNumber, sourceName } from './financialDisplay';
export interface ResultSource { title: string; endpoint?: string; parameters?: Record<string, unknown>; snapshot?: { item?: Record<string, unknown>[] } }

const fields: Record<string, string> = {
  date_ms: '日期', period_end_ms: '报告期', report_date_ms: '披露日期',
  open_price: '开盘', high_price: '最高', low_price: '最低', close_price: '收盘', volume: '成交量（股）', turnover: '成交额（元）',
  operating_income: '营业收入（元）', parent_holder_net_profit: '归母净利润（元）', act_cash_flow_net: '经营现金流净额（元）',
};
const cell = (key: string, value: unknown) => value == null ? '—' : key.endsWith('_ms') && typeof value === 'number'
  ? new Date(value).toLocaleDateString('zh-CN', { timeZone: 'Asia/Shanghai' }) : financialNumber(value).replaceAll('|', '\\|');

export function resultSourceText(source: ResultSource, fetchedAt: string): string {
  const rows = source.snapshot?.item ?? [];
  const keys = Object.keys(fields).filter(key => rows.some(row => key in row));
  const table = keys.length ? [`| ${keys.map(key => fields[key]).join(' | ')} |`, `| ${keys.map(() => '---').join(' | ')} |`,
    ...rows.map(row => `| ${keys.map(key => cell(key, row[key])).join(' | ')} |`)].join('\n') : '该来源未保留可回读的明细。';
  return `### ${sourceName(source.title)}\n\n获取时间：${new Date(fetchedAt).toLocaleString()}\n\n以下为生成这份成果时取得的来源数据。行情价格单位为元，财务金额为人民币元。\n\n${table}`;
}
