import { researchRead } from './research';
import { localService } from './localService';
import { formatFactValue } from './wikiFacts';
import type { PacketThreshold } from './companyPacket';
import { qualifiedWatch, toNumber, type TrackedVariable, type TrackingVariables, type VariableCard, type VariableCompany } from './trackingVariables';

/**
 * 跟踪页的清单：Backend `GET/POST/PATCH /tracking/items`。价格项带 40 个交易日收盘与提醒、跳档线；观察项带信号。
 * 页面只显示和转发操作；「不再盯」只停提醒，不改研究模型。
 */
export type SignalKind = '加强' | '削弱' | '无关' | '待定';
export const SIGNAL_KINDS: readonly SignalKind[] = ['加强', '削弱', '无关', '待定'];
export interface TrackingSignal { id: string; date: string; text: string; kind: SignalKind; ref?: string; by?: string }
interface ItemBase { id: string; source: 'research' | 'user'; started_at: string; muted_at: string | null; name: string }
export interface PriceItem extends ItemBase {
  kind: 'price'; var_id: string; unit?: string | null; series: string[][] | null; status: 'ok' | 'gap' | 'no_data'; reason?: string | null;
  cards: VariableCard[]; companies: VariableCompany[];
}
export interface ObservationCondition { text: string; var_id: string; direction: 'up' | 'down'; value: string | number; unit: string }
export interface ObservationConditions { strengthen: (string | ObservationCondition)[]; weaken: (string | ObservationCondition)[]; overturn: (string | ObservationCondition)[] }
export interface ObservationMetric { text: string; var_id: string; unit: string; series: string[][] | null; latest: string | null; status: 'ok' | 'gap'; reason?: string | null; checks: (ObservationCondition & { kind: keyof ObservationConditions; triggered: boolean | null })[] }
export interface ObservationItem extends ItemBase {
  kind: 'observation'; topic_id: string; tracking_key: string; topic_title: string; hypothesis: string; signals: TrackingSignal[];
  observables?: (string | ObservationMetric)[]; conditions?: ObservationConditions; next_source?: string;
}
/** 展开里三档条件的固定顺序与说法。 */
export const CONDITION_LABEL: [keyof ObservationConditions, string][] = [['strengthen', '判断变强'], ['weaken', '判断变弱'], ['overturn', '判断推翻']];
export const conditionText = (condition: string | ObservationCondition) => typeof condition === 'string' ? condition : condition.text;
const thresholdValue = (condition: ObservationCondition) => `${Number(condition.value).toLocaleString('zh-CN', { maximumFractionDigits: 8 })}${condition.unit === '%' ? '' : ' '}${condition.unit}`;
/** 图上阈值线旁只标数值，三档说法在展开的条件列表里。 */
export const observationLineLabel = thresholdValue;
export const observationThreshold = (condition: ObservationCondition & { kind: keyof ObservationConditions }) =>
  `${condition.direction === 'up' ? '突破' : '跌破'} ${thresholdValue(condition)}：${CONDITION_LABEL.find(([key]) => key === condition.kind)![1]}`;
/** 行上只写已越过的最严重一档：推翻 > 变弱 > 变强；没有越线返回空。 */
export function observationAlert(item: ObservationItem): string {
  const order: (keyof ObservationConditions)[] = ['overturn', 'weaken', 'strengthen'];
  const hit = (item.observables ?? []).flatMap(metric => typeof metric === 'string' ? [] : metric.checks.filter(check => check.triggered === true))
    .sort((a, b) => order.indexOf(a.kind) - order.indexOf(b.kind))[0];
  return hit ? observationThreshold(hit) : '';
}
export type TrackingItem = PriceItem | ObservationItem;
export interface TrackingList { as_of: string; items: TrackingItem[]; muted: TrackingItem[] }

export function observationGroups(items: readonly ObservationItem[]): { topicId: string; title: string; items: ObservationItem[] }[] {
  const groups = new Map<string, { topicId: string; title: string; items: ObservationItem[] }>();
  for (const item of items) {
    // 组名只取议题标题冒号前的短名，后半句与行下的「为什么重要」重复。
    const group = groups.get(item.topic_id) ?? { topicId: item.topic_id, title: item.topic_title.split(/[：:]/)[0]!.trim() || item.topic_title, items: [] };
    group.items.push(item);
    groups.set(item.topic_id, group);
  }
  return [...groups.values()];
}

export async function loadTrackingItems(signal?: AbortSignal): Promise<TrackingList> {
  const { symbols } = await localService.clientWatch();
  const qualified = qualifiedWatch(symbols);
  const list = await researchRead<TrackingList>(`/tracking/items${qualified.length ? `?symbols=${qualified.join(',')}` : ''}`, { signal });
  if (!Array.isArray(list?.items) || !Array.isArray(list.muted)) throw new Error('跟踪清单读取失败');
  return list;
}

const send = <T>(method: 'POST' | 'PATCH', route: string, body: unknown) =>
  researchRead<T>(route, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
export const addPrice = (varId: string) => send<PriceItem>('POST', '/tracking/items', { var_id: varId });
export const setMuted = (id: string, muted: boolean) => send<TrackingItem>('PATCH', `/tracking/items/${encodeURIComponent(id)}`, { muted });
export const setSignalKind = (itemId: string, signalId: string, kind: SignalKind) =>
  send<TrackingSignal>('PATCH', `/tracking/items/${encodeURIComponent(itemId)}/signals/${encodeURIComponent(signalId)}`, { kind });

/** 清单里价格项的最新价与前一日差：接口只给收盘序列，页面从序列末尾取。 */
export function priceVariable(item: PriceItem): TrackedVariable {
  const rows = (item.series ?? []).filter(row => toNumber(row[1]) != null);
  const last = rows[rows.length - 1], before = rows[rows.length - 2];
  const latest = last ? toNumber(last[1])! : null, previous = before ? toNumber(before[1])! : null;
  return {
    var_id: item.var_id, name: item.name, unit: item.unit, tier: 'market_daily', status: item.status, reason: item.reason,
    series: item.series, last_date: last?.[0] ?? null,
    latest: last ? last[1]! : null, previous: before ? before[1]! : null,
    change_1d: latest != null && previous != null ? String(Math.round((latest - previous) * 1e6) / 1e6) : null,
    companies: item.companies,
  };
}
/** 跳档线的读取沿用「变量表」的形状。 */
export const asTrackingVariables = (list: TrackingList): TrackingVariables => ({
  as_of: list.as_of, variables: list.items.flatMap(item => item.kind === 'price' ? [priceVariable(item)] : []), cards: [],
  coverage: { unresearched: [], uncovered: [] },
});

/** 信号类型在界面上的说法：观察项本身是一个判断，信号按它对这个判断的影响说。Backend 的取值不变，只在显示时映射。 */
export const KIND_LABEL: Record<SignalKind, string> = { 加强: '支持', 削弱: '不利', 无关: '无关', 待定: '未判断' };
/** 行尾汇总：「支持 2 · 不利 1」；只有一种时只写那一种；都没有写「暂无消息」。 */
export function summaryOf(signals: readonly TrackingSignal[]): string {
  const support = signals.filter(signal => signal.kind === '加强').length, against = signals.filter(signal => signal.kind === '削弱').length;
  const parts = [support ? `支持 ${support}` : '', against ? `不利 ${against}` : ''].filter(Boolean);
  if (parts.length) return parts.join(' · ');
  return '暂无消息';
}

/** 信号时间轴：按日期铺在 420 宽的轴上，同一天略微错开；只有一个日期时居中。 */
export const TIMELINE_W = 420;
export const TIMELINE_H = 40;
export function timelineOf(signals: readonly TrackingSignal[]): { id: string; kind: SignalKind; x: number }[] {
  const days = signals.map(signal => Date.parse(signal.date)).filter(Number.isFinite);
  const low = Math.min(...days), high = Math.max(...days);
  const seen = new Map<string, number>();
  return signals.map(signal => {
    const day = Date.parse(signal.date);
    const nth = seen.get(signal.date) ?? 0;
    seen.set(signal.date, nth + 1);
    const base = high > low && Number.isFinite(day) ? 20 + (day - low) / (high - low) * (TIMELINE_W - 40) : TIMELINE_W / 2;
    return { id: signal.id, kind: signal.kind, x: Math.round(Math.min(TIMELINE_W - 10, base + nth * 14) * 10) / 10 };
  });
}

/** 「＋ 添加要盯的」可选的外部价格目录：Backend `GET /tracking/catalog`，返回数组或 `{ items }`。 */
export interface CatalogPrice { id: string; name: string; unit: string; exchange?: string }
const rowsOf = <T>(value: unknown): T[] | null => Array.isArray(value) ? value as T[] : Array.isArray((value as { items?: unknown } | null)?.items) ? (value as { items: T[] }).items : null;
export async function loadCatalog(signal?: AbortSignal): Promise<CatalogPrice[]> {
  const rows = rowsOf<CatalogPrice>(await researchRead<unknown>('/tracking/catalog', { signal }));
  if (!rows) throw new Error('价格目录读取失败');
  return rows.filter(row => row && typeof row.id === 'string' && typeof row.name === 'string');
}

/** Backend 拥有报告期、短名、截止日与阈值比较，页面只显示返回结果。 */
export interface ReportCheck {
  text: string; field_ids: string[]; names: string[]; threshold: PacketThreshold | null;
  window: string; window_label: string; period: string | null;
  actual: { value: string; unit: string; period: string; field_id: string } | null;
  triggered: boolean | null; actual_reason: string;
}
export interface NextReport { symbol: string; name: string; report: string; date: string | null; deadline: string; checks: ReportCheck[]; researched_at?: string | null }
export async function loadNextReports(signal?: AbortSignal): Promise<NextReport[]> {
  const { symbols } = await localService.clientWatch();
  const qualified = qualifiedWatch(symbols);
  if (!qualified.length) return [];
  const rows = rowsOf<NextReport>(await researchRead<unknown>(`/tracking/next-reports?symbols=${qualified.join(',')}`, { signal }));
  if (!rows) throw new Error('下次报告读取失败');
  return rows.filter(row => row && typeof row.symbol === 'string' && typeof row.report === 'string');
}
const reportDay = (value: string) => `${Number(value.slice(5, 7))}-${Number(value.slice(8, 10))}`;
export const nextReportWhen = (row: NextReport) => `${row.report} · ${row.date ? reportDay(row.date) : `最晚 ${reportDay(row.deadline)}`}`;
export function nextReportSummary(row: NextReport): string {
  const names = [...new Set(row.checks.flatMap(check => check.names))];
  return `${names.slice(0, 3).join('、')}${names.length > 3 ? `等 ${names.length} 项` : ''}`;
}
/** 阈值与实际值去掉无意义的尾零：55.00% → 55%，300.00 亿元 → 300 亿元。 */
const plainValue = (fact: Record<string, unknown>) => formatFactValue(fact).replace(/(\d)\.(\d*?)0+(?!\d)/g, (_, int, dec) => dec ? `${int}.${dec}` : int);
const checkIsYoy = (check: ReportCheck) => check.threshold?.kind === 'yoy_pct' || check.field_ids.some(id => id.startsWith('lens:ytd_yoy.'));
export function reportThreshold(check: ReportCheck): string {
  const threshold = check.threshold;
  if (!threshold || !['up', 'down'].includes(threshold.direction ?? '') || !Number.isFinite(Number(threshold.value))) return '';
  return `${checkIsYoy(check) ? '同比' : ''}${threshold.direction === 'down' ? '低于' : '高于'} ${plainValue({ value: threshold.value, unit: threshold.unit })}就改判断`;
}
export function reportActual(check: ReportCheck): string {
  if (!check.actual || typeof check.triggered !== 'boolean') return '';
  return `已出：${checkIsYoy(check) ? '同比 ' : ''}${plainValue(check.actual)}，${check.triggered ? '已触发' : '未触发'}`;
}
