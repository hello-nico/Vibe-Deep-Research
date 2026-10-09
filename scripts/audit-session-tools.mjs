#!/usr/bin/env node
// 本地只读审计，不进钩子/CI。不加载 dsh_paths.ts（其路径解析会读取个人配置和 .env）。
// 沿同一默认/环境路径规则：DSH_HOME > <VRA_DATA_ROOT 或 .local>/dsh；配置自定义路径请显式 --home。
import { createReadStream, existsSync, readdirSync, statSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';
import { createInterface } from 'node:readline';

export const forbiddenTool = name => /^(?:read|write|edit|multi_edit|apply_patch)$/.test(name)
  || /(?:^|[./:_-])(?:bash|pwsh|powershell|shell|fs|read_file|write_file|edit_file|file_read|file_write|file_edit|apply_patch)(?:$|[./:_-])/.test(name);

export function project(record) {
  // 不遍历、保存或输出消息/工具结果/提示词/参数，只取用户授权的两个字段。
  const preset = record.type === 'session' ? record.agentPreset ?? record.data?.agentPreset : record.session?.agentPreset;
  const tools = record.type === 'request/header' ? record.data?.header?.tools : undefined;
  return { preset: typeof preset === 'string' ? preset : undefined,
    names: Array.isArray(tools) ? tools.map(t => t.name).filter(n => typeof n === 'string') : undefined };
}
function* logs(dir) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.isSymbolicLink()) continue;
    const path = join(dir, entry.name);
    if (entry.isDirectory()) yield* logs(path);
    else if (entry.isFile() && /^session(?:\.v\d+)?\.jsonl(?:\.zstd)?$/.test(entry.name)) yield path;
  }
}
export function parseSince(value) {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/.test(value))
    throw new Error('--since 需要带时区的 ISO 日期时间');
  const timestamp = Date.parse(value);
  if (!Number.isFinite(timestamp) || new Date(value.slice(0, 10)).toISOString().slice(0, 10) !== value.slice(0, 10))
    throw new Error('--since 日期时间无效');
  return timestamp;
}
export async function audit(home, { since } = {}) {
  const sessions = join(home, 'sessions');
  if (!existsSync(sessions)) throw new Error('sessions 目录不存在；自定义 DSH home 请显式传 --home（不读取配置文件）');
  const threshold = since === undefined ? undefined : parseSince(since);
  const totals = { sessions: 0, skipped: 0, sessionsWithTools: 0, headers: 0, malformed: 0 };
  const presets = new Map(), tools = new Map(), presetTools = new Map();
  for (const file of logs(sessions)) {
    // 不读取第三个日志字段。DSH 每会话目录的文件系统创建时间保持跨日志版本一致。
    // 复制/恢复目录会改变该时间；此时不能据此证明逻辑会话创建时间，需重新开会话验证。
    if (threshold !== undefined) {
      const created = statSync(dirname(file) === sessions ? file : dirname(file)).birthtime.getTime();
      if (!Number.isFinite(created) || created <= 0) throw new Error('文件系统未提供会话创建时间，不能执行 --since 审计');
      if (created <= threshold) { totals.skipped++; continue; }
    }
    totals.sessions++;
    let preset = '未标注', hasTools = false;
    const sessionTools = new Map();
    const child = file.endsWith('.zstd') ? spawn('zstd', ['-q', '-dc', '--', file], { stdio: ['ignore', 'pipe', 'ignore'] }) : null;
    const completed = child ? new Promise((done, reject) => {
      child.on('error', () => reject(new Error('zstd 无法启动')));
      child.on('close', code => code === 0 ? done() : reject(new Error('zstd 解压失败（未输出文件内容）')));
    }) : Promise.resolve();
    // 提前接拒绝处理，避免流读取期间未处理 Promise rejection。
    completed.catch(() => {});
    const stream = child?.stdout ?? createReadStream(file);
    const reader = createInterface({ input: stream, crlfDelay: Infinity });
    for await (const line of reader) {
      if (!line.trim()) continue;
      let selected;
      try { selected = project(JSON.parse(line)); } catch { totals.malformed++; continue; }
      if (selected.preset) preset = selected.preset;
      if (selected.names !== undefined) {
        totals.headers++; hasTools = true;
        for (const name of selected.names) {
          tools.set(name, (tools.get(name) ?? 0) + 1);
          sessionTools.set(name, (sessionTools.get(name) ?? 0) + 1);
        }
      }
    }
    await completed;
    presets.set(preset, (presets.get(preset) ?? 0) + 1);
    const byPreset = presetTools.get(preset) ?? new Map();
    for (const [name, count] of sessionTools) byPreset.set(name, (byPreset.get(name) ?? 0) + count);
    presetTools.set(preset, byPreset);
    if (hasTools) totals.sessionsWithTools++;
  }
  return { totals, presets: [...presets].sort(), tools: [...tools].sort(), presetTools: [...presetTools].sort().map(([preset, names]) => [preset, [...names].sort()]) };
}
export async function main(args = process.argv.slice(2)) {
  const root = resolve(import.meta.dirname, '..');
  let home = process.env.DSH_HOME ? resolve(root, process.env.DSH_HOME) : resolve(root, process.env.VRA_DATA_ROOT || '.local', 'dsh');
  let since;
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--home' && args[i + 1]) home = resolve(args[++i]);
    else if (args[i] === '--since' && args[i + 1]) since = args[++i];
    else throw new Error('用法：node scripts/audit-session-tools.mjs [--home <DSH home>] [--since <ISO 日期时间>]');
  }
  const result = await audit(home, { since });
  // JSON 字符串转义名字中的换行/控制符，输出只含预设、工具名与计数。
  console.log(JSON.stringify(result));
  if (result.tools.some(([name]) => forbiddenTool(name))) return 1;
  // 无工具表、损坏记录、空目录不构成通过证据。
  return result.totals.sessionsWithTools && !result.totals.malformed ? 0 : 2;
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try { process.exitCode = await main(); } catch (error) {
    console.error(error.code ? '会话审计读取失败（未输出路径或会话内容）' : error.message);
    process.exitCode = 2;
  }
}
