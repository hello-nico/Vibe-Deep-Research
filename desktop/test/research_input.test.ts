import assert from 'node:assert/strict';
import test from 'node:test';
import { createServer } from 'vite';
import { createServer as httpServer } from 'node:http';
import { fileURLToPath } from 'node:url';

test('研究引用拒绝文件路径，发送前核对对象并保留稳定身份', async () => {
  const server = await createServer({ configFile: false, root: fileURLToPath(new URL('../', import.meta.url)), server: { middlewareMode: true, hmr: { server: httpServer() }, watch: null }, appType: 'custom' });
  const originalFetch = globalThis.fetch;
  try {
    const { researchTarget, researchObjectSource, matchCompanies } = await server.ssrLoadModule('/src/verticals/finance/dsh/research-input.ts');
    const companies = [
      ...Array.from({ length: 4 }, (_, i) => ({ code: `60000${i}`, name: `其他公司${i}`, symbol: `60000${i}.SH` })),
      { code: '300750', name: '宁德时代', symbol: '300750.SZ' },
    ];
    assert.deepEqual(matchCompanies(companies, '宁德时代 首次回购'), [companies[4]]);
    assert.deepEqual(matchCompanies(companies, '300750.SZ 首次回购'), [companies[4]]);
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
    const candidates = await researchObjectSource.candidates(null, { query: '电力', signal });
    assert.equal(candidates.length, 28);
    assert.equal(requests.length, 7);
    assert.ok(requests.some(url => url.includes('/documents/uploads')));
    assert.ok(requests.some(url => url.includes('/industries/profiles')));
    assert.ok(requests.filter(url => url.includes('/wiki/')).every(url => url.includes('limit=5') && url.includes(encodeURIComponent('电力'))));
    assert.ok(requests.filter(url => url.includes('/pages?')).every(url => url.includes('sort=updated')));
    const marketHits = await researchObjectSource.candidates(null, { query: '沪深', signal });
    assert.ok(marketHits.some((item: { value: string }) => item.value === 'market:000300.SH'));
    assert.ok(marketHits.some((item: { value: string }) => item.value === 'market:indices'));
    assert.equal(marketHits.some((item: { name: string; value: string }) => /情绪|资金流/.test(item.name + item.value)), false);
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
    const newsEvidence = (title: string, url: string, field: string) => ({
      id: url, symbol: '300750', market: 'CN', field, value: title, unit: '', currency: '',
      period: '2026-09-20', as_of: '2026-09-20', source: 'test', endpoint: field, fetched_at: '2026-09-20',
      adjustment: '', raw_ref: null, record_key: url, note: `url=${url}`,
    });
    globalThis.fetch = async (input, init) => {
      const url = String(input);
      if (url.includes('/finance-api/fetch')) {
        const body = JSON.parse(String(init?.body || '{}'));
        if (body.endpoint === 'cninfo_announcements') {
          return new Response(JSON.stringify({ envelope: { evidence: [
            newsEvidence('首次回购报告书', 'https://example.com/filing/buyback', 'announcement_title'),
            newsEvidence('日常关联交易', 'https://example.com/filing/daily', 'announcement_title'),
          ] } }));
        }
        if (body.endpoint === 'em_stock_news') {
          return new Response(JSON.stringify({ envelope: { evidence: [
            newsEvidence('宁德时代扩产', 'https://example.com/news/capex', 'news_title'),
          ] } }));
        }
        return new Response(JSON.stringify({ envelope: { evidence: [] } }));
      }
      if (url.includes('/wiki/pages?kind=companies')) {
        return new Response(JSON.stringify({ items: [{ slug: 'companies/300750-sz', title: '宁德时代', input_hash: 'a'.repeat(64) }], total: 1 }));
      }
      if (url.includes('/documents/uploads') || url.includes('/industries/profiles') || url.includes('/wiki/')) {
        return new Response(JSON.stringify({ items: [], total: 0 }));
      }
      return new Response(JSON.stringify({ items: [] }));
    };
    const byName = await researchObjectSource.candidates(null, { query: '宁德时代', signal });
    assert.ok(byName.some((item: { value: string }) => item.value === 'company:300750.SZ'));
    assert.ok(byName.some((item: { value: string; section: string }) => item.section === '公告' && item.value.includes('filing/buyback')));
    assert.ok(byName.some((item: { value: string; section: string }) => item.section === '新闻' && item.value.includes('news/capex')));
    const byTitle = await researchObjectSource.candidates(null, { query: '宁德时代 首次回购', signal });
    assert.ok(byTitle.some((item: { value: string; section: string }) => item.section === '公告' && item.value.includes('filing/buyback')));
    assert.equal(byTitle.some((item: { value: string }) => String(item.value).includes('filing/daily')), false);
    const { providerSnapshot } = await server.ssrLoadModule('/src/verticals/finance/lib/wikiFacts.ts');
    const snapshot = providerSnapshot({ source: 'provider', provider: 'hithink', metric: 'revenue', value: 100, unit: '元', period: '2026H1' });
    assert.match(snapshot, /数值：100.00 元/);
    assert.doesNotMatch(snapshot, /REST|GET |本机|\/api\//);
  } finally { globalThis.fetch = originalFetch; await server.close(); }
});
