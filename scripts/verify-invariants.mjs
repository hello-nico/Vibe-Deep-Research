#!/usr/bin/env node
// Mechanical checks for docs/contracts/invariants.md.
//   #16 DSH patches: every patch targets an exactly pinned dependency at the patched version
//       (package.json and package-lock.json) and is registered in desktop/dsh/runtime/README.md.
//   #17 Server plugin registrations: every webServer/tools registration in desktop/dsh/finance-ui/*.mjs
//       hands its disposer to track(), returns it from an install function whose call is tracked,
//       or stores it in a dispose-named field.
// Usage: node scripts/verify-invariants.mjs [repo-root]
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join, resolve, relative } from "node:path";
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const ts = createRequire(new URL('../orchestrator/package.json', import.meta.url))('typescript');
// 来源：旧系统退役_Task_2026-09-15.md 的退役范围；对应提交 60b87aad 的删除路径/符号。
// 不禁用通用 legacy/Stage/localStorage：现用数据源、引用与界面偏好仍使用这些词。
export const RETIRED_IDENTIFIERS = [
  'local_agent_runtime', 'local_agent_stage_agent', 'task_router', 'runtime_provider',
  'run_tools_mcp', 'stageOutputSchema', 'vra_run.write_stage', 'start_research',
  '/research/legacy', 'llmStore', 'vr-llm', 'loadUserLlm', 'saveUserLlm', 'readAiRuntime',
];
export function registrationProblems(sources) {
  const trees = Object.entries(sources).map(([name, text]) => ts.createSourceFile(name, text, ts.ScriptTarget.Latest, true, ts.ScriptKind.JS));
  const trackedCalls = new Set();
  const walk = (node, visit) => { visit(node); ts.forEachChild(node, child => walk(child, visit)); };
  const isTrack = node => ts.isCallExpression(node) && ts.isIdentifier(node.expression) && node.expression.text === 'track';
  for (const tree of trees) walk(tree, node => {
    if (isTrack(node)) for (const arg of node.arguments) if (ts.isCallExpression(arg) && ts.isIdentifier(arg.expression)) trackedCalls.add(arg.expression.text);
  });
  const errors = [];
  for (const tree of trees) {
    for (const diagnostic of tree.parseDiagnostics) errors.push(`${tree.fileName}: source parse error ${ts.flattenDiagnosticMessageText(diagnostic.messageText, ' ')}`);
    walk(tree, node => {
      if (!ts.isCallExpression(node) || !ts.isPropertyAccessExpression(node.expression) || node.expression.name.text !== 'register') return;
      const registry = node.expression.expression;
      if (!ts.isPropertyAccessExpression(registry) || !['webServer', 'tools'].includes(registry.name.text)) return;
      let value = node;
      while (ts.isParenthesizedExpression(value.parent)) value = value.parent;
      const parent = value.parent;
      if (isTrack(parent) && parent.arguments.includes(value)) return;
      const dispose = name => name && /^dispose\w*$/i.test(name.getText(tree).replace(/^['"]|['"]$/g, ''));
      if ((ts.isPropertyAssignment(parent) || ts.isVariableDeclaration(parent)) && parent.initializer === value && dispose(parent.name)) return;
      if (ts.isBinaryExpression(parent) && parent.right === value && parent.operatorToken.kind === ts.SyntaxKind.EqualsToken) {
        const name = ts.isPropertyAccessExpression(parent.left) ? parent.left.name : parent.left;
        if (dispose(name)) return;
      }
      if (ts.isReturnStatement(parent)) {
        let fn = parent.parent;
        while (fn && !ts.isFunctionLike(fn)) fn = fn.parent;
        if (fn && ts.isFunctionDeclaration(fn) && fn.name && trackedCalls.has(fn.name.text)) return;
      }
      errors.push(`${tree.fileName}:${tree.getLineAndCharacterOfPosition(node.getStart(tree)).line + 1}: registration disposer is not passed to track() or stored in a dispose field`);
    });
  }
  return errors;
}

export function declarationProblems(patch, startup) {
  // 只证明仓库声明，不证明有效工具表；模型实际工具另用 audit-session-tools 本地审计。
  const errors = [];
  for (const id of ['tool-bash', 'tool-pwsh', 'tool-fs', 'tool-fs-search']) {
    const escaped = id.replace(/-/g, '\\-');
    const row = new RegExp(`^- id: ['"]?${escaped}['"]?\\s*\\n([\\s\\S]*?)(?=^- |$(?![\\s\\S]))`, 'm').exec(patch);
    if (!row || !/^  disabled: true\s*$/m.test(row[1])) errors.push(`#15 宿主 ${id} 必须显式 disabled: true`);
  }
  const preset = /^    - id: preset-vibe\s*\n([\s\S]*?)(?=^    - id:|$(?![\s\S]))/m.exec(patch)?.[1];
  if (!preset || !/^        id: vibe\s*$/m.test(preset) || !/^        plugins:\s*$/m.test(preset)) errors.push('#15 缺 preset-vibe 插件声明');
  if (preset && /^\s+- id:\s*['"]?tool[-_]|^\s+name:\s*['"]?@deepseek-ai\/dsh-tool-/m.test(preset)) errors.push('#15 preset-vibe plugins 不得包含 tool 行');
  const tree = ts.createSourceFile('dsh-dev.ts', startup, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
  let found = false;
  function visit(node) {
    if (ts.isObjectLiteralExpression(node)) {
      const property = key => node.properties.find(p => ts.isPropertyAssignment(p) && p.name.getText(tree).replace(/^['"]|['"]$/g, '') === key)?.initializer;
      const id = property('id'), config = property('config');
      if (id && ts.isStringLiteral(id) && id.text === 'agent-presets' && config && ts.isObjectLiteralExpression(config)) {
        const d = config.properties.find(p => ts.isPropertyAssignment(p) && p.name.getText(tree) === 'default')?.initializer;
        if (d && ts.isStringLiteral(d) && d.text === 'vibe') found = true;
        else errors.push('#15 dsh-dev.ts 默认预设必须为 vibe');
      }
    }
    ts.forEachChild(node, visit);
  }
  visit(tree);
  if (!found) errors.push('#15 dsh-dev.ts 缺 default: vibe 的声明');
  return errors;
}

export function retiredProblems(text, file) {
  const errors = [];
  for (const id of RETIRED_IDENTIFIERS) {
    const re = new RegExp(`(?<![\\w])${id.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?![\\w])`, 'g');
    for (const match of text.matchAll(re)) errors.push(`#18 ${file}:${text.slice(0, match.index).split('\n').length}: 禁用标识符 ${id}`);
  }
  if (/\b(?:from\s*|require\s*\(\s*)['"]electron(?:\/[^'"]*)?['"]/.test(text)) errors.push(`#18 ${file}: Electron 原生外壳导入`);
  return errors;
}

export function verifyInvariants(root) {
const errors = [];
const fail = (message) => errors.push(message);

// #16
const runtime = join(root, "desktop/dsh/runtime");
const patchDir = join(runtime, "patches");
if (existsSync(patchDir)) {
  const pkg = JSON.parse(readFileSync(join(runtime, "package.json"), "utf8"));
  const pins = { ...pkg.dependencies, ...pkg.overrides };
  const lock = existsSync(join(runtime, "package-lock.json"))
    ? JSON.parse(readFileSync(join(runtime, "package-lock.json"), "utf8")).packages ?? {}
    : {};
  const readme = readFileSync(join(runtime, "README.md"), "utf8");
  for (const file of readdirSync(patchDir).filter((n) => n.endsWith(".patch"))) {
    // patch-package naming: @scope+name+version.patch
    const match = /^(@[^+]+)\+(.+)\+(\d[^+]*)\.patch$/.exec(file) ?? /^([^@+][^+]*)\+(\d[^+]*)\.patch$/.exec(file);
    if (!match) { fail(`patches/${file}: unrecognized patch file name`); continue; }
    const [name, version] = match.length === 4 ? [`${match[1]}/${match[2]}`, match[3]] : [match[1], match[2]];
    const short = name.split("/").pop();
    if (pins[name] !== version) fail(`patches/${file}: ${name} must be pinned to exactly ${version} in package.json (found ${pins[name] ?? "none"})`);
    const locked = lock[`node_modules/${name}`]?.version;
    if (locked !== undefined && locked !== version) fail(`patches/${file}: package-lock.json has ${name}@${locked}`);
    if (!new RegExp(`^\\|\\s*${short.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "m").test(readme)) {
      fail(`patches/${file}: ${short} is not registered in desktop/dsh/runtime/README.md patch table`);
    }
  }
}

// #17
const plugin = join(root, "desktop/dsh/finance-ui");
if (existsSync(plugin)) {
  const files = readdirSync(plugin).filter((n) => n.endsWith(".mjs"));
  const sources = Object.fromEntries(files.map((n) => [n, readFileSync(join(plugin, n), "utf8")]));
  errors.push(...registrationProblems(Object.fromEntries(Object.entries(sources).map(([name, text]) => [`desktop/dsh/finance-ui/${name}`, text]))));
}

// #15 声明层（必须存在，不能因路径消失而悄悄跳过）。
const declaration = join(root, 'desktop/dsh/finance-ui/cordis.patch.yml');
const startup = join(root, 'desktop/dsh-dev.ts');
if (!existsSync(declaration) || !existsSync(startup)) fail('#15 缺产品工具/默认预设声明文件');
else errors.push(...declarationProblems(readFileSync(declaration, 'utf8'), readFileSync(startup, 'utf8')));

// #18 只扫描现用源码；不扫描 tests、历史文档、node_modules、运行日志或 DSH 补丁。
function scan(dir) {
  if (!existsSync(dir)) return;
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) scan(path);
    else if (entry.isFile() && /\.(?:[cm]?js|tsx?|ya?ml)$/.test(entry.name)) errors.push(...retiredProblems(readFileSync(path, 'utf8'), relative(root, path)));
  }
}
for (const dir of ['orchestrator/src', 'desktop/src', 'desktop/dsh/finance-ui', 'desktop/dsh/presets']) scan(join(root, dir));
for (const file of ['desktop/dsh-dev.ts', 'desktop/dsh/setup.ts']) if (existsSync(join(root, file))) errors.push(...retiredProblems(readFileSync(join(root, file), 'utf8'), file));
return errors;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
let errors;
try { errors = verifyInvariants(resolve(process.argv[2] ?? join(import.meta.dirname, '..'))); }
catch (error) { console.error(`verify-invariants: ${error.message}`); process.exit(1); }
if (errors.length) {
  console.error(`verify-invariants: ${errors.length} problem(s)`);
  for (const e of errors) console.error(`  ${e}`);
  process.exit(1);
}
console.log("verify-invariants: ok");
}
