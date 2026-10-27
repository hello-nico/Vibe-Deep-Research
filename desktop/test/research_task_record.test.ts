import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

process.env.VIBE_RESEARCH_RESUME_DELAY_MS = '0';
process.env.VIBE_REPORT_ARRIVAL_INTERVAL_MS = '0';
const originalFetch = globalThis.fetch;
globalThis.fetch = async (url, init) => String(url).endsWith('/health')
  ? new Response(JSON.stringify({ api: { version: 1, min_client: 1 } }), { status: 200 })
  : originalFetch(url, init);
import {
  cancelResearchRun, composeResearchTask, currentResearchBootId, disposeReportRuntime, installHostState,
  listResearchTasks, loadReportTasks, readResearchTask, researchBootPromise, startReportRun, startResearchRun,
} from '../dsh/finance-ui/host-state.mjs';

function useHome(t) {
  const previous = process.env.DSH_HOME;
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'vibe-research-task-'));
  process.env.DSH_HOME = home;
  t.after(async () => {
    await disposeReportRuntime();
    if (previous === undefined) delete process.env.DSH_HOME;
    else process.env.DSH_HOME = previous;
    fs.rmSync(home, { recursive: true, force: true });
  });
  return home;
}

function researchCtx(starts = []) {
  const host = { session: { id: 'host-company' }, dispose: async () => {} };
  let n = 0;
  const ctx = {
    on: () => () => {},
    agentDefaultModel: { currentSelection: () => ({ provider: 'test', model: 'test-model' }) },
    agents: {
      get: (id) => id === host.session.id ? host : null,
      create: async () => ({ agent: host, dispose: async () => {} }),
    },
    subagents: {
      startActivation: async ({ provider, request, delivery }) => {
        assert.equal(provider, 'spawn');
        assert.equal(delivery, 'caller');
        const id = `research-${++n}`;
        let finish = () => {};
        const result = new Promise(resolve => { finish = resolve; });
        const run = { childId: id, result, dispose: async () => { finish({ stopReason: 'aborted' }); }, request, finish };
        starts.push(run);
        return run;
      },
    },
  };
  return { ctx, host, starts };
}

async function until(check, label) {
  for (let i = 0; i < 50; i += 1) {
    if (check()) return;
    await new Promise(resolve => setTimeout(resolve, 10));
  }
  throw new Error(label);
}

function writeStep(taskId, index, key, status, outputs = {}) {
  const file = path.join(process.env.DSH_HOME, 'research', 'tasks', taskId, 'steps', `${index}-${key}.json`);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify({ step: key, status, session_id: 'plugin-session', finished_at: '2026-10-14T01:00:00.000Z', outputs }));
}

test('启动研究时建立任务记录，绑定带 task_id', async (t) => {
  useHome(t);
  t.after(() => disposeReportRuntime());
  const { ctx } = researchCtx();
  const started = await startResearchRun(ctx, { slug: 'companies/600011-sh', symbol: '600011.SH', prompt: '研究华能', title: '华能国际' });
  const binding = loadReportTasks().sessions[started.session_id];
  assert.equal(binding.kind, 'research');
  assert.match(binding.task_id, /^task:[0-9a-f]{16}$/);
  const record = readResearchTask(binding.task_id);
  assert.equal(record.symbol, '600011.SH');
  assert.equal(record.status, 'running');
  assert.equal(record.current_step, 1);
  assert.equal(record.steps[0].status, 'running');
  assert.equal(record.steps.every(step => step.attempts === 0), true);
  assert.equal(record.host_boot_id, currentResearchBootId());
  assert.deepEqual(record.sessions, [started.session_id]);
  assert.equal(record.trigger_note, null);
  assert.equal(record.trigger, null);
});

test('定期报告到达触发记在任务记录里', async (t) => {
  useHome(t);
  t.after(() => disposeReportRuntime());
  const { ctx } = researchCtx();
  const started = await startResearchRun(ctx, {
    slug: 'companies/600011-sh', symbol: '600011.SH', prompt: '定期报告已披露，按最新报告重研',
    title: '华能国际', trigger: 'report_arrival', trigger_period: '2026Q3',
  });
  const record = readResearchTask(loadReportTasks().sessions[started.session_id].task_id);
  assert.equal(record.trigger, 'report_arrival');
  assert.equal(record.trigger_period, '2026Q3');
  assert.equal(record.report_period, '2026Q3');
});

test('步骤文件合成当前步，跳过的步骤不占当前步', async (t) => {
  useHome(t);
  const task = {
    task_id: 'task:0123456789abcdef', kind: 'company_research', symbol: '600011.SH', slug: 'companies/600011-sh',
    title: '华能国际', status: 'running', steps: [
      { key: 'fetch', attempts: 1 }, { key: 'read_report', attempts: 0 }, { key: 'key_variables', attempts: 0 },
      { key: 'valuation', attempts: 0 }, { key: 'save', attempts: 0 }, { key: 'settle', attempts: 0 },
    ],
    sessions: ['session-a'], host_boot_id: 'boot', trigger_note: null, reason: null,
    created_at: '2026-10-14T00:00:00.000Z', updated_at: '2026-10-14T00:00:00.000Z', finished_at: null,
  };
  fs.mkdirSync(path.join(process.env.DSH_HOME, 'research', 'tasks', task.task_id), { recursive: true });
  fs.writeFileSync(path.join(process.env.DSH_HOME, 'research', 'tasks', task.task_id, 'task.json'), JSON.stringify(task));
  writeStep(task.task_id, 1, 'fetch', 'done', { packet_as_of: '2026-10-14' });
  writeStep(task.task_id, 2, 'read_report', 'skipped', { document_id: 'should-not-be-current' });
  const view = composeResearchTask(task);
  assert.equal(view.current_step, 3);
  assert.equal(view.steps[0].status, 'done');
  assert.equal(view.steps[1].status, 'skipped');
  assert.equal(view.steps[2].status, 'running');
  assert.equal(view.steps[0].attempts, 1);
  assert.equal(view.steps[0].outputs.packet_as_of, '2026-10-14');
});

test('整理失败的步骤文件显示为失败，不退回等待', async (t) => {
  useHome(t);
  const task = {
    task_id: 'task:fedcba9876543210', kind: 'company_research', symbol: '000933.SZ', slug: 'companies/000933-sz',
    title: '神火股份', status: 'completed', steps: [],
    sessions: ['session-a'], host_boot_id: 'boot', trigger_note: null, reason: null,
    created_at: '2026-10-19T00:00:00.000Z', updated_at: '2026-10-19T00:00:00.000Z', finished_at: '2026-10-19T00:05:00.000Z',
  };
  fs.mkdirSync(path.join(process.env.DSH_HOME, 'research', 'tasks', task.task_id), { recursive: true });
  fs.writeFileSync(path.join(process.env.DSH_HOME, 'research', 'tasks', task.task_id, 'task.json'), JSON.stringify(task));
  ['fetch', 'read_report', 'key_variables', 'valuation', 'save'].forEach((key, i) => writeStep(task.task_id, i + 1, key, 'done'));
  writeStep(task.task_id, 6, 'settle', 'failed');
  const view = composeResearchTask(task);
  assert.equal(view.steps[5].status, 'failed');
});

test('保存完成后结束不再续跑；用户中止也不续跑', async (t) => {
  useHome(t);
  t.after(() => disposeReportRuntime());
  const saved = researchCtx();
  const started = await startResearchRun(saved.ctx, { slug: 'companies/600011-sh', symbol: '600011.SH', prompt: '研究华能' });
  const taskId = loadReportTasks().sessions[started.session_id].task_id;
  writeStep(taskId, 5, 'save', 'done', {});
  saved.starts[0].finish({ stopReason: 'completed' });
  await until(() => readResearchTask(taskId).status === 'completed', 'saved task did not complete');
  assert.equal(saved.starts.length, 1);

  const cancelled = researchCtx();
  const second = await startResearchRun(cancelled.ctx, { slug: 'companies/600900-sh', symbol: '600900.SH', prompt: '研究长电' });
  const cancelId = loadReportTasks().sessions[second.session_id].task_id;
  cancelResearchRun(second.session_id);
  cancelled.starts[0].finish({ stopReason: 'aborted' });
  await until(() => readResearchTask(cancelId).status === 'cancelled', 'cancelled task did not settle');
  assert.equal(cancelled.starts.length, 1);
});

test('第 5 步未完成时续跑，交接说明只含 done 步', async (t) => {
  useHome(t);
  t.after(() => disposeReportRuntime());
  const { ctx, starts } = researchCtx();
  const started = await startResearchRun(ctx, { slug: 'companies/600011-sh', symbol: '600011.SH', prompt: '研究华能' });
  const taskId = loadReportTasks().sessions[started.session_id].task_id;
  writeStep(taskId, 1, 'fetch', 'done', { packet_as_of: '2026-10-14' });
  writeStep(taskId, 2, 'read_report', 'skipped', { title: '不应出现的报告', document_id: 'doc-skipped' });
  writeStep(taskId, 3, 'key_variables', 'done', { sensitivity_ref: 'sens-1', scenario_ref: 'scen-1' });
  starts[0].finish({ stopReason: 'error' });
  await until(() => starts.length === 2, 'resume did not start');
  const text = starts[1].request.prompt[0].text;
  assert.match(text, /研究华能/);
  assert.match(text, /这是一次接续/);
  assert.match(text, /收集资料（数据包 2026-10-14）/);
  assert.match(text, /sensitivityRef=sens-1/);
  assert.match(text, /从「估值与判断」继续/);
  assert.match(text, /本次不调用 ensure_company_data 和 calculate_metrics/);
  // 接续说明是宿主指令，不能命中后台整理判断「用户在提偏好」的关键词，否则会被记成用户说过的话。
  assert.doesNotMatch(text, /(记住|不要再|以后请|纠正|不是这个意思|偏好)/);
  assert.doesNotMatch(text, /doc-skipped|不应出现的报告/);
  assert.equal(readResearchTask(taskId).steps[3].attempts, 1);
});

test('同一步两次失败后停止，不再开第三次', async (t) => {
  useHome(t);
  t.after(() => disposeReportRuntime());
  const { ctx, starts } = researchCtx();
  const started = await startResearchRun(ctx, { slug: 'companies/600011-sh', symbol: '600011.SH', prompt: '研究华能' });
  const taskId = loadReportTasks().sessions[started.session_id].task_id;
  starts[0].finish({ stopReason: 'error' });
  await until(() => starts.length === 2, 'first resume missing');
  starts[1].finish({ stopReason: 'error' });
  await until(() => readResearchTask(taskId).status === 'failed', 'task did not fail');
  assert.equal(starts.length, 2);
  assert.equal(readResearchTask(taskId).reason, '这次没完成，可以稍后重新研究');
  assert.equal(readResearchTask(taskId).steps[0].attempts, 2);
});

test('宿主启动把旧 boot 的 running 标成 interrupted 并续跑；没配模型则停住', async (t) => {
  useHome(t);
  t.after(() => disposeReportRuntime());
  const home = process.env.DSH_HOME;
  const taskId = 'task:abcdef0123456789';
  const task = {
    task_id: taskId, kind: 'company_research', symbol: '600011.SH', slug: 'companies/600011-sh',
    title: '华能国际', status: 'running', steps: [
      { key: 'fetch', attempts: 0 }, { key: 'read_report', attempts: 0 }, { key: 'key_variables', attempts: 0 },
      { key: 'valuation', attempts: 0 }, { key: 'save', attempts: 0 }, { key: 'settle', attempts: 0 },
    ],
    sessions: ['old-session'], host_boot_id: 'previous-boot', trigger_note: null, reason: null,
    prompt: '研究华能', model_selection: { provider: 'test', model: 'test-model' },
    created_at: '2026-10-14T00:00:00.000Z', updated_at: '2026-10-14T00:00:00.000Z', finished_at: null,
  };
  fs.mkdirSync(path.join(home, 'research', 'tasks', taskId), { recursive: true });
  fs.writeFileSync(path.join(home, 'research', 'tasks', taskId, 'task.json'), JSON.stringify(task));
  const routes = [];
  const { ctx, starts } = researchCtx();
  ctx.webServer = { register(route) { routes.push(route); return () => {}; } };
  installHostState(ctx);
  await researchBootPromise();
  assert.equal(starts.length, 1);
  const resumed = readResearchTask(taskId);
  assert.equal(resumed.status, 'running');
  assert.equal(resumed.host_boot_id, currentResearchBootId());
  assert.equal(resumed.sessions.at(-1), starts[0].childId);
  assert.equal(resumed.steps[0].attempts, 0);

  const quiet = 'task:fedcba9876543210';
  fs.mkdirSync(path.join(home, 'research', 'tasks', quiet), { recursive: true });
  fs.writeFileSync(path.join(home, 'research', 'tasks', quiet, 'task.json'), JSON.stringify({ ...task, task_id: quiet, host_boot_id: 'another-boot' }));
  const noModel = researchCtx();
  noModel.ctx.agentDefaultModel.currentSelection = () => null;
  noModel.ctx.webServer = ctx.webServer;
  installHostState(noModel.ctx);
  await researchBootPromise();
  assert.equal(noModel.starts.length, 0);
  const held = readResearchTask(quiet);
  assert.equal(held.status, 'interrupted');
  assert.equal(held.reason, '请先在设置中配置模型');
  assert.equal(held.steps[0].attempts, 0);
  assert.ok(routes.some(route => route.path === '/finance-research-tasks'));
});

test('研究记录接口只读，按条件返回，单条不包进列表', async (t) => {
  useHome(t);
  const routes = [];
  const ctx = { webServer: { register(route) { routes.push(route); return () => {}; } }, agentDefaultModel: { currentSelection: () => null } };
  installHostState(ctx);
  await researchBootPromise();
  const handler = routes.find(route => route.path === '/finance-research-tasks').handler;
  const older = {
    task_id: 'task:1111111111111111', kind: 'company_research', symbol: '600011.SH', slug: 'companies/600011-sh',
    title: '华能国际', status: 'failed', steps: [], sessions: [], host_boot_id: 'boot', trigger_note: null,
    reason: '这次没完成，可以稍后重新研究', created_at: '2026-10-14T00:00:00.000Z', updated_at: '2026-10-14T00:00:00.000Z', finished_at: null,
  };
  const newer = { ...older, task_id: 'task:2222222222222222', symbol: '600900.SH', status: 'completed', updated_at: '2026-10-14T02:00:00.000Z' };
  for (const task of [older, newer]) {
    fs.mkdirSync(path.join(process.env.DSH_HOME, 'research', 'tasks', task.task_id), { recursive: true });
    fs.writeFileSync(path.join(process.env.DSH_HOME, 'research', 'tasks', task.task_id, 'task.json'), JSON.stringify(task));
  }
  const before = fs.readFileSync(path.join(process.env.DSH_HOME, 'research', 'tasks', older.task_id, 'task.json'), 'utf8');
  const posted = { status: 0, headers: null, body: '' };
  await handler({ method: 'POST', url: '/finance-research-tasks' }, { writeHead(status, headers) { posted.status = status; posted.headers = headers; }, end(body) { posted.body = body || ''; } });
  assert.equal(posted.status, 405);
  assert.equal(fs.readFileSync(path.join(process.env.DSH_HOME, 'research', 'tasks', older.task_id, 'task.json'), 'utf8'), before);

  const listed = { status: 0, body: '' };
  await handler({ method: 'GET', url: '/finance-research-tasks?symbol=600011.SH&status=failed&limit=1' }, { writeHead(status) { listed.status = status; }, end(body) { listed.body = body; } });
  const items = JSON.parse(listed.body).items;
  assert.equal(listed.status, 200);
  assert.equal(items.length, 1);
  assert.equal(items[0].task_id, older.task_id);
  const one = { status: 0, body: '' };
  await handler({ method: 'GET', url: '/finance-research-tasks?task_id=task:2222222222222222' }, { writeHead(status) { one.status = status; }, end(body) { one.body = body; } });
  assert.equal(JSON.parse(one.body).task_id, newer.task_id);
  assert.equal(JSON.parse(one.body).items, undefined);
  assert.deepEqual(listResearchTasks({ status: 'completed' }).map(item => item.task_id), [newer.task_id]);
});

test('续跑前 pending 带 task_id，插件首轮就能绑定；关键变量未完成时不让模型直接写六节', async (t) => {
  useHome(t);
  t.after(() => disposeReportRuntime());
  const { ctx, starts } = researchCtx();
  const pendings = [];
  const start = ctx.subagents.startActivation;
  ctx.subagents.startActivation = async (spec) => { pendings.push(loadReportTasks().pending); return start(spec); };
  const started = await startResearchRun(ctx, { slug: 'companies/600011-sh', symbol: '600011.SH', prompt: '研究华能' });
  const taskId = loadReportTasks().sessions[started.session_id].task_id;
  assert.equal(pendings[0].task_id, taskId);
  writeStep(taskId, 1, 'fetch', 'done', { packet_as_of: '2026-10-14' });
  starts[0].finish({ stopReason: 'error' });
  await until(() => starts.length === 2, 'resume did not start');
  assert.equal(pendings[1].task_id, taskId);
  const text = starts[1].request.prompt[0].text;
  assert.match(text, /从「读报告」继续/);
  assert.match(text, /其余动作仍按原顺序/);
  assert.doesNotMatch(text, /写六节并保存|calculate_metrics/);
});

test('续跑开会话失败时留在 interrupted，下次宿主启动再试', async (t) => {
  const home = useHome(t);
  t.after(() => disposeReportRuntime());
  const taskId = 'task:00000000000000aa';
  const dir = path.join(home, 'research', 'tasks', taskId);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'task.json'), JSON.stringify({
    task_id: taskId, kind: 'company_research', symbol: '600011.SH', slug: 'companies/600011-sh', title: '华能国际',
    status: 'interrupted', steps: ['fetch', 'read_report', 'key_variables', 'valuation', 'save', 'settle'].map(key => ({ key, attempts: 0 })),
    sessions: ['old-session'], host_boot_id: 'old-boot', prompt: '研究华能', model_selection: { provider: 'test', model: 'test-model' },
    created_at: '2026-10-14T00:00:00.000Z', updated_at: '2026-10-14T00:00:00.000Z',
  }));
  const { ctx, starts } = researchCtx();
  ctx.webServer = { register: () => () => {} };
  installHostState(ctx);
  await researchBootPromise();
  assert.equal(starts.length, 1);
  assert.equal(readResearchTask(taskId).status, 'running');
});

test('宿主关闭时中断的研究不记成中止，下次启动接着跑', async (t) => {
  useHome(t);
  t.after(() => disposeReportRuntime());
  const { ctx, starts } = researchCtx();
  ctx.webServer = { register: () => () => {} };
  installHostState(ctx);
  await researchBootPromise();
  const started = await startResearchRun(ctx, { slug: 'companies/600011-sh', symbol: '600011.SH', prompt: '研究华能' });
  const taskId = loadReportTasks().sessions[started.session_id].task_id;
  writeStep(taskId, 1, 'fetch', 'done', { packet_as_of: '2026-10-14' });
  await disposeReportRuntime();
  starts[0].finish({ stopReason: 'aborted' });
  await new Promise(resolve => setTimeout(resolve, 20));
  assert.equal(readResearchTask(taskId).status, 'running');
  installHostState(ctx);
  await researchBootPromise();
  assert.equal(starts.length, 2);
  assert.equal(readResearchTask(taskId).status, 'running');
  assert.equal(readResearchTask(taskId).sessions.length, 2);
  assert.match(starts[1].request.prompt[0].text, /这是一次接续/);
});

test('连续宿主关闭不消耗同一步失败次数，每次启动仍可续跑', async t => {
  useHome(t);
  const { ctx, starts } = researchCtx();
  ctx.webServer = { register: () => () => {} };
  installHostState(ctx);
  await researchBootPromise();
  const started = await startResearchRun(ctx, { slug: 'companies/600011-sh', symbol: '600011.SH', prompt: '研究华能' });
  const taskId = loadReportTasks().sessions[started.session_id].task_id;
  for (let shutdown = 0; shutdown < 3; shutdown++) {
    await disposeReportRuntime();
    assert.equal(readResearchTask(taskId).status, 'running');
    assert.equal(loadReportTasks().sessions[starts.at(-1).childId].run_status, 'running');
    assert.equal(readResearchTask(taskId).steps[0].attempts, 0);
    installHostState(ctx);
    await researchBootPromise();
    assert.equal(starts.length, shutdown + 2);
    assert.equal(readResearchTask(taskId).status, 'running');
  }
});

test('用户中止后立即关闭宿主仍保留 cancelled，下一启动不续跑', async t => {
  useHome(t);
  const { ctx, starts } = researchCtx();
  ctx.webServer = { register: () => () => {} };
  installHostState(ctx);
  await researchBootPromise();
  const started = await startResearchRun(ctx, { slug: 'companies/600011-sh', symbol: '600011.SH', prompt: '研究华能' });
  const taskId = loadReportTasks().sessions[started.session_id].task_id;
  cancelResearchRun(started.session_id);
  assert.equal(readResearchTask(taskId).status, 'cancelled');
  await disposeReportRuntime();
  installHostState(ctx);
  await researchBootPromise();
  assert.equal(starts.length, 1);
  assert.equal(readResearchTask(taskId).status, 'cancelled');
  assert.equal(readResearchTask(taskId).steps[0].attempts, 0);
});

test('容量拒绝保留初次研究失败记录并清理 pending，报告入口返回具体原因', async t => {
  useHome(t);
  const { ctx } = researchCtx();
  ctx.subagents.startActivation = async () => { throw Object.assign(new Error('capacity exhausted'), { code: 'ACTIVATION_LIMIT_REACHED' }); };
  const input = { slug: 'companies/600011-sh', symbol: '600011.SH', prompt: '研究华能' };
  await assert.rejects(startResearchRun(ctx, input), error => error.code === 'ACTIVATION_LIMIT_REACHED' && /上限/.test(error.message));
  const [task] = listResearchTasks({ symbol: input.symbol });
  assert.equal(task.status, 'failed');
  assert.match(task.reason, /上限/);
  assert.deepEqual(task.sessions, []);
  assert.equal(loadReportTasks().pending, null);
  await assert.rejects(startReportRun(ctx, { slug: input.slug, input_hash: 'a'.repeat(64), prompt: '生成报告' }), error =>
    error.code === 'ACTIVATION_LIMIT_REACHED' && /上限/.test(error.message));
  assert.equal(loadReportTasks().pending, null);
});

test('续跑遇到容量拒绝后写 failed 原因，不保留无原因的 interrupted', async t => {
  useHome(t);
  const { ctx, starts } = researchCtx();
  const started = await startResearchRun(ctx, { slug: 'companies/600011-sh', symbol: '600011.SH', prompt: '研究华能' });
  const taskId = loadReportTasks().sessions[started.session_id].task_id;
  ctx.subagents.startActivation = async () => { throw Object.assign(new Error('capacity exhausted'), { code: 'ACTIVATION_LIMIT_REACHED' }); };
  starts[0].finish({ stopReason: 'error' });
  await until(() => readResearchTask(taskId).status === 'failed', 'capacity rejection was not recorded');
  assert.match(readResearchTask(taskId).reason, /上限/);
  assert.equal(readResearchTask(taskId).steps[0].attempts, 1);
  assert.equal(loadReportTasks().pending, null);
});
