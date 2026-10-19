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

for (const outcome of ['success', 'network', 'timeout', 'http'] as const) {
  test(`公告 ${outcome} 路径保留公司身份、所属区块和 URL`, async t => {
    t.mock.method(globalThis, 'fetch', async () => {
      if (outcome === 'network') throw new Error('network unavailable');
      if (outcome === 'timeout') throw new DOMException('timeout', 'TimeoutError');
      if (outcome === 'http') return Response.json({ detail: '来源暂不可读' }, { status: 503 });
      return Response.json({ url: 'https://example.com/notice', text: '公告正文样例', content_sha256: 'a'.repeat(64) });
    });
    const text = await bindAssistantPrompt({ ...common, objects: [{
      kind: 'url', id: 'url:https://example.com/notice', label: '公司公告',
      section: 'A股公告', detail: '所属公司代码：600900.SH',
    }] });
    assert.match(text, /所属：A股公告/);
    assert.match(text, /所属公司代码：600900\.SH/);
    assert.match(text, /URL：https:\/\/example.com\/notice/);
    if (outcome === 'success') assert.match(text, /公告正文样例/);
    else {
      assert.match(text, /读取失败/);
      assert.match(text, /不能按正文分析/);
      assert.doesNotMatch(text, /公告正文样例/);
    }
  });
}
