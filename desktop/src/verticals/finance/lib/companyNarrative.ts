import { fieldIdLabel, findField, periodLabel, scenarioPriceText, showField, thresholdText, tightPercent, type DataPacket, type PacketField, type PacketThreshold } from './companyPacket';
import { formatFactValue } from './wikiFacts';
import { driverWatch, type DriverSet } from './templateDrivers';
import type { CompanyPageResearch } from './companyPage';
export { periodLabel };

/** T7.3 页面逻辑。页面只做四种运算：「base_profit + Σ 系数 × 变动」「÷ 股本」「× 凭据中的中性倍数」「现价 ÷ 每股收益」；其余数字都来自数据包字段或计算凭据。 */

const num = (value: unknown): number | null => {
  if (value == null || value === '' || typeof value === 'boolean') return null;
  const parsed = typeof value === 'number' ? value : Number(String(value).trim());
  return Number.isFinite(parsed) ? parsed : null;
};

/** 带千分位的数字；步长小于 1 的变量保留两位小数。 */
export function plainNumber(value: number, digits = 0) {
  return value.toLocaleString('zh-CN', { minimumFractionDigits: digits, maximumFractionDigits: digits });
}
export function yuanText(value: number) {
  return formatFactValue({ value, unit: '元' });
}
/** 利润变动统一按亿元显示（不足一亿也一样），避免贡献条旁出现长串元；四舍五入到两位小数。 */
export function yiText(value: number) {
  return `${plainNumber(Math.round(value / 1e6) / 100, 2)} 亿元`;
}

// ---------------------------------------------------------------- 句中数字槽

export type SentencePart = { kind: 'text'; text: string } | { kind: 'slot'; token: string };
const SLOT = /\{([^{}\s][^{}\n]{0,198})\}/g;
export function splitSentence(text: string): SentencePart[] {
  const parts: SentencePart[] = [];
  let last = 0;
  for (const match of text.matchAll(SLOT)) {
    if (match.index > last) parts.push({ kind: 'text', text: text.slice(last, match.index) });
    parts.push({ kind: 'slot', token: match[1]!.trim() });
    last = match.index + match[0].length;
  }
  if (last < text.length) parts.push({ kind: 'text', text: text.slice(last) });
  return parts;
}
/** 把文字里的 {…} 数据引用替换成带单位的数值；解析不到写 gap（默认「（数据缺失）」），不漏出原始占位符。页面与问助手快照共用。 */
export function fillSlots(text: string | undefined, packet: DataPacket | undefined, calcs: Record<string, unknown>, gap = '（数据缺失）', livePrice?: number | null): string {
  return splitSentence(text ?? '').map(part => part.kind === 'text' ? part.text : resolveSlot(part.token, packet, calcs, livePrice)?.text ?? gap).join('');
}
/** 句子里引用的计算凭据，页面按这些读回。 */
export function calcRefsIn(text: string | undefined) {
  const refs = new Set<string>();
  for (const part of splitSentence(text ?? '')) {
    const parsed = part.kind === 'slot' ? parseCalcToken(part.token) : null;
    if (parsed) refs.add(parsed.resultId);
  }
  return [...refs];
}
export function parseCalcToken(token: string) {
  const match = /^calc:(result:[0-9a-f]{32})\.(.+)$/.exec(token);
  return match ? { resultId: match[1]!, path: match[2]! } : null;
}

const PROVIDERS: Record<string, string> = { hithink: '同花顺', sina: '新浪', tencent: '腾讯', eastmoney: '东方财富' };
function sourceNote(field: PacketField) {
  const ref = typeof field.source_ref === 'string' ? field.source_ref : typeof field.ref === 'string' ? field.ref : '';
  if (field.provider && PROVIDERS[field.provider.toLowerCase()]) return `来源 ${PROVIDERS[field.provider.toLowerCase()]}`;
  const prefix = /^[a-z]+(?=:)/.exec(ref)?.[0];
  if (prefix === 'provider') return `来源 ${PROVIDERS[ref.split(':')[1]?.toLowerCase() ?? ''] ?? '数据服务'}`;
  if (prefix === 'source') return '来源 定期报告原文';
  if (prefix === 'result') return '来源 已保存成果';
  return '来源 当日数据包';
}

export interface ResolvedSlot { text: string; title: string }
/** null 表示缺口：页面显示灰色「暂缺」。 */
export function resolveSlot(token: string, packet: DataPacket | undefined, calcs: Record<string, unknown>, livePrice?: number | null): ResolvedSlot | null {
  // 页内凡写「现价」一律用页首同一实时价；数据包的快照价只在「查看数据」里出现。
  if (token === 'price' && typeof livePrice === 'number' && Number.isFinite(livePrice)) return { text: `${plainNumber(livePrice, 2)} 元/股`, title: '现价（页首实时行情）' };
  const calc = parseCalcToken(token);
  if (calc) {
    const raw = calcs[calc.resultId];
    const value = raw ? pathValue(calculationExtra(raw), calc.path) ?? pathValue(calculationBody(raw), calc.path) : undefined;
    const text = formatCalcValue(calc.path, value, calculationExtra(raw));
    return text ? { text, title: '来源 计算凭据' } : null;
  }
  const field = findField(packet, token);
  if (!field || (field.status !== 'verified' && field.status !== 'sourced') || field.value == null || field.value === '') return null;
  const title = [fieldIdLabel(token), periodLabel(field.period), field.scope, sourceNote(field)].filter(Boolean).join(' · ');
  return { text: showField(field), title };
}

const CALC_YUAN_KEYS = new Set(['profit_delta', 'base_profit', 'profit', 'profit_at_current']);
/** 按占位路径最后一段的键名定单位；current / anchor 取同一个 variables 项里的 unit；其他键原样显示。 */
function formatCalcValue(path: string, value: unknown, extra: Record<string, unknown> | undefined): string {
  const parsed = num(value);
  if (parsed == null) return '';
  const segments = path.split('.');
  const key = segments.at(-1) ?? '';
  if (CALC_YUAN_KEYS.has(key)) return yiText(parsed);
  if (key === 'pe' || key === 'pb' || key === 'multiple') return `${plainNumber(parsed, 1)} 倍`;
  if (key === 'price') return `${plainNumber(parsed, 2)} 元`;
  if (key === 'eps') return `${plainNumber(parsed, 2)} 元/股`;
  const raw = plainNumber(parsed, Number.isInteger(parsed) ? 0 : 2);
  if (key === 'current' || key === 'anchor' || (key === 'value' && segments.at(-2) === 'anchor')) {
    const at = segments.indexOf('variables');
    const unit = at >= 0 ? record(pathValue(extra, segments.slice(0, at + 2).join('.')))?.unit : undefined;
    return typeof unit === 'string' && unit.trim() ? tightPercent(`${raw} ${unit.trim()}`) : raw;
  }
  return raw;
}
function pathValue(root: unknown, path: string): unknown {
  let node: unknown = root;
  for (const key of path.split('.')) {
    if (node == null || typeof node !== 'object') return undefined;
    node = (node as Record<string, unknown>)[key];
  }
  return node;
}
const record = (value: unknown): Record<string, unknown> | undefined => value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : undefined;
export function calculationBody(raw: unknown): Record<string, unknown> | undefined {
  const top = record(raw);
  const body = record(top?.body) ?? top;
  return record(record(body?.payload)?.calculation) ?? record(body?.result) ?? body;
}
export function calculationExtra(raw: unknown): Record<string, unknown> | undefined {
  const calculation = calculationBody(raw);
  return record(calculation?.extra) ?? record(record(raw)?.extra);
}

// ---------------------------------------------------------------- 敏感性

/** anchor：基数期间的变量均值，零变动点；current：今天，只作滑块初始位置。利润(x) = 基数 + Σ 系数 × (x − anchor)。
 *  anchor 为 null 表示凭据缺这个值：该变量不可拖，也不计入利润。 */
export interface SensitivityVariable {
  id: string; name: string; unit: string; current: number; anchor: number | null; anchorLabel: string;
  coef: number; min: number; max: number; step: number; sourceLabel?: string;
}
export interface SensitivityTier { name: string; values: Record<string, number>; profit?: number; eps?: number }
/** 主价格走到这个值，五档判断会变成 `grade`；`invalid` 为超出变量合理区间的数学根，不展示。 */
export interface PriceFlip { id: string; value: number; grade?: string; invalid?: boolean; /** Backend 的边界名（如 `neutral_plus_10_pct`），页面据此推出跨过后的档位。 */ boundary?: string }
export interface SensitivityModel {
  model?: string; baseProfit: number; baseLabel?: string; profitAtCurrent?: number; shares: number; variables: SensitivityVariable[];
  ruleOfThumb: { id: string; delta: number; profitDelta: number }[];
  tiers: SensitivityTier[]; implied?: { id: string; value: number; multiple?: number; /** Backend 标明隐含值是否落在变量的合理区间；老凭据没有这两项。 */ withinRange?: boolean; range?: [number, number] }; /** 主价格的跳档价（Backend `extra.flips`，没有就为空）。 */ flips: PriceFlip[]; assumptions?: string;
}
/** 读回的 sensitivity 凭据；形态不完整时返回 null，页面用单季柱图兜底。 */
export function parseSensitivity(raw: unknown): SensitivityModel | null {
  const extra = calculationExtra(raw);
  if (!extra) return null;
  const baseProfit = num(extra.base_profit), shares = num(extra.shares);
  if (baseProfit == null || shares == null || shares <= 0 || !Array.isArray(extra.variables)) return null;
  const variables: SensitivityVariable[] = [];
  for (const item of extra.variables) {
    const row = record(item);
    const range = Array.isArray(row?.range) ? row.range : [];
    const current = num(row?.current), coef = num(row?.coef_per_unit), min = num(range[0]), max = num(range[1]);
    if (!row || typeof row.var_id !== 'string' || current == null || coef == null || min == null || max == null || !(max > min)) continue;
    variables.push({
      id: row.var_id, name: String(row.name ?? '').trim() || '价格', unit: String(row.unit ?? '').trim(),
      current, coef, min, max, step: num(row.step) ?? (max - min) / 100,
      anchor: num(row.anchor) ?? num(record(row.anchor)?.value),
      anchorLabel: typeof row.anchor_label === 'string' && row.anchor_label.trim() ? row.anchor_label.trim().replace(/基数期/g, '对比期') : '对比期均价',
      sourceLabel: typeof row.source_label === 'string' ? row.source_label : undefined,
    });
  }
  if (!variables.length) return null;
  const ruleOfThumb = (Array.isArray(extra.rule_of_thumb) ? extra.rule_of_thumb : []).flatMap(item => {
    const row = record(item);
    const delta = num(row?.delta), profitDelta = num(row?.profit_delta);
    return row && typeof row.var_id === 'string' && delta != null && profitDelta != null ? [{ id: row.var_id, delta, profitDelta }] : [];
  });
  const tiers = (Array.isArray(extra.scenarios) ? extra.scenarios : []).flatMap(item => {
    const row = record(item), values = record(row?.values);
    if (!row || !values || typeof row.name !== 'string') return [];
    const parsed: Record<string, number> = {};
    for (const [key, value] of Object.entries(values)) { const n = num(value); if (n != null) parsed[key] = n; }
    return [{ name: row.name, values: parsed, profit: num(row.profit) ?? undefined, eps: num(row.eps) ?? undefined }];
  });
  const impliedRow = record(extra.implied);
  const impliedValue = num(impliedRow?.value);
  return {
    model: typeof extra.model === 'string' ? extra.model : undefined, baseProfit, baseLabel: typeof extra.base_label === 'string' ? extra.base_label : undefined,
    profitAtCurrent: num(extra.profit_at_current) ?? undefined, shares, variables, ruleOfThumb, tiers,
    implied: impliedRow && typeof impliedRow.var_id === 'string' && impliedValue != null
      ? { id: impliedRow.var_id, value: impliedValue, multiple: num(impliedRow.multiple) ?? undefined,
        ...(typeof impliedRow.within_range === 'boolean' ? { withinRange: impliedRow.within_range } : {}),
        ...(Array.isArray(impliedRow.range) && num(impliedRow.range[0]) != null && num(impliedRow.range[1]) != null ? { range: [num(impliedRow.range[0])!, num(impliedRow.range[1])!] as [number, number] } : {}) } : undefined,
    flips: parseFlips(extra.flips),
    assumptions: typeof extra.assumptions === 'string' ? extra.assumptions : undefined,
  };
}
/** `extra.flips`：[{ var_id, value, boundary, valid, grade?（or to_grade / result_grade） }]；认不出的行丢掉。 */
function parseFlips(raw: unknown): PriceFlip[] {
  return (Array.isArray(raw) ? raw : []).flatMap(item => {
    const row = record(item);
    const value = num(row?.value);
    if (!row || typeof row.var_id !== 'string' || value == null) return [];
    const grade = [row.grade, row.to_grade, row.result_grade].find(entry => typeof entry === 'string' && entry.trim()) as string | undefined;
    return [{ id: row.var_id, value, grade: grade?.trim(), invalid: row.invalid === true || row.valid === false, ...(typeof row.boundary === 'string' ? { boundary: row.boundary } : {}) }];
  });
}
export type SliderValues = Record<string, number>;
export const initialSliderValues = (model: SensitivityModel): SliderValues => Object.fromEntries(model.variables.map(item => [item.id, item.current]));
/** 每个变量的利润贡献：系数 × (取值 − 对比期均价)；缺 anchor 的变量不可拖，贡献为 0 并由界面标出缺口。 */
export function contributions(model: SensitivityModel, values: SliderValues) {
  return model.variables.map(item => ({ variable: item, profit: item.anchor == null ? 0 : item.coef * ((values[item.id] ?? item.current) - item.anchor) }));
}
export function profitAt(model: SensitivityModel, values: SliderValues) {
  return model.baseProfit + contributions(model, values).reduce((sum, item) => sum + item.profit, 0);
}
export const epsAt = (model: SensitivityModel, profit: number) => profit / model.shares;
/** 现价对应的市盈率；每股收益非正时不给倍数。 */
export function impliedPe(price: number | null | undefined, eps: number) {
  return price != null && price > 0 && eps > 0 ? price / eps : null;
}
export function sliderUnitText(variable: SensitivityVariable, value: number) {
  const digits = variable.step < 1 ? 2 : 0;
  return tightPercent(`${plainNumber(value, digits)} ${variable.unit}`.trim());
}
export function ruleOfThumbText(model: SensitivityModel, variable: SensitivityVariable) {
  const rule = model.ruleOfThumb.find(item => item.id === variable.id);
  if (!rule) return '';
  const sign = rule.profitDelta >= 0 ? '+' : '-';
  return tightPercent(`每 ${rule.delta >= 0 ? '+' : '-'}${plainNumber(Math.abs(rule.delta))} ${variable.unit}，净利润 ${sign}${yiText(Math.abs(rule.profitDelta))}`);
}
export function variableOf(model: SensitivityModel, id: string) {
  return model.variables.find(item => item.id === id);
}

// ---------------------------------------------------------------- 柱图兜底、去向条

export interface QuarterBar { period: string; revenue?: number; profit?: number }
const QUARTER = /^lens:single_quarters\.(\d{4}Q[1-4])\.(revenue|net_profit_attributable)$/;
/** 无敏感性模型时：数据包里已有的单季营收与归母净利，取最近四个有值的季度。 */
export function quarterSeries(packet: DataPacket | undefined): QuarterBar[] {
  const rows = new Map<string, QuarterBar>();
  const lens = packet?.lenses?.single_quarters;
  for (const item of Array.isArray(lens) ? lens : []) {
    const field = item as PacketField;
    const match = QUARTER.exec(field.field_id ?? '');
    const value = num(field.value);
    if (!match || value == null || (field.status !== 'verified' && field.status !== 'sourced')) continue;
    const bar = rows.get(match[1]!) ?? { period: match[1]! };
    if (match[2] === 'revenue') bar.revenue = value; else bar.profit = value;
    rows.set(match[1]!, bar);
  }
  return [...rows.values()].filter(bar => bar.revenue != null || bar.profit != null).sort((a, b) => a.period.localeCompare(b.period)).slice(-4);
}
export const quarterLabel = (period: string) => `${period.slice(0, 4)} 年第${'一二三四'[Number(period.slice(-1)) - 1]}季度`;

export interface FlowItem { key: string; label: string; field?: PacketField; value: number | null; estimated?: boolean }
/** 去向条：经营现金流 → 资本开支 → 分红 → 剩余，已有项照画，缺项为空值。 */
export function flowItems(packet: DataPacket | undefined): FlowItem[] {
  const spec: [string, string][] = [['operating_cash_flow', '经营现金流'], ['capex_cash', '资本开支'], ['dividend_paid', '现金分红'], ['residual_cash', '剩余现金']];
  const items: FlowItem[] = spec.map(([key, label]) => {
    // 剩余现金缺口时用「资本开支后现金」镜头（未扣分红）。
    const lens = key === 'residual_cash' && numericValue(packet?.fields?.[key]) == null ? findField(packet, 'lens:cash_after_capex.cash_after_capex') : undefined;
    const field = lens ?? packet?.fields?.[key];
    const value = field && (field.status === 'verified' || field.status === 'sourced') ? num(field.value) : null;
    return { key, label: lens && value != null ? '剩余（未扣分红）' : label, field, value: value != null && value >= 0 ? value : null };
  });
  // 有每股分红但缺现金分红总额：用「每股分红 × 总股本」估算，标明估算；两者都缺才写暂缺。
  const dividend = items.find(item => item.key === 'dividend_paid')!;
  const perShare = numericValue(packet?.fields?.dividend_per_share);
  const shares = numericValue(packet?.fields?.shares);
  if (dividend.value == null && perShare != null && perShare > 0 && shares != null && shares > 0) {
    dividend.value = perShare * shares;
    dividend.label = '现金分红（按每股分红估算）';
    dividend.field = packet?.fields?.dividend_per_share;
    dividend.estimated = true;
    // 分红有了数，剩余现金也按同一口径接着算，去向条首尾才对得上。
    const operating = items[0]!.value, capex = items[1]!.value, residual = items[3]!;
    if (operating != null && capex != null && (residual.field?.field_id !== 'residual_cash' || residual.value == null)) {
      residual.value = Math.max(0, operating - capex - dividend.value);
      residual.label = '剩余现金（按每股分红估算）';
      residual.estimated = true;
    }
  }
  return items;
}

// ---------------------------------------------------------------- 跟踪卡

/** 跟踪卡内部状态，不直接显示：正常不出标签，打破与不成立只用下面 TRACKING_TEXT 的白话句。 */
export type TrackingState = 'ok' | 'crossed' | 'failed';
const plainLevel = (text: string) => text.replace(/^同比\s*/, '').replace(/(\d+\.\d*?)0+(?=\D|$)/g, '$1').replace(/\.(?=\D|$)/g, '').replace(/\s+%/g, '%');
const sideOf = (threshold: PacketThreshold | null | undefined) => threshold?.direction === 'down' ? '低于' : '高于';
/** 观察期结束的说法：「年报已出」「三季报已出」；只给了日期时说「观察期已过」。 */
function windowDoneText(window: string | undefined) {
  const text = String(window ?? '');
  if (/三季|第三季/.test(text)) return '三季报已出';
  if (/半年|中报/.test(text)) return '半年报已出';
  if (/一季|第一季/.test(text)) return '一季报已出';
  if (/年报|年度|FY/i.test(text)) return '年报已出';
  return '观察期已过';
}
/** 跟踪卡白话文案集中在这一处，改文案只改这里；不用「警戒线」等行话。 */
export const TRACKING_TEXT = {
  /** 这条判断靠什么成立：「保持在 55% 以上」；研究没写方向时只列「关键值」。 */
  holds: (threshold: PacketThreshold | null | undefined) => {
    const text = thresholdText(threshold);
    if (!text) return '';
    if (threshold?.direction !== 'down' && threshold?.direction !== 'up') return `关键值 ${plainLevel(text)}`;
    return `保持在 ${plainLevel(text)} ${threshold.direction === 'down' ? '以上' : '以下'}`;
  },
  /** 条件被打破、对应期报告未出。 */
  broken: (args: { title: string; value: string; threshold?: PacketThreshold | null }) =>
    `${args.title}${args.threshold?.direction === 'down' ? '降到' : '升到'} ${plainLevel(args.value)}，${sideOf(args.threshold)} ${plainLevel(thresholdText(args.threshold))}，这条判断可能不成立了`,
  /** 对应期报告已出仍不满足。 */
  failed: (args: { title: string; window?: string; threshold?: PacketThreshold | null }) =>
    `${windowDoneText(args.window)}，${args.title}仍${sideOf(args.threshold)} ${plainLevel(thresholdText(args.threshold))}，这条判断不成立`,
};
/** 越线时数值下的一句白话；正常或取不到当前值时为空。 */
export function trackingNote(args: { state: TrackingState | null; title: string; value: string; threshold?: PacketThreshold | null; window?: string }) {
  if (args.state === 'crossed') return TRACKING_TEXT.broken(args);
  if (args.state === 'failed') return TRACKING_TEXT.failed(args);
  return '';
}
/** 观察窗口是否已过。ISO 日期按日；「FY2026 年报」「2026 年三季报」按披露截止；「下一期」类视为未到。 */
export function windowPassed(window: string | undefined, now: Date): boolean {
  const text = String(window ?? '');
  const iso = /(\d{4})-(\d{2})-(\d{2})/.exec(text);
  const end = (year: number, month: number, day: number) => new Date(Date.UTC(year, month - 1, day, 15, 59, 59));
  if (iso) return now.getTime() > end(Number(iso[1]), Number(iso[2]), Number(iso[3])).getTime();
  const year = /(\d{4})/.exec(text);
  if (!year) return false;
  const y = Number(year[1]);
  if (/三季|第三季/.test(text)) return now.getTime() > end(y, 10, 31).getTime();
  if (/半年|中报/.test(text)) return now.getTime() > end(y, 8, 31).getTime();
  if (/一季|第一季/.test(text)) return now.getTime() > end(y, 4, 30).getTime();
  if (/年报|年度|FY/i.test(text)) return now.getTime() > end(y + 1, 4, 30).getTime();
  return false;
}
/** 状态由页面按当前值与阈值的 direction 判断；当前值取不到或没有 direction 时返回 null（卡片不显示任何状态）。
 *  同比类阈值的当前值取自年内累计同比镜头。 */
export function trackingState(args: { current: number | null; threshold?: PacketThreshold | null; window?: string; now?: Date }): TrackingState | null {
  const { current, threshold } = args;
  const line = num(threshold?.value);
  if (current == null || line == null || !threshold || (threshold.direction !== 'down' && threshold.direction !== 'up')) return null;
  const crossed = threshold.direction === 'down' ? current < line : current > line;
  if (!crossed) return 'ok';
  return windowPassed(args.window, args.now ?? new Date()) ? 'failed' : 'crossed';
}
/** 同比类警戒线的当前值：数据包的年内累计同比镜头（收入、归母净利）。 */
export function yoyField(packet: DataPacket | undefined, fieldId: string | undefined): PacketField | undefined {
  if (!packet || !fieldId || !['revenue', 'net_profit_attributable'].includes(fieldId)) return undefined;
  return findField(packet, `lens:ytd_yoy.${fieldId}`);
}
export function numericValue(field: PacketField | undefined) {
  return field && (field.status === 'verified' || field.status === 'sourced') ? num(field.value) : null;
}
/** 第一层关键数：最多三个，期间与口径收进悬停；页面与问助手快照共用这一个选法。 */
export const KEY_LIMIT = 3;
export function keyIdsOf(packet: DataPacket | undefined, ids: readonly string[]) {
  return ids.filter(id => numericValue(findField(packet, id)) != null).slice(0, KEY_LIMIT);
}

// ---------------------------------------------------------------- 页首判断变化行

export interface ConversationSource { at?: string; sessionId?: string; reason?: string }
export interface ChangeLine { text: string; /** 多处变化时的明细，放悬停提示。 */ detail?: string; conversation?: ConversationSource; revertable: boolean }
const SECTION_NAME: Record<string, string> = { thesis: '论点', business: '生意', profit_formula: '价格影响', variables: '价格影响', cash: '现金', valuation: '估值', tracking: '跟踪' };
const dateOf = (value?: string) => (value ?? '').slice(0, 10);
const shortDate = (value?: string) => dateOf(value).slice(5);
/** 跨年或非今年带年份：2027 年 4 月 30 日；今年只写 10 月 30 日。 */
export function reportDateText(iso: string, today: string): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) return iso;
  const month = Number(iso.slice(5, 7)), day = Number(iso.slice(8, 10));
  const body = `${month} 月 ${day} 日`;
  return iso.slice(0, 4) === today.slice(0, 4) ? body : `${iso.slice(0, 4)} 年 ${body}`;
}
/** 研究说明里的内部说法换成用户能懂的话。 */
export const plainChangeText = (text: string) => text.trim()
  .replace(/行情目录变量/g, '价格数据').replace(/三档情景/g, '悲观、中性、乐观三种情况').replace(/口径/g, '算法');
/** extras 来自研究读口的顶层：changedFrom（最近一次对话写回的来源）与 canRevert（有上一版可恢复）。 */
export function changeLine(research: CompanyPageResearch | null, extras: { changedFrom?: CompanyPageResearch['changedFrom']; canRevert?: boolean } = {}): ChangeLine | null {
  if (!research || research.gapNote || !research.researchedAt) return null;
  const drivers = research.sensitivity?.drivers ?? [];
  const talked = drivers.find(item => item.origin === 'conversation');
  const changed = extras.changedFrom ?? research.changedFrom;
  const conversation: ConversationSource | undefined = changed
    ? { at: changed.at ?? changed.confirmedAt, sessionId: changed.sessionId, reason: changed.reason }
    : talked ? { at: talked.confirmedAt, sessionId: talked.sessionId } : undefined;
  const revertable = extras.canRevert ?? Boolean(conversation);
  const changes = Object.entries(research.changes ?? {}).filter(([, text]) => typeof text === 'string' && text.trim());
  // 来自对话的调整写「因 10-26 对话调整」，其余写保存日。
  const prefix = conversation ? `因${conversation.at ? ` ${shortDate(conversation.at)} ` : ''}对话调整：` : `${shortDate(research.researchedAt)} 更新：`;
  if (changes.length) {
    const seen = new Set<string>();
    const parts = changes.flatMap(([key, text]) => {
      const plain = plainChangeText(String(text));
      const item = `${SECTION_NAME[key] ?? '研究'}：${plain}`;
      if (seen.has(item)) return [];
      seen.add(item);
      return [{ plain, item }];
    });
    if (parts.length === 1) return { text: `${prefix}${parts[0]!.plain}`, conversation, revertable };
    return { text: `${prefix}${parts.length} 处判断有变化`, detail: parts.map(part => part.item).join('\n'), conversation, revertable };
  }
  return { text: conversation ? prefix.replace(/：$/, '') : `${prefix}判断没变`, conversation, revertable };
}
/** 「来自 10-26 的对话」：个股页里来自对话的取值、论点、支柱旁的灰字。 */
export const conversationOrigin = (at?: string) => `来自${at ? ` ${shortDate(at)} 的` : ''}对话`;
export function conversationHint(conversation: ConversationSource | undefined) {
  if (!conversation) return '';
  return ['来自对话确认', conversation.at ? dateOf(conversation.at) : '', conversation.sessionId ? `会话 ${conversation.sessionId}` : '', conversation.reason].filter(Boolean).join(' · ');
}

// ---------------------------------------------------------------- 节标题右侧的口径标签

const GRADE_NAMES = ['明显低估', '偏低', '合理', '偏高', '明显高估'] as const;
export const GRADES = GRADE_NAMES;
/** 五档判断一律写完整句：「估值偏高」，不只写半句「偏高」。研究里没有的档名原样显示。 */
export function gradeLabel(grade: string | null | undefined): string {
  const name = String(grade ?? '').trim();
  return (GRADE_NAMES as readonly string[]).includes(name) ? `估值${name}` : name;
}
/** 估值之前的小节标题：用前两个影响因素名，取不到时写「价格」。 */
export function variablesQuestion(names: readonly string[] | undefined): string {
  const lead = (names ?? []).map(item => item.trim()).filter(Boolean).slice(0, 2);
  return `${lead.length ? lead.join('、') : '价格'}动一下，利润变多少`;
}
export const COMPANY_TYPE_NAME: Record<string, string> = {
  generic: '通用', commodity_cycle: '商品周期', leveraged_cyclical_utility: '高杠杆周期公用事业', scarce_asset_rent: '稀缺资产收租', bank: '银行',
};
/** 同业中位数（Backend 给出）；没有就不显示。 */
export function peerMedian(packet: DataPacket | undefined, metric: 'pe' | 'pb') {
  const field = findField(packet, `lens:peer_comparison.${metric}`);
  const median = num(field?.median);
  return median != null && field?.status !== 'gap' ? median : null;
}

/** 同一句原话只出现一次：把引用同一句的因素名并到这句前面。 */
export function groupQuotes(quotes: readonly { name: string; quote: string }[]): { quote: string; names: string[] }[] {
  const groups: { quote: string; names: string[] }[] = [];
  for (const item of quotes) {
    const group = groups.find(entry => entry.quote === item.quote);
    if (group) { if (!group.names.includes(item.name)) group.names.push(item.name); } else groups.push({ quote: item.quote, names: [item.name] });
  }
  return groups;
}

// ---------------------------------------------------------------- 页首：完整判断与市场在赌的价格

/** 主价格距最近的有效跳档价不超过这个比例时，才在页首提一句跳档。 */
export const FLIP_NEAR = 0.03;
/** 页首用的价格写法：百分比类变量保留一位小数，四舍五入成零写 0，百分号紧跟数字。 */
function headlinePrice(variable: SensitivityVariable, value: number) {
  const digits = variable.step < 1 ? 2 : variable.unit.includes('%') ? 1 : 0;
  const shown = plainNumber(value, digits);
  const text = Number(shown.replace(/,/g, '')) === 0 ? '0' : shown;
  return tightPercent(`${text} ${variable.unit}`.trim());
}
/** Backend 跳档边界两侧的档位：[利润变小的一侧, 利润变大的一侧]；利润变大时同一现价显得更便宜，往低档走。 */
const BOUNDARY_GRADES: Record<string, readonly [string, string]> = {
  pessimistic_equal_spot: ['偏低', '明显低估'], neutral_minus_10_pct: ['合理', '偏低'],
  neutral_plus_10_pct: ['偏高', '合理'], optimistic_equal_spot: ['明显高估', '偏高'],
};
/** 价格从现在走到这个跳档价后，判断落在哪一档；边界认不出、系数为零或推出的档位就是现在这档时返回 undefined。 */
export function flipGrade(flip: PriceFlip, variable: SensitivityVariable, currentGrade?: string | null): string | undefined {
  const sides = flip.boundary ? BOUNDARY_GRADES[flip.boundary] : undefined;
  const profitSign = Math.sign(variable.coef) * Math.sign(flip.value - variable.current);
  if (!sides || profitSign === 0) return undefined;
  const grade = sides[profitSign > 0 ? 1 : 0];
  return grade === String(currentGrade ?? '').trim() ? undefined : grade;
}
/** 页首「现在」用的变量最新价：盘中有报价用盘中，否则最近收盘；`when` 是已排好的时点文字（如「10-23 收盘」「10-26 14:05 盘中」）。 */
export interface LivePrice { value: number; when: string }
export interface VerdictLine { label: string; implied: string; flip: string; gap: string }
/** 页首第二行：「估值偏高：按现在的股价，大致对应沪铝约 23,258 元/吨（现在 22,970 元/吨）」。隐含价缺失时 implied 为空、gap 写原因（进「查看数据」）。 */
export function verdictLine(args: { grade?: string | null; model?: SensitivityModel | null; live?: LivePrice | null }): VerdictLine {
  const label = gradeLabel(args.grade);
  const model = args.model;
  const implied = model?.implied;
  const found = model && implied ? variableOf(model, implied.id) : undefined;
  if (!model || !implied || !found) {
    return { label, implied: '', flip: '', gap: model ? '利润试算凭据里没有大致对应的价格，页首只写判断。' : '没有利润试算凭据，页首只写判断。' };
  }
  // 「现在」取变量最新价（Q1）；取不到才退回研究时的默认值并写「研究时」。比较「跌破 / 涨过」也以同一个现在为准。
  const percent = found.unit.includes('%');
  const live = percent ? null : args.live ?? null;
  const variable = live ? { ...found, current: live.value } : found;
  const nowText = live ? `现在 ${headlinePrice(variable, live.value)}，${live.when}` : `研究时 ${headlinePrice(variable, variable.current)}`;
  // 百分比变量的取值是相对对比期的变动（0 就是与对比期一样），不是价格：不写「约 x，现在 0」，改写比对比期高 / 低多少。
  const points = Math.round(Math.abs(implied.value) * 10) / 10;
  // 越界：Backend 照给反解值但标 within_range 为假；按现价说清楚市场隐含的数在近年区间之外，不再不显示。
  const outside = implied.withinRange === false
    ? (implied.range ? (implied.value < implied.range[0] ? '低于' : '高于') : '超出') : '';
  const shown = percent
    ? (points < 0.05 ? `${variable.name}与对比期持平` : `${variable.name}比对比期${implied.value > 0 ? '高' : '低'}约 ${plainNumber(points, 1)}%`)
    : `${variable.name}约 ${headlinePrice(variable, implied.value)}`;
  const text = outside
    ? `按现价，市场隐含的${shown}，${outside}近年区间`
    : percent ? `按现在的股价，大致对应${shown}` : `按现在的股价，大致对应 ${shown}（${nowText}）`;
  // 百分比变量的「接近」按百分点算：3 个点内（价格是 3%）。
  const near = model.flips.filter(item => item.id === variable.id && !item.invalid && (percent || variable.current !== 0))
    .map(item => ({ item, distance: percent ? Math.abs(item.value - variable.current) / 100 : Math.abs(item.value - variable.current) / Math.abs(variable.current) }))
    .filter(entry => entry.distance <= FLIP_NEAR).sort((a, b) => a.distance - b.distance)[0]?.item;
  const to = near ? near.grade ?? flipGrade(near, variable, args.grade) : undefined;
  const verdict = `判断${to ? `变为${gradeLabel(to)}` : '会改变'}`;
  const flip = !near ? '' : percent
    ? `${variable.name}再${near.value >= variable.current ? '升' : '降'} ${plainNumber(Math.round(Math.abs(near.value - variable.current) * 10) / 10, 1)}%，${verdict}`
    : `${near.value < variable.current ? '跌破' : '涨过'} ${headlinePrice(variable, near.value)}，${verdict}`;
  return { label, implied: text, flip, gap: '' };
}

// ---------------------------------------------------------------- 它靠什么赚钱：各业务毛利

export interface SegmentRow { name: string; revenue: number; cost: number | null; gross: number | null; revenueId: string; costId: string }
const EXCLUDED_SEGMENT = /其他|抵消|内部|合并调整/;
export interface SegmentSummary {
  /** gross：按毛利排序；revenue：一家都没有分部成本，只列收入。 */
  mode: 'gross' | 'revenue' | 'none'; period?: string | null; shown: SegmentRow[]; /** 不上第一层、只在「查看数据」里列出的分部：其他 / 抵消 / 内部 / 合并调整，或毛利为负且收入占比不到 5%。 */ excluded: SegmentRow[]; /** 有收入但缺成本的业务名。 */ costGaps: string[];
}
const SEGMENT_ID = /^segment:(annual:)?product:(.+)\.(revenue|cost)$/;
/** 数据包里的分部收入与成本（单位元）。最新一期优先，没有就用年度；毛利 = 分部收入 − 分部成本，最多三项；缺成本的业务不进毛利排序。 */
export function segmentGross(packet: DataPacket | undefined): SegmentSummary {
  const groups = new Map<boolean, Map<string, Partial<Record<'revenue' | 'cost', { value: number; id: string; period?: string | null }>>>>();
  for (const field of Object.values(packet?.fields ?? {})) {
    const id = field.field_id ?? '';
    const match = SEGMENT_ID.exec(id);
    const value = numericValue(field);
    if (!match || value == null) continue;
    const annual = Boolean(match[1]);
    const group = groups.get(annual) ?? new Map();
    group.set(match[2]!, { ...group.get(match[2]!), [match[3]!]: { value, id, period: field.period } });
    groups.set(annual, group);
  }
  const pick = [...(groups.get(false) ?? [])].some(([, row]) => row.revenue) ? groups.get(false)! : groups.get(true);
  const rows: SegmentRow[] = [...(pick ?? [])].flatMap(([name, row]) => row.revenue ? [{
    name, revenue: row.revenue.value, cost: row.cost?.value ?? null, gross: row.cost ? row.revenue.value - row.cost.value : null,
    revenueId: row.revenue.id, costId: row.cost?.id ?? row.revenue.id.replace(/\.revenue$/, '.cost'),
  }] : []);
  const total = rows.reduce((sum, row) => sum + Math.max(0, row.revenue), 0);
  const isExcluded = (row: SegmentRow) => EXCLUDED_SEGMENT.test(row.name) || (row.gross != null && row.gross < 0 && total > 0 && row.revenue / total < 0.05);
  const excluded = rows.filter(isExcluded);
  if (!rows.length || excluded.length === rows.length) return { mode: 'none', shown: [], costGaps: [], excluded };
  const kept = rows.filter(row => !isExcluded(row));
  const costed = kept.filter(row => row.gross != null).sort((a, b) => b.gross! - a.gross!);
  const period = (pick ? [...pick.values()].map(row => row.revenue?.period).find(Boolean) : undefined) ?? null;
  const costGaps = kept.filter(row => row.gross == null).map(row => row.name);
  if (costed.length) return { mode: 'gross', period, shown: costed.slice(0, KEY_LIMIT), costGaps, excluded };
  return { mode: 'revenue', period, shown: [...kept].sort((a, b) => b.revenue - a.revenue).slice(0, KEY_LIMIT), costGaps, excluded };
}
/** 一行业务在第一层的名称与数：毛利，或（没有成本时）收入；悬停放收入与成本。 */
export function segmentLine(row: SegmentRow, mode: SegmentSummary['mode']) {
  const gross = mode === 'gross' && row.gross != null;
  return {
    label: `${row.name}${gross ? '毛利' : '收入'}`, value: yiText(gross ? row.gross! : row.revenue),
    title: [`收入 ${yiText(row.revenue)}`, row.cost != null ? `成本 ${yiText(row.cost)}` : ''].filter(Boolean).join(' · '),
  };
}
/** 「查看数据」里的缺口说明；没有缺口为空。 */
export function segmentGapText(summary: SegmentSummary) {
  if (summary.mode === 'revenue') return '没有拿到各业务的成本，只能列各业务收入，算不出各业务毛利。';
  return summary.costGaps.length ? `${summary.costGaps.join('、')}的分部成本暂缺，没有算毛利。` : '';
}

// ---------------------------------------------------------------- 接下来盯什么

export interface WatchItem { id: string; title: string; value: string; sub: string; note: string; hint?: string }
const REPORT_DEADLINES = [['一季报', 1, '04-30'], ['半年报', 2, '08-31'], ['三季报', 3, '10-31'], ['年报', 4, '04-30']] as const;
/** 报告期的先后：2026Q3 → 20263，FY2025 → 20254，2026H1 → 20262；认不出返回 null。 */
function reportRank(period: string | null | undefined): number | null {
  const text = String(period ?? '').replace(/^TTM:/, '');
  const fiscal = /^FY(\d{4})$/.exec(text);
  if (fiscal) return Number(fiscal[1]) * 10 + 4;
  const quarter = /^(\d{4})(?:YTD)?(Q[1-4]|H1)$/.exec(text);
  if (!quarter) return null;
  return Number(quarter[1]) * 10 + (quarter[2] === 'H1' ? 2 : Number(quarter[2]!.slice(1)));
}
export interface CalendarReport { period: string; name?: string; first_appoint?: string | null; appoint?: string | null; actual?: string | null }
/** Backend `/market/report-calendar` 的一家公司：sourced 带各报告期的预约日与实际日，gap 是取不到。 */
export interface ReportCalendar { status: 'sourced' | 'gap'; fetched_at?: string; reports: CalendarReport[] }
/** 读回的日历；形态不对按缺口处理，页面退回法定截止日。 */
export function parseReportCalendar(raw: unknown, symbol: string): ReportCalendar {
  const item = (Array.isArray(record(raw)?.items) ? record(raw)!.items as unknown[] : []).map(record).find(row => row?.symbol === symbol);
  const day = (value: unknown) => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : null;
  const reports = (Array.isArray(item?.reports) ? item!.reports as unknown[] : []).flatMap(entry => {
    const row = record(entry), period = day(row?.period);
    return row && period ? [{ period, appoint: day(row.appoint), first_appoint: day(row.first_appoint), actual: day(row.actual) }] : [];
  }).sort((a, b) => b.period.localeCompare(a.period));
  return item?.status === 'sourced' && reports.length ? { status: 'sourced', fetched_at: typeof item.fetched_at === 'string' ? item.fetched_at : undefined, reports } : { status: 'gap', reports: [] };
}
/** 报告期末日 → 序号与名称：2026-09-30 → 20263 三季报；年报带年份，免得跨年读混。 */
function periodInfo(period: string) {
  const month = Number(period.slice(5, 7)), year = Number(period.slice(0, 4));
  const quarter = month === 3 ? 1 : month === 6 ? 2 : month === 9 ? 3 : month === 12 ? 4 : 0;
  return quarter ? { rank: year * 10 + quarter, name: quarter === 4 ? `${year} 年报` : REPORT_DEADLINES[quarter - 1]![0] } : null;
}
const latestReported = (packet: DataPacket | undefined) => Math.max(0, ...['revenue', 'net_profit_attributable'].map(key => reportRank(packet?.fields?.[key]?.period) ?? 0));
/** 研究过期时页首的一句灰字：新报告已披露写资料名，取不到写「有新资料」。 */
export const newMaterialText = (next: { name: string; disclosed: boolean } | null) => next?.disclosed ? `有新资料（${next.name}）` : '有新资料';
export interface NextReport { name: string; day: string; text: string; /** 已披露：数据包还没用上这份新报告。 */ disclosed: boolean; /** 悬停补充；预约日取不到时写明。 */ hint: string }
/** 下一次报告。有日历：未披露写预约日，已披露（数据包还没用上）写实际日并提示重新研究；没有日历或缺口：按法定披露截止日
 *  （一季报 4-30、半年报 8-31、三季报 10-31、年报次年 4-30），悬停写「预约日暂缺」。数据包里已有的最新报告期之前的不再算。 */
export function nextReport(packet: DataPacket | undefined, now = new Date(), calendar?: ReportCalendar | null): NextReport | null {
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Shanghai', year: 'numeric', month: '2-digit', day: '2-digit' }).format(now);
  const reported = latestReported(packet);
  for (const report of calendar?.status === 'sourced' ? calendar.reports : []) {
    const info = periodInfo(report.period);
    if (!info || info.rank <= reported) break;
    if (report.actual) {
      const day = reportDateText(report.actual, today);
      return { name: info.name, day, disclosed: true, hint: '披露日来自东方财富', text: `${info.name}已于 ${day} 披露，重新研究可用新报告校准` };
    }
    if (report.appoint) {
      const day = reportDateText(report.appoint, today);
      return { name: info.name, day, disclosed: false, hint: '预约日来自东方财富，公司可能临时调整', text: `${info.name}预约 ${day} 披露` };
    }
  }
  const year = Number(today.slice(0, 4));
  for (let y = year - 1; y <= year + 1; y++) {
    for (const [name, quarter, day] of REPORT_DEADLINES) {
      const deadline = `${quarter === 4 ? y + 1 : y}-${day}`;
      if (deadline >= today && y * 10 + quarter > reported) {
        const label = quarter === 4 ? `${y} 年报` : name;
        const day = reportDateText(deadline, today);
        return { name: label, day, disclosed: false, hint: '预约日暂缺，按法定披露截止日', text: `${label}最晚 ${day} 披露` };
      }
    }
  }
  return null;
}
/** 盯什么：先列利润模型里的价格（现价、比对比期均价高低多少、对利润的影响、每动一档的利润），没有价格模型时列行业驱动项的当前值；最后一张是下一次报告。
 *  不拿毛利率、净利同比、市盈率这类结果指标当盯的项。 */
export function watchItems(args: { model?: SensitivityModel | null; packet?: DataPacket; now?: Date; calendar?: ReportCalendar | null; drivers?: DriverSet | null }): WatchItem[] {
  const { model, packet } = args;
  const items: WatchItem[] = [];
  for (const variable of (model?.variables ?? []).slice(0, KEY_LIMIT)) {
    const percent = variable.unit.includes('%');
    const here = percent ? '当前' : '现价';
    const value = sliderUnitText(variable, variable.current);
    if (variable.anchor == null && !percent) {
      items.push({ id: variable.id, title: variable.name, value, sub: `${variable.anchorLabel}暂缺`, note: `${variable.name}的${variable.anchorLabel}暂缺，算不出它对利润的影响` });
      continue;
    }
    // 百分比变量的取值本身就是相对对比期的变动（0 = 与对比期一样）：写持平或高 / 低多少，不写「0 %」。
    const diff = variable.current - (variable.anchor ?? 0);
    const profit = variable.coef * diff;
    const digits = variable.step < 1 ? 2 : 0;
    const impact = profit === 0 ? '' : `，年化净利润${profit > 0 ? '多' : '少'}约 ${yiText(Math.abs(profit))}`;
    const rule = ruleOfThumbText(model!, variable);
    if (percent) {
      const size = `${plainNumber(Math.round(Math.abs(diff) * 10) / 10, 1)}%`;
      items.push({ id: variable.id, title: variable.name, value: diff === 0 ? '持平' : `${diff > 0 ? '高' : '低'} ${size}`, sub: diff === 0 ? '与对比期' : '比对比期',
        note: `${variable.name}${diff === 0 ? '与对比期持平' : `比对比期${diff > 0 ? '高' : '低'} ${size}`}${impact}${rule ? `；${rule}` : ''}` });
      continue;
    }
    const position = diff === 0 ? `${here}与${variable.anchorLabel}持平` : tightPercent(`${here}比${variable.anchorLabel}${diff > 0 ? '高' : '低'} ${plainNumber(Math.abs(diff), digits)} ${variable.unit}`.trim());
    items.push({ id: variable.id, title: variable.name, value, sub: `${variable.anchorLabel} ${sliderUnitText(variable, variable.anchor ?? 0)}`, note: `${position}${impact}${rule ? `；${rule}` : ''}` });
  }
  if (!items.length) {
    for (const [key, field] of Object.entries(packet?.industry_drivers?.fields ?? {})) {
      if (items.length >= KEY_LIMIT) break;
      if (numericValue(field) == null) continue;
      const when = periodLabel(field.period);
      items.push({ id: key, title: fieldIdLabel(field.field_id ?? key), value: showField(field), sub: when, note: `${when ? `${when}的数，` : ''}它是影响利润的行业数据，下次报告时看它有没有变` });
    }
    // 没有价格模型：数据包里有数的驱动先列，不够再补所属行业框架的驱动（只写名字与影响什么，不编数字）。
    for (const driver of driverWatch(args.drivers, items.map(item => item.title), KEY_LIMIT - items.length)) {
      items.push({ id: `driver:${driver.name}`, title: driver.name, value: '', sub: '', note: driver.note, ...(driver.hint ? { hint: driver.hint } : {}) });
    }
  }
  const report = nextReport(packet, args.now, args.calendar);
  if (report) items.push({ id: 'next-report', title: report.disclosed ? '新报告已出' : '下一次报告', value: report.day, sub: '', note: report.text, hint: report.hint });
  return items;
}

// ---------------------------------------------------------------- 估值节：三方预期对比

export interface ExpectPiece { text: string; strong?: boolean }
export interface ExpectRow { key: 'institution' | 'model' | 'market'; pieces: ExpectPiece[] }
export interface Expectation { rows: ExpectRow[]; /** 分歧一句；少于两方有数时为空。 */ difference: string; /** 「查看数据」里的来源与期间。 */ details: string[] }
const SAME = 0.05;
const eps2 = (value: number) => `${plainNumber(value, 2)} 元`;
const forecastYear = (period: string | null | undefined) => /^FY(\d{4})E?$/i.exec(String(period ?? '').trim())?.[1];

/** 三方预期：机构（研报一致预期每股收益）、模型（三档区间与档位）、股价隐含（市场在赌的价格）；只用已有字段，缺的写缺，不估。
 *  分歧一句把三方折成同一口径的每股收益再比：机构预测；模型中性价对应的预测利润 ÷ 股本；现价 ÷ 模型中性倍数。 */
export function expectations(args: {
  packet?: DataPacket; scenarios?: { mode: 'per_share' | 'total'; rows: { name: string; multiple: string; price: string; earnings?: string; period?: string }[] } | null;
  model?: SensitivityModel | null; price?: number | null; grade?: string | null; verdict: VerdictLine;
}): Expectation {
  const { packet, scenarios, model, price, verdict } = args;
  const forecast = findField(packet, 'eps_forecast');
  const instEps = numericValue(forecast);
  const count = typeof forecast?.institution_count === 'number' ? forecast.institution_count : null;
  const year = forecastYear(forecast?.period);
  const institution: ExpectRow = { key: 'institution', pieces: instEps != null && instEps > 0
    ? [{ text: `机构预期：${year ? `${year} 年` : '预测年'}每股收益 ` }, { text: eps2(instEps), strong: true }, { text: count != null ? `（${count} 家${count < 3 ? '，样本少' : ''}）` : '' }]
    : [{ text: '暂无机构预期' }] };

  const neutral = scenarios?.rows.find(row => row.name === '中性');
  const neutralPrice = num(neutral?.price);
  const grade = String(args.grade ?? '').trim();
  const modelRow: ExpectRow = { key: 'model', pieces: neutralPrice != null
    ? [{ text: '模型：中性价 ' }, { text: scenarioPriceText(neutral!.price), strong: true }, { text: grade ? `，${gradeLabel(grade)}` : '' }]
    : [{ text: '模型：暂无三档价' }] };
  const marketRow: ExpectRow = { key: 'market', pieces: verdict.implied
    ? [{ text: `股价隐含：${verdict.implied}` }] : [{ text: '股价隐含：暂无大致对应的价格' }] };

  const modelEps = (() => {
    const earnings = num(neutral?.earnings);
    if (earnings == null) return null;
    if (scenarios?.mode === 'per_share') return earnings;
    return model && model.shares > 0 ? earnings / model.shares : null;
  })();
  const multiple = num(neutral?.multiple);
  // 股价隐含行写「暂无」时，差异句也不纳入股价隐含：行与句说的是同一件事。
  const marketEps = verdict.implied && price != null && price > 0 && multiple != null && multiple > 0 ? price / multiple : null;
  const sources = ([['机构预期', instEps], ['模型中性', modelEps], ['股价隐含', marketEps]] as const)
    .flatMap(([name, value]) => value != null && Number.isFinite(value) && value > 0 ? [{ name, value }] : []);

  let difference = '';
  const rel = (a: number, b: number) => `${a >= b ? '高' : '低'} ${plainNumber(Math.abs(a - b) / b * 100, 1)}%`;
  if (sources.length >= 2) {
    const mean = sources.reduce((sum, item) => sum + item.value, 0) / sources.length;
    const spread = (Math.max(...sources.map(item => item.value)) - Math.min(...sources.map(item => item.value))) / Math.min(...sources.map(item => item.value));
    if (spread < SAME) difference = `${sources.length === 3 ? '三方' : sources.map(item => item.name).join('与')}的每股收益相差不到 5%`;
    else if (sources.length === 2) {
      const [a, b] = sources[0]!.value >= sources[1]!.value ? [sources[0]!, sources[1]!] : [sources[1]!, sources[0]!];
      difference = `${a.name}每股收益 ${eps2(a.value)}，比${b.name}（${eps2(b.value)}）${rel(a.value, b.value)}`;
    } else {
      const far = sources.map(item => ({ item, score: sources.reduce((sum, other) => sum + Math.abs(item.value - other.value), 0) / mean })).sort((x, y) => y.score - x.score)[0]!.item;
      const others = sources.filter(item => item !== far);
      difference = `${far.name}与另外两方分歧最大：每股收益 ${eps2(far.value)}，${others.map(other => `比${other.name}（${eps2(other.value)}）${rel(far.value, other.value)}`).join('，')}`;
    }
  }

  // 机构预测年与模型利润期间不同：口径不同，差异句末尾说明，不换算。
  const modelPeriod = String(neutral?.period ?? '').trim();
  if (difference && instEps != null && instEps > 0 && modelPeriod && modelPeriod.toUpperCase() !== String(forecast?.period ?? '').trim().toUpperCase()) {
    const modelSpan = /^TTM[:：]/i.test(modelPeriod) ? '近 12 个月利润' : ` ${periodLabel(modelPeriod)}利润`;
    difference += `（机构为 ${year ? `${year} 年` : ''}预测，模型按${modelSpan}，口径不同）`;
  }

  const details = [
    instEps != null && instEps > 0
      ? `机构预期：研报一致预期（中位数）${year ? `，${year} 年` : ''}每股收益 ${eps2(instEps)}${count != null ? `，${count} 家机构` : ''}；${(() => { const next = numericValue(findField(packet, 'eps_forecast_next')); return next != null ? `下一年 ${eps2(next)}；` : ''; })()}只在数据包里有数时才写，不估`
      : '机构预期：数据包里没有可用的研报一致预期',
    neutralPrice != null
      ? `模型：三档价按「每股收益 × 倍数」计算，中性倍数 ${multiple != null ? `${plainNumber(multiple, 1)} 倍` : '暂缺'}${neutral?.period ? `，利润期间 ${periodLabel(neutral.period)}` : ''}；中性每股收益 ${modelEps != null ? eps2(modelEps) : '暂缺'}`
      : '模型：这家公司没有三档价',
    marketEps != null
      ? `股价隐含：现价 ÷ 中性倍数得每股收益 ${eps2(marketEps)}，是市场按模型倍数在定价的利润水平`
      : `股价隐含：${verdict.gap || (verdict.implied ? '缺现价或中性倍数，算不出隐含的每股收益' : '暂无大致对应的价格，不纳入差异比较')}`,
  ];
  return { rows: [institution, modelRow, marketRow], difference, details };
}
