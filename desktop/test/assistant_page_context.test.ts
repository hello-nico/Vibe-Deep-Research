import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
// @ts-expect-error DSH host plugin is JavaScript.
import { ensureAssistantPageContextTool, stageAssistantPageContext, readAssistantPageContext } from '../dsh/finance-ui/host-state.mjs';

test('页面上下文按会话和发送轮次暂存，未开始的同轮可覆盖，运行后不可覆盖', t => {
  const previous = process.env.DSH_HOME;
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'assistant-page-context-'));
  process.env.DSH_HOME = home;
  t.after(() => {
    if (previous === undefined) delete process.env.DSH_HOME;
    else process.env.DSH_HOME = previous;
    fs.rmSync(home, { recursive: true, force: true });
  });
  fs.mkdirSync(path.join(home, 'research'));
  fs.writeFileSync(path.join(home, 'research', 'assistant-sessions.json'), JSON.stringify({
    sessions: { 'session-111': { plugin: 'market', mode: 'ask' }, 'session-222': { plugin: 'intel', mode: 'agent' } },
    pages: {},
  }));
  const events = new Map([['session-111', [] as any[]], ['session-222', [] as any[]]]);
  const tools = new Map<string, any>();
  const ctx = {
    sessions: { get: (id: string) => events.has(id) ? { snapshotEvents: () => events.get(id) } : null },
    agents: { get: (id: string) => events.has(id) ? { session: { id }, ctx: { tools: {
      register(tool: any) { tools.set(id, tool); return () => tools.delete(id); },
    } } } : null },
  };
  const one = { session_id: 'session-111', page_name: '大盘', content: '快照一' };
  assert.equal(ensureAssistantPageContextTool(ctx, 'session-111'), true);
  assert.deepEqual(tools.get('session-111').execute({}, { agent: { session: { id: 'session-111', snapshotEvents: () => events.get('session-111') } } }),
    { status: 'missing', message: '本轮没有页面上下文' });
  assert.equal(stageAssistantPageContext(ctx, one).turn, 1);
  assert.equal(stageAssistantPageContext(ctx, { ...one, content: '快照一修正' }).turn, 1);
  assert.equal(stageAssistantPageContext(ctx, { session_id: 'session-222', page_name: '资讯', content: '资讯快照' }).turn, 1);
  assert.equal(readAssistantPageContext('session-111', 1).content, '快照一修正');
  assert.equal(readAssistantPageContext('session-222', 1).content, '资讯快照');
  assert.deepEqual(readAssistantPageContext('session-111', 2), { status: 'missing', message: '本轮没有页面上下文' });
  events.get('session-111')!.push({ type: 'turn/start', data: { turn: 1 } });
  assert.equal(tools.get('session-111').execute({}, { agent: { session: { id: 'session-111', snapshotEvents: () => events.get('session-111') } } }).content, '快照一修正');
  assert.throws(() => stageAssistantPageContext(ctx, { ...one, content: '不准覆盖' }), /尚未结束/);
  events.get('session-111')!.push({ type: 'turn/end', data: { turn: 1 } });
  assert.equal(stageAssistantPageContext(ctx, { ...one, content: '快照二' }).turn, 2);
  events.get('session-111')!.push({ type: 'turn/start', data: { turn: 2 } });
  assert.equal(tools.get('session-111').execute({}, { agent: { session: { id: 'session-111', snapshotEvents: () => events.get('session-111') } } }).content, '快照二');
  assert.equal(readAssistantPageContext('session-111', 1).content, '快照一修正');
});
