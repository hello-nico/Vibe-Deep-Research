import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
// @ts-expect-error DSH host plugin is JavaScript.
import { bindAssistantSession, ensureAssistantPageContextTool, loadAssistantSessions, setStockPageContextStage, stageAssistantPageContext } from '../dsh/finance-ui/host-state.mjs';
import { assistantBindingForPage } from '../src/verticals/finance/assistant/binding.ts';
import { createServer } from 'vite';
import { fileURLToPath } from 'node:url';


function setup(t: test.TestContext) {
  const previous = process.env.DSH_HOME;
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'assistant-deep-bind-'));
  process.env.DSH_HOME = home;
  t.after(() => {
    setStockPageContextStage(null);
    if (previous === undefined) delete process.env.DSH_HOME; else process.env.DSH_HOME = previous;
    fs.rmSync(home, { recursive: true, force: true });
  });
  const registered: string[] = [];
  const events: any[] = [];
  const ctx = {
    sessions: { get: () => ({ snapshotEvents: () => events }) },
    agents: { get: (id: string) => ({ session: { id }, ctx: { tools: { register(tool: any) { registered.push(tool.name); return () => {}; } } } }) },
  };
  return { home, ctx, registered, events };
}

async function loadPrompt() {
  const server = await createServer({ configFile: false, root: fileURLToPath(new URL('../', import.meta.url)),
    server: { middlewareMode: true, watch: null }, appType: 'custom' });
  try { return await server.ssrLoadModule('/src/verticals/finance/assistant/prompt.ts') as typeof import('../src/verticals/finance/assistant/prompt.ts'); }
  finally { await server.close(); }
}

const bindOptions = { sessionExists: () => true, isRunning: () => false };

test('个股页与动态讨论绑定 deep_research，个股页带当前公司', () => {
  assert.deepEqual(assistantBindingForPage('company-wiki:companies/000933-sz'),
    { plugin: 'deep_research', target: 'companies/000933-sz', bindKey: 'deep_research:companies/000933-sz' });
  assert.deepEqual(assistantBindingForPage('feed:variables'),
    { plugin: 'deep_research', target: '', bindKey: 'deep_research:feed-variables' });
});

test('宿主记录 deep_research 与公司；页面快照交给 Stock 暂存，不注册 read_page_context，也不进用户消息', async t => {
  const { ctx, registered } = setup(t);
  const record = bindAssistantSession({ session_id: 'session-deep-1', plugin: 'deep_research', mode: 'agent', target: 'companies/000933-sz', page_key: 'deep_research:companies/000933-sz' }, bindOptions);
  assert.equal(record.plugin, 'deep_research');
  assert.equal(record.target, 'companies/000933-sz');
  assert.equal(loadAssistantSessions().pages['deep_research:companies/000933-sz'].session_id, 'session-deep-1');
  assert.equal(loadAssistantSessions().pages['company_wiki:companies/000933-sz'], undefined, '旧 company_wiki 会话不迁移');

  const staged: any[] = [];
  setStockPageContextStage((sessionId: string, turn: number, snapshot: any) => { staged.push({ sessionId, turn, snapshot }); return snapshot; });
  assert.equal(ensureAssistantPageContextTool(ctx, 'session-deep-1'), true);
  assert.deepEqual(registered, [], '不再给模型 read_page_context');
  const result = stageAssistantPageContext(ctx, { session_id: 'session-deep-1', page_name: '神火股份', content: '【页面快照】净利润 12.3 亿元' });
  assert.equal(result.turn, 1);
  assert.equal(staged.length, 1);
  assert.equal(staged[0].sessionId, 'session-deep-1');
  assert.equal(staged[0].turn, 1);
  assert.equal(staged[0].snapshot.page_name, '神火股份');
  assert.match(staged[0].snapshot.content, /净利润 12.3 亿元/);
  assert.equal(registered.length, 0);

  const { assistantUserMessage } = await loadPrompt();
  const message = assistantUserMessage('它靠什么赚钱', []);
  assert.equal(message, '它靠什么赚钱');
  assert.doesNotMatch(message, /净利润 12.3/);
});

test('Stock 暂存通道不可用时拒绝暂存，不静默丢快照；其他页面仍走 read_page_context', t => {
  const { ctx, registered } = setup(t);
  bindAssistantSession({ session_id: 'session-deep-2', plugin: 'deep_research', mode: 'agent', target: 'companies/000933-sz' }, bindOptions);
  setStockPageContextStage(null);
  assert.throws(() => stageAssistantPageContext(ctx, { session_id: 'session-deep-2', page_name: '神火股份', content: '快照' }), /暂不可用/);
  bindAssistantSession({ session_id: 'session-intel-1', plugin: 'intel', mode: 'agent' }, bindOptions);
  ensureAssistantPageContextTool(ctx, 'session-intel-1');
  assert.deepEqual(registered, ['read_page_context']);
});

test('未注入时经进程全局的同一 Symbol 键找到 Stock 的暂存函数', t => {
  const { ctx } = setup(t);
  const key = Symbol.for('stock-research.page-context.stage');
  const staged: any[] = [];
  (globalThis as any)[key] = (sessionId: string, turn: number, snapshot: any) => { staged.push({ sessionId, turn, snapshot }); return snapshot; };
  t.after(() => { delete (globalThis as any)[key]; });
  bindAssistantSession({ session_id: 'session-deep-3', plugin: 'deep_research', mode: 'agent', target: 'companies/000933-sz' }, bindOptions);
  setStockPageContextStage(null);
  const { turn } = stageAssistantPageContext(ctx, { session_id: 'session-deep-3', page_name: '神火股份', content: '净利润 12.3 亿元' });
  assert.equal(staged.length, 1);
  assert.equal(staged[0].turn, turn);
  assert.equal(staged[0].snapshot.page_name, '神火股份');
});

test('bindAssistantPrompt 不再写「模式」行', async () => {
  const { bindAssistantPrompt } = await loadPrompt();
  const text = await bindAssistantPrompt({ prompt: '问', title: '神火股份', pageSnapshot: '快照', objects: [] });
  assert.doesNotMatch(text, /模式：|Ask|Agent/);
  assert.match(text, /当前页面：神火股份/);
});
