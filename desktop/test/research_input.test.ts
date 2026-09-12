import assert from 'node:assert/strict';
import test from 'node:test';
import { createServer } from 'vite';
import { createServer as httpServer } from 'node:http';
import { fileURLToPath } from 'node:url';

test('研究引用拒绝文件路径，发送前核对对象并保留稳定身份', async () => {
  const server = await createServer({ configFile: false, root: fileURLToPath(new URL('../', import.meta.url)), server: { middlewareMode: true, hmr: { server: httpServer() }, watch: null }, appType: 'custom' });
  const originalFetch = globalThis.fetch;
  try {
    const { researchTarget, researchObjectSource } = await server.ssrLoadModule('/src/verticals/finance/dsh/research-input.ts');
    for (const value of ['/Users/apple/workspace/wiki/a', '../companies/a', 'companies/../../secret', 'javascript:alert(1)', 'wiki/README.md']) assert.equal(researchTarget(value), null);
    assert.deepEqual(researchTarget('companies/600900-sh'), { kind: 'wiki', id: 'companies/600900-sh' });
    assert.deepEqual(researchTarget('stock-ref://source/doc%3Ar1%3Ablock'), { kind: 'evidence', id: 'source:doc:r1:block' });
    const signal = new AbortController().signal;
    const requests: string[] = [];
    globalThis.fetch = async input => {
      requests.push(String(input));
      return new Response(JSON.stringify({ items: Array.from({ length: 8 }, (_, i) => ({ slug: `companies/${i}`, topic_id: `topic:${i}`, title: `最近 ${i}` })) }));
    };
    const candidates = await researchObjectSource.candidates(null, { query: '电力', signal });
    assert.equal(candidates.length, 25);
    assert.equal(requests.length, 5);
    assert.ok(requests.every(url => url.includes('limit=5') && url.includes(encodeURIComponent('电力'))));
    assert.ok(requests.filter(url => url.includes('/pages?')).every(url => url.includes('sort=updated')));
    globalThis.fetch = async () => new Response(JSON.stringify({ spec: { title: '长江电力' } }));
    assert.equal(await researchObjectSource.codec.serialize('companies/600900-sh', signal), '引用材料：长江电力 `companies/600900-sh`');
    assert.match(await researchObjectSource.codec.serialize('themes/power', signal), /`themes\/power`/);
    globalThis.fetch = async () => new Response(JSON.stringify({ title: '电力研究' }));
    assert.equal(await researchObjectSource.codec.serialize('topic:24ff5def6bf2', signal), '引用议题：电力研究 `topic:24ff5def6bf2`');
    globalThis.fetch = async () => new Response('{}', { status: 404 });
    await assert.rejects(researchObjectSource.codec.serialize('companies/missing', signal));
    const { providerSnapshot } = await server.ssrLoadModule('/src/verticals/finance/lib/wikiFacts.ts');
    const snapshot = providerSnapshot({ source: 'provider', provider: 'hithink', metric: 'revenue', value: 100, unit: '元', period: '2026H1' });
    assert.match(snapshot, /数值：100.00 元/);
    assert.doesNotMatch(snapshot, /REST|GET |本机|\/api\//);
  } finally { globalThis.fetch = originalFetch; await server.close(); }
});
