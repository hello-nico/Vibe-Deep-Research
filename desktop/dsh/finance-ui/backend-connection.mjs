/** Shared Backend address and token. Token stays in the host process. */
import fs from 'node:fs';
import path from 'node:path';

export const DEFAULT_BACKEND_URL = 'http://127.0.0.1:8700/api/v1';
export const TOKEN_REJECTED = '服务器拒绝了访问令牌，请在设置里检查';
export const CLIENT_API = 1;
export const MIN_SERVER_API = 1;
export const SERVER_OUTDATED = '服务器版本过旧，请联系管理员更新';
export const CLIENT_OUTDATED = '客户端需要更新，请安装新版本';
const VERSION_HEADER = 'X-Vibe-Client-Version';
const IDENTITY_PATH = '/notes';
const COMPATIBILITY_MS = 10 * 60 * 1000;
const compatibilityCache = new Map();

export function maskSecrets(text, token = '') {
  let value = String(text ?? '');
  if (token) value = value.split(token).join('***');
  return value.replace(/Bearer\s+\S+/gi, 'Bearer ***');
}

export function connectionFile(env = process.env) {
  const home = String(env.DSH_HOME || '').trim();
  return home ? path.join(home, 'research', 'backend-connection.json') : '';
}

export function normalizeBackendUrl(raw) {
  const value = String(raw || '').trim();
  let parsed;
  try { parsed = new URL(value); } catch { return ''; }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return '';
  if (parsed.username || parsed.password) return '';
  return value.replace(/\/+$/, '');
}

export function readStoredConnection(env = process.env, fsImpl = fs) {
  const file = connectionFile(env);
  if (!file || !fsImpl.existsSync(file)) return null;
  let parsed;
  try { parsed = JSON.parse(fsImpl.readFileSync(file, 'utf8')); }
  catch { return { invalid: true }; }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return { invalid: true };
  const url = normalizeBackendUrl(parsed.url);
  if (!url) return { invalid: true };
  const token = typeof parsed.token === 'string' ? parsed.token : '';
  return { url, token };
}

export function resolveBackend(env = process.env, fsImpl = fs) {
  const stored = readStoredConnection(env, fsImpl);
  if (stored?.invalid) {
    const error = new Error('Backend 连接配置无法读取');
    error.code = 'backend_connection_invalid';
    throw error;
  }
  const version = String(env.VIBE_CLIENT_VERSION || '').trim() || 'unknown';
  if (stored?.url) return { url: stored.url, token: stored.token || '', version, source: 'file' };
  const rawEnv = String(env.STOCK_RESEARCH_BACKEND_URL || '').trim();
  if (rawEnv) {
    const url = normalizeBackendUrl(rawEnv);
    if (!url) throw new Error('STOCK_RESEARCH_BACKEND_URL must be an absolute HTTP URL');
    return { url, token: '', version, source: 'environment' };
  }
  return { url: DEFAULT_BACKEND_URL, token: '', version, source: 'default' };
}

export function backendHeaders(connection, extra = {}) {
  const headers = { ...extra, [VERSION_HEADER]: connection.version || 'unknown' };
  if (connection.token) headers.Authorization = `Bearer ${connection.token}`;
  return headers;
}

export function publicConnection(connection) {
  return { url: connection.url, has_token: Boolean(connection.token), status: connection.source };
}

export function writeConnection(body, env = process.env, fsImpl = fs) {
  const file = connectionFile(env);
  if (!file) throw Object.assign(new Error('DSH_HOME 未设置，不能保存 Backend 连接'), { status: 500 });
  // An empty address means "use this machine": drop the stored connection, token included.
  if (!String(body?.url ?? '').trim()) {
    if (fsImpl.existsSync(file)) fsImpl.rmSync(file, { force: true });
    clearCompatibilityCache();
    return resolveBackend(env, fsImpl);
  }
  const url = normalizeBackendUrl(body?.url);
  if (!url) throw Object.assign(new Error('服务器地址必须以 http:// 或 https:// 开头'), { status: 400 });
  const current = readStoredConnection(env, fsImpl);
  let token = current && !current.invalid ? current.token || '' : '';
  if (body && Object.hasOwn(body, 'token')) {
    if (typeof body.token !== 'string') throw Object.assign(new Error('访问令牌必须是字符串'), { status: 400 });
    token = body.token.trim() ? body.token : '';
  }
  fsImpl.mkdirSync(path.dirname(file), { recursive: true, mode: 0o700 });
  const tmp = `${file}.${process.pid}.tmp`;
  const payload = token ? { url, token } : { url };
  fsImpl.writeFileSync(tmp, `${JSON.stringify(payload)}\n`, { mode: 0o600 });
  fsImpl.renameSync(tmp, file);
  fsImpl.chmodSync(file, 0o600);
  clearCompatibilityCache();
  return resolveBackend(env, fsImpl);
}

export function clearCompatibilityCache() {
  compatibilityCache.clear();
}

export function compatibility(health) {
  const api = health && typeof health === 'object' ? health.api : undefined;
  if (!api || typeof api !== 'object') return 'server_outdated';
  const version = Number(api.version);
  const minClient = Number(api.min_client);
  if (!Number.isInteger(version) || version < MIN_SERVER_API) return 'server_outdated';
  if (!Number.isInteger(minClient) || CLIENT_API < minClient) return 'client_outdated';
  return 'ok';
}

export function compatibilityText(result) {
  if (result === 'server_outdated') return SERVER_OUTDATED;
  if (result === 'client_outdated') return CLIENT_OUTDATED;
  return '';
}

export async function readCompatibility(env = process.env, fetchImpl = fetch, fsImpl = fs) {
  const connection = resolveBackend(env, fsImpl);
  const cached = compatibilityCache.get(connection.url);
  if (cached && cached.expires > Date.now()) return cached;
  let health = null;
  try {
    const response = await fetchImpl(`${connection.url}/health`, {
      method: 'GET', headers: backendHeaders(connection, { Accept: 'application/json' }), signal: AbortSignal.timeout(5000),
    });
    if (response.ok) health = await response.json();
    else await response.body?.cancel?.();
  } catch {
    health = null;
  }
  if (!health) return { result: 'unreachable', text: '', url: connection.url, expires: 0 };
  const result = compatibility(health);
  const record = { result, text: compatibilityText(result), url: connection.url, expires: Date.now() + COMPATIBILITY_MS };
  compatibilityCache.set(connection.url, record);
  return record;
}

async function probe(url, headers, fetchImpl) {
  try {
    const response = await fetchImpl(url, { method: 'GET', headers, signal: AbortSignal.timeout(5000) });
    await response.body?.cancel?.();
    return response;
  } catch {
    return null;
  }
}

export async function testConnection(env = process.env, fetchImpl = fetch, fsImpl = fs) {
  const connection = resolveBackend(env, fsImpl);
  const headers = backendHeaders(connection, { Accept: 'application/json' });
  let healthResponse;
  try {
    healthResponse = await fetchImpl(`${connection.url}/health`, { method: 'GET', headers, signal: AbortSignal.timeout(5000) });
  } catch {
    return 'unreachable';
  }
  if (healthResponse.status === 401) { await healthResponse.body?.cancel?.(); return 'unauthorized'; }
  if (!healthResponse.ok) { await healthResponse.body?.cancel?.(); return 'unreachable'; }
  let body = null;
  try { body = await healthResponse.json(); } catch { body = null; }
  const identity = await probe(`${connection.url}${IDENTITY_PATH}`, headers, fetchImpl);
  if (!identity) return 'unreachable';
  if (identity.status === 401) return 'unauthorized';
  const result = compatibility(body);
  compatibilityCache.set(connection.url, {
    result, text: compatibilityText(result), url: connection.url, expires: Date.now() + COMPATIBILITY_MS,
  });
  return result;
}

function sendJson(res, status, payload) {
  res.writeHead(status, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
  res.end(JSON.stringify(payload));
}

async function readJson(req, limit = 8192) {
  let size = 0;
  const chunks = [];
  for await (const chunk of req) {
    size += chunk.length;
    if (size > limit) throw Object.assign(new Error('请求过大'), { status: 413 });
    chunks.push(chunk);
  }
  if (!chunks.length) return {};
  try { return JSON.parse(Buffer.concat(chunks).toString('utf8')); }
  catch { throw Object.assign(new Error('请求不是 JSON'), { status: 400 }); }
}

export function installBackendConnection(ctx, track = disposer => disposer) {
  track(ctx.webServer.register({ kind: 'exact', path: '/finance-backend-connection', async handler(req, res) {
      try {
        if (req.method === 'GET') { sendJson(res, 200, publicConnection(resolveBackend())); return; }
        if (req.method !== 'PUT') { res.writeHead(405); res.end(); return; }
        const saved = writeConnection(await readJson(req));
        sendJson(res, 200, publicConnection(saved));
      } catch (error) {
        sendJson(res, error.status || 500, { detail: maskSecrets(error.message || 'Backend 连接没有保存') });
      }
  }}));
  track(ctx.webServer.register({ kind: 'exact', path: '/finance-backend-connection/test', async handler(req, res) {
    if (req.method !== 'POST') { res.writeHead(405); res.end(); return; }
    try { sendJson(res, 200, { status: await testConnection() }); }
    catch (error) { sendJson(res, error.status || 500, { detail: maskSecrets(error.message || 'Backend 连接测试失败') }); }
  }}));
}
