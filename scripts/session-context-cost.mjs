#!/usr/bin/env node
// 只读会话用量和工具返回长度；不加载个人配置或投影对话正文。
import { createReadStream, readdirSync } from 'node:fs';
import { join, resolve, basename, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';
import { createInterface } from 'node:readline';

export function project(record) {
  const data = record.data;
  if (record.type === 'assistant/message') {
    const usage = data?.usage;
    if (!usage) return null;
    const names = ['inputTokens', 'cacheReadTokens', 'cacheWriteTokens', 'outputTokens', 'totalTokens'];
    if (names.some(name => !Number.isSafeInteger(usage[name]) || usage[name] < 0))
      throw new Error('用量字段缺失或无效');
    return { type: 'usage', turn: data.turn, step: data.step, usage: Object.fromEntries(names.map(name => [name, usage[name]])) };
  }
  if (record.type === 'step/start' || record.type === 'step/end')
    return { type: record.type, turn: data?.turn, step: data?.step, time: record.time };
  if (record.type === 'tool/call') return { type: 'call', id: data?.callId, name: data?.name };
  if (record.type === 'tool/result') {
    const message = data?.message;
    const content = message?.content;
    // 仅测量文本长度，不保留文本。非文本附件无法用字符衡量，单独计数。
    return { type: 'result', id: message?.toolCallId,
      chars: Array.isArray(content) ? content.reduce((n, part) => n + (typeof part.text === 'string' ? part.text.length : 0), 0) : 0,
      nonTextParts: Array.isArray(content) ? content.filter(part => part.type !== 'text').length : 0 };
  }
  return null;
}

export function summarize(records) {
  const steps = new Map(), calls = new Map(), results = [], tools = new Map();
  let malformed = 0;
  for (const record of records) {
    if (record?.type === 'malformed') { malformed++; continue; }
    if (!record) continue;
    if (record.type === 'call') calls.set(record.id, record.name);
    else if (record.type === 'result') results.push(record);
    else {
      const key = `${record.turn}:${record.step}`;
      const step = steps.get(key) ?? { turn: record.turn, step: record.step };
      if (record.type === 'usage') step.usage = record.usage; // 一步的最终用量，流式更新不重复相加。
      else step[record.type === 'step/start' ? 'start' : 'end'] = record.time;
      steps.set(key, step);
    }
  }
  const entries = [...steps.values()].sort((a, b) => a.turn - b.turn || a.step - b.step);
  const totals = { steps: entries.length, stepsWithUsage: 0, totalTokens: 0, uncachedInputTokens: 0,
    cacheReadTokens: 0, cacheWriteTokens: 0, outputTokens: 0, maxContextTokens: 0, elapsedMs: null, malformed };
  const perStep = entries.map(step => {
    const usage = step.usage;
    const contextTokens = usage ? usage.inputTokens + usage.cacheReadTokens + usage.cacheWriteTokens : null;
    if (usage) {
      totals.stepsWithUsage++;
      totals.totalTokens += usage.totalTokens;
      totals.uncachedInputTokens += usage.inputTokens;
      for (const name of ['cacheReadTokens', 'cacheWriteTokens', 'outputTokens']) totals[name] += usage[name];
      totals.maxContextTokens = Math.max(totals.maxContextTokens, contextTokens);
    }
    return { turn: step.turn, step: step.step, contextTokens, ...usage,
      elapsedMs: Number.isFinite(step.start) && Number.isFinite(step.end) ? step.end - step.start : null };
  });
  if (entries.length && entries.every(step => Number.isFinite(step.start) && Number.isFinite(step.end)))
    totals.elapsedMs = Math.max(...entries.map(s => s.end)) - Math.min(...entries.map(s => s.start));
  for (const result of results) {
    const name = calls.get(result.id) ?? '(unmatched)';
    const tool = tools.get(name) ?? { name, calls: 0, totalChars: 0, maxChars: 0, nonTextParts: 0 };
    tool.calls++; tool.totalChars += result.chars; tool.maxChars = Math.max(tool.maxChars, result.chars);
    tool.nonTextParts += result.nonTextParts; tools.set(name, tool);
  }
  return { totals, perStep, tools: [...tools.values()].sort((a, b) => b.totalChars - a.totalChars)
    .map(tool => ({ ...tool, meanChars: tool.totalChars / tool.calls })), characterUnit: 'UTF-16 code units' };
}

function* logs(dir) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.isSymbolicLink()) continue;
    const path = join(dir, entry.name);
    if (entry.isDirectory()) yield* logs(path);
    else if (entry.isFile() && /^session(?:\.v\d+)?\.jsonl(?:\.zstd)?$/.test(entry.name)) yield path;
  }
}

export async function audit(home, session) {
  if (!/^session-[a-f0-9][a-f0-9-]{7,}$/.test(session)) throw new Error('--session 需要会话 ID 或唯一前缀');
  const matches = [...logs(join(home, 'sessions'))].filter(file => basename(dirname(file)).startsWith(session));
  if (!matches.length) throw new Error('没有匹配会话');
  if (new Set(matches.map(dirname)).size !== 1) throw new Error('会话前缀不唯一');
  // 多个日志版本是同一会话的迁移副本，只统计最高版本；同版优先未压缩文件。
  matches.sort((a, b) => Number(b.match(/\.v(\d+)\./)?.[1] ?? 0) - Number(a.match(/\.v(\d+)\./)?.[1] ?? 0)
    || Number(a.endsWith('.zstd')) - Number(b.endsWith('.zstd')));
  const file = matches[0];
  const child = file.endsWith('.zstd') ? spawn('zstd', ['-q', '-dc', '--', file], { stdio: ['ignore', 'pipe', 'ignore'] }) : null;
  const completed = child ? new Promise((done, reject) => {
    child.on('error', () => reject(new Error('zstd 无法启动')));
    child.on('close', code => code === 0 ? done() : reject(new Error('zstd 解压失败')));
  }) : Promise.resolve();
  completed.catch(() => {});
  const selected = [];
  for await (const line of createInterface({ input: child?.stdout ?? createReadStream(file), crlfDelay: Infinity })) {
    if (!line.trim()) continue;
    try { selected.push(project(JSON.parse(line))); } catch { selected.push({ type: 'malformed' }); }
  }
  await completed;
  return { session: basename(dirname(file)), ...summarize(selected) };
}

export async function main(args = process.argv.slice(2)) {
  const root = resolve(import.meta.dirname, '..');
  let home = process.env.DSH_HOME ? resolve(root, process.env.DSH_HOME) : resolve(root, process.env.VRA_DATA_ROOT || '.local', 'dsh');
  let session;
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--home' && args[i + 1]) home = resolve(args[++i]);
    else if (args[i] === '--session' && args[i + 1]) session = args[++i];
    else throw new Error('用法：node scripts/session-context-cost.mjs --session <ID或唯一前缀> [--home <DSH home>]');
  }
  const result = await audit(home, session ?? '');
  console.log(JSON.stringify(result));
  return result.totals.stepsWithUsage === result.totals.steps && result.totals.steps > 0 && !result.totals.malformed ? 0 : 2;
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try { process.exitCode = await main(); } catch {
    console.error('成本统计失败：检查会话 ID、日志目录和 zstd；未输出路径或会话内容。');
    process.exitCode = 2;
  }
}
