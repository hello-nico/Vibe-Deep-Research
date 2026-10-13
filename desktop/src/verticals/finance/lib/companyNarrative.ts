import { fieldIdLabel, findField, showField, thresholdText, type DataPacket, type PacketField, type PacketThreshold } from './companyPacket';
import { formatFactValue } from './wikiFacts';
import type { CompanyPageResearch } from './companyPage';

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
export function resolveSlot(token: string, packet: DataPacket | undefined, calcs: Record<string, unknown>): ResolvedSlot | null {
  const calc = parseCalcToken(token);
  if (calc) {
    const raw = calcs[calc.resultId];
    const value = raw ? pathValue(calculationExtra(raw), calc.path) ?? pathValue(calculationBody(raw), calc.path) : undefined;
    const text = formatCalcValue(calc.path, value, calculationExtra(raw));
    return text ? { text, title: '来源 计算凭据' } : null;
  }
  const field = findField(packet, token);
  if (!field || (field.status !== 'verified' && field.status !== 'sourced') || field.value == null || field.value === '') return null;
  const title = [fieldIdLabel(token), field.period, field.scope, sourceNote(field)].filter(Boolean).join(' · ');
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
    return typeof unit === 'string' && unit.trim() ? `${raw} ${unit.trim()}` : raw;
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
export interface SensitivityModel {
  model?: string; baseProfit: number; baseLabel?: string; profitAtCurrent?: number; shares: number; variables: SensitivityVariable[];
  ruleOfThumb: { id: string; delta: number; profitDelta: number }[];
  tiers: SensitivityTier[]; implied?: { id: string; value: number; multiple?: number }; assumptions?: string;
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
      id: row.var_id, name: String(row.name ?? '').trim() || '关键变量', unit: String(row.unit ?? '').trim(),
      current, coef, min, max, step: num(row.step) ?? (max - min) / 100,
      anchor: num(row.anchor) ?? num(record(row.anchor)?.value),
      anchorLabel: typeof row.anchor_label === 'string' && row.anchor_label.trim() ? row.anchor_label.trim() : '基数期均价',
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
      ? { id: impliedRow.var_id, value: impliedValue, multiple: num(impliedRow.multiple) ?? undefined } : undefined,
    assumptions: typeof extra.assumptions === 'string' ? extra.assumptions : undefined,
  };
}
export type SliderValues = Record<string, number>;
export const initialSliderValues = (model: SensitivityModel): SliderValues => Object.fromEntries(model.variables.map(item => [item.id, item.current]));
/** 每个变量的利润贡献：系数 × (取值 − 基数期均价)；缺 anchor 的变量不可拖，贡献为 0 并由界面标出缺口。 */
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
  return `${plainNumber(value, digits)} ${variable.unit}`.trim();
}
export function ruleOfThumbText(model: SensitivityModel, variable: SensitivityVariable) {
  const rule = model.ruleOfThumb.find(item => item.id === variable.id);
  if (!rule) return '';
  const sign = rule.profitDelta >= 0 ? '+' : '-';
  return `每 ${rule.delta >= 0 ? '+' : '-'}${plainNumber(Math.abs(rule.delta))} ${variable.unit}，归母净利 ${sign}${yiText(Math.abs(rule.profitDelta))}`;
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

export interface FlowItem { key: string; label: string; field?: PacketField; value: number | null }
/** 去向条：经营现金流 → 资本开支 → 分红 → 剩余，已有项照画，缺项为空值。 */
export function flowItems(packet: DataPacket | undefined): FlowItem[] {
  const spec: [string, string][] = [['operating_cash_flow', '经营现金流'], ['capex_cash', '资本开支'], ['dividend_paid', '现金分红'], ['residual_cash', '剩余现金']];
  return spec.map(([key, label]) => {
    // 剩余现金缺口时用「资本开支后现金」镜头（未扣分红）。
    const lens = key === 'residual_cash' && numericValue(packet?.fields?.[key]) == null ? findField(packet, 'lens:cash_after_capex.cash_after_capex') : undefined;
    const field = lens ?? packet?.fields?.[key];
    const value = field && (field.status === 'verified' || field.status === 'sourced') ? num(field.value) : null;
    return { key, label: lens && value != null ? '剩余（未扣分红）' : label, field, value: value != null && value >= 0 ? value : null };
  });
}

// ---------------------------------------------------------------- 跟踪卡

export type TrackingState = '更稳' | '打折扣' | '不成立';
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
/** 状态由页面按当前值与阈值的 direction 判断；当前值取不到或没有 direction 时返回 null（界面显示「状态待定」）。
 *  同比类阈值的当前值取自年内累计同比镜头。 */
export function trackingState(args: { current: number | null; threshold?: PacketThreshold | null; window?: string; now?: Date }): TrackingState | null {
  const { current, threshold } = args;
  const line = num(threshold?.value);
  if (current == null || line == null || !threshold || (threshold.direction !== 'down' && threshold.direction !== 'up')) return null;
  const crossed = threshold.direction === 'down' ? current < line : current > line;
  if (!crossed) return '更稳';
  return windowPassed(args.window, args.now ?? new Date()) ? '不成立' : '打折扣';
}
/** 同比类警戒线的当前值：数据包的年内累计同比镜头（收入、归母净利）。 */
export function yoyField(packet: DataPacket | undefined, fieldId: string | undefined): PacketField | undefined {
  if (!packet || !fieldId || !['revenue', 'net_profit_attributable'].includes(fieldId)) return undefined;
  return findField(packet, `lens:ytd_yoy.${fieldId}`);
}
export function numericValue(field: PacketField | undefined) {
  return field && (field.status === 'verified' || field.status === 'sourced') ? num(field.value) : null;
}
/** 警戒线文字；有 direction 时写明「跌破 / 突破」。 */
export function thresholdLine(threshold?: PacketThreshold | null) {
  const text = thresholdText(threshold);
  return text && threshold?.direction ? `${threshold.direction === 'down' ? '跌破' : '突破'} ${text}` : text;
}
/** 状态待定的原因，供悬停。 */
export function pendingReason(args: { current: number | null; threshold?: PacketThreshold | null }) {
  if (!args.threshold || num(args.threshold.value) == null) return '没有警戒线';
  if (args.threshold.direction !== 'down' && args.threshold.direction !== 'up') return '研究没有写明越线方向';
  return '当前值暂缺';
}

// ---------------------------------------------------------------- 页首判断变化行

export interface ConversationSource { at?: string; sessionId?: string; reason?: string }
export interface ChangeLine { text: string; conversation?: ConversationSource; revertable: boolean }
const SECTION_NAME: Record<string, string> = { thesis: '论点', business: '生意', profit_formula: '关键变量', variables: '关键变量', cash: '现金', valuation: '估值', tracking: '跟踪' };
const dateOf = (value?: string) => (value ?? '').slice(0, 10);
/** extras 来自研究读口的顶层：changedFrom（最近一次对话写回的来源）与 canRevert（有上一版可恢复）。 */
export function changeLine(research: CompanyPageResearch | null, extras: { changedFrom?: CompanyPageResearch['changedFrom']; canRevert?: boolean } = {}): ChangeLine | null {
  if (!research || research.gapNote || !research.researchedAt) return null;
  const date = dateOf(research.researchedAt);
  const drivers = research.sensitivity?.drivers ?? [];
  const talked = drivers.find(item => item.origin === 'conversation');
  const changed = extras.changedFrom ?? research.changedFrom;
  const conversation: ConversationSource | undefined = changed
    ? { at: changed.at ?? changed.confirmedAt, sessionId: changed.sessionId, reason: changed.reason }
    : talked ? { at: talked.confirmedAt, sessionId: talked.sessionId } : undefined;
  const revertable = extras.canRevert ?? Boolean(conversation);
  const changes = Object.entries(research.changes ?? {}).filter(([, text]) => typeof text === 'string' && text.trim());
  if (changes.length) {
    const seen = new Set<string>();
    const parts = changes.flatMap(([key, text]) => {
      const item = `${SECTION_NAME[key] ?? '研究'}：${String(text).trim()}`;
      if (seen.has(item)) return [];
      seen.add(item);
      return [item];
    });
    return { text: `研究于 ${date} · 判断有变化 · ${parts.join('；')}`, conversation, revertable };
  }
  return { text: conversation ? `研究于 ${date} · 来自对话的更新` : `研究于 ${date}，资料未变化`, conversation, revertable };
}
export function conversationHint(conversation: ConversationSource | undefined) {
  if (!conversation) return '';
  return ['来自对话确认', conversation.at ? dateOf(conversation.at) : '', conversation.sessionId ? `会话 ${conversation.sessionId}` : '', conversation.reason].filter(Boolean).join(' · ');
}

// ---------------------------------------------------------------- 节标题右侧的口径标签

const GRADE_NAMES = ['明显低估', '偏低', '合理', '偏高', '明显高估'] as const;
export const GRADES = GRADE_NAMES;
export const COMPANY_TYPE_NAME: Record<string, string> = {
  generic: '通用', commodity_cycle: '商品周期', leveraged_cyclical_utility: '高杠杆周期公用事业', scarce_asset_rent: '稀缺资产收租', bank: '银行',
};
/** 期间文字：FY2025 → 2025 年报；日期 → 10 月 12 日；其余原样。 */
export function periodLabel(period: string | null | undefined) {
  const text = String(period ?? '').trim();
  const fy = /^FY(\d{4})$/i.exec(text);
  if (fy) return `${fy[1]} 年报`;
  const iso = /^\d{4}-(\d{2})-(\d{2})/.exec(text);
  if (iso) return `${Number(iso[1])} 月 ${Number(iso[2])} 日`;
  return text;
}
/** 同业中位数（Backend 给出）；没有就不显示。 */
export function peerMedian(packet: DataPacket | undefined, metric: 'pe' | 'pb') {
  const field = findField(packet, `lens:peer_comparison.${metric}`);
  const median = num(field?.median);
  return median != null && field?.status !== 'gap' ? median : null;
}
