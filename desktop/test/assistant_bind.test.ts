import test from 'node:test';
import assert from 'node:assert/strict';
import { visibleUserPrompt } from '../src/verticals/finance/lib/taskTrajectory.ts';
import { outboundWebUrl } from '../src/verticals/finance/lib/citationMarks.ts';

test('用户可见问题剥离本轮绑定包装，成果身份可回读', () => {
  const wrapped = [
    '本轮已绑定的 URL 依据（统一读取，未入库）。必须消费这份结果作判断；不要再次抓取同一 URL。补读或重抓只能作为另一份新结果，不能覆盖或混用本轮版本。',
    '- 华为云全面攻向智能体 `url:https://zhidx.com/p/595147.html`',
    '  URL：https://zhidx.com/p/595147.html',
    '  读取时点：2026-09-18T10:00:00+08:00',
    '  内容版本：abcdef0123456789',
    '  解析状态：readable',
    '  正文：',
    '很长的新闻正文',
    '',
    '当前页面：资讯雷达',
    '模式：Ask',
    '用户问题：',
    '这条消息影响哪些公司',
  ].join('\n');
  assert.equal(visibleUserPrompt(wrapped), '这条消息影响哪些公司');
});

test('网页引用打开原文，不走依据面板', () => {
  assert.equal(outboundWebUrl('https://static.cninfo.com.cn/finalpage/2026-04-22/1224567890.PDF'), 'https://static.cninfo.com.cn/finalpage/2026-04-22/1224567890.PDF');
  assert.equal(outboundWebUrl('lookup:https://basic.10jqka.com.cn/000636/operate.html'), 'https://basic.10jqka.com.cn/000636/operate.html');
  assert.equal(outboundWebUrl('stock-ref://lookup/https%3A%2F%2Fexample.com%2Fa'), null);
  assert.equal(outboundWebUrl('claim:abc'), null);
});
