import assert from 'node:assert/strict';
import test from 'node:test';
import { createRequire } from 'node:module';
import { dirname } from 'node:path';

// 与产品构建同样转换 TS，执行最终绑定函数，而非检查源码中是否出现字段名。
const require = createRequire(import.meta.url);
const { build } = require(require.resolve('esbuild', { paths: [dirname(require.resolve('vite/package.json'))] }));
const bundle = await build({
  entryPoints: [new URL('../src/verticals/finance/assistant/prompt.ts', import.meta.url).pathname],
  bundle: true, format: 'esm', platform: 'node', write: false,
});
const { bindAssistantPrompt, assistantUserMessage } = await import(`data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].text).toString('base64')}`);
const common = { prompt: '解释引用', title: '测试页面', mode: 'ask', pageSnapshot: '' };

test('本轮页面内容仅供工具读取，用户消息只保留原话和引用', async () => {
  const context = await bindAssistantPrompt({ ...common, pageSnapshot: '页面数据', objects: [] });
  const message = assistantUserMessage('  解释引用  ', ['引用材料：甲 `companies/a`']);
  assert.match(context, /页面数据/);
  assert.doesNotMatch(context, /用户问题/);
  assert.equal(message, '解释引用\n\n引用材料：甲 `companies/a`');
  assert.doesNotMatch(message, /【页面快照】|页面数据|引用读取结果/);
});

test('已移除的大盘指数引用不再绑定页面显示值，只给身份并声明没有读取契约', async () => {
  const text = await bindAssistantPrompt({ ...common,
    objects: [{ kind: 'market', id: 'market:indices', label: '宽基指数集合' }],
  });
  assert.match(text, /没有对应的宿主读取契约/);
  assert.doesNotMatch(text, /点位/);
});

test('URL 标签发送时不预抓正文：不请求 fetch-url，只带身份行与「正文未预读」；已读取提示只覆盖确实读取的对象', async t => {
  const calls: string[] = [];
  t.mock.method(globalThis, 'fetch', async (input: unknown) => {
    const url = String(input);
    calls.push(url);
    if (url.includes('/wiki/pages/read')) return Response.json({ spec: { title: '公司页' }, input_hash: 'h1', markdown: '公司页正文', published: true });
    throw new Error(`unexpected request ${url}`);
  });
  const notice = { kind: 'url', id: 'url:https://example.com/notice', label: '公司公告', url: 'https://example.com/notice',
    source: '长江电力（600900）', time: '2026-10-19 09:00', section: 'A股公告', detail: '所属公司代码：600900.SH' };
  const onlyUrl = await bindAssistantPrompt({ ...common, objects: [notice] });
  assert.deepEqual(calls, [], 'URL 标签不触发任何请求');
  assert.match(onlyUrl, /公司公告/);
  assert.match(onlyUrl, /所属：A股公告/);
  assert.match(onlyUrl, /所属公司代码：600900\.SH/);
  assert.match(onlyUrl, /正文未预读，需要时自行读取/);
  assert.doesNotMatch(onlyUrl, /已在发送时读取|引用读取结果|URL：|公告正文/);
  const mixed = await bindAssistantPrompt({ ...common, objects: [notice, { kind: 'wiki', id: 'companies/600900-sh', label: '长江电力' }] });
  assert.equal(calls.length, 1);
  assert.ok(calls[0]!.includes('/wiki/pages/read'));
  const read = /【引用读取结果】[\s\S]*?(?=\n\n【|$)/.exec(mixed)?.[0] ?? '';
  assert.match(read, /公司页正文/);
  assert.doesNotMatch(read, /公司公告/);
  assert.match(mixed, /【引用（未预读）】[\s\S]*公司公告[\s\S]*正文未预读/);
});
