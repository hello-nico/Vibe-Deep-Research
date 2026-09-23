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

test('八种 @ 引用连同模型说明一并折叠，用户文字保留', async () => {
  const server = await createServer({ configFile: false, root: fileURLToPath(new URL('../', import.meta.url)), server: { middlewareMode: true, hmr: { server: createHttpServer() }, watch: null }, appType: 'custom' });
  try {
    const { markResearchMentions, MENTION_NOTES: N } = await server.ssrLoadModule('/src/verticals/finance/lib/researchMentions.ts');
    const hash = 'e'.repeat(64);
    const cases: [string, string, string, string?][] = [
      [`引用资料：年报.pdf \`document:${'a'.repeat(32)}\`${N.documentUnparsed}`, `document:${'a'.repeat(32)}`, '年报.pdf', '（正文还在处理）'],
      [`引用议题：储能 \`topic:${'b'.repeat(12)}\``, `topic:${'b'.repeat(12)}`, '储能'],
      [`引用材料：贵州茅台 \`companies/600519-sh@${hash}\`${N.wikiStale}`, `companies/600519-sh@${hash}`, '贵州茅台', '（页面已更新，请重新引用）'],
      [`引用来源：https://www.cninfo.com.cn/a.pdf \`url:https://www.cninfo.com.cn/a.pdf\`${N.url}`, 'url:https://www.cninfo.com.cn/a.pdf', 'www.cninfo.com.cn'],
      [`引用公司行情：600519.SH \`company:600519.SH\`${N.company}`, 'company:600519.SH', '600519.SH 行情'],
      [`引用宽基指数集合 \`market:indices\`${N.indices}`, 'market:indices', '宽基指数集合'],
      [`引用宽基指数：沪深300 \`market:000300.SH\`${N.index('000300.SH')}`, 'market:000300.SH', '沪深300'],
      [`引用产业研究 Profile \`profile:sw2:801010:${hash}\`${N.profile}`, `profile:sw2:801010:${hash}`, '产业研究'],
      [`引用日历日 2026-09-23 \`date:2026-09-23\`${N.date}`, 'date:2026-09-23', '2026-09-23'],
    ];
    for (const [serialized, ref, label, status] of cases) {
      const win = new Window();
      const root = win.document.createElement('div');
      root.textContent = `${serialized} 今天怎么看`;
      win.document.body.append(root);
      markResearchMentions(root);
      const chip = root.querySelector('[data-research-mention]');
      assert.equal(chip?.getAttribute('data-ref'), ref, ref);
      assert.equal(chip?.textContent, label, ref);
      assert.doesNotMatch(root.textContent || '', /observe_market|marketBenchmarkId|read_industry_profile|Theme Wiki|asOf|symbol|解析|`/, ref);
      assert.equal(root.textContent, `${label}${status ?? ''} 今天怎么看`, ref);
    }
  } finally { await server.close(); }
});
