/** Only in-flight GETs are shared; completed research responses are never retained. */
type Reply = { body: ArrayBuffer; status: number; statusText: string; headers: Headers };
type Flight = { job: Promise<Reply>; controller: AbortController; subscribers: number };
const pending = new Map<string, Flight>();
const versions = new Map<string, number>();
const objectReads = new WeakMap<object, Map<string, Promise<unknown>>>();
export function clearReadRequests() {
  for (const flight of pending.values()) flight.controller.abort();
  pending.clear();
}

function objects(url: string, writing = false): string[] {
  const parsed = new URL(url, 'http://workbench');
  const path = parsed.pathname;
  const company = /\/wiki\/companies\/(\d{6})(?:\.(?:SH|SZ|BJ))?(?:\/|$)/i.exec(path)?.[1];
  if (company) return writing ? [`company:${company}`, 'company-list', 'writebacks'] : [`company:${company}`];
  if (/^\/finance-api\/client\/(watch|research)(\/|$)/.test(path)) return ['watch'];
  if (path.endsWith('/feed/research-events')) return ['writebacks', 'watch'];
  if (path.endsWith('/wiki/pages') && parsed.searchParams.get('kind') === 'companies') return ['company-list'];
  if (/\/tracking\//.test(path)) return ['watch', 'writebacks', ...(parsed.searchParams.get('symbols') ?? '').split(',').filter(Boolean).map(symbol => `company:${symbol.slice(0, 6)}`)];
  return [path];
}

function versionOf(url: string): string {
  return JSON.stringify(objects(url).map(key => [key, versions.get(key) ?? 0]));
}

/** Also covers composed object reads (payload, task metadata, names) without page-local versions. */
export async function readObject<T>(url: string, read: () => Promise<T>): Promise<T> {
  for (;;) {
    const version = versionOf(url);
    try {
      const value = await read();
      if (version === versionOf(url)) return value;
    } catch (error) {
      if (version === versionOf(url)) throw error;
    }
  }
}

/** Object owners may keep task sequencing, but only this layer merges same-version reads. */
export function shareObjectRead<T>(owner: object, url: string, read: () => Promise<T>): Promise<T> {
  let reads = objectReads.get(owner);
  if (!reads) { reads = new Map(); objectReads.set(owner, reads); }
  const key = JSON.stringify([url, versionOf(url)]);
  const existing = reads.get(key);
  if (existing) return existing as Promise<T>;
  const job = read();
  reads.set(key, job);
  void job.finally(() => { if (reads.get(key) === job) reads.delete(key); }).catch(() => {});
  return job;
}

async function fetchRead(url: string, init?: RequestInit): Promise<Reply> {
  for (let attempt = 0; ; attempt++) {
    init?.signal?.throwIfAborted();
    let response: Response;
    let body: ArrayBuffer;
    try {
      response = await fetch(url, init);
      body = await response.arrayBuffer();
    }
    catch (error) {
      init?.signal?.throwIfAborted();
      if (attempt) throw error;
      continue;
    }
    let retryable = response.status === 408 || response.status === 429 || response.status >= 500;
    if (response.status === 503) {
      let value: { detail?: { retryable?: boolean } } | null = null;
      try { value = JSON.parse(new TextDecoder().decode(body)); } catch { /* A proxy may return HTML. */ }
      if (value?.detail?.retryable === false) retryable = false;
    }
    if (!retryable || attempt) return { body, status: response.status, statusText: response.statusText, headers: response.headers };
    const retryAfter = response.headers.get('retry-after');
    const seconds = Number(retryAfter ?? NaN);
    const parsed = retryAfter ? Date.parse(retryAfter) - Date.now() : NaN;
    const delay = Number.isFinite(seconds) ? seconds * 1000 : Number.isFinite(parsed) ? parsed : 0;
    if (delay > 0) await new Promise(resolve => setTimeout(resolve, Math.min(5000, delay)));
  }
}

export async function readRequest(url: string, init?: RequestInit): Promise<Response> {
  init?.signal?.throwIfAborted();
  if (init?.method && init.method.toUpperCase() !== 'GET') {
    try { return await fetch(url, init); }
    finally {
      // Even an uncertain write outcome invalidates earlier reads; writes themselves are never replayed.
      for (const key of objects(url, true)) versions.set(key, (versions.get(key) ?? 0) + 1);
    }
  }
  return readObject(url, () => sharedRead(url, init));
}

async function sharedRead(url: string, init?: RequestInit): Promise<Response> {
  const version = versionOf(url);
  const headers = [...new Headers(init?.headers).entries()].sort();
  const key = JSON.stringify([url, headers, init?.credentials, init?.mode, init?.cache, versionOf(url)]);
  let flight = pending.get(key);
  if (!flight) {
    const controller = new AbortController();
    flight = { controller, subscribers: 0, job: fetchRead(url, { ...init, signal: controller.signal }) };
    pending.set(key, flight);
    const current = flight;
    void flight.job.finally(() => { if (pending.get(key) === current) pending.delete(key); }).catch(() => {});
  }
  const shared = flight;
  shared.subscribers++;
  // Cancel only after the last consumer leaves; a departing page cannot cancel a peer's read.
  return new Promise<Response>((resolve, reject) => {
    const signal = init?.signal;
    let released = false;
    const release = () => {
      if (released) return;
      released = true;
      shared.subscribers--;
      signal?.removeEventListener('abort', onAbort);
      if (!shared.subscribers && pending.get(key) === shared) {
        pending.delete(key);
        shared.controller.abort();
      }
    };
    const onAbort = () => { release(); reject(signal?.reason); };
    signal?.addEventListener('abort', onAbort, { once: true });
    void shared.job.then(reply => {
      release();
      if (signal?.aborted) reject(signal.reason);
      else resolve(versionedResponse(reply, url, init, version));
    }, error => { release(); reject(error); });
  });
}

function versionedResponse(reply: Reply, url: string, init: RequestInit | undefined, version: string): Response {
  const response = new Response([204, 205, 304].includes(reply.status) ? null : reply.body.slice(0), reply);
  for (const method of ['text', 'json', 'arrayBuffer'] as const) {
    const consume = response[method].bind(response);
    Object.defineProperty(response, method, { value: () => readObject(url, async () => {
      if (version === versionOf(url)) return consume();
      const fresh = await readRequest(url, init);
      const value = await fresh[method]();
      for (const key of ['status', 'statusText', 'ok', 'headers'] as const) {
        Object.defineProperty(response, key, { value: fresh[key], configurable: true });
      }
      return value;
    }) });
  }
  return response;
}
