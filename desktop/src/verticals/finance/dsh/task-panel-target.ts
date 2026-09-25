import type { TaskProcessRef } from './research-session';

export type TaskPanelAddress = { parentSessionId: string; childSessionId: string; mode: 'one-shot' | 'continuable' | 'unknown' };
type KnownTaskPanelAddress = TaskPanelAddress & { mode: 'one-shot' | 'continuable' };

export function taskPanelTarget(
  sessionId: string,
  parentSessionId: string | undefined,
  address: TaskPanelAddress | undefined,
  catalog: readonly { id: string; mode: 'one-shot' | 'continuable' | 'unknown' }[] = [],
): string | KnownTaskPanelAddress {
  if (address?.childSessionId === sessionId && address.mode !== 'unknown' && (!parentSessionId || address.parentSessionId === parentSessionId)) return address as KnownTaskPanelAddress;
  const entry = catalog.find(item => item.id === sessionId);
  if (parentSessionId && entry && entry.mode !== 'unknown') {
    return { parentSessionId, childSessionId: sessionId, mode: entry.mode };
  }
  return sessionId;
}

export function taskProcessMissing(
  sessionId: string,
  parentSessionId: string | undefined,
  address: TaskPanelAddress | undefined,
  catalog: readonly { id: string; mode: 'one-shot' | 'continuable' | 'unknown' }[],
  listed: boolean,
): boolean {
  const hasAddress = address?.childSessionId === sessionId
    && (!parentSessionId || address.parentSessionId === parentSessionId);
  if (parentSessionId) {
    return !hasAddress
      && !catalog.some(item => item.id === sessionId);
  }
  return !listed && !hasAddress;
}

export function isMissingSessionError(error: unknown): boolean {
  const candidate = error && typeof error === 'object' ? error as { code?: unknown; message?: unknown } : null;
  return candidate?.code === 'session/not-found'
    || typeof candidate?.message === 'string' && /^sessions\.retain: unknown session\b/.test(candidate.message);
}

export function defaultTaskPanelStage(task: TaskProcessRef, running: (sessionId: string) => boolean): 'research' | 'settlement' {
  return task.kind === 'research' && task.settlementSessionId && running(task.settlementSessionId)
    ? 'settlement' : 'research';
}
