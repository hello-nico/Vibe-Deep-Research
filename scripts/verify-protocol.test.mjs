import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, rmSync, chmodSync } from 'node:fs';
import { tmpdir, devNull } from 'node:os';
import { dirname, join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { SHARED_FILES, checklistProblems, taskProblems, verifyProtocol } from './verify-protocol.mjs';

const checklist = `# Human Checklist
## 两仓共享决定
<!-- shared:begin -->
### 系统归属
- Backend 拥有研究知识。（2026-10-09 确认｜规则）
<!-- shared:end -->
## 本仓决定
### 产品页面
- 页面沿正式接口读取。（2026-10-09 确认｜已实现：docs/contracts/product-ui.md）
## 待用户裁决
`;
const task = `# 测试 Task
状态：已派发
${Array.from({ length: 8 }, (_, i) => `## ${i + 1}. ${i === 5 ? 'Out of Scope' : i === 6 ? 'Stop Conditions' : '规格'}\n内容`).join('\n')}
## 9. 当前交接
1. 状态与结论：完成。
2. 改动文件：无。
3. 证据：真实。
4. 与规格的偏差及理由：无。
5. 未覆盖的缺口：无。
6. 下一步谁做什么：用户验收。
`;
function fixture(t) {
  const dir = mkdtempSync(join(tmpdir(), 'protocol-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const roots = [join(dir, 'Vibe-Deep-Research'), join(dir, 'Stock-Research')];
  const write = (root, path, text) => { mkdirSync(dirname(join(root, path)), { recursive: true }); writeFileSync(join(root, path), text); };
  for (const root of roots) {
    for (const path of SHARED_FILES) write(root, path, readFileSync(new URL(`../${path}`, import.meta.url)));
    write(root, 'AGENTS.md', '# 长期规则\n');
    write(root, root === roots[0] ? 'human-checklist.md' : 'docs/human-checklist.md', checklist);
    write(root, 'docs/tasks/active/example.md', task);
  }
  return { roots, write, strict: () => verifyProtocol(...roots) };
}
test('有效 Checklist 和 Task；代码块内长行豁免', () => {
  assert.deepEqual(checklistProblems(checklist), []);
  assert.deepEqual(taskProblems(task, 'fixture'), []);
  assert.deepEqual(taskProblems(task.replace('状态：已派发', '状态：已派发\n```\n' + 'x'.repeat(400) + '\n```'), 'fixture'), []);
});
for (const [name, change, message] of [
  ['三章顺序', s => s.replace('## 本仓决定', '## 其他决定'), 'C2'],
  ['共享标记', s => s.replace('<!-- shared:begin -->', ''), 'C2'],
  ['同名模块', s => s.replace('### 产品页面', '### 系统归属'), '同名'],
  ['同名条目', s => s.replace('- 页面沿正式接口读取。（2026-10-09 确认｜已实现：docs/contracts/product-ui.md）', '- Backend 拥有研究知识。（2026-10-09 确认｜规则）'), '重复'],
  ['缺日期', s => s.replace('2026-10-09 确认｜规则', '规则'), '日期或落点'],
  ['日期非法', s => s.replace('2026-10-09', '2026-02-30'), '日期或落点'],
  ['缺落点', s => s.replace('确认｜规则', '确认'), '日期或落点'],
  ['四行条目', s => s.replace('Backend 拥有研究知识。', 'Backend 拥有研究知识。\n  一\n  二\n  三'), '超过 3 行'],
  ['非条目正文', s => s.replace('### 产品页面', '### 产品页面\n普通正文'), '非条目正文'],
  ['清单超行数', s => s + '\n'.repeat(201), '超过 200 行'],
  ['清单长行', s => s.replace('页面沿正式接口读取。', '字'.repeat(301)), '300 字'],
  ...['以后述', '以本补充为准', '替代下文', '覆盖下文'].map(word => [word, s => s.replace('页面沿正式接口读取。', word), '禁用字样']),
]) test(`Checklist 反例：${name}`, () => assert.ok(checklistProblems(change(checklist)).some(e => e.includes(message))));
for (const [name, text, message] of [
  ['规格超 200 行', task.replace('## 1.', '\n'.repeat(201) + '## 1.'), '规格超过'],
  ['交接超 60 行', task + '\n'.repeat(61), '当前交接超过'],
  ['缺字段', task.replace('5. 未覆盖的缺口：无。\n', ''), '缺字段'],
  ['错顺序', task.replace('5. 未覆盖的缺口', '4. 未覆盖的缺口'), '顺序'],
  ['旧交接', task.replace('## 9. 当前交接', '## 9. 执行回填'), '阶段 D'],
  ['缺停止条件', task.replace('Stop Conditions', '其他'), 'Stop Conditions'],
  ['Task 长行', task.replace('状态：已派发', '字'.repeat(301)), '300 字'],
  ['第三次修订', task.replace('状态：已派发', '状态：已派发\n修订 3（2026-10-09）：原因'), '超过 2 次'],
]) test(`Task 反例：${name}`, () => assert.ok(taskProblems(text, 'fixture').some(e => e.includes(message))));
test('交接保留行数：空行也计入 60 行', () => {
  assert.ok(taskProblems(task.replace('1. 状态', '\n'.repeat(61) + '1. 状态'), 'fixture').some(e => e.includes('当前交接超过')));
});
test('两仓相同且日志豁免', t => {
  const f = fixture(t);
  f.write(f.roots[0], 'docs/tasks/active/example.log.md', 'invalid\n'.repeat(400));
  assert.deepEqual(f.strict().errors, []);
});
test('找不到另一仓库', t => {
  const f = fixture(t);
  assert.match(verifyProtocol(f.roots[0], join(f.roots[1], 'missing')).errors.join('\n'), /找不到另一个仓库/);
});
test('共享章有字节差异时输出 diff；CRLF 不静默归一化', t => {
  const f = fixture(t);
  f.write(f.roots[1], 'docs/human-checklist.md', checklist.replace('Backend 拥有', 'Backend 保存'));
  assert.match(f.strict().errors.join('\n'), /共享章.*不一致[\s\S]*\n- .*\n\+ /);
  f.write(f.roots[1], 'docs/human-checklist.md', checklist.replaceAll('\n', '\r\n'));
  assert.match(f.strict().errors.join('\n'), /共享章.*不一致/);
});
for (const path of SHARED_FILES) test(`协议或脚本不一致：${path}`, t => {
  const f = fixture(t);
  f.write(f.roots[1], path, 'different\n');
  assert.ok(f.strict().errors.some(e => e.startsWith(path + ':')));
});
for (const word of ['本轮', 'M8.5', 'T2-b']) test(`AGENTS 反例：${word}`, t => {
  const f = fixture(t);
  f.write(f.roots[0], 'AGENTS.md', word);
  assert.match(f.strict().errors.join('\n'), /AGENTS/);
});
test('Checklist 格式与 Task 错误均为硬门禁', t => {
  const f = fixture(t);
  f.write(f.roots[0], 'human-checklist.md', checklist + '以后述\n');
  const r = verifyProtocol(...f.roots);
  assert.match(r.errors.join('\n'), /C5 禁用字样/);
  f.write(f.roots[0], 'docs/tasks/active/example.md', task.replace('5. 未覆盖的缺口：无。\n', ''));
  assert.ok(verifyProtocol(...f.roots).errors.length > 0);
});
test('待重设计落点须有 Task，不能用空落点通过', () => {
  const redesigned = checklist.replace('已实现：docs/contracts/product-ui.md', '待重设计：T8');
  assert.deepEqual(checklistProblems(redesigned), []);
  assert.match(checklistProblems(redesigned.replace('待重设计：T8', '待重设计：')).join('\n'), /日期或落点/);
});
test('CLI --sibling 和环境变量；缺值失败', t => {
  const f = fixture(t);
  const script = new URL('./verify-protocol.mjs', import.meta.url).pathname;
  for (const args of [['--root', f.roots[0], '--sibling', f.roots[1]], ['--root', f.roots[0]]]) {
    const r = spawnSync(process.execPath, [script, ...args], { env: { ...process.env, VIBE_SIBLING_REPO: f.roots[1] } });
    assert.equal(r.status, 0, r.stderr.toString());
  }
  assert.equal(spawnSync(process.execPath, [script, '--sibling']).status, 1);
});
test('真实 Git 临时仓库：门禁失败拒绝提交，修正后可提交；安装器仅运行于临时仓库', t => {
  const f = fixture(t), root = f.roots[0];
  const git = (...args) => spawnSync('git', args, { cwd: root, encoding: 'utf8', env: { ...process.env, GIT_CONFIG_NOSYSTEM: '1', GIT_CONFIG_GLOBAL: devNull, GIT_AUTHOR_NAME: 'Fixture', GIT_AUTHOR_EMAIL: 'fixture@example.invalid', GIT_COMMITTER_NAME: 'Fixture', GIT_COMMITTER_EMAIL: 'fixture@example.invalid', VIBE_SIBLING_REPO: f.roots[1] } });
  assert.equal(git('init').status, 0);
  const install = spawnSync('sh', ['scripts/install-hooks'], { cwd: root, encoding: 'utf8', env: { ...process.env, GIT_CONFIG_NOSYSTEM: '1', GIT_CONFIG_GLOBAL: devNull } });
  assert.equal(install.status, 0, install.stderr);
  assert.equal(git('config', '--local', '--get', 'core.hooksPath').stdout.trim(), 'scripts/hooks');
  // Git 要求可执行位；fixture 与真实安装交付都设置该位。
  chmodSync(join(root, 'scripts/hooks/pre-commit'), 0o755);
  f.write(root, 'AGENTS.md', '本轮\n');
  assert.equal(git('add', '.').status, 0);
  const rejected = git('commit', '-m', 'fixture failure');
  assert.notEqual(rejected.status, 0);
  assert.match(rejected.stderr, /AGENTS/);
  f.write(root, 'AGENTS.md', '# 长期规则\n');
  assert.equal(git('add', 'AGENTS.md').status, 0);
  const accepted = git('commit', '-m', 'fixture success');
  assert.equal(accepted.status, 0, accepted.stderr);
});
