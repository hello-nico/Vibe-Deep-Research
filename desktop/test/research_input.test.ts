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
      if (String(input).includes('/industries/profiles')) {
        return new Response(JSON.stringify({ items: [] }));
      }
      return new Response(JSON.stringify({ items: Array.from({ length: 8 }, (_, i) => ({ slug: `companies/${i}`, topic_id: `topic:${i}`, title: `最近 ${i}` })) }));
    };
    // @ offers only company pages, industry pages and My Documents: 5 latest each.
    const recent = await researchObjectSource.candidates(null, { query: '', signal });
    assert.equal(requests.length, 3);
    assert.deepEqual([...new Set(recent.map((item: { section: string }) => item.section))], ['公司', '行业', '资料']);
    assert.equal(recent.length, 13);
    assert.ok(requests.some(url => url.includes('/wiki/pages?kind=companies') && url.includes('sort=updated') && url.includes('limit=5')));
    assert.ok(requests.some(url => url.includes('/wiki/pages?kind=industries')));
    assert.ok(requests.some(url => url.includes('/documents/uploads')));
    assert.equal(requests.some(url => /research-topics|kind=themes|kind=comparisons|industries\/profiles|finance-api/.test(url)), false);
    // A typed query goes to the Backend substring match (name or stock code).
    requests.length = 0;
    await researchObjectSource.candidates(null, { query: '神火', signal });
    assert.ok(requests.filter(url => url.includes('/wiki/pages?')).every(url => url.includes(encodeURIComponent('神火'))));
    assert.deepEqual(researchTarget('market:000300.SH'), { kind: 'market', id: '000300.SH' });
    assert.deepEqual(researchTarget('market:indices'), { kind: 'market', id: 'indices' });
    assert.deepEqual(researchTarget(`profile:sw2:801160:${'a'.repeat(64)}`), { kind: 'profile', id: `profile:sw2:801160:${'a'.repeat(64)}` });
    assert.deepEqual(researchTarget('date:2026-09-20'), { kind: 'date', id: '2026-09-20' });
    assert.equal(researchTarget('market:emotion'), null);
    assert.deepEqual(researchTarget('document:' + 'a'.repeat(32)), { kind: 'document', id: 'document:' + 'a'.repeat(32), parse_revision_id: undefined, parsed_content_sha256: undefined });
    globalThis.fetch = async input => {
      if (String(input).includes('/revisions')) return new Response(JSON.stringify({ revisions: [
        { status: 'active', parse_revision_id: 'r-new', parsed_content_sha256: 'c'.repeat(64) },
        { status: 'superseded', parse_revision_id: 'r-old', parsed_content_sha256: 'b'.repeat(64) },
      ] }));
      return new Response(JSON.stringify({ title: '对照笔记', has_parsed: true, extra: {} }));
    };
    const id = 'a'.repeat(32);
    const activeRef = `document:${id}/r-new/${'c'.repeat(64)}`;
    const pinnedRef = `document:${id}/r-old/${'b'.repeat(64)}`;
    const goneRef = `document:${id}/r-gone/${'d'.repeat(64)}`;
    assert.equal(await researchObjectSource.codec.serialize(`document:${id}`, signal), `引用资料：对照笔记 \`${activeRef}\``);
    const pinned = await researchObjectSource.codec.serialize(pinnedRef, signal);
    assert.equal(pinned, `引用资料：对照笔记 \`${pinnedRef}\``);
    assert.doesNotMatch(pinned, /parse_revision_id=|parsed_content_sha256=/);
    assert.match(await researchObjectSource.codec.serialize(goneRef, signal), /发送时绑定的解析版本已不可用/);
    assert.match(await researchObjectSource.codec.serialize(goneRef, signal), new RegExp('`' + goneRef.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '`'));
    globalThis.fetch = async () => new Response(JSON.stringify({ spec: { title: '长江电力' }, input_hash: 'a'.repeat(64) }));
    assert.equal(await researchObjectSource.codec.serialize('companies/600900-sh', signal), `引用材料：长江电力 \`companies/600900-sh@${'a'.repeat(64)}\``);
    assert.deepEqual(researchTarget(`companies/600900-sh@${'a'.repeat(64)}`), { kind: 'wiki', id: 'companies/600900-sh', input_hash: 'a'.repeat(64) });
    assert.match(await researchObjectSource.codec.serialize('market:000300.SH', signal), /marketBenchmarkId=000300\.SH/);
    assert.match(await researchObjectSource.codec.serialize('date:2026-09-20', signal), /日历日/);
    assert.deepEqual(researchTarget('url:https://example.com/a'), { kind: 'url', id: 'https://example.com/a' });
    assert.deepEqual(researchTarget('company:600900.SH'), { kind: 'company', id: '600900.SH' });
    globalThis.fetch = async () => new Response(JSON.stringify({ spec: { title: '长江电力' } }));
    assert.equal(await researchObjectSource.codec.serialize('themes/power', signal), '引用材料：长江电力 `themes/power`');
    globalThis.fetch = async () => new Response(JSON.stringify({ title: '电力研究' }));
    assert.equal(await researchObjectSource.codec.serialize('topic:24ff5def6bf2', signal), '引用议题：电力研究 `topic:24ff5def6bf2`');
    globalThis.fetch = async () => new Response('{}', { status: 404 });
    await assert.rejects(researchObjectSource.codec.serialize('companies/missing', signal));
    assert.match(await researchObjectSource.codec.serialize(`document:${id}`, signal), /已从我的资料移除，无法打开原件/);
    assert.match(await researchObjectSource.codec.serialize(`document:${id}`, signal), new RegExp('`document:' + id + '`'));
    // One busy category must not empty the whole menu.
    globalThis.fetch = async input => {
      const url = String(input);
      if (url.includes('kind=industries')) return new Response('busy', { status: 503 });
      if (url.includes('kind=companies') && url.includes('000933')) {
        return new Response(JSON.stringify({ items: [{ slug: 'companies/000933-sz', title: '神火股份', input_hash: 'b'.repeat(64) }], total: 1 }));
      }
      return new Response(JSON.stringify({ items: [], total: 0 }));
    };
    const byCode = await researchObjectSource.candidates(null, { query: '000933', signal });
    assert.deepEqual(byCode.map((item: { section: string; name: string }) => [item.section, item.name]), [['公司', '神火股份']]);
    const { providerSnapshot } = await server.ssrLoadModule('/src/verticals/finance/lib/wikiFacts.ts');
    const snapshot = providerSnapshot({ source: 'provider', provider: 'hithink', metric: 'revenue', value: 100, unit: '元', period: '2026H1' });
    assert.match(snapshot, /数值：100.00 元/);
    assert.doesNotMatch(snapshot, /REST|GET |本机|\/api\//);
  } finally {
    globalThis.fetch = originalFetch;
    await server.close();
  }
});
