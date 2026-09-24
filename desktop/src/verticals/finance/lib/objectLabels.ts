const STORAGE_KEY = 'finance-object-labels';
const labels = new Map<string, string>();
let loaded = false;

function storage() {
  try { return globalThis.sessionStorage; } catch { return undefined; }
}

function hydrate() {
  if (loaded) return;
  loaded = true;
  try {
    const saved = storage()?.getItem(STORAGE_KEY);
    const entries: unknown = saved ? JSON.parse(saved) : [];
    if (Array.isArray(entries)) for (const pair of entries) {
      if (Array.isArray(pair) && typeof pair[0] === 'string' && typeof pair[1] === 'string') labels.set(pair[0], pair[1]);
    }
  } catch { /* storage is optional */ }
}

export function rememberObjectLabel(ref: string, label: string) {
  hydrate();
  const title = label.replace(/\s+/g, ' ').trim();
  if (!ref || !title) return;
  labels.set(ref, title);
  const id = /^document:([a-f0-9]{32})/.exec(ref)?.[1];
  if (id) labels.set(`document:${id}`, title);
  try { storage()?.setItem(STORAGE_KEY, JSON.stringify([...labels])); } catch { /* in-memory cache remains valid */ }
}

export function cachedObjectLabel(ref: string): string | undefined {
  hydrate();
  return labels.get(ref) || labels.get(ref.replace(/@[a-f0-9]{64}$/, '')) || labels.get(/^document:([a-f0-9]{32})/.exec(ref)?.[0] || '');
}
