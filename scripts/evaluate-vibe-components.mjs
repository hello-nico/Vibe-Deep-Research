#!/usr/bin/env node
// S0 离线/只读评测。只接收明确指定的新会话，不扫描私人配置或历史会话。
import { createReadStream, readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createInterface } from 'node:readline';
import { spawn } from 'node:child_process';

export const questions = [
  '今天周几', '华能国际今天走势如何', '华能蒙电靠什么赚钱、利润看什么',
  '电解铝利润现在在周期什么位置', '国庆外盘对神火、云铝的影响',
];
const catalog = {
  chart: ['ref'], stat: [], item: ['label', 'ref', 'unit'], compare: [],
  bar: ['label', 'ref'], flow: ['note'], step: ['ref'],
  scenario: ['ref', 'driver', 'outputs', 'title'], valuation: ['ref', 'show'],
  suggest: ['type'], q: [], section: ['question'], grid: ['cols'], row: [], tabs: [],
};
const children = { stat: ['item'], compare: ['bar'], flow: ['step'], suggest: ['q'] };
const subelements = { item: 'stat', bar: 'compare', step: 'flow', q: 'suggest' };
const numeric = /[-+−]?(?:\d[\d,]*(?:\.\d+)?|\.\d+)(?:[eE][-+]?\d+)?/g;
const refSyntax = /^(?:result:[a-f0-9]{32}|(?:claim|evidence|provider|calc|calculation):[^\s<>"']+)$/;
const ratio = (a, b) => b ? a / b : null;
const chars = value => Array.from(value.replace(/\s/g, '')).length;

export function fences(text) {
  const blocks = [], outside = [];
  let active;
  for (const line of text.split(/\r?\n/)) {
    if (active) {
      const close = /^ {0,3}(`{3,}|~{3,})\s*$/.exec(line);
      if (close && close[1][0] === active.mark[0] && close[1].length >= active.mark.length) {
        if (active.vibe) blocks.push({ text: active.lines.join('\n'), closed: true });
        active = undefined;
      } else active.lines.push(line);
    } else {
      const open = /^ {0,3}(`{3,}|~{3,})([^\n]*)$/.exec(line);
      if (open) active = { mark: open[1], vibe: open[2].trim() === 'vibe', lines: [] };
      else outside.push(line);
    }
  }
  if (active?.vibe) blocks.push({ text: active.lines.join('\n'), closed: false });
  return { blocks, outside: outside.join('\n') };
}

// 小型类 JSX 语法解析器：不执行 JS，不容忍表达式、重复属性或错误嵌套。
export function parseBlock(block) {
  const elements = [], stack = [], errors = [];
  const token = /<\/?[^>"']*(?:(?:"[^"]*"|'[^']*')[^>"']*)*>|[^<]+|</g;
  for (const match of block.text.matchAll(token)) {
    const value = match[0];
    if (!value.startsWith('<')) {
      if (stack.length) stack.at(-1).text += value;
      else if (value.trim()) errors.push('outside_element_text');
      continue;
    }
    if (/^<\//.test(value)) {
      const closing = /^<\/([A-Za-z][\w-]*)\s*>$/.exec(value);
      if (closing && stack.at(-1)?.name === closing[1]) stack.pop().closed = true;
      else { errors.push('mismatched_close'); if (stack.length) stack.at(-1).valid = false; }
      continue;
    }
    const opening = /^<([A-Za-z][\w-]*)([\s\S]*?)(\/?)>$/.exec(value);
    if (!opening) { elements.push({ name: '?', attrs: [], valid: false, closed: false, text: '' }); continue; }
    const node = { name: opening[1], attrs: [], valid: true, closed: Boolean(opening[3]),
      parent: stack.at(-1), children: [], text: '' };
    elements.push(node);
    node.parent?.children.push(node);
    let rest = opening[2];
    while (rest.trim()) {
      const attr = /^\s+([A-Za-z][\w-]*)\s*=\s*(?:"([^"]*)"|'([^']*)'|(\{[^}]*\})|([^\s"'=<>`{}]+))/.exec(rest);
      if (!attr) { node.valid = false; errors.push('invalid_attribute'); break; }
      if (node.attrs.some(([name]) => name === attr[1])) node.valid = false;
      if (attr[4]) { node.valid = false; errors.push('invalid_attribute'); }
      node.attrs.push([attr[1], attr[2] ?? attr[3] ?? attr[4] ?? attr[5]]);
      rest = rest.slice(attr[0].length);
    }
    if (!node.closed) stack.push(node);
  }
  for (const node of stack) node.valid = false;
  return { elements, errors };
}

export function analyze(text) {
  const { blocks, outside } = fences(text);
  const parsed = blocks.map(parseBlock), elements = parsed.flatMap(p => p.elements);
  let unknownElements = 0, unknownAttributes = 0, attributeCount = 0, literalNumbers = 0;
  const refs = [], violations = [];
  for (const node of elements) {
    const allowed = catalog[node.name];
    if (!allowed) unknownElements++;
    for (const [name, value] of node.attrs) {
      attributeCount++;
      if (!allowed?.includes(name)) unknownAttributes++;
      if (name === 'ref') refs.push(value);
      // 引用中的年份/哈希是标识，不是字面数值；没有合法引用前缀则不豁免。
      if (!(name === 'ref' && refSyntax.test(value))) literalNumbers += [...value.matchAll(numeric)].length;
    }
    const attrs = Object.fromEntries(node.attrs);
    if (subelements[node.name] && node.parent?.name !== subelements[node.name]) violations.push('child_parent');
    if (children[node.name] && node.children.some(c => !children[node.name].includes(c.name))) violations.push('child_kind');
    if (node.name === 'stat' && (node.children.length < 1 || node.children.length > 4)) violations.push('stat_count');
    if (node.name === 'compare' && (node.children.length < 2 || node.children.length > 8)) violations.push('compare_count');
    if (node.name === 'flow' && (node.children.length < 3 || node.children.length > 6)) violations.push('flow_count');
    if (node.name === 'suggest' && !['question', 'indicator', 'company'].includes(attrs.type)) violations.push('suggest_type');
    if (['chart', 'item', 'bar', 'scenario', 'valuation'].includes(node.name) && !attrs.ref) violations.push('missing_ref');
    if (node.name === 'step' && /\d/.test(node.text) && !attrs.ref) violations.push('step_number_without_ref');
    if (node.name === 'section' && !attrs.question?.trim()) violations.push('missing_section_question');
  }
  return {
    blocks: blocks.length, unclosedBlocks: blocks.filter(b => !b.closed).length,
    elements: elements.length, parseableRatio: ratio(elements.filter(e => e.valid && e.closed).length, elements.length),
    unknownElements, unknownElementRatio: ratio(unknownElements, elements.length),
    unknownAttributes, unknownAttributeRatio: ratio(unknownAttributes, attributeCount), literalNumbers,
    refs, bodyChars: chars(outside), tags: elements.filter(e => e.valid && e.closed && catalog[e.name]).map(e => e.name),
    violations: [...parsed.flatMap(p => p.errors), ...violations],
    componentBlocks: blocks.map(b => b.text),
  };
}

export function expected(question, metrics) {
  const tags = new Set(metrics.tags);
  if (question === questions[0]) return metrics.blocks === 0;
  if (question === questions[1]) return tags.has('chart');
  if (question === questions[2]) return tags.has('section') && (tags.has('stat') || tags.has('compare')) && tags.has('scenario');
  // 链上组织/缺口真实性/组合合理性不能从标签或关键词确定。
  return null;
}

function usageOnly(data) {
  if (data.usage) return data.usage;
  return data.stream?.filter(r => r.type === 'chunk' && r.chunk?.type === 'usage').at(-1)?.chunk.usage;
}
export function project(record) {
  const data = record.data ?? {};
  // 不读取 system/user 文本、推理、工具参数、工具结果或不透明 meta。
  if (record.type === 'session') return { type: record.type, preset: record.agentPreset ?? data.agentPreset };
  if (record.type === 'agent-preset/selected') return { type: record.type, preset: data.agentPreset };
  if (record.type === 'request/header') return { type: record.type, turn: data.turn,
    model: data.header?.config?.model, provider: data.header?.config?.provider };
  if (record.type === 'assistant/message') return { type: record.type, turn: data.turn, step: data.step,
    text: (data.message?.content ?? []).filter(b => b.type === 'text').map(b => b.text).join(''),
    interrupted: data.interrupted === true, usage: usageOnly(data) };
  if (record.type === 'assistant/attempt') return { type: record.type, turn: data.turn, step: data.step, usage: usageOnly(data) };
  if (record.type === 'tool/call') return { type: record.type, turn: data.turn, step: data.step, name: data.name };
  if (['step/start', 'turn/start', 'turn/end'].includes(record.type)) return { type: record.type,
    turn: data.turn, step: data.step, completed: data.reason?.kind === 'completed' };
  return undefined;
}

export function sessionMetrics(records, turn = 1) {
  const selected = records.filter(r => r.turn === turn);
  const messages = selected.filter(r => r.type === 'assistant/message');
  const last = messages.at(-1), lastStep = Math.max(0, ...selected.map(r => r.step ?? 0));
  const finalAtLastStep = Boolean(last && last.step === lastStep
    && !selected.slice(selected.indexOf(last) + 1).some(r => r.type === 'tool/call'));
  const attempts = selected.filter(r => ['assistant/message', 'assistant/attempt'].includes(r.type));
  const usageComplete = attempts.length > 0 && attempts.every(r => Number.isFinite(r.usage?.totalTokens)
    || (Number.isFinite(r.usage?.inputTokens) && Number.isFinite(r.usage?.outputTokens)));
  const tokens = attempts.reduce((n, r) => n + (r.usage?.totalTokens ?? ((r.usage?.inputTokens ?? 0)
    + (r.usage?.outputTokens ?? 0) + (r.usage?.cacheReadTokens ?? 0) + (r.usage?.cacheWriteTokens ?? 0))), 0);
  const metrics = analyze(last?.text ?? '');
  const presets = [...new Set(records.filter(r => typeof r.preset === 'string').map(r => r.preset))];
  const models = [...new Set(records.filter(r => typeof r.model === 'string').map(r => r.model))];
  const providers = [...new Set(records.filter(r => typeof r.provider === 'string').map(r => r.provider))];
  const toolNames = selected.filter(r => r.type === 'tool/call').map(r => r.name);
  // 警报代表请求写工具，不代表写入已发生；后台 hook 写入不在本工具日志中。
  const writeCalls = toolNames.filter(n => /(?:topic_(?:update|propose|attach|create)|wiki_(?:report_publish|refresh|validate)|stage_extraction|source_ingest|propose_maintenance|review_maintenance|memory.*(?:write|update)|note_(?:save|create))/.test(n));
  return { ...metrics, presets, models, providers, toolNames, writeCalls, tokens,
    usageComplete, overBudget: tokens > 300000,
    newSession: records.filter(r => r.type === 'turn/start').length === 1,
    finalAtLastStep,
    bodyComplete: Boolean(last && finalAtLastStep && metrics.bodyChars > 0 && !last.interrupted
      && metrics.unclosedBlocks === 0 && selected.some(r => r.type === 'turn/end' && r.completed)),
  };
}

export async function readSession(file) {
  if (!/session(?:\.v\d+)?\.jsonl(?:\.zstd)?$/.test(file)) throw new Error('仅接受指定 session JSONL 日志');
  const child = file.endsWith('.zstd') ? spawn('zstd', ['-q', '-dc', '--', file], { stdio: ['ignore', 'pipe', 'ignore'] }) : null;
  const done = child ? new Promise((ok, fail) => {
    child.on('error', () => fail(new Error('zstd 启动失败')));
    child.on('close', code => code === 0 ? ok() : fail(new Error('zstd 解压失败')));
  }) : Promise.resolve();
  done.catch(() => {});
  const reader = createInterface({ input: child?.stdout ?? createReadStream(file), crlfDelay: Infinity });
  const records = [];
  try {
    for await (const line of reader) {
      if (!line.trim()) continue;
      let record;
      try { record = project(JSON.parse(line)); } catch { throw new Error('会话日志结构损坏（不输出原文）'); }
      if (record) records.push(record);
    }
    await done;
  } finally { reader.close(); child?.kill(); }
  return records;
}

export async function resolveRefs(refs, backend, request = fetch) {
  const base = new URL(backend);
  if (base.protocol !== 'http:' || !['127.0.0.1', 'localhost', '[::1]'].includes(base.hostname)
    || base.username || base.password || base.search || base.hash) throw new Error('只允许无凭据的本机 Backend 地址');
  const outcomes = new Map();
  const call = (url, options = {}) => request(url, { ...options, redirect: 'error', signal: AbortSignal.timeout(15000) });
  const unique = [...new Set(refs)];
  for (const ref of unique.filter(r => r.startsWith('result:'))) {
    if (!/^result:[a-f0-9]{32}$/.test(ref)) { outcomes.set(ref, 'invalid'); continue; }
    try {
      const response = await call(`${backend.replace(/\/$/, '')}/research-results/${encodeURIComponent(ref)}`);
      const data = response.ok ? await response.json() : {};
      outcomes.set(ref, response.ok && data.result_id === ref && data.payload ? 'resolved' : 'unresolved');
    } catch { outcomes.set(ref, 'unavailable'); }
  }
  const other = unique.filter(r => !r.startsWith('result:'));
  for (let i = 0; i < other.length; i += 100) {
    const batch = other.slice(i, i + 100);
    try {
      const response = await call(`${backend.replace(/\/$/, '')}/wiki/refs/resolve`, {
        method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ refs: batch }),
      });
      const data = response.ok ? await response.json() : {};
      for (const ref of batch) outcomes.set(ref, data.results?.find(r => r.ref === ref)?.status === 'resolved' ? 'resolved' : 'unresolved');
    } catch { for (const ref of batch) outcomes.set(ref, 'unavailable'); }
  }
  return { total: refs.length, resolved: refs.filter(r => outcomes.get(r) === 'resolved').length,
    ratio: ratio(refs.filter(r => outcomes.get(r) === 'resolved').length, refs.length),
    outcomes: [...outcomes].map(([ref, status]) => ({ ref, status })) };
}

export function c7(metrics, question) {
  return metrics.newSession && metrics.presets.length === 1 && metrics.presets[0] === 'vibe'
    && metrics.models.length === 1 && metrics.providers.length === 1 && metrics.bodyComplete
    && !metrics.overBudget && metrics.usageComplete
    && metrics.literalNumbers === 0 && metrics.unclosedBlocks === 0 && metrics.violations.length === 0
    && metrics.unknownElements === 0 && metrics.unknownAttributes === 0
    && (metrics.blocks === 0 || metrics.parseableRatio >= 0.9)
    && (metrics.refs.length === 0 || metrics.refResolution?.ratio >= 0.9)
    && expected(question, metrics) !== false;
}

export function summarizeRuns(runs) {
  const finished = runs.filter(r => r.status === 'evaluated');
  const groups = questions.map(question => {
    const rows = finished.filter(r => r.question === question);
    return { question, evaluated: rows.length, passed: rows.filter(r => r.passed).length,
      stable: rows.length >= 3 && rows.every(r => r.passed) && new Set(rows.map(r => r.repeat)).size >= 3 };
  });
  const models = [...new Set(finished.flatMap(r => r.metrics.models.map(m => `${r.metrics.providers[0]}/${m}`)))];
  return { groups, models, recommendation: groups.every(g => g.stable) && models.length === 1
    ? '自动指标满足；组合与语义仍需用户评分后裁决 S1' : '证据未满足 C7；不得据此采用 S1，交由用户裁决' };
}

const escapeHtml = value => String(value ?? '').replace(/[&<>"']/g, c => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
})[c]);

// 仅用于打分：ref 显示为占位，不把未回读的数据画成数值，也不执行模型代码。
export function previewHtml(run, componentBlocks = []) {
  function component(node, depth = 0) {
    if (depth > 64) return '<div class="box">嵌套过深，停止预览</div>';
    const attrs = Object.fromEntries(node.attrs);
    const nested = (node.children ?? []).map(child => component(child, depth + 1)).join('');
    if (!catalog[node.name] || !node.valid || !node.closed) {
      return `<div class="box invalid">未展示组件：${escapeHtml(node.name)}${nested}</div>`;
    }
    const titles = { chart: '图表引用', stat: '指标', item: '指标项', compare: '对比', bar: '对比项',
      flow: '传导链', step: '步骤', scenario: '情景', valuation: '估值', suggest: '推荐',
      q: '推荐内容', section: '结论', grid: '网格', row: '行', tabs: '分页' };
    const title = node.name === 'section' ? attrs.question : attrs.label ?? attrs.title ?? titles[node.name];
    const description = Object.entries(attrs).filter(([key]) => !['question', 'label', 'title'].includes(key))
      .map(([key, value]) => `<div class="attr">${escapeHtml(key)}：${escapeHtml(value)}</div>`).join('');
    return `<div class="box ${node.name}"><strong>${escapeHtml(title)}</strong>${description}`
      + `<div class="text">${escapeHtml(node.text.trim())}</div>${nested}</div>`;
  }
  const components = componentBlocks.map((text, index) => {
    const parsed = parseBlock({ text, closed: true });
    return `<section><h2>组件块 ${index + 1}</h2>${parsed.elements.filter(node => !node.parent).map(node => component(node)).join('')}`
      + `<details><summary>组件原文（转义）</summary><pre>${escapeHtml(text)}</pre></details></section>`;
  }).join('') || '<p>没有组件块。</p>';
  const m = run.metrics;
  const percent = n => Number.isFinite(n) ? `${(n * 100).toFixed(1)}%` : '不适用';
  const yes = value => value === undefined || value === null ? '待核对' : value ? '是' : '否';
  const metrics = m ? [
    ['vibe 块数', m.blocks], ['可解析元素', percent(m.parseableRatio)],
    ['未知组件', `${m.unknownElements} / ${percent(m.unknownElementRatio)}`],
    ['未知属性', `${m.unknownAttributes} / ${percent(m.unknownAttributeRatio)}`],
    ['属性字面数字', m.literalNumbers], ['ref 可解析', percent(m.refResolution?.ratio)],
    ['块外正文字数', m.bodyChars], ['正文在最后一步', yes(m.finalAtLastStep)],
    ['正文结构完整', yes(m.bodyComplete)], ['预期组件符合', yes(run.expected)],
    ['自动指标通过', yes(run.passed)], ['tokens', m.tokens],
  ].map(([label, value]) => `<dt>${escapeHtml(label)}</dt><dd>${escapeHtml(value)}</dd>`).join('')
    : '<dt>指标</dt><dd>未运行</dd>';
  const code = `Q${questions.indexOf(run.question) + 1}-${run.repeat}`;
  return `<!doctype html>
<html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; form-action 'none'; base-uri 'none'">
<title>${escapeHtml(code)} 组件评分预览</title><style>
body{font:16px/1.6 system-ui,sans-serif;color:#17212b;margin:24px;background:#f5f6f8}main{display:grid;grid-template-columns:minmax(0,2fr) minmax(280px,1fr);gap:24px}.box,aside{background:white;border:1px solid #cbd3dc;border-radius:8px;padding:12px;margin:8px 0}.box .box{margin-left:12px}.attr,pre{overflow-wrap:anywhere;white-space:pre-wrap;font-size:13px}.invalid{border-color:#b66}.bar{border-left:8px solid #8aa9bc}.step{border-left:4px solid #809a85}.text{white-space:pre-wrap}dl{display:grid;grid-template-columns:1fr 1fr;gap:8px}dd{margin:0}label{display:block;margin-top:12px}textarea{width:95%;min-height:90px}@media(max-width:800px){main{display:block}}@media print{body{background:white}select,textarea{border:1px solid #999}}
</style></head><body><h1>${escapeHtml(code)}：${escapeHtml(run.question)}</h1>
<p>状态：${escapeHtml(run.status)}。静态评分草图；引用只显示标识，数值与图表数据未在此渲染。组件之外的回答不复制到本页。</p>
<main><article>${components}</article><aside><h2>C6 指标</h2><dl>${metrics}</dl>
<h2>组合评分</h2><p>1：错配或依据有问题；2：基本合理但帮助有限；3：组织清晰、组件有效且依据可信。</p>
<label>分数 <select aria-label="组合评分"><option value="">待评</option><option>1</option><option>2</option><option>3</option></select></label>
<label>一句理由 <textarea aria-label="评分理由"></textarea></label>
<p>评分不自动保存；填写后打印或复制记录。截图预留：screens/${escapeHtml(code)}.png</p></aside></main></body></html>\n`;
}

export function writePreview(run, componentBlocks, directory) {
  const question = questions.indexOf(run.question) + 1;
  if (!question || ![1, 2, 3].includes(run.repeat)) throw new Error('预览题目或轮次不合法');
  mkdirSync(directory, { recursive: true, mode: 0o700 });
  const file = join(directory, `Q${question}-${run.repeat}.html`);
  writeFileSync(file, previewHtml(run, componentBlocks), { mode: 0o600 });
  return file;
}

export async function main(args = process.argv.slice(2)) {
  if (args.length !== 4 || args[0] !== '--manifest' || args[2] !== '--backend') throw new Error('用法：node scripts/evaluate-vibe-components.mjs --manifest <临时清单.json> --backend http://127.0.0.1:端口/api/v1');
  const manifestFile = resolve(args[1]), manifest = JSON.parse(readFileSync(manifestFile, 'utf8'));
  if (!Array.isArray(manifest.runs) || manifest.runs.length > 15) throw new Error('清单必须包含至多 15 个 runs');
  const runs = [], seen = new Set();
  for (const run of manifest.runs) {
    if (!questions.includes(run.question) || ![1, 2, 3].includes(run.repeat)) throw new Error('题目或轮次不合法');
    const key = `${run.question}/${run.repeat}`;
    if (seen.has(key)) throw new Error('题目轮次重复');
    seen.add(key);
    const row = { question: run.question, repeat: run.repeat };
    if (!run.log) {
      const pending = { ...row, status: 'not_run' };
      pending.preview = writePreview(pending, [], join(dirname(manifestFile), 'previews'));
      runs.push(pending); continue;
    }
    const file = resolve(dirname(manifestFile), run.log);
    if (seen.has(file)) throw new Error('必须每次一个新会话日志');
    seen.add(file);
    const metrics = sessionMetrics(await readSession(file));
    metrics.refResolution = await resolveRefs(metrics.refs, args[3]);
    const passed = c7(metrics, run.question);
    const { componentBlocks, tags, ...safeMetrics } = metrics;
    const evaluated = { ...row, status: 'evaluated', passed, expected: expected(run.question, metrics), metrics: safeMetrics,
      ...!passed && componentBlocks.length ? { failureBlocks: componentBlocks } : {} };
    evaluated.preview = writePreview(evaluated, componentBlocks, join(dirname(manifestFile), 'previews'));
    runs.push(evaluated);
    // 修订 1 接受抽取与维护提案；工具名不能证明 Wiki 自动生效。
    // 写入停止条件须在浏览器运行中核实，保留 writeCalls 作诊断，不作安全通过证明。
    if (metrics.overBudget) {
      runs.push({ status: 'stopped', reason: 'over_300K' });
      break;
    }
  }
  console.log(JSON.stringify({ runs, summary: summarizeRuns(runs) }, null, 2));
  return runs.some(r => r.status === 'stopped') ? 2 : runs.length === 15 && runs.every(r => r.passed) ? 0 : 1;
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try { process.exitCode = await main(); } catch { console.error('评测失败：检查清单、日志格式和本机 Backend（不输出日志或配置原文）'); process.exitCode = 2; }
}
