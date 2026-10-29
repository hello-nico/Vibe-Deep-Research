import test from 'node:test';
import assert from 'node:assert/strict';
import { clearReadRequests, readObject, readRequest } from '../src/verticals/finance/lib/readRequest.ts';
import { CompanyPageStore } from '../src/verticals/finance/lib/companyPage.ts';

test('GET subscribers share a request, consume independent bodies and cancel independently', async () => {
  const original = globalThis.fetch;
  let calls = 0;
  let finish!: (response: Response) => void;
  try {
    globalThis.fetch = async () => { calls++; return new Promise(resolve => { finish = resolve; }); };
    const controller = new AbortController();
    const one = readRequest('/same', { signal: controller.signal });
    const rejected = assert.rejects(one, { name: 'AbortError' });
    const two = readRequest('/same');
    const three = readRequest('/same');
    controller.abort();
    finish(new Response('{"value":1}'));
    await rejected;
    assert.deepEqual(await (await two).json(), { value: 1 });
    assert.deepEqual(await (await three).json(), { value: 1 });
    assert.equal(calls, 1);
  } finally { globalThis.fetch = original; clearReadRequests(); }
});

test('network and transient errors retry exactly once, failed reads are not cached; writes never replay', async () => {
  const original = globalThis.fetch;
  let calls = 0;
  try {
    globalThis.fetch = async () => { calls++; throw new TypeError('offline'); };
    await assert.rejects(readRequest('/network'));
    assert.equal(calls, 2);
    await assert.rejects(readRequest('/network'));
    assert.equal(calls, 4);
    await assert.rejects(readRequest('/write', { method: 'POST' }));
    assert.equal(calls, 5);
    calls = 0;
    globalThis.fetch = async () => { calls++; return calls === 1 ? new Response('', { status: 502 }) : new Response('ok'); };
    assert.equal(await (await readRequest('/recover')).text(), 'ok');
    assert.equal(calls, 2);
  } finally { globalThis.fetch = original; clearReadRequests(); }
});

test('identity headers and parameters separate flights; unrelated writes preserve in-flight reads', async () => {
  const original = globalThis.fetch;
  const finishes: ((response: Response) => void)[] = [];
  try {
    globalThis.fetch = async () => new Promise(resolve => { finishes.push(resolve); });
    const first = readRequest('/research?symbol=a', { headers: { 'x-test-user': 'a' } });
    const other = readRequest('/research?symbol=a', { headers: { 'x-test-user': 'b' } });
    const params = readRequest('/research?symbol=b');
    const write = readRequest('/save', { method: 'POST' });
    const afterWrite = readRequest('/research?symbol=a', { headers: { 'x-test-user': 'a' } });
    assert.equal(finishes.length, 4);
    finishes.forEach(finish => finish(new Response('fresh')));
    await Promise.all([first, other, params, write, afterWrite]);
    const again = readRequest('/research?symbol=a', { headers: { 'x-test-user': 'a' } });
    assert.equal(finishes.length, 5);
    finishes[4]!(new Response('new judgment'));
    assert.equal(await (await again).text(), 'new judgment');
  } finally { globalThis.fetch = original; clearReadRequests(); }
});

test('leaving the last subscriber cancels the shared network request without retrying it', async () => {
  const original = globalThis.fetch;
  let calls = 0;
  let sharedSignal: AbortSignal | null | undefined;
  try {
    globalThis.fetch = async (_url, init) => {
      calls++;
      sharedSignal = init?.signal;
      return new Promise((_resolve, reject) => sharedSignal?.addEventListener('abort', () => reject(sharedSignal?.reason)));
    };
    const controller = new AbortController();
    const request = readRequest('/leaving', { signal: controller.signal });
    const rejected = assert.rejects(request, { name: 'AbortError' });
    controller.abort();
    await rejected;
    assert.equal(sharedSignal?.aborted, true);
    assert.equal(calls, 1);
  } finally { globalThis.fetch = original; clearReadRequests(); }
});

test('P9 late company reads after a revert are discarded and share the new version; Store cannot publish the old version', async () => {
  const original = globalThis.fetch;
  const url = '/finance-research/wiki/companies/600011.SH/page-research';
  let backend = 'v2', reads = 0;
  let finish!: () => void;
  try {
    globalThis.fetch = async (_url, init) => {
      if (init?.method === 'POST') { backend = 'v1'; return Response.json({ saved: true }); }
      const captured = backend;
      const reply = () => Response.json({ research: { thesis: captured }, new_material: null, basisVersion: 'basis', researchVersion: captured });
      if (++reads === 1) return new Promise(resolve => { finish = () => resolve(reply()); });
      return reply();
    };
    const store = new CompanyPageStore({ readResearch: async () => (await readRequest(url)).json() } as any, '600011', 'fixture');
    const first = store.refresh();
    await readRequest(url + '/revert', { method: 'POST' });
    const refreshed = store.refresh();
    assert.notEqual(first, refreshed, '写后不得复用 Store 写前的在途读取');
    finish();
    await Promise.all([first, refreshed]);
    assert.equal(store.getSnapshot().researchVersion, 'v1');
    assert.equal(store.getSnapshot().research?.thesis, 'v1');
    assert.ok(reads >= 2, '迟到 v2 被丢弃，读取只交付 v1');
    const beforeNextRead = reads;
    await readRequest(url);
    assert.equal(reads, beforeNextRead + 1, '完成结果不入前端响应缓存');
  } finally { globalThis.fetch = original; clearReadRequests(); }
});

for (const [url, write] of [
  ['/finance-api/client/watch', '/finance-api/client/watch/delete'],
  ['/finance-research/feed/research-events', '/finance-research/wiki/companies/000933.SZ/page-research/drivers'],
]) test(`P9 ${url}: late list data cannot survive its write`, async () => {
  const original = globalThis.fetch;
  let reads = 0, backend = 'old';
  let finish!: () => void;
  try {
    globalThis.fetch = async (_url, init) => {
      if (init?.method === 'POST') { backend = 'new'; return Response.json({ saved: true }); }
      const captured = backend;
      if (++reads === 1) return new Promise(resolve => { finish = () => resolve(Response.json({ value: captured })); });
      return Response.json({ value: captured });
    };
    const first = readRequest(url), peer = readRequest(url);
    await readRequest(write, { method: 'POST' });
    finish();
    assert.equal((await (await first).json()).value, 'new');
    assert.equal((await (await peer).json()).value, 'new');
    assert.equal(reads, 2, '两个旧订阅者只合并同一新版本的重读');
  } finally { globalThis.fetch = original; clearReadRequests(); }
});

test('P9 composite read repeats if a write finishes during its metadata read; another company stays hot', async () => {
  const original = globalThis.fetch;
  const url = '/finance-research/wiki/companies/600011.SH/page-research';
  let runs = 0;
  let release!: () => void;
  try {
    globalThis.fetch = async () => Response.json({ saved: true });
    const read = readObject(url, async () => {
      const run = ++runs;
      if (run === 1) await new Promise<void>(resolve => { release = resolve; });
      return run;
    });
    await readRequest('/finance-research/wiki/companies/000933.SZ/page-research/revert', { method: 'POST' });
    assert.equal(runs, 1, '别家写入不会推进本公司版本');
    await readRequest(url + '/revert', { method: 'POST' });
    release();
    assert.equal(await read, 2);
  } finally { globalThis.fetch = original; clearReadRequests(); }
});

test('P9 a buffered response consumed after the write must read fresh payload and status', async () => {
  const original = globalThis.fetch;
  const url = '/finance-research/wiki/companies/600011.SH/page-research';
  let written = false;
  try {
    globalThis.fetch = async (_url, init) => {
      if (init?.method === 'POST') { written = true; return Response.json({ saved: true }); }
      return written ? Response.json({ detail: 'current missing' }, { status: 404 }) : Response.json({ version: 'old' });
    };
    const buffered = await readRequest(url);
    await readRequest(url + '/revert', { method: 'POST' });
    assert.deepEqual(await buffered.json(), { detail: 'current missing' });
    assert.equal(buffered.status, 404);
    assert.equal(buffered.ok, false);
  } finally { globalThis.fetch = original; clearReadRequests(); }
});
