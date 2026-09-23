export const TASK_TRACK_KEY = 'vr-task-tracks';
export const TASK_NOTICE_MAX = 3;
export const TASK_TRACK_TTL_MS = 2 * 60 * 60 * 1000;

export type TaskObject = { slug: string; title: string; kind: 'company' | 'industry'; path: string };
export type TrackedTask = {
  id: string;
  kind: 'report' | 'refresh';
  object: TaskObject;
  ref: string;
  originHref: string;
  startedAt: number;
  baseline?: string;
  phase?: 'check' | 'write';
  page?: 'company' | 'industry';
};
export type NoticeVariant = 'report-success' | 'report-fail' | 'refresh-wrote' | 'refresh-pending' | 'refresh-fail';
export type TaskNotice = {
  id: string;
  variant: NoticeVariant;
  object: TaskObject;
  title: string;
  detail: string;
  href: string;
  sticky: boolean;
  createdAt: number;
};
export type TrackOutcome =
  | { status: 'running' }
  | { status: 'unchanged' }
  | { status: 'done'; variant: NoticeVariant; detail: string };

type StorageLike = Pick<Storage, 'getItem' | 'setItem'>;

let memoryTracks: TrackedTask[] = [];
const trackListeners = new Set<() => void>();
const noticeListeners = new Set<() => void>();
let memoryNotices: TaskNotice[] = [];

function storage(): StorageLike | undefined {
  try { return globalThis.localStorage; } catch { return undefined; }
}

function isTrackRecord(value: unknown): value is TrackedTask {
  if (!value || typeof value !== 'object') return false;
  const item = value as TrackedTask;
  return (item.kind === 'report' || item.kind === 'refresh')
    && typeof item.id === 'string'
    && typeof item.ref === 'string'
    && typeof item.startedAt === 'number'
    && typeof item.originHref === 'string'
    && !!item.object
    && typeof item.object.slug === 'string'
    && typeof item.object.title === 'string'
    && typeof item.object.path === 'string'
    && (item.object.kind === 'company' || item.object.kind === 'industry');
}

export function pruneTracks(tracks: TrackedTask[], now = Date.now()): TrackedTask[] {
  return tracks.filter(item => now - item.startedAt < TASK_TRACK_TTL_MS);
}

function readTracks(store?: StorageLike): TrackedTask[] {
  try {
    const raw = (store ?? storage())?.getItem(TASK_TRACK_KEY);
    if (!raw) return memoryTracks;
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return memoryTracks;
    const tracks = parsed.filter(isTrackRecord);
    memoryTracks = tracks;
    return tracks;
  } catch {
    return memoryTracks;
  }
}

function writeTracks(tracks: TrackedTask[], store?: StorageLike) {
  memoryTracks = tracks;
  try { (store ?? storage())?.setItem(TASK_TRACK_KEY, JSON.stringify(tracks)); } catch { /* 仅本页生命周期内跟踪 */ }
  trackListeners.forEach(listener => listener());
}

export function listTracks(now = Date.now(), store?: StorageLike): TrackedTask[] {
  const next = pruneTracks(readTracks(store), now);
  if (next.length !== memoryTracks.length) writeTracks(next, store);
  return next;
}

export function objectPathFromLocation(href = typeof location === 'undefined' ? '' : location.pathname + location.search): string {
  if (!href) return '';
  const path = href.split('?')[0] || '';
  const query = href.split('?')[1] || '';
  const params = new URLSearchParams(query);
  params.delete('view');
  params.delete('refresh');
  const search = params.toString();
  return search ? `${path}?${search}` : path;
}

export function objectHref(path: string, extra: Record<string, string> = {}): string {
  const base = path.split('?')[0] || '';
  const query = path.split('?')[1] || '';
  const params = new URLSearchParams(query);
  for (const [key, value] of Object.entries(extra)) {
    if (value) params.set(key, value); else params.delete(key);
  }
  const search = params.toString();
  return search ? `${base}?${search}` : base;
}

export function sameOriginPage(originHref: string, currentHref: string): boolean {
  return objectPathFromLocation(originHref) === objectPathFromLocation(currentHref)
    && new URLSearchParams(originHref.split('?')[1] || '').get('view') === new URLSearchParams(currentHref.split('?')[1] || '').get('view');
}

export function trackTask(input: {
  kind: TrackedTask['kind'];
  object: TaskObject;
  ref: string;
  baseline?: string;
  phase?: TrackedTask['phase'];
  page?: TrackedTask['page'];
  originHref?: string;
  startedAt?: number;
}, store?: StorageLike): TrackedTask {
  const startedAt = input.startedAt ?? Date.now();
  const track: TrackedTask = {
    id: `${input.kind}:${input.object.slug}`,
    kind: input.kind,
    object: input.object,
    ref: input.ref,
    originHref: input.originHref ?? (typeof location === 'undefined' ? input.object.path : location.pathname + location.search),
    startedAt,
    baseline: input.baseline,
    phase: input.phase,
    page: input.page ?? input.object.kind,
  };
  const next = listTracks(startedAt, store).filter(item => item.id !== track.id);
  next.push(track);
  writeTracks(next, store);
  return track;
}

export function dropTrack(id: string, store?: StorageLike) {
  writeTracks(listTracks(Date.now(), store).filter(item => item.id !== id), store);
}

export function subscribeTracks(listener: () => void): () => void {
  trackListeners.add(listener);
  return () => { trackListeners.delete(listener); };
}

export function listNotices(): TaskNotice[] {
  return memoryNotices;
}

export function subscribeNotices(listener: () => void): () => void {
  noticeListeners.add(listener);
  return () => { noticeListeners.delete(listener); };
}

function emitNotices() {
  noticeListeners.forEach(listener => listener());
}

export function dismissNotice(id: string) {
  memoryNotices = memoryNotices.filter(item => item.id !== id);
  emitNotices();
}

export function noticeFromOutcome(task: TrackedTask, outcome: Extract<TrackOutcome, { status: 'done' }>, currentHref: string, now = Date.now()): TaskNotice | null {
  if (sameOriginPage(task.originHref, currentHref)) return null;
  const name = task.object.title || task.object.slug;
  const href = outcome.variant === 'report-success' ? objectHref(task.object.path, { view: 'report' })
    : outcome.variant === 'refresh-pending' ? objectHref(task.object.path, { refresh: 'confirm' })
      : objectHref(task.object.path);
  const copy: Record<NoticeVariant, { title: string; detail: string; sticky: boolean }> = {
    'report-success': { title: `「${name}」· 图文报告已生成`, detail: '点击查看', sticky: false },
    'report-fail': { title: `「${name}」· 图文报告没有生成成功`, detail: '可在「我的研究 · 任务」查看过程后重试', sticky: true },
    'refresh-wrote': { title: `「${name}」· 资料已更新`, detail: outcome.detail, sticky: false },
    'refresh-pending': { title: `「${name}」· 发现新资料，待你确认`, detail: outcome.detail || '点击查看并确认', sticky: true },
    'refresh-fail': { title: `「${name}」· 这次未能检查完`, detail: '资料保持原样，可稍后重试', sticky: true },
  };
  return { id: `${task.id}:${now}`, variant: outcome.variant, object: task.object, href, createdAt: now, ...copy[outcome.variant] };
}

export function pushNotice(notice: TaskNotice) {
  memoryNotices = [notice, ...memoryNotices.filter(item => item.id !== notice.id)].slice(0, TASK_NOTICE_MAX);
  emitNotices();
}

export function resetTaskNoticesForTest() {
  memoryTracks = [];
  memoryNotices = [];
}

async function readJson<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, init);
  const value = await response.json();
  if (!response.ok) throw new Error(typeof value?.detail === 'string' ? value.detail : '任务状态暂时无法读取');
  return value as T;
}

async function refreshRequest<T>(body: Record<string, unknown>): Promise<T> {
  return readJson<T>('/finance-maintenance-refresh', {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body),
  });
}

export async function resolveTrack(task: TrackedTask, deps?: {
  listReports?: (slug: string) => Promise<{ items: { report_id: string; current?: boolean }[] }>;
  findReportTask?: (slug: string) => Promise<{ sessionId: string; running: boolean } | null>;
  sessionState?: (sessionId: string) => { running?: boolean; failed?: boolean; lastAgentError?: string | null; promptError?: string | null } | null;
  readCheck?: (id: string) => Promise<{ status: string; proposal?: { status?: string }; items?: { receipt?: { status?: string; result?: { updated_fields?: number; added_sources?: number; status?: string } } }[] }>;
  readProposal?: (id: string, page: string) => Promise<{ status: string; items?: { receipt?: { status?: string; result?: { updated_fields?: number; added_sources?: number; status?: string } } }[] }>;
}): Promise<TrackOutcome> {
  if (task.kind === 'report') {
    const list = await (deps?.listReports ?? ((slug: string) =>
      readJson<{ items: { report_id: string; current?: boolean }[] }>(
        '/finance-research/wiki/reports?slug=' + encodeURIComponent(slug),
      )))(task.object.slug);
    const current = list.items.find(item => item.current);
    if (current && current.report_id !== task.baseline) return { status: 'done', variant: 'report-success', detail: '点击查看' };
    const found = await (deps?.findReportTask?.(task.object.slug) ?? Promise.resolve(null));
    const state = deps?.sessionState?.(found?.sessionId || task.ref) ?? null;
    const running = Boolean(found?.running || state?.running);
    if (running) return { status: 'running' };
    if (state?.failed || state?.lastAgentError || state?.promptError) return { status: 'done', variant: 'report-fail', detail: '可在「我的研究 · 任务」查看过程后重试' };
    if (found && !found.running) return { status: 'done', variant: 'report-fail', detail: '可在「我的研究 · 任务」查看过程后重试' };
    return { status: 'running' };
  }
  const page = task.page || task.object.kind;
  if (task.phase === 'write') {
    const proposal = await (deps?.readProposal ?? ((id, nextPage) => refreshRequest({ operation: 'read', page: nextPage, proposal_id: id })))(task.ref, page);
    const receipt = proposal.items?.[0]?.receipt;
    const result = receipt?.result;
    if (proposal.status === 'executing') return { status: 'running' };
    if (receipt?.status === 'success') {
      const detail = result?.added_sources
        ? `已向资料时间线追加 ${result.added_sources} 条统计来源。`
        : result?.status === 'unavailable' ? '这次没取到新数据，页面保持原样。'
          : `已更新 ${result?.updated_fields ?? 0} 项数据。`;
      return { status: 'done', variant: 'refresh-wrote', detail };
    }
    if (proposal.status === 'open') return { status: 'done', variant: 'refresh-pending', detail: '点击查看并确认' };
    if (receipt?.status === 'failed' || proposal.status === 'partial') return { status: 'done', variant: 'refresh-fail', detail: '资料保持原样，可稍后重试' };
    return { status: 'running' };
  }
  const check = await (deps?.readCheck ?? ((id) => refreshRequest({ operation: 'read_check', check_id: id })))(task.ref);
  if (check.status === 'checking') return { status: 'running' };
  if (check.status === 'unchanged') return { status: 'unchanged' };
  if (check.status === 'failed') return { status: 'done', variant: 'refresh-fail', detail: '资料保持原样，可稍后重试' };
  if (check.status === 'pending' || check.proposal?.status === 'open') return { status: 'done', variant: 'refresh-pending', detail: '点击查看并确认' };
  if (check.status === 'completed') {
    const result = check.items?.[0]?.receipt?.result;
    return { status: 'done', variant: 'refresh-wrote', detail: result?.added_sources ? `已向资料时间线追加 ${result.added_sources} 条统计来源。` : `已更新 ${result?.updated_fields ?? 0} 项数据。` };
  }
  return { status: 'running' };
}
