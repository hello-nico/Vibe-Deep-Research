import assert from 'node:assert/strict';
import test from 'node:test';
import { createServer } from 'vite';
import { createServer as createHttpServer } from 'node:http';
import { fileURLToPath } from 'node:url';
import { researchRoute, installResearchApi } from '../dsh/finance-ui/research.mjs';
import { EventEmitter } from 'node:events';

test('证据引用保留 block 冒号、固定修订且拒绝损坏的身份', async () => {
  const server = await createServer({ configFile: false, root: fileURLToPath(new URL('../', import.meta.url)), server: { middlewareMode: true, hmr: { server: createHttpServer() }, watch: null }, appType: 'custom' });
  const originalFetch = globalThis.fetch;
  try {
    const { decodeEvidenceLink, pinnedBlockPath, readPinnedBlock, loadEvidence } = await server.ssrLoadModule('/src/verticals/finance/lib/evidence.ts');
    assert.equal(decodeEvidenceLink('stock-ref://source/doc%3Ar1%3Ahash%3Ar1%3Ap2%3Ab3'), 'source:doc:r1:hash:r1:p2:b3');
    assert.equal(decodeEvidenceLink('javascript:alert(1)'), null);
    assert.equal(decodeEvidenceLink('stock-ref://claim/%ZZ'), null);
    assert.equal(decodeEvidenceLink('stock-ref://claim/%00'), null);
    const identity = { document_id: 'abc123', parse_revision_id: 'r1', parsed_content_sha256: 'a'.repeat(64), block_id: 'r1:p2:b3' };
    const path = pinnedBlockPath(identity);
    assert.ok(path.includes('r1%3Ap2%3Ab3'));
    assert.ok(path.includes('parse_revision_id=r1'));
    assert.throws(() => pinnedBlockPath({ ...identity, parse_revision_id: '' }));
    globalThis.fetch = async () => new Response(JSON.stringify({ ...identity, parse_revision_id: 'r2', text: '错误版本' }));
    await assert.rejects(readPinnedBlock(identity, new AbortController().signal), /校验失败/);
    globalThis.fetch = async () => new Response(JSON.stringify({ results: [{ ref: 'claim:a', status: 'resolved', kind: 'claim', data: { support_groups: [{ mode: 'all_of', segments: [{ evidence_id: 'evidence:abc123:x:r1:p2:b3' }] }] } }] }));
    const claim = await loadEvidence('claim:a', new AbortController().signal);
    assert.deepEqual(claim.related, ['evidence:abc123:x:r1:p2:b3']);
    globalThis.fetch = async () => new Response(JSON.stringify({ results: [{ ref: 'claim:a', status: 'missing' }] }));
    await assert.rejects(loadEvidence('claim:a', new AbortController().signal));
  } finally { globalThis.fetch = originalFetch; await server.close(); }
});

test('产品只开放 pinned block 的读取路径', () => {
  assert.equal(researchRoute('GET', '/wiki/documents/abc123/blocks/r1%3Ap2%3Ab3'), true);
  assert.equal(researchRoute('POST', '/wiki/documents/abc123/blocks/r1%3Ap2%3Ab3'), false);
  assert.equal(researchRoute('GET', '/wiki/documents/abc123/blocks/../../raw'), false);
  assert.equal(researchRoute('GET', '/wiki/documents/abc123/blocks/r1/extra'), false);
});

test('原件代理仅将实际 PDF 字节设为内嵌类型，保持正文完整', async () => {
  let handler;
  installResearchApi({ webServer: { register(value) { handler = value.handler; } } });
  const originalFetch = globalThis.fetch;
  try {
    for (const [body, expected] of [['%PDF-1.7\nreport', 'application/pdf'], ['<html>attachment</html>', 'application/octet-stream']]) {
      globalThis.fetch = async () => new Response(new ReadableStream({ start(controller) {
        for (const byte of new TextEncoder().encode(body)) controller.enqueue(new Uint8Array([byte]));
        controller.close();
      } }), { headers: { 'Content-Type': 'application/octet-stream' } });
      const chunks: Uint8Array[] = [];
      const response = Object.assign(new EventEmitter(), {
        writableEnded: false, headersSent: false, headers: {} as Record<string, string>,
        setHeader() {}, writeHead(status: number, headers: Record<string, string>) { assert.equal(status, 200); this.headers = headers; this.headersSent = true; },
        write(chunk: Uint8Array) { chunks.push(chunk); }, end() { this.writableEnded = true; },
      });
      await handler({ url: '/finance-research/documents/abc123/raw', method: 'GET', headers: {}, async *[Symbol.asyncIterator]() {} }, response);
      assert.equal(response.headers['Content-Type'], expected);
      assert.equal(Buffer.concat(chunks).toString(), body);
      assert.equal(response.headers['Content-Disposition'], expected === 'application/pdf' ? 'inline' : undefined);
    }
  } finally { globalThis.fetch = originalFetch; }
});
