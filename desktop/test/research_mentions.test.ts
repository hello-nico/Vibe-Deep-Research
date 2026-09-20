import assert from 'node:assert/strict';
import test from 'node:test';
import { createServer } from 'vite';
import { createServer as createHttpServer } from 'node:http';
import { fileURLToPath } from 'node:url';
import { Window } from 'happy-dom';

test('用户气泡把序列化身份折成标题 chip，不露出 document id', async () => {
  const server = await createServer({ configFile: false, root: fileURLToPath(new URL('../', import.meta.url)), server: { middlewareMode: true, hmr: { server: createHttpServer() }, watch: null }, appType: 'custom' });
  try {
    const { markResearchMentions } = await server.ssrLoadModule('/src/verticals/finance/lib/researchMentions.ts');
    const win = new Window();
    const doc = win.document;
    const root = doc.createElement('section');
    const id = 'a'.repeat(32);
    const ref = `document:${id}/r-1/${'b'.repeat(64)}`;
    root.textContent = `引用资料：中国移动 A股与港股系统性研究.pdf \`${ref}\` 分析当前的这个报告`;
    doc.body.append(root);
    markResearchMentions(root);
    const chip = root.querySelector('[data-research-mention]');
    assert.equal(chip?.textContent, '中国移动 A股与港股系统性研究.pdf');
    assert.equal(chip?.getAttribute('data-ref'), ref);
    assert.equal(root.textContent?.includes('document:'), false);
    assert.equal(root.textContent?.includes('parse_revision_id'), false);
    assert.match(root.textContent || '', /分析当前的这个报告/);
    markResearchMentions(root);
    assert.equal(root.querySelectorAll('[data-research-mention]').length, 1);
  } finally { await server.close(); }
});

test('旧 serialize 的 parse_revision_id 字段一并收进 chip', async () => {
  const server = await createServer({ configFile: false, root: fileURLToPath(new URL('../', import.meta.url)), server: { middlewareMode: true, hmr: { server: createHttpServer() }, watch: null }, appType: 'custom' });
  try {
    const { markResearchMentions } = await server.ssrLoadModule('/src/verticals/finance/lib/researchMentions.ts');
    const win = new Window();
    const root = win.document.createElement('div');
    const id = 'c'.repeat(32);
    root.textContent = `引用资料：对照笔记 \`document:${id}\` parse_revision_id=r-old parsed_content_sha256=${'d'.repeat(64)} 继续`;
    win.document.body.append(root);
    markResearchMentions(root);
    assert.equal(root.querySelector('[data-research-mention]')?.textContent, '对照笔记');
    assert.doesNotMatch(root.textContent || '', /parse_revision_id|parsed_content_sha256|document:/);
    assert.match(root.textContent || '', /继续/);
  } finally { await server.close(); }
});
