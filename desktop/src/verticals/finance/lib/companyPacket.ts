import { formatFactValue } from './wikiFacts';

/** Fields the page reads from GET …/data-packet. Extra keys from later packet versions are ignored. */
export interface PacketField {
  field_id?: string;
  metric?: string;
  value?: string | number | null;
  unit?: string | null;
  period?: string | null;
  scope?: string | null;
  status?: string;
  reason?: string | null;
  ref?: string | null;
  provider?: string | null;
  provider_values?: PacketField[];
  report_comparisons?: { report?: PacketField; consistent?: boolean }[] | null;
  institution_count?: number;
  /** 同业对比镜头：同业中位数（Backend 给出，页面不计算）。 */
  median?: string | number | null;
  items?: PacketPeer[];
  formula?: string;
  source_ref?: string | string[] | null;
}
export interface PacketPeer {
  symbol?: string;
  name?: string;
  pe?: PacketField;
  pb?: PacketField;
}
export interface PacketSnapshot { observed_at?: string }
export interface DataPacket {
  symbol?: string;
  as_of: string;
  financial_period?: string;
  /** 页面数字统一截至的报告期（2026Q3、2026H1、FY2025）；旧 Backend 没有。 */
  page_period?: string;
  /** 公司在行业公共层里的身份；`industry_code` 用来读所属行业的估值框架。 */
  identity?: { symbol?: string; name?: string; industry_name?: string; industry_code?: string };
  fields: Record<string, PacketField>;
  industry_drivers?: {
    definition?: { formula?: { operation?: string } };
    fields?: Record<string, PacketField>;
    calculation?: PacketField;
  };
  lenses?: Record<string, PacketField | PacketField[] | Record<string, PacketField | unknown> | unknown>;
  provider_snapshots?: PacketSnapshot[];
}
export interface ScenarioRow {
  name: string;
  multiple: string;
  /** 空串表示这一档没有价（如亏损）；原因写在 gapNote。 */
  price: string;
  gapNote?: string;
  earnings?: string;
  period?: string;
  /** 倍数依据（行业与周期位置），可选。 */
  reason?: string;
}
export type ScenarioMode = 'per_share' | 'total';
export interface ScenarioTableData { mode: ScenarioMode; rows: ScenarioRow[] }

const LABELS: Record<string, string> = {
  revenue: '营业收入', operating_cost: '营业成本', gross_margin: '毛利率', net_profit_attributable: '净利润',
  operating_cash_flow: '经营现金流', capex_cash: '资本开支', dividend_paid: '现金分红',
  residual_cash: '剩余现金', shares: '总股本', dividend_per_share: '每股分红',
  price: '价格', pe: '市盈率', pb: '市净率', dividend_yield: '股息率',
  roe: '净资产收益率', net_assets: '净资产', market_cap: '总市值',
  eps_ttm: '每股收益（TTM）', eps_forecast: '机构预测每股收益', eps_forecast_next: '次年每股收益', forward_pe: '前瞻市盈率',
  power_sales: '售电量', power_price: '电价', unit_cost: '单位成本', product_price: '产品单价',
  net_profit_ex_nonrecurring: '扣非净利润', common_equity: '普通股权益', other_equity_tools: '其他权益工具',
  ttm_profit: '滚动净利润（近四季）', peers: '同业', cash_conversion: '现金转化率', industry_formula: '行业利润公式',
  average_earning_assets: '生息资产平均余额', net_interest_margin: '净息差', credit_cost: '信贷成本',
  single_quarter: '单季度数据', latest_net_profit_attributable: '最近披露净利润',
  cash_after_capex: '资本开支后现金（未扣分红）',
};
/** Driver keys of the form <kind>:<name>, e.g. sales:<product>. The name is the Chinese product or segment. */
const DRIVER_KINDS: Record<string, string> = { sales: '销量', price: '单价', cost: '单位成本', output: '产量' };
/** Segment field ids are `segment:[period:]<product|region>:<name>.<metric>`; the label is the segment name plus a short metric noun. */
const SEGMENT_METRICS: Record<string, string> = { revenue: '收入', cost: '成本' };
const QUARTERS: Record<string, string> = { Q1: '第一季度', Q2: '第二季度', Q3: '第三季度', Q4: '第四季度' };
/** Used when a metric has no Chinese label; an unknown key is never shown. */
export const UNKNOWN_FIELD_LABEL = '相关指标';
const FORMULAS: Record<string, string> = {
  volume_price_cost: '数量 ×（单价 − 单位成本）',
  revenue_margin: '业务收入 × 毛利率',
  bank_interest: '平均生息资产 × 净息差',
  telecom_service: '平均客户数 × 月均收入',
};
const PROVIDERS: Record<string, string> = { hithink: '同花顺', sina: '新浪', tencent: '腾讯' };

export function shanghaiDay(now = new Date()) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Shanghai', year: 'numeric', month: '2-digit', day: '2-digit' }).format(now);
}
export function packetNeedsEnsure(packet: DataPacket, asOf: string) {
  return !(packet.provider_snapshots ?? []).some(item => /^(\d{4}-\d{2}-\d{2})/.exec(item.observed_at ?? '')?.[1] === asOf);
}
const hasChinese = (text: string) => /[\u4e00-\u9fff]/.test(text);
/** Chinese label for a packet metric or driver key. Unknown keys fall back to a generic Chinese noun, never the raw key. */
export function fieldLabel(metric: string | undefined, fallback = UNKNOWN_FIELD_LABEL): string {
  const key = String(metric ?? '').trim();
  if (!key) return fallback;
  if (key.startsWith('driver:')) return fieldLabel(key.slice('driver:'.length), fallback);
  if (key.startsWith('lens:')) return fieldIdLabel(key, fallback);
  if (LABELS[key]) return LABELS[key];
  const segment = /^(?:segment:)?(?:[A-Za-z0-9]+:)?(?:product|region):(.+)\.([a-z_]+)$/i.exec(key);
  if (segment) return `${segment[1]}${SEGMENT_METRICS[segment[2]!.toLowerCase()] ?? LABELS[segment[2]!.toLowerCase()] ?? '指标'}`;
  const kinded = /^([A-Za-z_]+)[:：](.+)$/.exec(key);
  if (kinded) {
    const [, kind, name] = kinded as unknown as [string, string, string];
    if (!hasChinese(name)) return fallback;
    return `${name}${DRIVER_KINDS[kind.toLowerCase()] ?? ''}`;
  }
  return hasChinese(key) && !/[A-Za-z_]{3,}/.test(key) ? key : fallback;
}
/** Label for a field_id: main fields are the metric key, drivers driver:<metric>, lenses lens:<lens>.<metric>. */
export function fieldIdLabel(id: string | undefined, fallback = UNKNOWN_FIELD_LABEL): string {
  const key = String(id ?? '').trim();
  const lens = /^lens:([a-z_]+)\.(.+)$/.exec(key);
  if (!lens) return fieldLabel(key, fallback);
  const [, kind, rest] = lens as unknown as [string, string, string];
  if (kind === 'peer_comparison') return `同业${fieldLabel(rest, '指标')}中位数`;
  if (kind === 'valuation_percentile') return `${fieldLabel(rest, '估值')}历史分位`;
  if (kind === 'ytd_yoy') return `今年以来${fieldLabel(rest, '指标')}同比`;
  if (kind === 'single_quarters') {
    const quarter = /^(\d{4})(Q[1-4])\.(.+)$/.exec(rest);
    return quarter ? `${quarter[1]} 年${QUARTERS[quarter[2]!]}${fieldLabel(quarter[3], '指标')}（单季）` : fallback;
  }
  if (!['ttm_profit', 'cash_conversion', 'residual_cash', 'cash_after_capex'].includes(kind)) return fallback;
  return fieldLabel(rest.split('.').pop() ?? rest, fallback);
}
/** direction：down 为跌破越线，up 为突破越线；旧研究没有该字段，页面显示「状态待定」。 */
export interface PacketThreshold { kind?: 'level' | 'yoy_pct'; direction?: 'down' | 'up'; value: string | number; unit: string }
/** yoy_pct is a year-over-year change in percent; level keeps the field's own unit (no kind means level). */
export function thresholdText(threshold: PacketThreshold | null | undefined) {
  if (!threshold || threshold.value == null || String(threshold.value).trim() === '') return '';
  if (threshold.kind === 'yoy_pct') {
    const raw = String(threshold.value).trim();
    const numeric = Number(raw);
    if (!Number.isFinite(numeric)) return '';
    const sign = raw.startsWith('-') ? '-' : raw.startsWith('+') ? '+' : '±';
    return `同比 ${sign}${formatFactValue({ value: Math.abs(numeric), unit: '%' }).replace(/\s+/g, '')}`;
  }
  return tightPercent(formatFactValue({ value: threshold.value, unit: threshold.unit }));
}
export function formulaText(packet: DataPacket) {
  const calculation = packet.industry_drivers?.calculation;
  if (calculation && calculation.status !== 'gap' && calculation.formula && !/field_id|packet|api\//i.test(calculation.formula)) return calculation.formula;
  const operation = packet.industry_drivers?.definition?.formula?.operation;
  return operation ? FORMULAS[operation] ?? '' : '';
}
function sourceLabel(provider: string | null | undefined) {
  if (!provider) return '来源';
  return PROVIDERS[provider.toLowerCase()] ?? '另一口径';
}
export function conflictValues(field: PacketField): { label: string; field: PacketField }[] {
  if (field.status !== 'conflict') return [];
  const rows: { label: string; field: PacketField }[] = [];
  for (const item of field.provider_values ?? []) {
    if (item.value == null || item.value === '') continue;
    rows.push({ label: [sourceLabel(item.provider), periodLabel(item.period)].filter(Boolean).join(' · '), field: item });
  }
  for (const comparison of field.report_comparisons ?? []) {
    if (comparison.consistent !== false || comparison.report?.value == null) continue;
    rows.push({ label: ['定期报告', periodLabel(comparison.report.period)].filter(Boolean).join(' · '), field: comparison.report });
  }
  return rows;
}
export function gapText(field: PacketField) {
  const reason = String(field.reason ?? '').trim();
  if (!reason || /field_id|packet_field|scenarioRef|basisVersion|sha256|parse_revision|\/api\/|calculate_metrics|provider/i.test(reason)) {
    return `暂时取不到${fieldLabel(field.metric)}`;
  }
  return reason;
}
function citedField(value: unknown): PacketField | undefined {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined;
  const field = value as PacketField;
  return typeof field.field_id === 'string' ? field : undefined;
}
function addCited(out: PacketField[], value: unknown) {
  if (Array.isArray(value)) { value.forEach(item => addCited(out, item)); return; }
  const field = citedField(value);
  if (field && typeof field.status === 'string') { out.push(field); return; }
  if (!value || typeof value !== 'object') return;
  for (const item of Object.values(value as Record<string, unknown>)) addCited(out, item);
}
/** Exact field_id across main fields, industry drivers, and lenses. Nested inputs are not citable. */
export function findField(packet: DataPacket | undefined, id: string) {
  if (!packet || !id) return undefined;
  const cited: PacketField[] = [];
  for (const field of Object.values(packet.fields ?? {})) {
    if (field.field_id === id) cited.push(field);
  }
  // 主字段的 field_id 就是指标键；旧形态的包没有 field_id 时按键取。
  const keyed = packet.fields?.[id];
  if (keyed && !keyed.field_id) cited.push({ ...keyed, field_id: id });
  const drivers = packet.industry_drivers;
  for (const field of Object.values(drivers?.fields ?? {})) {
    if (field.field_id === id) cited.push(field);
  }
  if (drivers?.calculation?.field_id === id) cited.push(drivers.calculation);
  for (const lens of Object.values(packet.lenses ?? {})) addCited(cited, lens);
  return cited.find(field => field.field_id === id);
}
export function forecastNote(field: PacketField) {
  if (field.metric !== 'eps_forecast' || typeof field.institution_count !== 'number') return '';
  const note = `机构预测（${field.institution_count} 家）`;
  return field.institution_count < 3 ? `${note}，样本少` : note;
}
export function showField(field: PacketField | undefined) {
  return tightPercent(formatFactValue((field ?? {}) as Record<string, unknown>));
}
function scenarioMode(value: unknown): ScenarioMode {
  return value === 'total' ? 'total' : 'per_share';
}
function scenarioExtra(result: Record<string, unknown>): { scenarios?: unknown; mode?: unknown } | undefined {
  const body = result.body && typeof result.body === 'object' ? result.body as Record<string, unknown> : result;
  const payload = body.payload && typeof body.payload === 'object' ? body.payload as Record<string, unknown> : undefined;
  const calculation = payload?.calculation && typeof payload.calculation === 'object' ? payload.calculation as Record<string, unknown> : undefined;
  const stored = calculation?.extra && typeof calculation.extra === 'object' ? calculation.extra as { scenarios?: unknown; mode?: unknown } : undefined;
  if (stored) return stored;
  const direct = result.extra && typeof result.extra === 'object' ? result.extra as { scenarios?: unknown; mode?: unknown } : undefined;
  const nested = result.result && typeof result.result === 'object' ? (result.result as { extra?: { scenarios?: unknown; mode?: unknown } }).extra : undefined;
  return direct ?? nested;
}
export function scenarioTable(result: unknown): ScenarioTableData | null {
  if (!result || typeof result !== 'object') return null;
  const record = result as Record<string, unknown> & { scenarios?: unknown };
  const extra = scenarioExtra(record);
  const scenarios = extra?.scenarios ?? record.scenarios;
  if (!Array.isArray(scenarios)) return null;
  const rows = scenarios.flatMap(item => {
    if (!item || typeof item !== 'object') return [];
    const row = item as { name?: unknown; multiple?: unknown; price?: unknown; earnings?: unknown; earnings_period?: unknown; reason?: unknown; multiple_reason?: unknown };
    const name = String(row.name ?? '').trim();
    const price = String(row.price ?? '').trim();
    if (!name) return [];
    const loss = Number(row.earnings) < 0 || /亏损/.test(String(row.reason ?? ''));
    return [{ name, multiple: String(row.multiple ?? ''), price, ...(price ? {} : { gapNote: loss ? '亏损，不给价' : '价格暂缺' }), earnings: row.earnings == null ? undefined : String(row.earnings), period: row.earnings_period == null ? undefined : String(row.earnings_period), reason: [row.reason, row.multiple_reason].find((value): value is string => typeof value === 'string' && value.trim() !== '') }];
  });
  return rows.length === 3 ? { mode: scenarioMode(extra?.mode), rows } : null;
}
export function scenarioPriceText(price: string | number) {
  return `${formatFactValue({ value: price, unit: '元/股' })}`;
}
/** 三档价的数字写法（不带单位）：与三档表同一规则，页面上同一个三档价只有一种写法。 */
export function scenarioPriceNumber(price: string | number) {
  return scenarioPriceText(price).replace(/\s*元\/股$/, '');
}
export function scenarioEarningsText(earnings: string | undefined, mode: ScenarioMode = 'per_share') {
  if (!earnings) return '';
  return formatFactValue({ value: earnings, unit: mode === 'total' ? '元' : '元/股' });
}

/** 倍数一律一位小数（Backend 给的是长小数字符串）；不是数字时返回空。 */
export function multipleText(value: string | number | null | undefined): string {
  const parsed = typeof value === 'number' ? value : Number(String(value ?? '').trim());
  if (value == null || String(value).trim() === '' || !Number.isFinite(parsed)) return '';
  return `${parsed.toLocaleString('zh-CN', { minimumFractionDigits: 1, maximumFractionDigits: 1 })} 倍`;
}

const SEASON: Record<string, string> = { H1: '半年报', Q1: '一季报', Q2: '二季度', Q3: '三季报', Q4: '四季度' };
const YTD: Record<string, string> = { Q1: '一季度', Q2: '上半年', Q3: '前三季度', Q4: '全年' };
/** 期间写法统一在这里：FY2025 → 2025 年报；FY2026E → 2026 年预测；2026H1 → 2026 半年报；Q1 / Q3 → 一季报 / 三季报；TTM:2026Q3 → 近四季（截至 2026 三季报）；日期 → 10 月 12 日；其余原样。 */
export function periodLabel(period: string | null | undefined): string {
  const text = String(period ?? '').trim();
  const fy = /^FY(\d{4})$/i.exec(text);
  if (fy) return `${fy[1]} 年报`;
  const forecast = /^FY(\d{4})E$/i.exec(text);
  if (forecast) return `${forecast[1]} 年预测`;
  const ttm = /^TTM[:：]\s*(.+)$/i.exec(text);
  if (ttm) return `近四季（截至 ${periodLabel(ttm[1])}）`;
  const season = /^(\d{4})\s*(H1|Q[1-4])$/i.exec(text);
  if (season) return `${season[1]} ${SEASON[season[2]!.toUpperCase()]}`;
  const ytd = /^(\d{4})\s*YTD\s*(Q[1-4])$/i.exec(text);
  if (ytd) return `${ytd[1]} 年${YTD[ytd[2]!.toUpperCase()]}`;
  const iso = /^\d{4}-(\d{2})-(\d{2})/.exec(text);
  if (iso) return `${Number(iso[1])} 月 ${Number(iso[2])} 日`;
  return text;
}
/** 报告期写法：2026Q3 → 2026 年三季报；scheme 为分红这类按年度方案的数：FY2025 → 2025 年度方案。 */
export function reportPeriodText(period: string | null | undefined, scheme = false): string {
  const text = String(period ?? '').trim().replace(/^TTM[:：]\s*/i, '');
  const fy = /^FY(\d{4})$/i.exec(text);
  if (fy) return scheme ? `${fy[1]} 年度方案` : `${fy[1]} 年报`;
  const season = /^(\d{4})\s*(?:YTD)?\s*(H1|Q[1-4])$/i.exec(text);
  if (!season) return '';
  const name = { H1: '半年报', Q1: '一季报', Q2: '二季报', Q3: '三季报', Q4: '四季报' }[season[2]!.toUpperCase() as 'H1' | 'Q1' | 'Q2' | 'Q3' | 'Q4'];
  return `${season[1]} 年${name}`;
}
/** 统一成可比的报告期：去掉 TTM: 与 YTD，认不出（日期、空）返回空。 */
const reportKey = (period: string | null | undefined) => {
  const text = String(period ?? '').trim().replace(/^TTM[:：]\s*/i, '').replace(/YTD/i, '').toUpperCase();
  return /^(FY\d{4}|\d{4}(H1|Q[1-4]))$/.test(text) ? text : '';
};
/** 与页面报告期（`page_period`）不同期的数字才返回它自己的期间小字；同期、市场时点、旧 Backend 没有 page_period 时为空。 */
export function otherPeriodText(packet: DataPacket | undefined, field: { field_id?: string; metric?: string; period?: string | null } | undefined): string {
  const page = reportKey(packet?.page_period), own = reportKey(field?.period);
  if (!page || !own || page === own) return '';
  return reportPeriodText(field!.period, /^dividend/.test(String(field?.field_id ?? field?.metric ?? '')));
}
/** 节标题右侧的口径：有 page_period 时，与页面同期的报告期不重复写，不同期写自己的期间，行情日期这类时点照写；旧 Backend 保持原写法。 */
export function sectionMeta(packet: DataPacket | undefined, field: { field_id?: string; metric?: string; period?: string | null } | undefined): string {
  if (!field?.period) return '';
  if (!reportKey(packet?.page_period)) return periodLabel(field.period);
  if (!reportKey(field.period)) return periodLabel(field.period);
  return otherPeriodText(packet, field);
}
/** 页首灰字：数据截至哪份报告；没有 page_period 返回空。 */
export const pagePeriodText = (packet: DataPacket | undefined) => reportKey(packet?.page_period) ? `数据截至 ${reportPeriodText(packet!.page_period)}` : '';
/** 数字与百分号之间不留空格（23.35%）。 */
export const tightPercent = (text: string) => text.replace(/(\d)\s+%/g, '$1%');
