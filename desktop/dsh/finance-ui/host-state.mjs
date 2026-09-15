import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const TOPIC_ID = /^topic:[0-9a-f]{12}$/;
const SESSION_ID = /^[A-Za-z0-9._:-]{8,128}$/;

function researchDir() {
  const home = (process.env.DSH_HOME || '').trim() || path.join(os.tmpdir(), 'vibe-dsh-home');
  const dir = path.join(home, 'research');
  fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
  return dir;
}

function readJson(file, fallback) {
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); }
  catch (error) { if (error.code === 'ENOENT') return fallback; throw error; }
}

function writeJson(file, payload) {
  const tmp = `${file}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(payload, null, 2) + '\n', { mode: 0o600 });
  fs.renameSync(tmp, file);
}

function send(res, status, body) {
  res.writeHead(status, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
  res.end(JSON.stringify(body));
}

async function readBody(req, limit = 2_000_000) {
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > limit) throw Object.assign(new Error('payload too large'), { status: 413 });
    chunks.push(chunk);
  }
  if (!chunks.length) return {};
  return JSON.parse(Buffer.concat(chunks).toString('utf8'));
}

export function topicSessionPath() {
  return path.join(researchDir(), 'topic-sessions.json');
}

export function loadTopicSessions() {
  const data = readJson(topicSessionPath(), { sessions: {}, topics: {} });
  return {
    sessions: data.sessions && typeof data.sessions === 'object' ? data.sessions : {},
    topics: data.topics && typeof data.topics === 'object' ? data.topics : {},
  };
}

export function bindTopicSession({ topic_id, session_id, title }) {
  if (!TOPIC_ID.test(topic_id || '')) throw Object.assign(new Error('invalid topic'), { status: 422 });
  if (!SESSION_ID.test(session_id || '')) throw Object.assign(new Error('invalid session'), { status: 422 });
  const store = loadTopicSessions();
  if (store.sessions[session_id] && store.sessions[session_id].topic_id !== topic_id) {
    throw Object.assign(new Error('session already belongs to another topic'), { status: 409 });
  }
  const now = new Date().toISOString();
  const current = store.topics[topic_id] || { session_ids: [], active_session_id: '', title: title || '', updated_at: now };
  const ids = [...new Set([...(current.session_ids || []), session_id])];
  store.topics[topic_id] = {
    session_ids: ids,
    active_session_id: session_id,
    title: title || current.title || '',
    updated_at: now,
  };
  store.sessions[session_id] = { topic_id, bound_at: now };
  writeJson(topicSessionPath(), store);
  return store.topics[topic_id];
}

function backendBase() {
  return (process.env.STOCK_RESEARCH_BACKEND_URL || 'http://127.0.0.1:8700/api/v1').replace(/\/$/, '');
}

async function proxyNotes(req, res, route) {
  const response = await fetch(backendBase() + route, { headers: { Accept: 'application/json' } });
  const body = await response.text();
  if (!response.ok && (!body || body === '[]' || body === '{}')) {
    send(res, response.status || 502, { detail: '研究记录服务不可用' });
    return;
  }
  res.writeHead(response.status, { 'Content-Type': response.headers.get('content-type') || 'application/json', 'Cache-Control': 'no-store' });
  res.end(body);
}

export function installHostState(ctx) {
  ctx.webServer.register({ kind: 'exact', path: '/finance-topic-sessions', async handler(req, res) {
    try {
      if (req.method === 'GET') { send(res, 200, loadTopicSessions()); return; }
      if (req.method !== 'POST') { res.writeHead(405); res.end(); return; }
      const body = await readBody(req);
      send(res, 200, bindTopicSession(body));
    } catch (error) {
      send(res, error.status || 500, { detail: error.message || 'topic session bind failed' });
    }
  } });
  ctx.webServer.register({ kind: 'exact', path: '/finance-note-digest', async handler(req, res) {
    try {
      if (req.method !== 'GET') { res.writeHead(405); res.end(); return; }
      await proxyNotes(req, res, '/notes?limit=40&offset=0');
    } catch (error) {
      send(res, error.status || 502, { detail: error.message || 'note digest failed' });
    }
  } });
  ctx.webServer.register({ kind: 'prefix', path: '/finance-notes', async handler(req, res) {
    try {
      if (req.method !== 'GET') { res.writeHead(405); res.end(); return; }
      const url = new URL(req.url, 'http://localhost');
      const rest = url.pathname.slice('/finance-notes'.length);
      if (!rest || rest === '/') {
        const query = url.search || '?limit=40&offset=0';
        await proxyNotes(req, res, `/notes${query}`);
        return;
      }
      await proxyNotes(req, res, `/notes/${encodeURIComponent(decodeURIComponent(rest.slice(1)))}`);
    } catch (error) {
      send(res, error.status || 502, { detail: error.message || 'note read failed' });
    }
  } });
}
