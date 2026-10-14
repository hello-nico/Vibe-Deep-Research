import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { researchErrorMessage } from '../src/verticals/finance/lib/researchSymbol.ts';
import {
  installBackendConnection, maskSecrets, publicConnection, resolveBackend, testConnection, writeConnection,
} from '../dsh/finance-ui/backend-connection.mjs';

function home() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'vibe-backend-connection-'));
  return { dir, env: { DSH_HOME: dir, VIBE_CLIENT_VERSION: '1.1.0' } };
}

test('地址优先级是配置文件、环境变量、本机默认，令牌只来自文件', () => {
  const bare = resolveBackend({});
  assert.equal(bare.url, 'http://127.0.0.1:8700/api/v1');
  assert.equal(bare.token, '');
  assert.equal(bare.source, 'default');
  assert.equal(bare.version, 'unknown');
  const fromEnv = resolveBackend({ STOCK_RESEARCH_BACKEND_URL: 'https://cloud.example/api/v1/', VIBE_CLIENT_VERSION: '9.9.9' });
  assert.equal(fromEnv.url, 'https://cloud.example/api/v1');
  assert.equal(fromEnv.source, 'environment');
  assert.equal(fromEnv.token, '');
  const { dir, env } = home();
  writeConnection({ url: 'https://file.example/api/v1', token: 'secret-token' }, env);
  const file = path.join(dir, 'research', 'backend-connection.json');
  assert.equal(fs.statSync(file).mode & 0o777, 0o600);
  const resolved = resolveBackend({ ...env, STOCK_RESEARCH_BACKEND_URL: 'https://env.example/api/v1' });
  assert.equal(resolved.url, 'https://file.example/api/v1');
  assert.equal(resolved.token, 'secret-token');
  assert.equal(resolved.source, 'file');
  assert.equal(resolved.version, '1.1.0');
  fs.writeFileSync(file, '{');
  assert.throws(() => resolveBackend({ ...env, STOCK_RESEARCH_BACKEND_URL: 'https://env.example/api/v1' }), /无法读取/);
});

test('PUT 保留或清除令牌，GET 与错误信息不泄露令牌', async () => {
  const { env } = home();
  writeConnection({ url: 'https://file.example/api/v1', token: 'secret-token' }, env);
  const kept = writeConnection({ url: 'https://file.example/api/v1/' }, env);
  assert.equal(kept.token, 'secret-token');
  const cleared = writeConnection({ url: 'https://other.example/api/v1', token: '' }, env);
  assert.equal(cleared.token, '');
  assert.equal(cleared.url, 'https://other.example/api/v1');
  assert.throws(() => writeConnection({ url: 'ftp://file.example', token: 'secret-token' }, env), /http:\/\/ 或 https:\/\//);
  const view = publicConnection(kept);
  assert.equal(JSON.stringify(view).includes('secret-token'), false);
  assert.equal(view.has_token, true);
  assert.equal(maskSecrets('Authorization: Bearer secret-token failed', 'secret-token').includes('secret-token'), false);
  let handler;
  const previous = process.env.DSH_HOME;
  process.env.DSH_HOME = env.DSH_HOME;
  process.env.VIBE_CLIENT_VERSION = '1.1.0';
  installBackendConnection({ webServer: { register(route) { if (route.path === '/finance-backend-connection') handler = route.handler; return () => {}; } } });
  const response = { status: 0, body: '', writeHead(status) { this.status = status; }, end(body) { this.body = body; } };
  await handler({ method: 'GET', async *[Symbol.asyncIterator]() {} }, response);
  assert.equal(response.body.includes('secret-token'), false);
  if (previous === undefined) delete process.env.DSH_HOME;
  else process.env.DSH_HOME = previous;
});

test('测试连接区分可达、拒绝和不可达，并带上令牌与版本头', async () => {
  const { env } = home();
  writeConnection({ url: 'https://cloud.example/api/v1', token: 'secret-token' }, env);
  const calls = [];
  const ok = await testConnection(env, async (url, init) => {
    calls.push({ url, headers: init.headers });
    return new Response('{}', { status: url.endsWith('/health') ? 200 : 200 });
  });
  assert.equal(ok, 'ok');
  assert.deepEqual(calls.map(call => call.url), ['https://cloud.example/api/v1/health', 'https://cloud.example/api/v1/notes']);
  assert.equal(calls[0].headers.Authorization, 'Bearer secret-token');
  assert.equal(calls[0].headers['X-Vibe-Client-Version'], '1.1.0');
  assert.equal(await testConnection(env, async () => new Response('', { status: 401 })), 'unauthorized');
  assert.equal(await testConnection(env, async () => { throw new Error('down'); }), 'unreachable');
  assert.equal(researchErrorMessage(401, { detail: 'secret-token' }), '服务器拒绝了访问令牌，请在设置里检查');
  assert.equal(researchErrorMessage(502, null), '资料没有保存成功，请稍后重试');
});

test('地址留空表示用本机：删除已存连接，回到默认地址', async () => {
  const fs = await import('node:fs');
  const os = await import('node:os');
  const path = await import('node:path');
  const { writeConnection, resolveBackend, DEFAULT_BACKEND_URL } = await import('../dsh/finance-ui/backend-connection.mjs');
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'vibe-conn-'));
  const env = { DSH_HOME: home };
  writeConnection({ url: 'https://example.invalid/api/v1', token: 'secret-token' }, env);
  assert.equal(resolveBackend(env).source, 'file');
  const cleared = writeConnection({ url: '' }, env);
  assert.equal(cleared.url, DEFAULT_BACKEND_URL);
  assert.equal(cleared.token, '');
  fs.rmSync(home, { recursive: true, force: true });
});
