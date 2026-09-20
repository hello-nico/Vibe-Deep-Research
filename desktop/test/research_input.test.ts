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
      if (String(input).includes('/documents/uploads')) {
        return new Response(JSON.stringify({
          items: Array.from({ length: 3 }, (_, i) => ({
            document_id: 'a'.repeat(31) + String(i),
            title: `笔记 ${i}`,
            has_raw: true,
            has_parsed: true,
            extra: { content_type: 'text', process_status: 'ready' },
          })),
          total: 3, offset: 0, limit: 5,
        }));
      }
      return new Response(JSON.stringify({ items: Array.from({ length: 8 }, (_, i) => ({ slug: `companies/${i}`, topic_id: `topic:${i}`, title: `最近 ${i}` })) }));
    };
    const candidates = await researchObjectSource.candidates(null, { query: '电力', signal });
    assert.equal(candidates.length, 28);
    assert.equal(requests.length, 6);
    assert.ok(requests.some(url => url.includes('/documents/uploads')));
    assert.ok(requests.filter(url => url.includes('/wiki/')).every(url => url.includes('limit=5') && url.includes(encodeURIComponent('电力'))));
    assert.ok(requests.filter(url => url.includes('/pages?')).every(url => url.includes('sort=updated')));
    assert.deepEqual(researchTarget('document:' + 'a'.repeat(32)), { kind: 'document', id: 'document:' + 'a'.repeat(32), parse_revision_id: undefined, parsed_content_sha256: undefined });
    globalThis.fetch = async input => {
      if (String(input).includes('/revisions')) return new Response(JSON.stringify({ revisions: [
        { status: 'active', parse_revision_id: 'r-new', parsed_content_sha256: 'c'.repeat(64) },
        { status: 'superseded', parse_revision_id: 'r-old', parsed_content_sha256: 'b'.repeat(64) },
      ] }));
      return new Response(JSON.stringify({ title: '对照笔记', has_parsed: true, extra: {} }));
    };
    assert.match(await researchObjectSource.codec.serialize('document:' + 'a'.repeat(32), signal), /引用资料：对照笔记 `document:a{32}` parse_revision_id=r-new/);
    const pinned = await researchObjectSource.codec.serialize('document:' + 'a'.repeat(32) + '/r-old/' + 'b'.repeat(64), signal);
    assert.match(pinned, /parse_revision_id=r-old/);
    assert.doesNotMatch(pinned, /r-new/);
    assert.match(await researchObjectSource.codec.serialize('document:' + 'a'.repeat(32) + '/r-gone/' + 'd'.repeat(64), signal), /发送时绑定的解析版本已不可用/);
    globalThis.fetch = async () => new Response(JSON.stringify({ spec: { title: '长江电力' } }));
    assert.equal(await researchObjectSource.codec.serialize('companies/600900-sh', signal), '引用材料：长江电力 `companies/600900-sh`');
    assert.match(await researchObjectSource.codec.serialize('themes/power', signal), /`themes\/power`/);
    globalThis.fetch = async () => new Response(JSON.stringify({ title: '电力研究' }));
    assert.equal(await researchObjectSource.codec.serialize('topic:24ff5def6bf2', signal), '引用议题：电力研究 `topic:24ff5def6bf2`');
    globalThis.fetch = async () => new Response('{}', { status: 404 });
    await assert.rejects(researchObjectSource.codec.serialize('companies/missing', signal));
    assert.match(await researchObjectSource.codec.serialize('document:' + 'a'.repeat(32), signal), /已从我的资料移除，无法打开原件/);
    const { providerSnapshot } = await server.ssrLoadModule('/src/verticals/finance/lib/wikiFacts.ts');
    const snapshot = providerSnapshot({ source: 'provider', provider: 'hithink', metric: 'revenue', value: 100, unit: '元', period: '2026H1' });
    assert.match(snapshot, /数值：100.00 元/);
    assert.doesNotMatch(snapshot, /REST|GET |本机|\/api\//);
  } finally { globalThis.fetch = originalFetch; await server.close(); }
});
