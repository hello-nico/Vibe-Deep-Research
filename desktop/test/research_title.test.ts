import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createServer } from 'vite';
import { createServer as createHttpServer } from 'node:http';
import { fileURLToPath } from 'node:url';

const message = '华友钴业供应关系\n引用材料：宁德时代 `companies/300750-sz@' + 'a'.repeat(64) + '`';
const entries = (kind: 'fallback' | 'provider' | 'user') => [
  { type: 'event', event: { type: 'user/message', seq: 1, data: { source: { kind: 'user' }, content: [{ type: 'text', text: message }] } } },
  { type: 'event', event: { type: 'session/title', seq: 2, data: { title: '引用材料：宁德时代 `compan…', source: { kind }, messageSeqs: kind === 'user' ? [] : [1] } } },
];

test('serialized @ slug folds to a readable first-message title', async () => {
  const server = await createServer({ configFile: false, root: fileURLToPath(new URL('../', import.meta.url)), server: { middlewareMode: true, hmr: { server: createHttpServer() }, watch: null }, appType: 'custom' });
  try {
    const { foldResearchMentionsText, readableResearchTitle } = await server.ssrLoadModule('/src/verticals/finance/lib/researchMentions.ts');
    const { readableTitleDecision } = await server.ssrLoadModule('/src/verticals/finance/dsh/research-title.ts');
    assert.equal(foldResearchMentionsText(message), '华友钴业供应关系\n宁德时代');
    assert.equal(readableResearchTitle(message), '宁德时代 · 华友钴业供应关系');
    assert.deepEqual(readableTitleDecision(entries('fallback')), { status: 'rename', title: '宁德时代 · 华友钴业供应关系', eventSeq: 2 });
    assert.deepEqual(readableTitleDecision(entries('provider')), { status: 'rename', title: '宁德时代 · 华友钴业供应关系', eventSeq: 2 });
    assert.deepEqual(readableTitleDecision(entries('user')), { status: 'skip' });
    assert.deepEqual(readableTitleDecision([...entries('fallback'),
      { type: 'event', event: { type: 'session/title', seq: 3, data: { title: '我的手动标题', source: { kind: 'user' }, messageSeqs: [] } } }]), { status: 'skip' });
    const plain = entries('fallback');
    plain[1]!.event.data.title = '宁德时代供应链';
    assert.deepEqual(readableTitleDecision(plain), { status: 'skip' });
  } finally { await server.close(); }
});
