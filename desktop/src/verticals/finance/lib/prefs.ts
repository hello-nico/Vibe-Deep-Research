import { localService } from "./localService";
import { storageGet, storageSet } from "./storage";

const PERSISTED = ["vr-sidebar", "vr-intel-open2", "vr-signals-open2", "vr-theme", "vr-watchlist-live", "vr-company-roster-view", "vr-library-view"] as const;
type PrefKey = (typeof PERSISTED)[number];

let cache: Record<string, string> = {};
let seq = 0;

export async function hydratePrefs(): Promise<void> {
  const mine = ++seq;
  const remote = (await localService.clientPrefs()).prefs ?? {};
  if (mine !== seq) return;
  const next = { ...remote };
  for (const key of PERSISTED) {
    if (next[key] != null) continue;
    const local = storageGet(key);
    if (local == null) continue;
    try {
      await localService.clientPrefSet(key, local);
    } catch {
      // 本机服务尚未登记新键时仍用本地值，避免整页停在加载态。
    }
    next[key] = local;
  }
  if (mine !== seq) return;
  cache = next;
  for (const key of PERSISTED) {
    if (next[key] != null) storageSet(key, next[key]);
  }
}

export function prefGet(key: PrefKey): string | null {
  return cache[key] ?? storageGet(key);
}

export async function prefSet(key: PrefKey, value: string): Promise<void> {
  cache[key] = value;
  storageSet(key, value);
  seq++;
  try {
    await localService.clientPrefSet(key, value);
  } catch {
    // 远程白名单未同步时保留本地偏好。
  }
}
