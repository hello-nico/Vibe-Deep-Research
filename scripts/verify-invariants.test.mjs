import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import { registrationProblems, declarationProblems, retiredProblems, RETIRED_IDENTIFIERS } from './verify-invariants.mjs';

test('#17 跨行未处理 disposer 必须报错，字符串和注释不伪装注册', () => {
  assert.equal(registrationProblems({ 'a.mjs': 'ctx.tools\n .register\n ({ name: "x" });' }).length, 1);
  assert.equal(registrationProblems({ 'a.mjs': '// ctx.tools.register({});\nconst text = "ctx.webServer.register({})";' }).length, 0);
});
for (const source of [
  'track(\nctx.webServer\n.register\n({}));',
  'const dispose = ctx.tools.register({});',
  'const value = {dispose: ctx.tools.register({})};',
  'this.disposeTool = ctx.tools.register({});',
]) test(`#17 有效处置：${source.split('\n')[0]}`, () => assert.deepEqual(registrationProblems({ 'a.mjs': source }), []));
test('#17 install 返回值只能在调用被 track 时放行', () => {
  const a = 'export function install(ctx) {return ctx.tools\n.register({});}';
  assert.equal(registrationProblems({ 'a.mjs': a }).length, 1);
  assert.deepEqual(registrationProblems({ 'a.mjs': a, 'b.mjs': 'track(install(ctx));' }), []);
  assert.equal(registrationProblems({ 'a.mjs': a, 'b.mjs': '// track(install(ctx));' }).length, 1);
});
test('#17 非 disposer 字段与语法错误拒绝', () => {
  assert.equal(registrationProblems({ 'a.mjs': 'const ignored = ctx.tools.register({});' }).length, 1);
  assert.ok(registrationProblems({ 'a.mjs': 'const = ;' }).length > 0);
});
const patch = readFileSync(new URL('../desktop/dsh/finance-ui/cordis.patch.yml', import.meta.url), 'utf8');
const startup = readFileSync(new URL('../desktop/dsh-dev.ts', import.meta.url), 'utf8');
test('#15 仓库声明满足当前约束', () => assert.deepEqual(declarationProblems(patch, startup), []));
for (const id of ['tool-bash', 'tool-pwsh', 'tool-fs', 'tool-fs-search']) test(`#15 宿主 ${id} 重新启用报错`, () => {
  assert.ok(declarationProblems(patch.replace(new RegExp(`(- id: ${id}\\n  name: [^\\n]+\\n  disabled:) true`), '$1 false'), startup).length > 0);
});
test('#15 预设挂 bash，即使宿主禁用也报错', () => {
  assert.ok(declarationProblems(patch.replace('        plugins:', '        plugins:\n          - id: tool-bash\n            name: "@deepseek-ai/dsh-tool-bash"'), startup).some(e => e.includes('tool 行')));
});
test('#15 默认 standard，缺声明与注释伪装均报错', () => {
  assert.ok(declarationProblems(patch, startup.replace('default: "vibe"', 'default: "standard"')).length > 0);
  assert.ok(declarationProblems(patch, '// default: "vibe"').length > 0);
  assert.ok(declarationProblems('', startup).length > 0);
});
for (const id of RETIRED_IDENTIFIERS) test(`#18 禁用标识符：${id}`, () => assert.ok(retiredProblems(`const text = "${id}";`, 'fixture.ts').length > 0));
test('#18 精确标识不误伤 legacy、localStorage 和较长合法词', () => {
  assert.deepEqual(retiredProblems('const Stage = "legacy"; localStorage.setItem("ui-layout", "x"); const newer_start_research_handler = 1;', 'fixture.ts'), []);
  assert.ok(retiredProblems('import {app} from "electron";', 'fixture.ts').length > 0);
});
