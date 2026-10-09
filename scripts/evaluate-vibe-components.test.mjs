import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, readFileSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { analyze, fences, project, sessionMetrics, resolveRefs, questions, expected, c7,
  readSession, summarizeRuns, previewHtml, writePreview, main } from './evaluate-vibe-components.mjs';

const result = `result:${'a'.repeat(32)}`;
const wrap = text => `结论：利润取决于量价成本。\n\n\`\`\`vibe\n${text}\n\`\`\`\n对应口径须一致。`;
const valid = `<section question="成本变化决定利润"><stat><item label="利润" ref="${result}" unit="亿元" /></stat><scenario ref="${result}" driver="电价" outputs="利润" title="利润敏感性" /></section>`;
const records = text => [
  { type: 'session', agentPreset: 'vibe' },
  { type: 'request/header', data: { header: { config: { model: 'fixture-model', provider: 'fixture' } } } },
  { type: 'turn/start', data: { turn: 1 } },
  { type: 'step/start', data: { turn: 1, step: 1 } },
  { type: 'assistant/message', data: { turn: 1, step: 1, message: { content: [{ type: 'text', text }] },
    usage: { inputTokens: 100, outputTokens: 30, cacheReadTokens: 10 } } },
  { type: 'turn/end', data: { turn: 1, reason: { kind: 'completed' } } },
];
const evaluate = rows => sessionMetrics(rows.map(project).filter(Boolean));

test('合法嵌套与固定目录，不把引用哈希当字面数字', () => {
  const m = analyze(wrap(valid));
  assert.equal(m.blocks, 1); assert.equal(m.parseableRatio, 1);
  assert.equal(m.unknownElements, 0); assert.equal(m.unknownAttributes, 0);
  assert.equal(m.literalNumbers, 0); assert.equal(m.refs.length, 2);
  assert.deepEqual(m.violations, []);
  assert.equal(expected(questions[2], m), true);
});
test('未知组件与属性单独计量', () => {
  const m = analyze(wrap('<widget value="高"/><chart ref="' + result + '" colour="red"/>'));
  assert.equal(m.parseableRatio, 1); assert.equal(m.unknownElements, 1);
  assert.equal(m.unknownElementRatio, 0.5); assert.equal(m.unknownAttributes, 2);
  assert.equal(m.unknownAttributeRatio, 2 / 3);
});
test('数字包含裸属性、年份、负数、百分比与 JSX 表达式', () => {
  assert.equal(analyze(wrap('<grid cols=2><chart ref="' + result + '" /></grid>')).literalNumbers, 1);
  assert.equal(analyze(wrap('<flow note="2026年下降-12.5%"/>')).literalNumbers, 2);
  const m = analyze(wrap('<grid cols={2}><row/></grid>'));
  assert.ok(m.parseableRatio < 1); assert.ok(m.violations.includes('invalid_attribute'));
  assert.equal(m.literalNumbers, 1);
});
test('未闭合围栏/元素、重复属性、错误闭合不会判为合法', () => {
  assert.equal(analyze('正文\n```vibe\n<row/>').unclosedBlocks, 1);
  assert.equal(analyze(wrap('<section question="结论"><row/>')).parseableRatio, 0.5);
  assert.equal(analyze(wrap('<chart ref="' + result + '" ref="' + result + '"/>')).parseableRatio, 0);
  assert.ok(analyze(wrap('<row></grid>')).violations.includes('mismatched_close'));
});
test('块外正文统计排除 vibe 和其他代码块，支持长围栏与波浪围栏', () => {
  assert.equal(analyze('甲乙\n```vibe\n<row/>\n```\n丙').bodyChars, 3);
  assert.equal(analyze('甲\n```js\nconst x=2\n```\n乙').bodyChars, 2);
  assert.equal(fences('````vibe\n<row/>\n```\n````').blocks[0].closed, true);
  assert.equal(analyze('~~~vibe\n<row/>\n~~~').blocks, 1);
  assert.equal(analyze('```text\n```vibe\n<row/>\n```').blocks, 0);
});
test('子元素、数量与数字步骤引用检查', () => {
  assert.ok(analyze(wrap('<item label="利润" ref="' + result + '"/>')).violations.includes('child_parent'));
  assert.ok(analyze(wrap('<compare><bar ref="' + result + '"/></compare>')).violations.includes('compare_count'));
  assert.ok(analyze(wrap('<flow><step>成本增长10%</step><step>收入</step><step>利润</step></flow>')).violations.includes('step_number_without_ref'));
  assert.ok(analyze(wrap('<chart/>')).violations.includes('missing_ref'));
});
test('最后一步正文与失败/中断区分，不拿前一步答案兜底', () => {
  const source = records(wrap(valid));
  assert.equal(evaluate(source).bodyComplete, true);
  source.splice(-1, 0, { type: 'step/start', data: { turn: 1, step: 2 } });
  assert.equal(evaluate(source).finalAtLastStep, false);
  const sameStep = records(wrap(valid));
  sameStep.splice(-1, 0, { type: 'tool/call', data: { turn: 1, step: 1, name: 'today' } });
  assert.equal(evaluate(sameStep).bodyComplete, false);
  const interrupted = records('正文'); interrupted[4].data.interrupted = true;
  assert.equal(evaluate(interrupted).bodyComplete, false);
  const failed = records('正文'); failed.at(-1).data.reason.kind = 'error';
  assert.equal(evaluate(failed).bodyComplete, false);
});
test('日志投影不读取提示词、用户文本、推理和工具私有字段', () => {
  const fail = () => { throw new Error('private field touched'); };
  const privateData = { get arguments() { return fail(); }, get meta() { return fail(); },
    name: 'today', turn: 1, step: 1 };
  assert.deepEqual(project({ type: 'tool/call', data: privateData }), { type: 'tool/call', name: 'today', turn: 1, step: 1 });
  for (const type of ['system/message', 'user/message', 'tool/result']) assert.equal(project({ type, data: privateData }), undefined);
  const m = records('正文')[4];
  m.data.message.content.push({ type: 'reasoning', get text() { return fail(); } });
  assert.equal(project(m).text, '正文');
});
test('用量含重试与缓存，300K 以上报警；缺用量不假装完整', () => {
  const rows = records('正文');
  rows.splice(4, 0, { type: 'assistant/attempt', data: { turn: 1, step: 1, stream: [
    { type: 'chunk', chunk: { type: 'usage', usage: { totalTokens: 300000 } } },
  ] } });
  assert.equal(evaluate(rows).tokens, 300140); assert.equal(evaluate(rows).overBudget, true);
  delete rows[5].data.usage;
  assert.equal(evaluate(rows).usageComplete, false);
});
test('写入工具请求报警；不声称工具日志能证明后台没有写入', () => {
  const rows = records('正文'); rows.splice(4, 0, { type: 'tool/call', data: { turn: 1, step: 1, name: 'source_ingest_periodic_report' } });
  assert.deepEqual(evaluate(rows).writeCalls, ['source_ingest_periodic_report']);
});
test('只读 refs 路由、重复 ref 分母、成果身份、失败降级', async () => {
  const calls = [];
  const request = async (url, options) => {
    calls.push({ url, options });
    return { ok: true, json: async () => url.includes('research-results')
      ? { result_id: result, payload: { title: 'fixture' } }
      : { results: [{ ref: 'claim:fixture', status: 'resolved' }] } };
  };
  const r = await resolveRefs([result, 'claim:fixture', result], 'http://127.0.0.1:8000/api/v1', request);
  assert.equal(r.ratio, 1); assert.equal(r.total, 3); assert.equal(calls.length, 2);
  assert.equal(calls[0].options.method, undefined); assert.equal(calls[1].options.method, 'POST');
  assert.equal(calls[0].url, `http://127.0.0.1:8000/api/v1/research-results/${encodeURIComponent(result)}`);
  assert.equal(calls[1].url, 'http://127.0.0.1:8000/api/v1/wiki/refs/resolve');
  assert.equal(calls[0].options.redirect, 'error');
  const wrongIdentity = await resolveRefs([result], 'http://localhost:8000/api/v1', async () => ({
    ok: true, json: async () => ({ result_id: result.slice(7), payload: {} }),
  }));
  assert.equal(wrongIdentity.ratio, 0);
  const unavailable = await resolveRefs([result], 'http://localhost:8000/api/v1', async () => { throw new Error('offline'); });
  assert.equal(unavailable.ratio, 0); assert.equal(unavailable.outcomes[0].status, 'unavailable');
  await assert.rejects(resolveRefs([], 'http://secret:password@localhost:8000', request));
  await assert.rejects(resolveRefs([], 'https://example.org', request));
});
test('C7 矩阵不以未运行、重复会话、少于三次或混用模型判通过', () => {
  const m = evaluate(records('今天是周五。'));
  m.refResolution = { ratio: null };
  assert.equal(c7(m, questions[0]), true);
  assert.equal(c7({ ...m, newSession: false }, questions[0]), false);
  assert.equal(c7({ ...m, models: ['a', 'b'] }, questions[0]), false);
  assert.equal(expected(questions[0], analyze(wrap('<row/>'))), false);
  assert.equal(summarizeRuns([]).groups.every(g => !g.stable), true);
  assert.equal(summarizeRuns([{ status: 'evaluated', question: questions[0], repeat: 1, passed: true, metrics: m }]).groups[0].stable, false);
});
test('按 DSH JSONL 读取白名单字段，损坏记录闭合失败', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'vibe-s0-fixture-'));
  const file = join(dir, 'session.v2.jsonl');
  writeFileSync(file, records(wrap(valid)).map(r => JSON.stringify(r)).join('\n'));
  assert.equal(sessionMetrics(await readSession(file)).bodyComplete, true);
  writeFileSync(file, '{broken');
  await assert.rejects(readSession(file), /结构损坏/);
});

test('静态预览粗画标题、指标、对比、传导链、推荐，旁列 C6 与评分栏', () => {
  const text = `<section question="电价决定利润"><stat><item label="利润" ref="${result}" unit="亿元" /></stat>`
    + `<compare><bar label="甲" ref="${result}"/><bar label="乙" ref="${result}"/></compare>`
    + '<flow note="成本传导"><step>煤价</step><step>成本</step><step>利润</step></flow>'
    + '<suggest type="question"><q>下一步看什么？</q></suggest></section>';
  const metrics = evaluate(records(wrap(text)));
  metrics.refResolution = { ratio: 1 };
  const html = previewHtml({ question: questions[2], repeat: 1, status: 'evaluated', metrics,
    passed: true, expected: true }, metrics.componentBlocks);
  for (const value of ['电价决定利润', '指标', '甲', '乙', '煤价', '下一步看什么？', result,
    'C6 指标', '可解析元素', '100.0%', '正文在最后一步', '组合评分', '评分理由']) assert.ok(html.includes(value), value);
  assert.ok(!html.includes('结论：利润取决于量价成本。'));
  assert.ok(html.includes('数值与图表数据未在此渲染'));
});

test('预览转义模型文本、属性和原文，不产生脚本、事件、外链或执行表达式', () => {
  const malicious = '<section question="&quot; onmouseover=alert(1)"><q>&lt;危险&gt;</q></section>'
    + '<script>alert(1)</script><img src="https://example.org" onerror="alert(2)"/>'
    + '<chart ref="javascript:alert(3)"/><grid cols={danger()}/>';
  const dir = mkdtempSync(join(tmpdir(), 'vibe-preview-fixture-'));
  const file = writePreview({ question: questions[0], repeat: 1, status: '<img onerror=x>' }, [malicious], dir);
  const html = readFileSync(file, 'utf8');
  assert.match(html, /&lt;script&gt;/);
  assert.match(html, /&amp;quot; onmouseover/);
  assert.match(html, /&lt;img onerror=x&gt;/);
  assert.ok(!/<\s*(script|img|iframe|object|embed|svg|link)\b/i.test(html));
  assert.ok(!/<[^>]+\s(?:on\w+|src|href)\s*=/i.test(html));
  assert.match(html, /default-src 'none'/);
  assert.match(html, /没有组件块|未展示组件/);
});

test('评测 CLI 每个运行生成独立本地预览，未运行不伪造指标', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'vibe-preview-cli-'));
  writeFileSync(join(dir, 'session.jsonl'), records('今天是周五。私密正文不进入预览。').map(r => JSON.stringify(r)).join('\n'));
  const flow = '<flow note="成本传导"><step>煤价</step><step>成本</step><step>利润</step></flow>';
  const proposed = records(wrap(flow));
  proposed.splice(4, 0, { type: 'tool/call', data: { turn: 1, step: 1, name: 'propose_maintenance' } });
  writeFileSync(join(dir, 'session.v2.jsonl'), proposed.map(r => JSON.stringify(r)).join('\n'));
  const manifest = join(dir, 'runs.json');
  writeFileSync(manifest, JSON.stringify({ runs: [
    { question: questions[0], repeat: 1, log: 'session.jsonl' },
    { question: questions[0], repeat: 2, log: null },
    { question: questions[3], repeat: 1, log: 'session.v2.jsonl' },
  ] }));
  const prior = console.log;
  let report;
  console.log = value => { report = JSON.parse(value); };
  try { assert.equal(await main(['--manifest', manifest, '--backend', 'http://127.0.0.1:1/api/v1']), 1); }
  finally { console.log = prior; }
  assert.deepEqual(readdirSync(join(dir, 'previews')), ['Q1-1.html', 'Q1-2.html', 'Q4-1.html']);
  assert.equal(report.runs[0].preview, join(dir, 'previews/Q1-1.html'));
  assert.match(readFileSync(report.runs[0].preview, 'utf8'), /没有组件块/);
  assert.ok(!readFileSync(report.runs[0].preview, 'utf8').includes('私密正文'));
  assert.match(readFileSync(report.runs[1].preview, 'utf8'), /<dd>未运行<\/dd>/);
  assert.match(readFileSync(report.runs[2].preview, 'utf8'), /成本传导/);
  assert.equal(report.runs[2].passed, true);
  assert.deepEqual(report.runs[2].metrics.writeCalls, ['propose_maintenance']);
  assert.equal(report.runs.some(r => r.status === 'stopped'), false);
});
