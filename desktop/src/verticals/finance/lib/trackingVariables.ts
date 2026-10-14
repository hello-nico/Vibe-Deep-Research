import { researchRead, aShareQualified } from './research';
import { localService } from './localService';
import { plainNumber, yiText } from './companyNarrative';

/**
 * 「关键变量」页的数据：Backend `GET /api/v1/tracking/variables`（T12a R1/R2）。
 * 数字一律是十进制字符串，缺口为 null 并带 reason；页面只做显示，不重算影响。
 * 类型按 R2 手写，A 线交回 tracking-variables.schema.json 后以它为准。
 */
export type VariableTier = 'market_daily' | 'low_frequency' | 'company_disclosed' | 'none';
export type VariableStatus = 'ok' | 'gap' | 'no_data';

export interface VariableCompany {
  symbol: string; name: string; researched_at: string; result_ref: string;
  coef_per_unit?: string | null; anchor?: string | null; anchor_period?: string | null; step?: string | null;
  profit_per_step?: string | null; impact_vs_anchor?: string | null; impact_1d?: string | null;
  pct_of_base?: string | null; neutral_price_delta?: string | null;
  kind: 'operating' | 'revaluation'; stale?: boolean;
}
export interface TrackedVariable {
  var_id: string; name: string; unit?: string | null; tier: VariableTier; source?: string | null; frequency?: string | null;
  last_date?: string | null; latest?: string | null; previous?: string | null; change_1d?: string | null;
  series?: string[][] | null; status: VariableStatus; reason?: string | null; companies: VariableCompany[];
}
export interface VariableCardCompany { symbol: string; name: string; impact: string; pct_of_base?: string | null; neutral_price_delta?: string | null }
export interface VariableCard {
  date: string; var_id: string; name: string; unit?: string | null; from: string; to: string; change: string; change_pct?: string | null;
  rule: 'daily' | 'five_day'; companies: VariableCardCompany[];
}
export interface TrackingVariables {
  as_of: string; variables: TrackedVariable[]; cards: VariableCard[];
  coverage: {
    unresearched: string[];
    uncovered: { var_id: string; name: string; tier?: 'none'; companies: string[] }[];
  };
}

/** 关注名单（Client，无交易所后缀）→ 带后缀的代码；认不出的不请求，最多 50 家。 */
export function qualifiedWatch(symbols: readonly string[]): string[] {
  return [...new Set(symbols.flatMap(symbol => aShareQualified(symbol) ?? []))].slice(0, 50);
}

export async function loadTrackingVariables(signal?: AbortSignal): Promise<TrackingVariables | null> {
  const { symbols } = await localService.clientWatch();
  const qualified = qualifiedWatch(symbols);
  if (!qualified.length) return null;
  return researchRead<TrackingVariables>(`/tracking/variables?symbols=${qualified.join(',')}`, { signal });
}

// ---------------------------------------------------------------- 显示

export const toNumber = (value: string | null | undefined): number | null => {
  if (value == null || value === '') return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};
const MINUS = '−';
/** 涨红跌绿只看对利润的方向。 */
export const tone = (value: string | null | undefined): 'up' | 'down' | undefined => {
  const parsed = toNumber(value);
  return parsed == null || parsed === 0 ? undefined : parsed > 0 ? 'up' : 'down';
};
const signOf = (value: number) => value > 0 ? '+' : value < 0 ? MINUS : '';
/** 价格与变动：千分位，最多两位小数。 */
export const priceText = (value: string | null | undefined) => {
  const parsed = toNumber(value);
  return parsed == null ? '—' : plainNumber(parsed, Number.isInteger(parsed) ? 0 : 2);
};
export const signedPriceText = (value: string | null | undefined) => {
  const parsed = toNumber(value);
  return parsed == null ? '—' : `${signOf(parsed)}${priceText(String(Math.abs(parsed)))}`;
};
/** 利润影响：亿元两位小数（四舍五入），带正负号。 */
export const impactText = (value: string | null | undefined) => {
  const parsed = toNumber(value);
  return parsed == null ? '—' : `${signOf(parsed)}${yiText(Math.abs(parsed))}`;
};
export const percentText = (value: string | null | undefined) => {
  const parsed = toNumber(value);
  return parsed == null ? '—' : `${signOf(parsed)}${plainNumber(Math.abs(parsed) * 100, 2)}%`;
};
export const yuanPerShareText = (value: string | null | undefined) => {
  const parsed = toNumber(value);
  return parsed == null ? '—' : `${signOf(parsed)}${plainNumber(Math.abs(parsed), 2)} 元`;
};
export const dayLabel = (date: string) => {
  const match = /^\d{4}-(\d{2})-(\d{2})$/.exec(date);
  return match ? `${Number(match[1])} 月 ${Number(match[2])} 日` : date;
};

/** 较基数期均价：各家基数一致时给差值，否则不给（每家的数在展开里）。 */
export function versusAnchor(variable: TrackedVariable): number | null {
  const latest = toNumber(variable.latest);
  const anchors = new Set(variable.companies.map(company => company.anchor).filter(Boolean));
  if (latest == null || anchors.size !== 1) return null;
  return latest - Number([...anchors][0]);
}

/** 有行情的在前，没有日行情的（no_data）排最后；各自保持后端给的顺序。 */
export function orderVariables(variables: readonly TrackedVariable[]): TrackedVariable[] {
  return [...variables.filter(item => item.status !== 'no_data'), ...variables.filter(item => item.status === 'no_data')];
}

/** 句子里用简称：去掉「股份」后缀（神火股份 → 神火），其余原样。 */
export const shortName = (name: string) => name.length > 2 ? name.replace(/股份$/, '') : name;
const directionOf = (change: string) => (toNumber(change) ?? 0) < 0 ? '跌' : '涨';
export const withUnit = (value: string, unit: string | null | undefined) => unit ? `${value} ${unit}` : value;
const sizeOf = (card: VariableCard) => withUnit(priceText(String(Math.abs(toNumber(card.change) ?? 0))), card.unit);
const percentValue = (value: string | null) => `${plainNumber(Math.abs(toNumber(value) ?? 0) * 100, 1)}%`;

export interface SentencePiece { text: string; strong?: boolean; tone?: 'up' | 'down' }
/** 一句话：哪个变量动了多少，对谁的利润和中性价影响多少。strong 为加粗的数字，tone 为对利润的方向。 */
export function cardPieces(card: VariableCard): SentencePiece[] {
  const when = card.rule === 'five_day' ? '五天累计' : '一天';
  const pct = toNumber(card.change_pct) == null ? '' : `，${percentText(card.change_pct)}`;
  const pieces: SentencePiece[] = [
    { text: `${card.name}${when}${directionOf(card.change)} ` }, { text: sizeOf(card), strong: true },
    { text: `（${priceText(card.from)} → ${priceText(card.to)}${pct}）` },
  ];
  card.companies.forEach((company, index) => pieces.push({ text: index ? '；' : '，' }, ...companyPieces(company)));
  pieces.push({ text: '。' });
  return pieces;
}
/** 某家公司的影响：全年利润、占基数、中性价；动态卡展开后一家一行。 */
export function companyPieces(company: VariableCardCompany): SentencePiece[] {
  const pieces: SentencePiece[] = [{ text: `${shortName(company.name)}年化归母净利约 ` }, { text: impactText(company.impact), strong: true, tone: tone(company.impact) }];
  if (company.pct_of_base != null) pieces.push({ text: `（占基数 ${percentValue(company.pct_of_base)}）` });
  if (company.neutral_price_delta != null) pieces.push({ text: '，中性价约 ' }, { text: yuanPerShareText(company.neutral_price_delta), strong: true, tone: tone(company.neutral_price_delta) });
  return pieces;
}

/** 动态卡标题：事情本身，不带金额。例「沪铝主力一天跌 445 元/吨（−1.9%）」。 */
export function cardTitle(card: VariableCard): string {
  const when = card.rule === 'five_day' ? '五天累计' : '一天';
  const pct = toNumber(card.change_pct);
  return `${card.name}${when}${directionOf(card.change)} ${sizeOf(card)}${pct == null ? '' : `（${signOf(pct)}${plainNumber(Math.abs(pct) * 100, 1)}%）`}`;
}
/** 第二行：碰到哪些关注公司、对利润的方向；各家不一致时只说方向不同。 */
export function cardTouch(card: VariableCard): string {
  const directions = new Set(card.companies.map(company => tone(company.impact)).filter(Boolean));
  const effect = directions.size > 1 ? ' · 对利润影响方向不同' : directions.has('up') ? ' · 对利润偏正面' : directions.has('down') ? ' · 对利润偏负面' : '';
  return `关注中：${card.companies.map(company => shortName(company.name)).join('、')}${effect}`;
}

/** 跟踪页「正在盯的」一行的最新情况：最近 20 个交易日有卡片就写那一次，没有写平静。 */
export function variableLine(variable: TrackedVariable, cards: readonly VariableCard[]): string {
  if (variable.status === 'no_data') return '没有公开行情，跟着财报更新';
  if (variable.status === 'gap') return '暂时取不到行情';
  const card = cards.filter(item => item.var_id === variable.var_id).sort((a, b) => b.date.localeCompare(a.date))[0];
  return card ? `${dayLabel(card.date)} ${directionOf(card.change)} ${sizeOf(card)}，已提醒` : '本周没有大的波动';
}
/** 有卡片的变量排前，其余保持原顺序（no_data 本来就在最后）。 */
export function orderWatching(variables: readonly TrackedVariable[], cards: readonly VariableCard[]): TrackedVariable[] {
  const alerted = new Set(cards.map(card => card.var_id));
  return [...variables.filter(item => alerted.has(item.var_id)), ...variables.filter(item => !alerted.has(item.var_id))];
}
export const cardSentence = (card: VariableCard) => cardPieces(card).map(piece => piece.text).join('');

/** 「讨论」预填的问句：自然语言，不提页面与系统机制。 */
export function cardQuestion(card: VariableCard): string {
  return `${card.name} ${dayLabel(card.date)}${directionOf(card.change)}了 ${sizeOf(card)}，对${card.companies.map(company => shortName(company.name)).join('、')}影响多大？`;
}

const EXCHANGES: [RegExp, string][] = [[/\bSHFE\b/g, '上期所'], [/\bDCE\b/g, '大商所'], [/\bZCE\b/g, '郑商所'], [/\bGFEX\b/g, '广期所'], [/\bINE\b/g, '上期能源']];
/** 行情目录原文里的交易所代码换成中文，其余原样显示。 */
export const sourceText = (source: string | null | undefined) => EXCHANGES.reduce((text, [pattern, name]) => text.replace(pattern, name), source ?? '');
