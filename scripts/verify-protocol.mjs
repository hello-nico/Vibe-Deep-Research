#!/usr/bin/env node
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const SHARED_FILES = [
  'docs/task-protocol.md', 'scripts/verify-protocol.mjs',
  'scripts/verify-protocol.test.mjs', 'scripts/hooks/pre-commit', 'scripts/install-hooks',
];
const fields = ['状态与结论', '改动文件', '证据', '与规格的偏差及理由', '未覆盖的缺口', '下一步谁做什么'];
const linesOf = text => text.replace(/\r\n/g, '\n').replace(/\n$/, '').split('\n');
const outsideCode = text => {
  let fence;
  return linesOf(text).map((line, index) => {
    const match = /^\s*(`{3,}|~{3,})/.exec(line);
    if (match) { fence = fence ? undefined : match[1][0]; return null; }
    return fence ? null : { line, index };
  }).filter(Boolean);
};
const longLines = (text, label) => outsideCode(text).filter(({ line }) => [...line].length > 300)
  .map(({ index }) => `${label}:${index + 1}: 单行超过 300 字`);

export function checklistProblems(text, label = 'Checklist') {
  const errors = [];
  const chapters = [...text.matchAll(/^## (.+)$/gm)].map(m => m[1].trim());
  const expected = ['两仓共享决定', '本仓决定', '待用户裁决'];
  if (JSON.stringify(chapters) !== JSON.stringify(expected)) errors.push(`${label}: C2 三章顺序不符`);
  if ((text.match(/<!-- shared:begin -->/g) ?? []).length !== 1 || (text.match(/<!-- shared:end -->/g) ?? []).length !== 1)
    errors.push(`${label}: C2 共享标记缺失或重复`);
  const shared = extractShared(text);
  const local = /^## 本仓决定\s*\n([\s\S]*?)(?=^## |$(?![\s\S]))/m.exec(text)?.[1] ?? '';
  if (shared !== null) {
    const modules = block => [...block.matchAll(/^### (.+)$/gm)].map(m => m[1].trim());
    const items = block => [...block.matchAll(/^- (.+)(?:\n[ \t]+[^\n]+)*/gm)].map(m => m[0].replace(/\s+/g, ' ').trim());
    for (const module of modules(local)) if (modules(shared).includes(module)) errors.push(`${label}: 本仓与共享模块同名 ${module}`);
    for (const item of items(local)) if (items(shared).includes(item)) errors.push(`${label}: 本仓与共享条目重复 ${item}`);
  }
  if (linesOf(text).length > 200) errors.push(`${label}: C5 超过 200 行`);
  errors.push(...longLines(text, label));
  for (const { line, index } of outsideCode(text)) {
    if (/以后述|以本补充为准|替代下文|覆盖下文/.test(line)) errors.push(`${label}:${index + 1}: C5 禁用字样`);
  }
  // 待裁决章可用自由说明；前两章只接受模块标题、标记、空行和 1–3 行条目。
  const body = text.slice(text.search(/^## 两仓共享决定/m)).split(/^## 待用户裁决/m)[0];
  const lines = linesOf(body);
  for (let i = 0; i < lines.length; i++) {
    if (/^- /.test(lines[i])) {
      const start = i;
      let item = lines[i];
      while (i + 1 < lines.length && /^[ \t]+\S/.test(lines[i + 1])) item += '\n' + lines[++i];
      if (i - start + 1 > 3) errors.push(`${label}: C3 条目超过 3 行`);
      const ending = /（(\d{4}-\d{2}-\d{2}) 确认｜(规则|已实现：[^）]+|待实施：[^）]+|待重设计：[^）]+)）$/.exec(item.trim());
      if (!ending || Number.isNaN(Date.parse(ending[1])) || new Date(ending[1]).toISOString().slice(0, 10) !== ending[1])
        errors.push(`${label}: C3 条目缺有效日期或落点`);
    } else if (lines[i].trim() && !/^#{2,3} |^<!-- shared:(begin|end) -->$/.test(lines[i])) {
      errors.push(`${label}: C3 非条目正文`);
    }
  }
  return errors;
}

export function extractShared(text) {
  const start = text.indexOf('<!-- shared:begin -->');
  const end = text.indexOf('<!-- shared:end -->');
  return start >= 0 && end > start ? text.slice(start + '<!-- shared:begin -->'.length, end) : null;
}

export function taskProblems(text, label) {
  const index = text.search(/^## 9\. 当前交接\s*$/m);
  const specification = index >= 0 ? text.slice(0, index).trimEnd() : text.split(/^## 9\./m)[0].trimEnd();
  const errors = longLines(text, label);
  if (linesOf(specification).length > 200) errors.push(`${label}: Task 规格超过 200 行`);
  for (let n = 1; n <= 8; n++) if (!new RegExp(`^## ${n}\\. `, 'm').test(specification)) errors.push(`${label}: 缺 §${n}`);
  if (!/^## .*(Out of Scope|范围外)/m.test(specification)) errors.push(`${label}: 缺 Out of Scope`);
  if (!/^## .*(Stop Conditions|停止条件)/m.test(specification)) errors.push(`${label}: 缺 Stop Conditions`);
  if (index < 0) errors.push(`${label}: 缺 ## 9. 当前交接（阶段 D 待迁移）`);
  else {
    const handoff = text.slice(index);
    if (linesOf(handoff).length > 60) errors.push(`${label}: 当前交接超过 60 行`);
    const present = [...handoff.matchAll(/^([1-6])\. ([^：\n]+)：/gm)].map(m => [Number(m[1]), m[2]]);
    if (present.length !== 6 || present.some(([n, field], i) => n !== i + 1 || field !== fields[i]))
      errors.push(`${label}: 当前交接缺字段或顺序错误（固定六字段）`);
    if (/^#{2,} /m.test(handoff.split('\n').slice(1).join('\n'))) errors.push(`${label}: 当前交接不得追加章节`);
  }
  for (const m of text.matchAll(/^修订 (\d+)/gm)) if (Number(m[1]) > 2) errors.push(`${label}: 修订超过 2 次，应另开 Task`);
  return errors;
}

function byteDiff(a, b, label) {
  const left = a.toString('utf8').split('\n'), right = b.toString('utf8').split('\n');
  const index = left.findIndex((line, i) => line !== right[i]);
  const i = index < 0 ? Math.min(left.length, right.length) : index;
  return `${label}: 两仓逐字节不一致\n@@ line ${i + 1} @@\n- ${left[i] ?? '<EOF>'}\n+ ${right[i] ?? '<EOF>'}`;
}

export function verifyProtocol(root, sibling) {
  const errors = [];
  root = resolve(root); sibling = resolve(sibling);
  if (!existsSync(sibling)) return { errors: [`找不到另一个仓库：${sibling}`] };
  const read = (repo, path) => {
    if (!existsSync(join(repo, path))) { errors.push(`${repo}: 缺文件 ${path}`); return null; }
    return readFileSync(join(repo, path));
  };
  for (const path of SHARED_FILES) {
    const a = read(root, path), b = read(sibling, path);
    if (a && b && !a.equals(b)) errors.push(byteDiff(a, b, path));
  }
  const checklists = [root, sibling].map(repo => {
    const path = existsSync(join(repo, 'human-checklist.md')) ? 'human-checklist.md' : 'docs/human-checklist.md';
    return read(repo, path)?.toString('utf8');
  });
  if (checklists.every(t => t !== undefined)) {
    const shared = checklists.map(extractShared);
    if (shared.every(t => t !== null)) {
      if (shared[0] !== shared[1]) errors.push(byteDiff(Buffer.from(shared[0]), Buffer.from(shared[1]), '共享章'));
    }
    for (let i = 0; i < 2; i++) errors.push(...checklistProblems(checklists[i], `${i ? '另一仓' : '本仓'} Checklist`));
  }
  const agents = read(root, 'AGENTS.md')?.toString('utf8');
  if (agents && /本轮|\bM\d+(?:\.\d+)?\b|\bT\d+(?:-[a-z])?\b/.test(agents)) errors.push('AGENTS 含本轮或里程碑编号');
  const active = join(root, 'docs/tasks/active');
  if (existsSync(active)) for (const name of readdirSync(active).filter(n => n.endsWith('.md') && !n.endsWith('.log.md')))
    errors.push(...taskProblems(readFileSync(join(active, name), 'utf8'), `docs/tasks/active/${name}`));
  return { errors };
}

export function main(args = process.argv.slice(2)) {
  let root = resolve(import.meta.dirname, '..'), sibling;
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--root' && args[i + 1]) root = resolve(args[++i]);
    else if (args[i] === '--sibling' && args[i + 1]) sibling = resolve(args[++i]);
    else throw new Error(`未知或缺值参数：${args[i]}`);
  }
  const isVibe = existsSync(join(root, 'human-checklist.md'));
  sibling ??= process.env.VIBE_SIBLING_REPO ? resolve(process.env.VIBE_SIBLING_REPO) : resolve(root, '..', isVibe ? 'Stock-Research' : 'Vibe-Deep-Research');
  const { errors } = verifyProtocol(root, sibling);
  for (const error of errors) console.error(error);
  console.log(`verify-protocol: ${errors.length ? `${errors.length} problem(s)` : 'ok'}`);
  return errors.length ? 1 : 0;
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try { process.exitCode = main(); } catch (error) { console.error(error.message); process.exitCode = 1; }
}
