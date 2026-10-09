import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, statSync, utimesSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { audit, project, forbiddenTool, parseSince } from './audit-session-tools.mjs';

test('只投影授权字段，不包含会话内容与工具参数', () => {
  assert.deepEqual(project({ type: 'request/header', data: { header: { tools: [{ name: 'wiki_read', parameters: { private: true } }], content: 'PRIVATE' } } }), { preset: undefined, names: ['wiki_read'] });
  assert.deepEqual(project({ type: 'session', agentPreset: 'vibe', content: 'PRIVATE' }), { preset: 'vibe', names: undefined });
});
for (const name of ['bash', 'pwsh', 'shell', 'fs', 'read_file', 'write_file', 'edit_file', 'read', 'write', 'edit', 'apply_patch', 'dsh-tool-bash', 'file_write'])
  test(`禁用工具：${name}`, () => assert.ok(forbiddenTool(name)));
test('领域工具不按 file 子串误报', () => {
  for (const name of ['read_industry_profile', 'wiki_read', 'read_page_context', 'fetch_company_data', 'update_topic']) assert.equal(forbiddenTool(name), false);
});
function fixture(t) {
  const home = mkdtempSync(join(tmpdir(), 'tools-audit-'));
  t.after(() => rmSync(home, { recursive: true, force: true }));
  mkdirSync(join(home, 'sessions', 'fixture'), { recursive: true });
  return home;
}
test('CLI 禁用工具退出 1，只打印名称与计数；普通工具退出 0', async t => {
  const home = fixture(t), file = join(home, 'sessions/fixture/session.jsonl');
  const records = name => [JSON.stringify({ type: 'session', agentPreset: 'vibe', content: 'PRIVATE_MESSAGE' }), JSON.stringify({ type: 'request/header', data: { header: { tools: [{ name, description: 'PRIVATE_PROMPT' }], content: 'PRIVATE_SECRET' } } })].join('\n');
  const run = () => spawnSync(process.execPath, [new URL('./audit-session-tools.mjs', import.meta.url).pathname, '--home', home], { encoding: 'utf8' });
  writeFileSync(file, records('bash'));
  const failed = run();
  assert.equal(failed.status, 1);
  assert.ok(!/PRIVATE|description|parameters|fixture/.test(failed.stdout));
  writeFileSync(file, records('read_industry_profile'));
  assert.equal(run().status, 0);
  assert.equal((await audit(home)).totals.sessionsWithTools, 1);
});
test('无工具表、坏日志不冒充通过', t => {
  const home = fixture(t), file = join(home, 'sessions/fixture/session.jsonl');
  const run = () => spawnSync(process.execPath, [new URL('./audit-session-tools.mjs', import.meta.url).pathname, '--home', home], { encoding: 'utf8' });
  writeFileSync(file, JSON.stringify({ type: 'session', agentPreset: 'vibe' }));
  assert.equal(run().status, 2);
  writeFileSync(file, 'INVALID');
  assert.equal(run().status, 2);
});

test('--since 按会话目录创建时间过滤，忽略日志修改时间；不包含相等边界', async t => {
  const home = fixture(t), directory = join(home, 'sessions/fixture');
  const created = statSync(directory).birthtime.toISOString();
  const records = JSON.stringify({ type: 'session', agentPreset: 'vibe' }) + '\n' + JSON.stringify({ type: 'request/header', data: { header: { tools: [{ name: 'wiki_read' }] } } });
  writeFileSync(join(directory, 'session.v4.jsonl'), records);
  utimesSync(directory, new Date('2100-01-01T00:00:00Z'), new Date('2100-01-01T00:00:00Z'));
  assert.equal((await audit(home, { since: '1970-01-01T00:00:00Z' })).totals.sessions, 1);
  const excluded = await audit(home, { since: created });
  assert.equal(excluded.totals.sessions, 0);
  assert.equal(excluded.totals.skipped, 1);
  assert.deepEqual(excluded.tools, []);
});
test('--since 支持时区；拒绝缺值、非法日期、无时区和未知参数', () => {
  assert.equal(parseSince('2026-10-09T08:00:00+08:00'), parseSince('2026-10-09T00:00:00Z'));
  for (const value of ['2026-02-30T00:00:00Z', '2026-10-09', '2026-10-09T00:00:00', 'PRIVATE']) assert.throws(() => parseSince(value), /--since/);
  for (const args of [['--since'], ['--since', 'PRIVATE'], ['--unknown']]) {
    const r = spawnSync(process.execPath, [new URL('./audit-session-tools.mjs', import.meta.url).pathname, ...args], { encoding: 'utf8' });
    assert.equal(r.status, 2);
    assert.ok(!r.stderr.includes('PRIVATE'));
  }
});
test('--since 过滤后无样本不能通过；CLI 可与 --home 任意顺序组合', t => {
  const home = fixture(t);
  writeFileSync(join(home, 'sessions/fixture/session.jsonl'), JSON.stringify({ type: 'request/header', data: { header: { tools: [{ name: 'bash' }] } } }));
  for (const args of [['--home', home, '--since', '2100-01-01T00:00:00Z'], ['--since', '2100-01-01T00:00:00Z', '--home', home]]) {
    const r = spawnSync(process.execPath, [new URL('./audit-session-tools.mjs', import.meta.url).pathname, ...args], { encoding: 'utf8' });
    assert.equal(r.status, 2);
    assert.deepEqual(JSON.parse(r.stdout).tools, []);
  }
});
test('文件系统错误不输出会话路径或个人目录', t => {
  const home = mkdtempSync(join(tmpdir(), 'PRIVATE_PATH-'));
  t.after(() => rmSync(home, { recursive: true, force: true }));
  writeFileSync(join(home, 'sessions'), 'PRIVATE_CONTENT');
  const r = spawnSync(process.execPath, [new URL('./audit-session-tools.mjs', import.meta.url).pathname, '--home', home], { encoding: 'utf8' });
  assert.equal(r.status, 2);
  assert.equal(r.stdout, '');
  assert.ok(!/PRIVATE|sessions|ENOTDIR/.test(r.stderr));
  assert.match(r.stderr, /读取失败/);
});
