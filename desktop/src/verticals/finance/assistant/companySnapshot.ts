/**
 * 个股页交给问助手的页面快照。
 *
 * 原则：只写页面上**实际显示**的内容——每节的回答句（数字已按页面规则填好）、第一层的关键数（带期间）、
 * 专用图里直接标出的数；不写内部字段编号、计算凭据与引用身份。折叠起来的「查看数据」不进快照。
 * 每节一段，供 `clipSectionedSnapshot` 在超出上限时按「用户正在看的那一节」取舍。
 */
import { fieldIdLabel, findField, showField, type DataPacket, type PacketField, type PacketThreshold } from '../lib/companyPacket';
import {
  contributions, epsAt, flowItems, impliedPe, keyIdsOf, peerMedian, periodLabel, plainNumber, profitAt, quarterLabel, fillSlots,
  ruleOfThumbText, sliderUnitText, TRACKING_TEXT, trackingNote, trackingState, yiText, yuanText,
  type QuarterBar, type SensitivityModel, type SliderValues,
} from '../lib/companyNarrative';
import type { SnapshotSection } from './snapshot';

export type CompanySectionId = 'thesis' | 'business' | 'variables' | 'cash' | 'valuation' | 'tracking' | 'related';
type NarrativeId = 'business' | 'variables' | 'cash' | 'valuation' | 'tracking';

/** 回答句：占位按页面规则填值，缺口写「暂缺」，与页面所见一致。 */
export function fillSentence(text: string | undefined, packet: DataPacket | undefined, calcs: Record<string, unknown>): string {
  return fillSlots(text, packet, calcs, '暂缺').trim();
}

/** 口径只在写的是中文说明时带上（「合并经营现金流 / 同期归母净利」），带英文内部取值（provider、编号）的整条不带。 */
function scopeOf(field: PacketField): string {
  const scope = String(field.scope ?? '').trim();
  return /[\u4e00-\u9fff]/.test(scope) && !/[a-z_]+:|provider|field_id|_recalculated/i.test(scope) ? scope : '';
}

/** 第一层关键数，选法与页面同一个 `keyIdsOf`；每行带期间与口径。 */
export function keyNumberLines(packet: DataPacket | undefined, ids: readonly string[], peers = false): string[] {
  return keyIdsOf(packet, ids).flatMap(id => {
    const field = findField(packet, id);
    if (!field) return [];
    const median = peers && (id === 'pe' || id === 'pb') ? peerMedian(packet, id) : null;
    const meta = [periodLabel(field.period), scopeOf(field), median != null ? `同业中位 ${plainNumber(median, id === 'pe' ? 1 : 2)}` : ''].filter(Boolean).join('；');
    return [`- ${fieldIdLabel(field.field_id ?? id)}：${showField(field)}${meta ? `（${meta}）` : ''}`];
  });
}

/** 现金去向条上直接标出的数；缺项照页面写「暂缺」。 */
export function flowLines(packet: DataPacket | undefined): string[] {
  const items = flowItems(packet);
  if (items.every(item => item.value == null)) return [];
  return items.map(item => {
    if (item.value == null) return `- ${item.label}：暂缺`;
    const period = periodLabel(item.field?.period);
    return `- ${item.label}：${yuanText(item.value)}${period ? `（${period}）` : ''}`;
  });
}

function quarterLines(bars: readonly QuarterBar[]): string[] {
  return bars.map(bar => `- ${quarterLabel(bar.period)}（单季）：收入 ${bar.revenue == null ? '暂缺' : yuanText(bar.revenue)}，归母净利 ${bar.profit == null ? '暂缺' : yuanText(bar.profit)}`);
}

function sensitivityLines(model: SensitivityModel, values: SliderValues, price: number | null): string[] {
  const parts = contributions(model, values);
  const profit = profitAt(model, values);
  const eps = epsAt(model, profit);
  const pe = impliedPe(price, eps);
  const moved = model.variables.some(item => (values[item.id] ?? item.current) !== item.current);
  const delta = profit - model.baseProfit;
  return [
    ...(model.baseLabel ? [`基数：${model.baseLabel}，归母净利 ${yuanText(model.baseProfit)}`] : []),
    ...model.variables.map(item => {
      const now = values[item.id] ?? item.current;
      const rule = ruleOfThumbText(model, item);
      return `- ${item.name}：今天 ${sliderUnitText(item, item.current)}${now !== item.current ? `，滑块现在拖到 ${sliderUnitText(item, now)}` : ''}${item.anchor != null ? `，${item.anchorLabel} ${sliderUnitText(item, item.anchor)}` : `，${item.anchorLabel}暂缺`}${rule ? `；${rule}` : ''}`;
    }),
    `${moved ? '按滑块当前取值' : '按今天价格'}，年化归母净利估算 ${yuanText(profit)}（${delta === 0 ? '与基数一致' : `相对基数 ${delta > 0 ? '+' : '-'}${yiText(Math.abs(delta))}`}），对应每股收益 ${plainNumber(eps, 2)} 元/股，${price != null ? `现价 ${plainNumber(price, 2)} 元对应市盈率` : '现价对应市盈率'} ${pe == null ? '暂缺' : `${plainNumber(pe, 1)} 倍`}`,
    ...parts.filter(item => item.variable.anchor != null && item.profit !== 0).map(item => `- ${item.variable.name}贡献 ${item.profit > 0 ? '+' : '-'}${yiText(Math.abs(item.profit))}`),
    ...(model.assumptions ? [`假设：${model.assumptions}`] : []),
  ];
}

/** 跟踪卡：页面上看到的标题、当前值、状态、警戒线与观察窗口。 */
export interface SnapshotTrackItem {
  text: string; fieldId?: string; yoy?: boolean; field?: PacketField; threshold?: PacketThreshold | null; window?: string;
}
function trackingLines(items: readonly SnapshotTrackItem[], now?: Date): string[] {
  return items.map(item => {
    const raw = item.field && (item.field.status === 'verified' || item.field.status === 'sourced') ? Number(item.field.value) : null;
    const current = raw != null && Number.isFinite(raw) ? raw : null;
    const state = trackingState({ current, threshold: item.threshold, window: item.window, now });
    const title = item.fieldId ? `${fieldIdLabel(item.fieldId)}${item.yoy ? '同比' : ''}` : item.text;
    const value = item.fieldId ? (item.field && item.field.value != null && item.field.status !== 'gap' ? showField(item.field) : '暂缺') : '';
    const level = TRACKING_TEXT.holds(item.threshold);
    const note = trackingNote({ state, title, value: value || '—', threshold: item.threshold, window: item.window });
    return `- ${title}${value ? `：${value}` : ''}${note ? `；${note}` : ''}${level ? `；${level}` : ''}${item.window ? `；${item.window}` : ''}${item.fieldId ? `；支柱：${item.text}` : ''}`;
  });
}

export interface CompanySnapshotInput {
  name: string; symbol: string; typeName?: string;
  quote?: { price?: number | null; currencyLabel?: string; change_pct?: number | null; fetched_at?: string | null } | null;
  quoteLoading?: boolean;
  thesis?: string; gapNote?: string; grade?: string; changeText?: string;
  packet?: DataPacket; packetLoading?: boolean; packetError?: boolean;
  calcs: Record<string, unknown>;
  /** 页面当前显示的节（与页面 showSection 同口径）；没显示的节不进快照。 */
  show: Record<NarrativeId, boolean>;
  titles: Record<NarrativeId, string>;
  answers: Partial<Record<NarrativeId, string | undefined>>;
  /** 页面各节第一层关键数候选（已按页面规则去重）。 */
  keys: Record<'business' | 'cash' | 'valuation', readonly string[]>;
  formulaSentence?: string; formula?: string; quarterBars: readonly QuarterBar[];
  model?: SensitivityModel | null; values?: SliderValues; price?: number | null;
  tiers: readonly { name: string; text: string }[]; adjusted?: number | null; impliedText?: string;
  tracking: readonly SnapshotTrackItem[]; now?: Date;
  related: readonly { title: string }[];
}

function part(id: CompanySectionId, title: string, lines: (string | undefined | false)[]): SnapshotSection {
  return { id, title, text: `【${title}】\n${lines.filter(Boolean).join('\n')}` };
}

/** 页面各节的快照段，顺序与页面一致。 */
export function buildCompanySnapshotSections(input: CompanySnapshotInput): SnapshotSection[] {
  const { packet, calcs } = input;
  const ready = !input.packetLoading && !input.packetError;
  const note = input.packetLoading ? '数据正在加载，页面上这一节还没有数字。' : input.packetError ? '数据暂时取不到，页面上这一节没有数字。' : undefined;
  const out: SnapshotSection[] = [];
  const quote = input.quote;
  out.push(part('thesis', `${input.name} 个股页`, [
    `${input.name === input.symbol ? input.symbol : `${input.name}（${input.symbol}）`}${input.typeName ? ` · ${input.typeName}` : ''}`,
    input.quoteLoading ? '行情正在加载。' : quote?.price != null
      ? `行情：${plainNumber(quote.price, 2)}${quote.currencyLabel ? ` ${quote.currencyLabel}` : ''}${quote.change_pct != null ? `，${quote.change_pct > 0 ? '+' : ''}${plainNumber(quote.change_pct, 2)}%` : ''}${quote.fetched_at ? `（行情 ${periodLabel(quote.fetched_at)}）` : ''}`
      : '行情暂不可用。',
    input.gapNote ? `研究缺口：${input.gapNote}` : input.thesis ? `论点：${fillSentence(input.thesis, packet, calcs)}` : '尚无研究判断。',
    !input.gapNote && input.grade ? `五档结论：${input.grade}` : '',
    !input.gapNote && input.changeText ? input.changeText : '',
  ]));
  const narrative = (id: NarrativeId, extra: (string | undefined | false)[]) =>
    part(id, input.titles[id], [note, input.answers[id] ? `回答：${fillSentence(input.answers[id], packet, calcs)}` : undefined, ...extra]);
  if (input.show.business) {
    const keys = ready ? keyNumberLines(packet, input.keys.business) : [];
    out.push(narrative('business', [keys.length ? '关键数：' : undefined, ...keys]));
  }
  if (input.show.variables) {
    const model = input.model;
    out.push(narrative('variables', !ready ? [] : model
      ? ['敏感性试算：', ...sensitivityLines(model, input.values ?? {}, input.price ?? null)]
      : [
        input.formulaSentence ? `公式：${fillSentence(input.formulaSentence, packet, calcs)}` : undefined,
        input.formula ? `行业公式：${input.formula}` : undefined,
        ...(input.quarterBars.length ? ['单季：', ...quarterLines(input.quarterBars)] : []),
      ]));
  }
  if (input.show.cash) {
    const flow = ready ? flowLines(packet) : [];
    const keys = ready ? keyNumberLines(packet, input.keys.cash) : [];
    out.push(narrative('cash', [
      flow.length ? '现金去向（经营现金流依次扣资本开支、分红，余下为剩余现金）：' : undefined, ...flow,
      keys.length ? '关键数：' : undefined, ...keys,
    ]));
  }
  if (input.show.valuation) {
    const keys = ready ? keyNumberLines(packet, input.keys.valuation, true) : [];
    out.push(narrative('valuation', [
      input.tiers.length ? '三档情景：' : undefined,
      ...input.tiers.map(tier => `- ${tier.name}：${tier.text}`),
      input.adjusted != null ? `按关键变量节滑块调整后的中性价 ${plainNumber(input.adjusted, 2)} 元/股` : undefined,
      input.impliedText,
      keys.length ? '关键数：' : undefined, ...keys,
    ]));
  }
  if (input.show.tracking) out.push(narrative('tracking', trackingLines(input.tracking, input.now)));
  if (input.related.length) out.push(part('related', '关联', input.related.map(item => `- ${item.title}`)));
  return out;
}
