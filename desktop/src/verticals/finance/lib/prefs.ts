import { backend } from "./backend";
import { storageGet, storageSet } from "./storage";

const PERSISTED = ["vr-sidebar", "vr-intel-open2", "vr-signals-open2", "vr-theme", "vr-watchlist-live", "vr-company-roster-view"] as const;
type PrefKey = (typeof PERSISTED)[number];

let cache: Record<string, string> = {};
let seq = 0;

export async function hydratePrefs(): Promise<void> {
  const mine = ++seq;
  const remote = (await backend.clientPrefs()).prefs ?? {};
  if (mine !== seq) return;
  const next = { ...remote };
  for (const key of PERSISTED) {
    if (next[key] != null) continue;
    const local = storageGet(key);
    if (local == null) continue;
    await backend.clientPrefSet(key, local);
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
  await backend.clientPrefSet(key, value);
}
