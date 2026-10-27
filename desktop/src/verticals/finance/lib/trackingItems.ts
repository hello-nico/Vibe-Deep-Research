import { researchRead } from './research';
import { localService } from './localService';
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
export interface ObservationItem extends ItemBase { kind: 'observation'; hypothesis: string; signals: TrackingSignal[] }
export type TrackingItem = PriceItem | ObservationItem;
export interface TrackingList { as_of: string; items: TrackingItem[]; muted: TrackingItem[] }

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
export const KIND_LABEL: Record<SignalKind, string> = { 加强: '支持这个判断', 削弱: '不利于这个判断', 无关: '无关', 待定: '还没判断' };
/** 行尾汇总：「4 条消息里 2 条支持、1 条不利」；只有一种时只写那一种；支持和不利都没有写「还没有相关消息」。 */
export function summaryOf(signals: readonly TrackingSignal[]): string {
  const support = signals.filter(signal => signal.kind === '加强').length, against = signals.filter(signal => signal.kind === '削弱').length;
  const total = `${signals.length} 条消息里`;
  if (support && against) return `${total} ${support} 条支持、${against} 条不利`;
  if (support) return `${total} ${support} 条支持这个判断`;
  if (against) return `${total} ${against} 条不利于这个判断`;
  return '还没有相关消息';
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

/** 「下次报告要验什么」的一家：Backend `GET /tracking/next-reports?symbols=`；date 为 null 时用 date_note（预约日待公布）。 */
export interface NextReport { symbol: string; name: string; report: string; date: string | null; date_note?: string | null; checks: string[]; researched_at?: string | null }
export async function loadNextReports(signal?: AbortSignal): Promise<NextReport[]> {
  const { symbols } = await localService.clientWatch();
  const qualified = qualifiedWatch(symbols);
  if (!qualified.length) return [];
  const rows = rowsOf<NextReport>(await researchRead<unknown>(`/tracking/next-reports?symbols=${qualified.join(',')}`, { signal }));
  if (!rows) throw new Error('下次报告读取失败');
  return rows.filter(row => row && typeof row.symbol === 'string' && typeof row.report === 'string');
}
/** 右边一格：「三季报 · 10-30」；没有日期写「预约日待公布」。 */
export const nextReportWhen = (row: NextReport) => `${row.report} · ${/^\d{4}-(\d{2})-(\d{2})$/.test(row.date ?? '') ? row.date!.slice(5) : row.date_note || '预约日待公布'}`;
