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

export function readNoteLedger() {
  const file = (process.env.STOCK_RESEARCH_PRODUCT_NOTES || '').trim();
  if (!file) throw new Error('product ledger is not configured');
  let payload;
  try { payload = JSON.parse(fs.readFileSync(file, 'utf8')); }
  catch (error) { if (error.code === 'ENOENT') return { index: [], notes: {} }; throw error; }
  if (payload.kind !== 'note' || !Array.isArray(payload.records)) throw new Error('invalid product note ledger');
  const notes = {};
  const index = [];
  for (const item of payload.records) {
    const id = String(item.id || '');
    if (!id) continue;
    const content = String(item.body || '');
    notes[id] = {
      id,
      kind: String(item.category || ''),
      title: String(item.title || '').slice(0, 200),
      content,
      ts: Date.parse(item.created_at) || 0,
    };
    index.push({ id, kind: notes[id].kind, title: notes[id].title, ts: notes[id].ts });
  }
  index.sort((a, b) => b.ts - a.ts);
  return { index, notes };
}

function pageNotes(ledger, offset = 0, limit = 40) {
  const start = Math.max(0, Number(offset) || 0);
  const size = Math.min(40, Math.max(1, Number(limit) || 40));
  const index = Array.isArray(ledger.index) ? ledger.index : [];
  const notes = ledger.notes && typeof ledger.notes === 'object' ? ledger.notes : {};
  return {
    as_of: ledger.as_of || '',
    offset: start,
    limit: size,
    total: index.length,
    next_offset: start + size < index.length ? start + size : null,
    items: index.slice(start, start + size).map(item => ({
      id: item.id,
      kind: item.kind,
      title: item.title,
      excerpt: String(notes[item.id]?.content || '').slice(0, 400),
      ts: item.ts,
    })),
  };
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
      if (req.method === 'GET') { send(res, 200, pageNotes(readNoteLedger(), 0, 40)); return; }
      res.writeHead(405); res.end();
    } catch (error) {
      send(res, error.status || 500, { detail: error.message || 'note digest failed' });
    }
  } });
  ctx.webServer.register({ kind: 'prefix', path: '/finance-notes', async handler(req, res) {
    try {
      if (req.method !== 'GET') { res.writeHead(405); res.end(); return; }
      const url = new URL(req.url, 'http://localhost');
      const rest = url.pathname.slice('/finance-notes'.length);
      const ledger = readNoteLedger();
      if (!rest || rest === '/') {
        send(res, 200, pageNotes(ledger, url.searchParams.get('offset'), url.searchParams.get('limit')));
        return;
      }
      const id = decodeURIComponent(rest.slice(1));
      const notes = ledger.notes && typeof ledger.notes === 'object' ? ledger.notes : {};
      const note = notes[id] || notes[id.replace(/^note:/, '')];
      if (!note) { send(res, 404, { detail: 'note not in product ledger' }); return; }
      send(res, 200, note);
    } catch (error) {
      send(res, error.status || 500, { detail: error.message || 'note read failed' });
    }
  } });
}
