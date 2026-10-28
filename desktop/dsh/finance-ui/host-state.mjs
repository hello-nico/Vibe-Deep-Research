import { randomBytes, randomUUID } from 'node:crypto';
import { AsyncLocalStorage } from 'node:async_hooks';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { backendHeaders, readCompatibility, resolveBackend, TOKEN_REJECTED, maskSecrets } from './backend-connection.mjs';
import { REPORT_CHILD_PERSONA, RESEARCH_CHILD_PERSONA } from './child-personas.mjs';
import { resolveResearchTitle, researchTitleOf } from './research-title.mjs';

const taskCreation = new AsyncLocalStorage();

export async function startTaskActivation(ctx, spec, persona) {
  const creation = { persona };
  const release = ctx.on('agent/created', ({ agent }) => {
    if (taskCreation.getStore() !== creation) return;
    agent.ctx.tools.restrict({ allow: [] });
    agent.ctx.systemPrompt.section({ name: 'deployment:persona-prefix',
      order: agent.ctx.systemPrompt.getSectionOrder('DEPLOYMENT_PERSONA_PREFIX'), text: persona });
  });
  try {
    return await taskCreation.run(creation, () => ctx.subagents.startActivation(spec));
  } finally {
    release();
  }
}

const TOPIC_ID = /^topic:[0-9a-f]{12}$/;
const SESSION_ID = /^[A-Za-z0-9._:-]{8,128}$/;
const REPORT_SLUG = /^(?:topic:[0-9a-f]{12}|(companies|industries|themes|comparisons)\/[A-Za-z0-9._一-鿿-]+(?:\/[A-Za-z0-9._一-鿿-]+)*)$/;
const INPUT_HASH = /^[a-f0-9]{64}$/;
// Page keys and Wiki targets share the same ASCII/CJK identity alphabet.
const PAGE_KEY = /^[A-Za-z0-9._一-鿿:/-]{1,180}$/;
const ASSISTANT_MODE = /^(ask|agent)$/;
const assistantPageContexts = new Map();
const pageContextTools = new Map();

// deep_research 页面会话的快照由 Stock 每轮隐藏注入，不再给模型 read_page_context 工具。
const deepResearchBound = sessionId => loadAssistantSessions().sessions[sessionId]?.plugin === 'deep_research';

// Stock 研究插件加载时把暂存函数挂在进程全局（同一个 Symbol 键），两插件不互相按路径加载模块。
const STOCK_PAGE_CONTEXT_STAGE = Symbol.for('stock-research.page-context.stage');
let stockStage = null;
export function setStockPageContextStage(stage) { stockStage = typeof stage === 'function' ? stage : null; }
function currentStockStage() {
  if (stockStage) return stockStage;
  const shared = globalThis[STOCK_PAGE_CONTEXT_STAGE];
  return typeof shared === 'function' ? shared : null;
}

export function ensureAssistantPageContextTool(ctx, sessionId) {
  if (deepResearchBound(sessionId)) {
    pageContextTools.get(sessionId)?.dispose();
    pageContextTools.delete(sessionId);
    return Boolean(liveAgent(ctx, sessionId));
  }
  const agent = liveAgent(ctx, sessionId);
  if (!agent?.ctx?.tools?.register) return false;
  if (pageContextTools.get(sessionId)?.agent !== agent) {
    pageContextTools.get(sessionId)?.dispose();
    pageContextTools.set(sessionId, { agent, dispose: agent.ctx.tools.register(pageContextTool()) });
  }
  return true;
}

function nextAssistantTurn(session) {
  const turns = (session?.snapshotEvents?.() || []).filter(event => event.type === 'turn/start');
  const last = turns.at(-1);
  const events = session?.snapshotEvents?.() || [];
  if (last && !events.some(event => event.type === 'turn/end' && event.data?.turn === last.data?.turn))
    throw Object.assign(new Error('当前回答尚未结束，请稍后发送'), { status: 409 });
  return (last?.data?.turn || 0) + 1;
}

export function stageAssistantPageContext(ctx, input) {
  const { session_id: sessionId, page_name: pageName, content } = input || {};
  if (!SESSION_ID.test(sessionId || '') || !loadAssistantSessions().sessions[sessionId])
    throw Object.assign(new Error('问助手会话不存在'), { status: 404 });
  if (typeof pageName !== 'string' || !pageName.trim() || pageName.length > 200
    || typeof content !== 'string' || !content.trim() || content.length > 120_000)
    throw Object.assign(new Error('页面上下文无效'), { status: 422 });
  const session = ctx.sessions?.get?.(sessionId);
  if (!session) throw Object.assign(new Error('问助手会话尚未就绪'), { status: 404 });
  if (!ensureAssistantPageContextTool(ctx, sessionId))
    throw Object.assign(new Error('问助手工具暂不可用'), { status: 503 });
  const turn = nextAssistantTurn(session);
  const turns = assistantPageContexts.get(sessionId) || new Map();
  const snapshot = Object.freeze({ status: 'ready', page_name: pageName.trim(), fetched_at: new Date().toISOString(), content });
  if (deepResearchBound(sessionId)) {
    const stage = currentStockStage();
    if (!stage) throw Object.assign(new Error('页面上下文通道暂不可用'), { status: 503 });
    if (!stage(sessionId, turn, snapshot)) throw Object.assign(new Error('页面上下文无效'), { status: 422 });
  }
  turns.set(turn, snapshot);
  while (turns.size > 8) turns.delete(turns.keys().next().value);
  assistantPageContexts.set(sessionId, turns);
  return { turn };
}

export function readAssistantPageContext(sessionId, turn) {
  return assistantPageContexts.get(sessionId)?.get(turn)
    || { status: 'missing', message: '本轮没有页面上下文' };
}

function currentAssistantTurn(session) {
  const events = session?.snapshotEvents?.() || [];
  const last = events.findLast(event => event.type === 'turn/start');
  if (!last || events.some(event => event.type === 'turn/end' && event.data?.turn === last.data?.turn)) return 0;
  return last.data?.turn || 0;
}

function pageContextTool() {
  return {
    name: 'read_page_context',
    description: 'Read the page snapshot and @ references pinned at send time for the current page-assistant turn. Call before answering.',
    parameters: { type: 'object', additionalProperties: false, properties: {} },
    output: {
      schema: { type: 'object', additionalProperties: true, properties: { status: { type: 'string' } }, required: ['status'] },
      render(_args, value) { return [{ type: 'text', text: JSON.stringify(value) }]; },
    },
    isConcurrencySafe: () => true,
    execute(_args, exec) {
      const session = exec?.agent?.session;
      const sessionId = session?.id;
      if (!sessionId || !loadAssistantSessions().sessions[sessionId]) return { status: 'missing', message: '本轮没有页面上下文' };
      return readAssistantPageContext(sessionId, currentAssistantTurn(session));
    },
  };
}

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

export function reportTasksPath() {
  return path.join(researchDir(), 'report-tasks.json');
}

export function assistantSessionsPath() {
  return path.join(researchDir(), 'assistant-sessions.json');
}

export function backgroundTasksPath() {
  return path.join(researchDir(), 'background-tasks.json');
}

const RUNNING_STALE_MS = 180000;

export function displayBackgroundStatus(task, now = Date.now()) {
  if (!task || typeof task !== 'object') return 'failed';
  if (task.finished_at) return task.status;
  if (task.status === 'running') {
    const started = Date.parse(task.started_at || '');
    if (!Number.isFinite(started) || now - started > RUNNING_STALE_MS) return 'interrupted';
    return 'running';
  }
  return task.status || 'failed';
}

export function loadBackgroundTasks() {
  const data = readJson(backgroundTasksPath(), { tasks: [] });
  const tasks = Array.isArray(data.tasks) ? data.tasks : [];
  const now = Date.now();
  return tasks.map(task => ({ ...task, ingest: Array.isArray(task.ingest) ? task.ingest.map(job => ({ ...job })) : task.ingest, display_status: displayBackgroundStatus(task, now) }));
}

export async function overlayIngestStatus(tasks) {
  await Promise.all((tasks || []).flatMap(task => (task.ingest || []).map(async job => {
    if (!job?.job_id || ['ready', 'failed'].includes(job.status)) return;
    try {
      const target = resolveBackend();
      const response = await fetch(`${target.url}/wiki/periodic-reports/jobs/${encodeURIComponent(job.job_id)}`, { headers: backendHeaders(target, { Accept: 'application/json' }), signal: AbortSignal.timeout(3000) });
      if (!response.ok) return;
      const latest = await response.json();
      if (latest.status) job.status = latest.status;
      if (latest.document_id) job.document_id = latest.document_id;
    } catch { /* listing still shows the last recorded job status */ }
  })));
  for (const task of tasks || []) {
    const pending = (task.ingest || []).some(job => job.job_id && !['ready', 'failed'].includes(job.status));
    if (!pending && task.status === 'waiting_ingest') {
      task.status = task.draft_token ? 'awaiting_authorization' : 'partial';
    }
    task.display_status = displayBackgroundStatus(task);
  }
  return tasks;
}

export function loadTopicSessions() {
  const data = readJson(topicSessionPath(), { sessions: {}, topics: {} });
  return {
    sessions: data.sessions && typeof data.sessions === 'object' ? data.sessions : {},
    topics: data.topics && typeof data.topics === 'object' ? data.topics : {},
  };
}

export function loadReportTasks() {
  const data = readJson(reportTasksPath(), { sessions: {} });
  return {
    sessions: data.sessions && typeof data.sessions === 'object' ? data.sessions : {},
    host_session_id: typeof data.host_session_id === 'string' ? data.host_session_id : '',
    pending: data.pending && typeof data.pending === 'object' ? data.pending : null,
  };
}

async function parentSessionOf(ctx, sessionId) {
  try {
    const live = ctx.sessions?.get?.(sessionId)?.header?.parentSession;
    if (live) return live;
  } catch { /* live lookup is best-effort */ }
  if (typeof ctx.sessionPersistence?.inspect !== 'function') return;
  try {
    const inspection = await ctx.sessionPersistence.inspect(sessionId);
    return inspection?.meta?.parentSession || inspection?.header?.parentSession;
  } catch { /* cold session may already be gone */ }
}

export async function reportTasksWithLineage(ctx) {
  const store = loadReportTasks();
  const sessions = {};
  for (const [id, binding] of Object.entries(store.sessions)) {
    const parent = await parentSessionOf(ctx, id);
    sessions[id] = { ...binding, ...(parent ? { parent_id: parent } : {}) };
  }
  return { ...store, sessions };
}

export function loadAssistantSessions() {
  const data = readJson(assistantSessionsPath(), { sessions: {}, pages: {} });
  return {
    sessions: data.sessions && typeof data.sessions === 'object' ? data.sessions : {},
    pages: data.pages && typeof data.pages === 'object' ? data.pages : {},
  };
}

function writeReportStore(store) {
  const payload = { sessions: store.sessions && typeof store.sessions === 'object' ? store.sessions : {} };
  if (store.host_session_id) payload.host_session_id = store.host_session_id;
  if (store.pending) payload.pending = store.pending;
  writeJson(reportTasksPath(), payload);
}

export function backgroundSessionIds(store = loadReportTasks()) {
  const ids = new Set(Object.keys(store.sessions || {}));
  if (store.host_session_id) ids.add(store.host_session_id);
  return ids;
}

const reportRuns = new Map();
let spawnChain = Promise.resolve();
let hostHandle = null;
let bootId = randomUUID();
let researchBootScan = Promise.resolve();

const RESEARCH_STEPS = [
  { key: 'fetch', label: '收集资料' },
  { key: 'read_report', label: '读报告' },
  { key: 'key_variables', label: '算价格对利润的影响' },
  { key: 'valuation', label: '估值与判断' },
  { key: 'save', label: '保存资料' },
  { key: 'settle', label: '整理结论' },
];
const RESEARCH_FAIL_REASON = '这次没完成，可以稍后重新研究';
const RESEARCH_MODEL_REASON = '请先在设置中配置模型';
const ACTIVATION_LIMIT_REASON = '同时运行的子任务已达上限，请等待已有任务结束后重新研究';
const runtimeLifetimes = new WeakMap();
const activeLifetimes = new Set();

function lifetimeFor(ctx) {
  if (!runtimeLifetimes.has(ctx)) {
    const lifetime = new AbortController();
    runtimeLifetimes.set(ctx, lifetime);
    activeLifetimes.add(lifetime);
  }
  return runtimeLifetimes.get(ctx);
}

function assertActive(signal) {
  if (signal.aborted) throw Object.assign(new Error('报告任务运行时已卸载'), { status: 503 });
}
const PENDING_STALE_MS = 15_000;

function liveAgent(ctx, sessionId) {
  try { return ctx?.agents?.get?.(sessionId) || null; }
  catch { return null; }
}

/** `agents.create()` returns `{ agent, dispose }`; a raw Agent is not a valid create result. */
export function unwrapCreatedAgent(created) {
  return created?.agent?.session?.id ? created.agent : null;
}

async function releaseHandle(handle) {
  if (!handle?.dispose) return;
  try { await handle.dispose(); }
  catch { /* already released */ }
}

async function ensureTaskHost(ctx, signal) {
  assertActive(signal);
  const store = loadReportTasks();
  const existing = store.host_session_id ? liveAgent(ctx, store.host_session_id) : null;
  if (existing?.session?.id) return existing;
  if (hostHandle) {
    const stale = hostHandle;
    hostHandle = null;
    await releaseHandle(stale);
    assertActive(signal);
  }
  if (!ctx?.agents?.create) throw Object.assign(new Error('报告子 Agent 能力不可用'), { status: 503 });
  const sessionId = randomUUID();
  const created = await ctx.agents.create({ sessionId, timezone: 'Asia/Shanghai' });
  if (signal.aborted) {
    await releaseHandle(created);
    assertActive(signal);
  }
  const agent = unwrapCreatedAgent(created);
  if (!agent) {
    await releaseHandle(created);
    throw Object.assign(new Error('任务宿主不可用'), { status: 503 });
  }
  hostHandle = created;
  const next = loadReportTasks();
  next.host_session_id = agent.session.id;
  writeReportStore(next);
  return agent;
}

function watchReportRun(run, abort, ctx) {
  const entry = { abort, run, ctx, cancelled: false };
  let release;
  const dispose = () => release ??= releaseHandle(run);
  const onAbort = () => { void dispose(); };
  abort.signal.addEventListener('abort', onAbort, { once: true });
  if (abort.signal.aborted) onAbort();
  const finish = Promise.resolve(run.result).then(result => {
    // An abort the user did not ask for (host shutdown or restart) is not a cancellation.
    finishResearchBinding(run.childId, entry.cancelled ? 'cancelled' : result?.stopReason === 'aborted' ? 'aborted'
      : result?.stopReason === 'completed' ? 'completed' : 'failed', ctx);
  }, () => {
    finishResearchBinding(run.childId, entry.cancelled ? 'cancelled' : 'failed', ctx);
  }).catch(() => {}).finally(async () => {
    abort.signal.removeEventListener('abort', onAbort);
    try { await dispose(); }
    finally { reportRuns.delete(run.childId); }
  });
  entry.finish = finish;
  entry.dispose = dispose;
  reportRuns.set(run.childId, entry);
  return finish;
}

export async function disposeReportRuntime() {
  for (const lifetime of activeLifetimes) lifetime.abort();
  activeLifetimes.clear();
  const runs = [...reportRuns.values()];
  reportRuns.clear();
  const handle = hostHandle;
  hostHandle = null;
  for (const entry of runs) entry.abort.abort();
  await Promise.allSettled([...runs.map(entry => entry.dispose()), releaseHandle(handle)]);
  await Promise.allSettled(runs.map(entry => entry.finish));
}

function pendingAge(pending) {
  const started = Date.parse(pending?.requested_at || '');
  return Number.isFinite(started) ? Date.now() - started : Infinity;
}

function sessionRunning(ctx, sessionId) {
  // Best-effort probe across the shapes a live session/agent exposes; an
  // undetectable running state falls through and the DSH-side binding
  // rebuild still protects the task invariant.
  // Cordis throws on undeclared inject; that must not fail the bind itself.
  try {
    const live = ctx?.sessions?.get?.(sessionId);
    for (const candidate of [
      live?.running,
      live?.snapshot?.running,
      live?.getSnapshot?.()?.running,
      ctx?.agents?.get?.(sessionId)?.session?.running,
      ctx?.agents?.get?.(sessionId)?.running,
    ]) {
      if (typeof candidate === 'boolean') return candidate;
    }
  } catch { /* live running state unavailable */ }
  return false;
}

const SESSION_LOG = /^session(?:\.v\d+)?\.jsonl(?:\.zstd)?$/;

export function persistedSessionExists(sessionId) {
  const home = (process.env.DSH_HOME || '').trim();
  if (!home || !SESSION_ID.test(sessionId || '')) return false;
  const root = path.join(home, 'sessions');
  let entries;
  try { entries = fs.readdirSync(root, { withFileTypes: true }); }
  catch (error) { if (error.code === 'ENOENT') return false; throw error; }
  // DSH 0.1.7 writes session.v4.jsonl.zstd; earlier formats wrote session.jsonl(.zstd).
  return entries.some(entry => {
    if (!entry.isDirectory()) return false;
    try { return fs.readdirSync(path.join(root, entry.name, sessionId)).some(name => SESSION_LOG.test(name)); }
    catch (error) { if (error.code === 'ENOENT' || error.code === 'ENOTDIR') return false; throw error; }
  });
}

function liveSessionExists(ctx, sessionId) {
  try { return Boolean(ctx?.sessions?.get?.(sessionId)); }
  catch { return false; }
}

export function bindTopicSession({ topic_id, session_id, title }, { sessionExists } = {}) {
  if (!TOPIC_ID.test(topic_id || '')) throw Object.assign(new Error('invalid topic'), { status: 422 });
  if (!SESSION_ID.test(session_id || '')) throw Object.assign(new Error('invalid session'), { status: 422 });
  const exists = sessionExists || persistedSessionExists;
  if (!exists(session_id)) throw Object.assign(new Error('session not found'), { status: 404 });
  if (loadReportTasks().sessions[session_id]) {
    throw Object.assign(new Error('session already belongs to a report task'), { status: 409 });
  }
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

export function bindReportTask({ session_id, slug, input_hash }, { sessionExists, isRunning } = {}) {
  if (!SESSION_ID.test(session_id || '')) throw Object.assign(new Error('invalid session'), { status: 422 });
  if (!REPORT_SLUG.test(slug || '')) throw Object.assign(new Error('invalid report target'), { status: 422 });
  if (!INPUT_HASH.test(input_hash || '')) throw Object.assign(new Error('invalid input hash'), { status: 422 });
  const exists = sessionExists || persistedSessionExists;
  if (!exists(session_id)) throw Object.assign(new Error('session not found'), { status: 404 });
  if (loadTopicSessions().sessions[session_id]) {
    throw Object.assign(new Error('session already belongs to a Topic'), { status: 409 });
  }
  const store = loadReportTasks();
  const bound = store.sessions[session_id];
  if (bound && bound.slug !== slug) {
    throw Object.assign(new Error('session already belongs to another report target'), { status: 409 });
  }
  let running = false;
  try { running = isRunning ? Boolean(isRunning(session_id)) : false; }
  catch { running = false; }
  if (running) {
    // Binding mid-turn would swap the session's registered tool set while a
    // turn is in flight; only an identical re-bind is a harmless no-op.
    if (bound && bound.slug === slug && bound.input_hash === input_hash) return bound;
    throw Object.assign(new Error('session is running; report binding cannot be installed'), { status: 409 });
  }
  const record = { slug, input_hash, bound_at: new Date().toISOString() };
  store.sessions[session_id] = record;
  writeReportStore(store);
  return record;
}

function writeAssistantStore(store) {
  writeJson(assistantSessionsPath(), {
    sessions: store.sessions && typeof store.sessions === 'object' ? store.sessions : {},
    pages: store.pages && typeof store.pages === 'object' ? store.pages : {},
  });
}

const ASSISTANT_PLUGIN = /^(deep_research|intel)$/;
const ASSISTANT_TARGET = /^(companies|industries)\/(?=.{1,180}$)[A-Za-z0-9._一-鿿-]+(?:\/[A-Za-z0-9._一-鿿-]+)*$/;
const PROFILE_TARGET = /^profile:sw2:[0-9A-Z.]+$/;

function assistantBindKey(plugin, target, page_key) {
  return target ? `${plugin}:${target}` : `${plugin}:${page_key || ''}`;
}

export function bindAssistantSession({ session_id, plugin, mode, target, page_key }, { sessionExists, isRunning } = {}) {
  if (!ASSISTANT_MODE.test(mode || '')) throw Object.assign(new Error('invalid assistant mode'), { status: 422 });
  if (plugin && !ASSISTANT_PLUGIN.test(plugin)) throw Object.assign(new Error('invalid assistant plugin'), { status: 422 });
  if (page_key && !PAGE_KEY.test(page_key)) throw Object.assign(new Error('invalid page key'), { status: 422 });
  if (target && !ASSISTANT_TARGET.test(target) && !PROFILE_TARGET.test(target)) throw Object.assign(new Error('invalid assistant target'), { status: 422 });
  if (!SESSION_ID.test(session_id || '')) throw Object.assign(new Error('invalid session'), { status: 422 });
  const exists = sessionExists || persistedSessionExists;
  if (!exists(session_id)) throw Object.assign(new Error('session not found'), { status: 404 });
  if (loadTopicSessions().sessions[session_id]) {
    throw Object.assign(new Error('session already belongs to a Topic'), { status: 409 });
  }
  if (loadReportTasks().sessions[session_id]) {
    throw Object.assign(new Error('session already belongs to a report task'), { status: 409 });
  }
  const store = loadAssistantSessions();
  const bound = store.sessions[session_id];
  const nextPlugin = plugin || bound?.plugin || '';
  if (!ASSISTANT_PLUGIN.test(nextPlugin)) throw Object.assign(new Error('invalid assistant plugin'), { status: 422 });
  const nextTarget = target || bound?.target || '';
  let running = false;
  try { running = isRunning ? Boolean(isRunning(session_id)) : false; }
  catch { running = false; }
  if (running) {
    if (bound && bound.mode === mode && bound.plugin === nextPlugin && (bound.target || '') === nextTarget
      && (!page_key || bound.page_key === page_key)) return bound;
    throw Object.assign(new Error('session is running; assistant mode cannot be switched'), { status: 409 });
  }
  const record = {
    plugin: nextPlugin,
    mode,
    target: nextTarget,
    page_key: page_key || bound?.page_key || '',
    bound_at: new Date().toISOString(),
  };
  store.sessions[session_id] = record;
  const bindKey = assistantBindKey(record.plugin, record.target, record.page_key);
  const previousIds = new Set([store.pages[bindKey]?.session_id, record.page_key && store.pages[record.page_key]?.session_id].filter(Boolean));
  if (bindKey !== `${record.plugin}:`) {
    store.pages[bindKey] = { session_id, plugin: record.plugin, mode, target: record.target };
    if (record.page_key) store.pages[record.page_key] = { session_id, plugin: record.plugin, mode, target: record.target };
  }
  for (const previousId of previousIds) {
    if (previousId !== session_id && !exists(previousId)
      && !Object.values(store.pages).some(page => page.session_id === previousId)) delete store.sessions[previousId];
  }
  writeAssistantStore(store);
  return record;
}

export async function startReportRun(ctx, { slug, input_hash, prompt, title }) {
  if (!REPORT_SLUG.test(slug || '')) throw Object.assign(new Error('invalid report target'), { status: 422 });
  if (!INPUT_HASH.test(input_hash || '')) throw Object.assign(new Error('invalid input hash'), { status: 422 });
  const text = typeof prompt === 'string' ? prompt.trim() : '';
  if (!text) throw Object.assign(new Error('invalid prompt'), { status: 422 });
  const { signal } = lifetimeFor(ctx);
  const start = () => startReportRunLocked(ctx, { slug, input_hash, prompt: text, title }, signal);
  const run = spawnChain.then(start, start);
  spawnChain = run.then(() => undefined, () => undefined);
  return run;
}

async function startReportRunLocked(ctx, { slug, input_hash, prompt, title }, signal) {
  assertActive(signal);
  const store = loadReportTasks();
  const running = sessionId => reportRuns.has(sessionId) || sessionRunning(ctx, sessionId);
  const researchBusy = Object.entries(store.sessions).some(([id, bind]) => bind?.kind === 'research' && bind.slug === slug
    && (running(id) || (bind.settlement_status === 'running' && Date.now() - Date.parse(bind.settlement_updated_at || '') < RUNNING_STALE_MS)));
  if (researchBusy) throw Object.assign(new Error('公司研究进行中，完成后可生成图文报告'), { status: 409 });
  const matches = Object.entries(store.sessions).filter(([, bind]) => (bind?.kind || 'report') === 'report' && bind?.slug === slug);
  const same = matches.find(([id, bind]) => running(id) && bind.input_hash === input_hash);
  if (same) return { session_id: same[0], status: 'running', host_session_id: store.host_session_id || '' };
  const other = matches.find(([id, bind]) => running(id) && bind.input_hash !== input_hash);
  if (other) return { session_id: other[0], status: 'busy_other_version', host_session_id: store.host_session_id || '' };
  if (!ctx?.subagents?.startActivation) throw Object.assign(new Error('报告子 Agent 能力不可用'), { status: 503 });
  // The blank task host has never made a request, so it has no model to inherit.
  // Resolve the current DSH default for every attempt, including reused hosts.
  const selection = ctx.agentDefaultModel.currentSelection();
  if (!selection?.provider || !selection?.model) {
    throw Object.assign(new Error('请先在设置中配置默认模型。'), { status: 409 });
  }

  const host = await ensureTaskHost(ctx, signal);
  assertActive(signal);
  const hostId = host?.session?.id;
  if (!hostId) throw Object.assign(new Error('任务宿主不可用'), { status: 503 });
  const next = loadReportTasks();
  if (next.pending && pendingAge(next.pending) < PENDING_STALE_MS) {
    throw Object.assign(new Error('另一报告任务正在启动'), { status: 409 });
  }
  next.host_session_id = hostId;
  next.pending = {
    kind: 'report',
    parent_id: hostId,
    slug,
    input_hash,
    title: title || `报告生成 · ${slug}`,
    requested_at: new Date().toISOString(),
  };
  writeReportStore(next);

  const abort = new AbortController();
  const onUnload = () => abort.abort();
  signal.addEventListener('abort', onUnload, { once: true });
  try {
    const run = await startTaskActivation(ctx, {
      provider: 'spawn', label: next.pending.title, signal: abort.signal, delivery: 'caller',
      request: {
      parent: host,
      agentOptions: {
        provider: selection.provider,
        model: selection.model,
        ...(selection.reasoningEffort ? { reasoningEffort: selection.reasoningEffort } : {}),
      },
      prompt: [{ type: 'text', text: prompt }],
      maxDepth: 1,
      },
    }, REPORT_CHILD_PERSONA);
    if (signal.aborted) {
      // Observe a late run's rejection before disposing its native handle.
      void Promise.resolve(run.result).catch(() => {});
      await releaseHandle(run);
      assertActive(signal);
    }
    watchReportRun(run, abort, ctx);
    const after = loadReportTasks();
    if (after.pending?.parent_id === hostId) {
      after.sessions[run.childId] = { kind: 'report', slug, title: next.pending.title, input_hash, bound_at: new Date().toISOString(), run_status: 'running' };
      after.pending = null;
      writeReportStore(after);
    }
    return { session_id: run.childId, status: 'started', host_session_id: hostId };
  } catch (error) {
    const failed = loadReportTasks();
    if (failed.pending?.parent_id === hostId) {
      failed.pending = null;
      writeReportStore(failed);
    }
    if (error?.code === 'ACTIVATION_LIMIT_REACHED') {
      throw Object.assign(new Error(ACTIVATION_LIMIT_REASON, { cause: error }), { code: error.code, status: 503 });
    }
    throw error;
  } finally {
    signal.removeEventListener('abort', onUnload);
  }
}

export function cancelReportRun(session_id) {
  if (!SESSION_ID.test(session_id || '')) throw Object.assign(new Error('invalid session'), { status: 422 });
  const entry = reportRuns.get(session_id);
  if (!entry) throw Object.assign(new Error('没有可中止的运行中任务'), { status: 404 });
  entry.cancelled = true;
  finishResearchBinding(session_id, 'cancelled', entry.ctx);
  entry.abort.abort();
  return { session_id, status: 'cancelling' };
}

function researchTasksRoot() {
  return path.join(researchDir(), 'tasks');
}

function researchTaskDir(taskId) {
  return path.join(researchTasksRoot(), taskId);
}

function researchTaskFile(taskId) {
  return path.join(researchTaskDir(taskId), 'task.json');
}

function writeResearchTask(task) {
  fs.mkdirSync(researchTaskDir(task.task_id), { recursive: true, mode: 0o700 });
  writeJson(researchTaskFile(task.task_id), task);
}

function readResearchTaskFile(taskId) {
  if (!/^task:[0-9a-f]{16}$/.test(taskId || '')) return null;
  const task = readJson(researchTaskFile(taskId), null);
  return task?.task_id === taskId ? task : null;
}

function listResearchTaskFiles(root = researchTasksRoot()) {
  let names = [];
  try { names = fs.readdirSync(root); }
  catch (error) { if (error.code === 'ENOENT') return []; throw error; }
  return names.map(name => readJson(path.join(root, name, 'task.json'), null)).filter(task => task?.task_id);
}

function readResearchStep(taskId, index, key) {
  const marker = readJson(path.join(researchTaskDir(taskId), 'steps', `${index}-${key}.json`), null);
  if (!marker || marker.step !== key || !['done', 'skipped', 'failed'].includes(marker.status)) return null;
  return marker;
}

export function composeResearchTask(task) {
  const attempts = new Map((task.steps || []).map(step => [step.key, step.attempts || 0]));
  const steps = RESEARCH_STEPS.map((definition, index) => {
    const marker = readResearchStep(task.task_id, index + 1, definition.key);
    return {
      key: definition.key,
      label: definition.label,
      status: marker ? marker.status : 'pending',
      attempts: attempts.get(definition.key) || 0,
      finished_at: marker?.finished_at || null,
      outputs: marker?.outputs && typeof marker.outputs === 'object' ? marker.outputs : {},
    };
  });
  const open = steps.findIndex(step => step.status !== 'done' && step.status !== 'skipped');
  if (task.status === 'running' && open >= 0) steps[open].status = 'running';
  if (task.status === 'failed' && open >= 0) steps[open].status = 'failed';
  return {
    task_id: task.task_id,
    kind: 'company_research',
    symbol: task.symbol,
    slug: task.slug,
    title: task.title,
    status: task.status,
    current_step: open < 0 ? RESEARCH_STEPS.length : open + 1,
    steps,
    sessions: Array.isArray(task.sessions) ? task.sessions : [],
    host_boot_id: task.host_boot_id,
    trigger_note: task.trigger_note ?? null,
    trigger: task.trigger ?? null,
    trigger_period: task.trigger_period ?? null,
    report_period: task.report_period ?? null,
    reason: task.reason ?? null,
    created_at: task.created_at,
    updated_at: task.updated_at,
    finished_at: task.finished_at ?? null,
  };
}

export function listResearchTasks({ symbol, status, limit } = {}) {
  const items = listResearchTaskFiles().map(composeResearchTask)
    .filter(item => (!symbol || item.symbol === symbol) && (!status || item.status === status))
    .sort((a, b) => String(b.updated_at).localeCompare(String(a.updated_at)));
  const cap = Number(limit);
  return Number.isInteger(cap) && cap >= 0 ? items.slice(0, cap) : items;
}

export function readResearchTask(taskId) {
  const task = readResearchTaskFile(taskId);
  return task ? composeResearchTask(task) : null;
}

function doneStepText(step) {
  const outputs = step.outputs || {};
  if (step.key === 'fetch') return `收集资料（数据包 ${outputs.packet_as_of || ''}）`;
  if (step.key === 'read_report') {
    return `读报告（${outputs.title ? `《${outputs.title}》` : ''}document_id=${outputs.document_id || ''}，parseRevisionId=${outputs.parse_revision_id || ''}，parsedContentSha256=${outputs.parsed_content_sha256 || ''}）`;
  }
  if (step.key === 'key_variables') {
    return `算价格对利润的影响（sensitivityRef=${outputs.sensitivity_ref || ''}，scenarioRef=${outputs.scenario_ref || ''}）`;
  }
  return step.label;
}

export function researchHandoff(task) {
  const view = composeResearchTask(task);
  const done = view.steps.filter(step => step.status === 'done');
  const next = view.steps.find(step => step.status !== 'done' && step.status !== 'skipped');
  const doneKeys = new Set(done.map(step => step.key));
  const bans = [];
  if (doneKeys.has('fetch')) bans.push('ensure_company_data');
  if (doneKeys.has('key_variables')) bans.push('calculate_metrics');
  const avoid = bans.length ? `本次不调用 ${bans.join(' 和 ')}；` : '';
  const variablesSettled = ['done', 'skipped'].includes(view.steps.find(step => step.key === 'key_variables')?.status);
  const rest = variablesSettled ? '需要字段时用 read_company_data_packet 读同一天的数据包，直接用上面的凭据写六节并保存。'
    : (doneKeys.has('fetch') ? '需要字段时用 read_company_data_packet 读同一天的数据包；' : '') + '其余动作仍按原顺序。';
  let text = `这是一次接续。已完成：${done.map(doneStepText).join('；') || '无'}。\n从「${next?.label || '估值与判断'}」继续：${avoid}${rest}`;
  if (view.trigger_note) text += `\n用户补充：${view.trigger_note}`;
  return text;
}

function modelSelection(ctx) {
  try {
    const selection = ctx?.agentDefaultModel?.currentSelection?.();
    if (selection?.provider && selection?.model) return selection;
  } catch { /* no configured model */ }
  return null;
}

function createResearchTask({ slug, symbol, title, prompt, model_selection, trigger = null, trigger_period = null, report_period = null }) {
  const now = new Date().toISOString();
  const task = {
    task_id: `task:${randomBytes(8).toString('hex')}`,
    kind: 'company_research',
    symbol,
    slug,
    title,
    status: 'running',
    steps: RESEARCH_STEPS.map(step => ({ key: step.key, attempts: 0 })),
    sessions: [],
    host_boot_id: bootId,
    trigger_note: null,
    trigger,
    trigger_period,
    report_period: report_period || trigger_period || null,
    reason: null,
    prompt,
    model_selection,
    created_at: now,
    updated_at: now,
    finished_at: null,
  };
  writeResearchTask(task);
  return task;
}

function stampResearchTask(task, patch) {
  const next = { ...task, ...patch, steps: patch.steps || task.steps, updated_at: new Date().toISOString() };
  writeResearchTask(next);
  return next;
}

async function spawnResearchSession(ctx, task, prompt, signal) {
  const host = await ensureTaskHost(ctx, signal);
  // The plugin binds the new session from `pending` on its first turn, so the role and task_id must be there before spawn.
  const pending = loadReportTasks();
  pending.pending = { kind: 'research', parent_id: host.session.id, slug: task.slug, symbol: task.symbol,
    model_selection: task.model_selection, title: task.title, task_id: task.task_id, requested_at: new Date().toISOString() };
  writeReportStore(pending);
  const abort = new AbortController();
  const onUnload = () => abort.abort();
  signal.addEventListener('abort', onUnload, { once: true });
  try {
    const run = await startTaskActivation(ctx, {
      provider: 'spawn', label: task.title, signal: abort.signal, delivery: 'caller',
      request: {
      parent: host,
      agentOptions: task.model_selection,
      prompt: [{ type: 'text', text: prompt }], maxDepth: 1,
      },
    }, RESEARCH_CHILD_PERSONA);
    if (signal.aborted) {
      void Promise.resolve(run.result).catch(() => {});
      await releaseHandle(run);
      assertActive(signal);
    }
    const store = loadReportTasks();
    store.sessions[run.childId] = {
      kind: 'research', slug: task.slug, symbol: task.symbol, title: task.title,
      model_selection: task.model_selection, task_id: task.task_id,
      bound_at: new Date().toISOString(), run_status: 'running',
    };
    store.pending = null;
    writeReportStore(store);
    stampResearchTask(readResearchTaskFile(task.task_id) || task, {
      status: 'running', host_boot_id: bootId, reason: null, finished_at: null,
      sessions: [...new Set([...(task.sessions || []), run.childId])],
    });
    watchReportRun(run, abort, ctx);
    return run;
  } finally {
    signal.removeEventListener('abort', onUnload);
  }
}

async function resumeResearchTask(ctx, taskId) {
  const compatible = await readCompatibility();
  if (compatible.result === 'server_outdated' || compatible.result === 'client_outdated') return;
  const task = readResearchTaskFile(taskId);
  if (!task || task.status !== 'interrupted') return;
  const signal = lifetimeFor(ctx).signal;
  if (signal.aborted) return;
  if (!modelSelection(ctx)) {
    stampResearchTask(task, { status: 'interrupted', reason: RESEARCH_MODEL_REASON });
    return;
  }
  if (!ctx?.subagents?.startActivation) return;
  const view = composeResearchTask(task);
  const open = view.steps.findIndex(step => step.status !== 'done' && step.status !== 'skipped');
  if (open < 0 || view.steps[4]?.status === 'done') {
    stampResearchTask(task, { status: 'completed', finished_at: new Date().toISOString(), reason: null });
    return;
  }
  const steps = task.steps.map(step => ({ ...step }));
  if (steps[open].attempts >= 2) {
    stampResearchTask(task, { status: 'failed', steps, reason: RESEARCH_FAIL_REASON, finished_at: new Date().toISOString() });
    return;
  }
  const prepared = stampResearchTask(task, { status: 'interrupted', steps, reason: null });
  const prompt = `${task.prompt || ''}\n\n${researchHandoff(prepared)}`;
  try {
    await spawnResearchSession(ctx, prepared, prompt, signal);
  } catch (error) {
    const current = readResearchTaskFile(taskId);
    if (current?.status === 'interrupted') stampResearchTask(current,
      error?.code === 'ACTIVATION_LIMIT_REACHED'
        ? { status: 'failed', reason: ACTIVATION_LIMIT_REASON, finished_at: new Date().toISOString() }
        : { status: signal.aborted ? 'running' : 'interrupted', reason: RESEARCH_FAIL_REASON });
    const store = loadReportTasks();
    if (store.pending?.task_id === taskId) { store.pending = null; writeReportStore(store); }
  }
}

function queueResearchResume(ctx, taskId) {
  const job = () => resumeResearchTask(ctx, taskId);
  const next = spawnChain.then(job, job);
  spawnChain = next.then(() => undefined, () => undefined);
  return next;
}

function finishResearchBinding(sessionId, runStatus, ctx) {
  const store = loadReportTasks();
  const binding = store.sessions[sessionId];
  if (!binding) return;
  // A host shutdown leaves durable task state for the next boot, not a user cancellation.
  if (ctx && lifetimeFor(ctx).signal.aborted && runStatus !== 'cancelled') return;
  store.sessions[sessionId] = { ...binding, run_status: runStatus === 'aborted' ? 'cancelled' : runStatus, finished_at: new Date().toISOString() };
  writeReportStore(store);
  if (binding.kind !== 'research' || !binding.task_id || !ctx) return;
  const task = readResearchTaskFile(binding.task_id);
  if (!task || ['cancelled', 'completed', 'failed'].includes(task.status)) return;
  if (task.sessions?.at(-1) && task.sessions.at(-1) !== sessionId) return;
  if (runStatus === 'cancelled') {
    stampResearchTask(task, { status: 'cancelled', finished_at: new Date().toISOString(), reason: null });
    return;
  }
  if (composeResearchTask(task).steps[4]?.status === 'done') {
    stampResearchTask(task, { status: 'completed', finished_at: new Date().toISOString(), reason: null });
    return;
  }
  const open = composeResearchTask(task).steps.findIndex(step => !['done', 'skipped'].includes(step.status));
  const steps = task.steps.map(step => ({ ...step }));
  if (open >= 0) steps[open].attempts = (steps[open].attempts || 0) + 1;
  if (open >= 0 && steps[open].attempts >= 2) {
    stampResearchTask(task, { status: 'failed', steps, reason: RESEARCH_FAIL_REASON, finished_at: new Date().toISOString() });
    return;
  }
  stampResearchTask(task, { status: 'interrupted', steps });
  queueResearchResume(ctx, task.task_id);
}

export async function recoverInterruptedResearch(ctx, root = researchTasksRoot()) {
  const tasks = listResearchTaskFiles(root);
  const stale = tasks.filter(task => task.status === 'running' && task.host_boot_id !== bootId);
  for (const task of stale) stampResearchTask(task, { status: 'interrupted' });
  // A resume whose spawn failed stays interrupted; the next start tries it again.
  const waiting = [...stale, ...tasks.filter(task => task.status === 'interrupted')];
  for (const task of waiting) await queueResearchResume(ctx, task.task_id);
}

function researchResumeDelay() {
  const value = Number(process.env.VIBE_RESEARCH_RESUME_DELAY_MS);
  return Number.isFinite(value) && value >= 0 ? value : 20_000;
}

export function currentResearchBootId() {
  return bootId;
}

export function researchBootPromise() {
  return researchBootScan;
}

async function companyNameFromQuotes(symbol) {
  const connection = resolveBackend();
  const response = await fetch(`${connection.url}/market/quotes?symbols=${encodeURIComponent(symbol)}`, {
    headers: backendHeaders(connection, { Accept: 'application/json' }),
    signal: AbortSignal.timeout(5000),
  });
  if (!response.ok) return '';
  const body = await response.json().catch(() => null);
  const row = (body?.quotes || []).find(item => item?.symbol === symbol);
  return typeof row?.name === 'string' ? row.name : '';
}

export async function startResearchRun(ctx, { slug, symbol, prompt, title, trigger, trigger_period, report_period }) {
  const compatible = await readCompatibility();
  if (compatible.result === 'server_outdated' || compatible.result === 'client_outdated') {
    throw Object.assign(new Error(compatible.text), { status: 426 });
  }
  if (!/^companies\/[A-Za-z0-9._-]{1,100}$/.test(slug || '') || !/^[A-Za-z0-9.]{1,24}$/.test(symbol || ''))
    throw Object.assign(new Error('invalid company target'), { status: 422 });
  const message = typeof prompt === 'string' ? prompt.trim() : '';
  if (!message) throw Object.assign(new Error('invalid prompt'), { status: 422 });
  const { signal } = lifetimeFor(ctx);
  const start = () => startResearchRunLocked(ctx, {
    slug, symbol, prompt: message, title, trigger, trigger_period, report_period,
  }, signal);
  const run = spawnChain.then(start, start);
  spawnChain = run.then(() => undefined, () => undefined);
  return run;
}

async function startResearchRunLocked(ctx, { slug, symbol, prompt, title, trigger, trigger_period, report_period }, signal) {
  assertActive(signal);
  const store = loadReportTasks();
  const reportBusy = Object.entries(store.sessions).some(([id, bind]) => (bind?.kind || 'report') === 'report' && bind.slug === slug
    && (reportRuns.has(id) || sessionRunning(ctx, id)));
  if (reportBusy) throw Object.assign(new Error('图文报告生成中，完成后可刷新资料'), { status: 409 });
  const active = Object.entries(store.sessions).find(([id, bind]) => bind?.kind === 'research' && bind.slug === slug
    && (reportRuns.has(id) || sessionRunning(ctx, id)
      || (bind.settlement_status === 'running' && Date.now() - Date.parse(bind.settlement_updated_at || '') < RUNNING_STALE_MS)));
  if (active) return { session_id: active[0], status: 'running', host_session_id: store.host_session_id || '' };
  if (!ctx?.subagents?.startActivation) throw Object.assign(new Error('研究子 Agent 能力不可用'), { status: 503 });
  const selection = ctx.agentDefaultModel.currentSelection();
  if (!selection?.provider || !selection?.model) throw Object.assign(new Error('请先在设置中配置默认模型。'), { status: 409 });
  const host = await ensureTaskHost(ctx, signal);
  const hostId = host.session.id;
  const next = loadReportTasks();
  if (next.pending && pendingAge(next.pending) < PENDING_STALE_MS)
    throw Object.assign(new Error('另一任务正在启动'), { status: 409 });
  const model_selection = { provider: selection.provider, model: selection.model,
    ...(selection.reasoningEffort ? { reasoningEffort: selection.reasoningEffort } : {}) };
  const researchTitle = await resolveResearchTitle(title, symbol, companyNameFromQuotes);
  const task = createResearchTask({
    slug, symbol, title: researchTitle, prompt, model_selection, trigger, trigger_period, report_period,
  });
  try {
    const run = await spawnResearchSession(ctx, task, prompt, signal);
    return { session_id: run.childId, status: 'started', host_session_id: hostId };
  } catch (error) {
    const failed = loadReportTasks();
    if (failed.pending?.parent_id === hostId && failed.pending?.kind === 'research') {
      failed.pending = null;
      writeReportStore(failed);
    }
    if (error?.code === 'ACTIVATION_LIMIT_REACHED') {
      stampResearchTask(readResearchTaskFile(task.task_id) || task,
        { status: 'failed', reason: ACTIVATION_LIMIT_REASON, finished_at: new Date().toISOString() });
      throw Object.assign(new Error(ACTIVATION_LIMIT_REASON, { cause: error }), { code: error.code, status: 503 });
    }
    if (signal.aborted) {
      stampResearchTask(readResearchTaskFile(task.task_id) || task, { status: 'running', reason: null });
    } else if (!readResearchTaskFile(task.task_id)?.sessions?.length) {
      fs.rmSync(researchTaskDir(task.task_id), { recursive: true, force: true });
    }
    throw error;
  }
}

export function cancelResearchRun(session_id) {
  if (loadReportTasks().sessions[session_id]?.kind !== 'research')
    throw Object.assign(new Error('不是公司研究任务'), { status: 404 });
  return cancelReportRun(session_id);
}

async function proxyNotes(req, res, route) {
  const target = resolveBackend();
  const response = await fetch(target.url + route, { headers: backendHeaders(target, { Accept: 'application/json' }) });
  if (response.status === 401) {
    await response.body?.cancel?.();
    send(res, 401, { detail: TOKEN_REJECTED });
    return;
  }
  const body = maskSecrets(await response.text(), target.token);
  if (!response.ok && (!body || body === '[]' || body === '{}')) {
    send(res, response.status || 502, { detail: '研究记录服务不可用' });
    return;
  }
  res.writeHead(response.status, { 'Content-Type': response.headers.get('content-type') || 'application/json', 'Cache-Control': 'no-store' });
  res.end(body);
}

export function installHostState(ctx, track = disposer => disposer) {
  bootId = randomUUID();
  runtimeLifetimes.delete(ctx);
  lifetimeFor(ctx);
  const tasksRoot = researchTasksRoot();
  const { signal } = lifetimeFor(ctx);
  // Plugins load in no guaranteed order and cordis here has no all-loaded event; resuming before the
  // research plugin binds the role starts a session without tools, so the boot scan waits a little.
  const recover = () => signal.aborted ? undefined : recoverInterruptedResearch(ctx, tasksRoot);
  const settle = new Promise(resolve => {
    const timer = setTimeout(resolve, researchResumeDelay());
    signal.addEventListener('abort', () => { clearTimeout(timer); resolve(); }, { once: true });
  });
  // Resumes go through the same spawn queue, so a start the user makes meanwhile is not held up by the wait.
  researchBootScan = settle.then(recover, recover);
  return [
    track(() => {
      for (const { dispose } of pageContextTools.values()) dispose();
      pageContextTools.clear();
      assistantPageContexts.clear();
    }),
    track(() => { void disposeReportRuntime(); }),
    track(ctx.webServer.register({ kind: 'exact', path: '/finance-background-tasks', async handler(req, res) {
      try {
        if (req.method !== 'GET') { res.writeHead(405); res.end(); return; }
        send(res, 200, { items: await overlayIngestStatus(loadBackgroundTasks()) });
      } catch (error) {
        send(res, error.status || 500, { detail: error.message || 'background task list failed' });
      }
    } })),
    track(ctx.webServer.register({ kind: 'exact', path: '/finance-topic-sessions', async handler(req, res) {
      try {
        if (req.method === 'GET') { send(res, 200, loadTopicSessions()); return; }
        if (req.method !== 'POST') { res.writeHead(405); res.end(); return; }
        const body = await readBody(req);
        send(res, 200, bindTopicSession(body, {
          sessionExists: sessionId => liveSessionExists(ctx, sessionId) || persistedSessionExists(sessionId),
        }));
      } catch (error) {
        send(res, error.status || 500, { detail: error.message || 'topic session bind failed' });
      }
    } })),
    track(ctx.webServer.register({ kind: 'exact', path: '/finance-report-tasks', async handler(req, res) {
      try {
        if (req.method === 'GET') { send(res, 200, await reportTasksWithLineage(ctx)); return; }
        if (req.method !== 'POST') { res.writeHead(405); res.end(); return; }
        const body = await readBody(req);
        send(res, 200, bindReportTask(body, {
          sessionExists: sessionId => liveSessionExists(ctx, sessionId) || persistedSessionExists(sessionId),
          isRunning: sessionId => sessionRunning(ctx, sessionId),
        }));
      } catch (error) {
        send(res, error.status || 500, { detail: error.message || 'report task bind failed' });
      }
    } })),
    track(ctx.webServer.register({ kind: 'exact', path: '/finance-report-runs', async handler(req, res) {
      try {
        if (req.method !== 'POST') { res.writeHead(405); res.end(); return; }
        const body = await readBody(req);
        if (body?.action === 'cancel') {
          send(res, 200, cancelReportRun(body.session_id));
          return;
        }
        send(res, 200, await startReportRun(ctx, body));
      } catch (error) {
        send(res, error.status || 500, { detail: error.message || 'report run failed' });
      }
    } })),
    track(ctx.webServer.register({ kind: 'exact', path: '/finance-research-tasks', async handler(req, res) {
      try {
        if (req.method !== 'GET') { res.writeHead(405); res.end(); return; }
        const query = new URL(req.url || '/', 'http://localhost').searchParams;
        const taskId = query.get('task_id');
        if (taskId) {
          const item = readResearchTask(taskId);
          if (!item) { send(res, 404, { detail: '没有这条研究记录' }); return; }
          send(res, 200, item);
          return;
        }
        const rawLimit = query.get('limit');
        send(res, 200, { items: listResearchTasks({
          symbol: query.get('symbol') || '', status: query.get('status') || '',
          limit: rawLimit == null || rawLimit === '' ? undefined : rawLimit,
        }) });
      } catch (error) {
        send(res, error.status || 500, { detail: error.message || 'research task read failed' });
      }
    } })),
    track(ctx.webServer.register({ kind: 'exact', path: '/finance-research-runs', async handler(req, res) {
      try {
        if (req.method !== 'POST') { res.writeHead(405); res.end(); return; }
        const body = await readBody(req);
        send(res, 200, body?.action === 'cancel' ? cancelResearchRun(body.session_id) : await startResearchRun(ctx, body));
      } catch (error) {
        send(res, error.status || 500, { detail: error.message || 'research run failed' });
      }
    } })),
    track(ctx.webServer.register({ kind: 'exact', path: '/finance-assistant-sessions', async handler(req, res) {
      try {
        if (req.method === 'GET') { send(res, 200, loadAssistantSessions()); return; }
        if (req.method !== 'POST') { res.writeHead(405); res.end(); return; }
        const body = await readBody(req);
        const bound = bindAssistantSession(body, {
          sessionExists: sessionId => liveSessionExists(ctx, sessionId) || persistedSessionExists(sessionId),
          isRunning: sessionId => sessionRunning(ctx, sessionId),
        });
        ensureAssistantPageContextTool(ctx, body.session_id);
        send(res, 200, bound);
      } catch (error) {
        send(res, error.status || 500, { detail: error.message || 'assistant session bind failed' });
      }
    } })),
    track(ctx.webServer.register({ kind: 'exact', path: '/finance-assistant-page-context', async handler(req, res) {
      try {
        if (req.method !== 'POST') { res.writeHead(405); res.end(); return; }
        send(res, 200, stageAssistantPageContext(ctx, await readBody(req, 150_000)));
      } catch (error) {
        send(res, error.status || 500, { detail: error.message || '页面上下文暂存失败' });
      }
    } })),
    track(ctx.webServer.register({ kind: 'exact', path: '/finance-note-digest', async handler(req, res) {
      try {
        if (req.method !== 'GET') { res.writeHead(405); res.end(); return; }
        await proxyNotes(req, res, '/notes?limit=40&offset=0');
      } catch (error) {
        send(res, error.status || 502, { detail: error.message || 'note digest failed' });
      }
    } })),
    track(ctx.webServer.register({ kind: 'prefix', path: '/finance-notes', async handler(req, res) {
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
    } })),
  ];
}
