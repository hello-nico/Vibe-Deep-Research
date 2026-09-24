import assert from 'node:assert/strict';
import test from 'node:test';
import { createRequire } from 'node:module';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { maintenanceDefinition, researchStatusDefinition } from '../src/verticals/finance/dsh/result-projection.ts';

// Exercise the installed product runtime; only the model and Backend are controlled.
const requireRuntime = createRequire(new URL('../dsh/runtime/package.json', import.meta.url));
const runtime = async (name: string) => import(requireRuntime.resolve(`@deepseek-ai/${name}`));
const { Context } = await runtime('cordis');
const { LlmAdapter } = await runtime('dsh-llm');
const stock = process.env.VRA_RESEARCH_REPO
  ? pathToFileURL(path.join(process.env.VRA_RESEARCH_REPO, 'dsh/dist') + path.sep)
  : new URL('../../../Stock-Research/dsh/dist/', import.meta.url);
const { runBackgroundReview, listBackgroundTasks } = await import(new URL('background-review.mjs', stock).href);
const { installResearchTools } = await import(new URL('research-tools.mjs', stock).href);
const snapshot = {
  questionIdentity: 'first-question', question: '第一题材料快照', reviewed_as_of: '2026-09-15',
  accepted_pages: [{ spec: { slug: 'companies/test', research_blocks: [] }, base_input_hash: 'a'.repeat(64) }],
  source_blocks: [{ text: '原文材料', source_ref: 'source:test' }], candidates: [],
};
const emptyResult = { decision: 'no_increment', noIncrementReason: '无增量' };

test('native spawn isolates requests, tools, completion and cancellation from parent', { timeout: 15000 }, async (t) => {
  const previous = { enabled: process.env.STOCK_RESEARCH_ACCUMULATE, token: process.env.STOCK_RESEARCH_HOOK_TOKEN, home: process.env.DSH_HOME };
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'native-settlement-'));
  process.env.DSH_HOME = home;
  process.env.STOCK_RESEARCH_ACCUMULATE = '1';
  process.env.STOCK_RESEARCH_HOOK_TOKEN = 'controlled-test-token';
  t.after(() => {
    for (const [key, value] of [['STOCK_RESEARCH_ACCUMULATE', previous.enabled], ['STOCK_RESEARCH_HOOK_TOKEN', previous.token], ['DSH_HOME', previous.home]]) {
      if (value === undefined) delete process.env[key!]; else process.env[key!] = value;
    }
    fs.rmSync(home, { recursive: true, force: true });
  });
  const ctx = new Context();
  const requests: any[] = [];
  t.mock.method(globalThis, 'fetch', async (url: any) => {
    if (!String(url).includes('/wiki/research-memory')) throw new Error('Unexpected Backend request');
    return new Response(JSON.stringify({ version: 1, entries: [{ stance: 'stated', text: '先给结论' }] }));
  });
  let childStarted: () => void = () => {};
  let releaseChild: () => void = () => {};
  let mode = 'complete';
  let mainStarted: () => void = () => {};
  let releaseMain: () => void = () => {};
  class ControlledModel extends LlmAdapter {
    async *stream(options: any) {
      requests.push(options);
      const packed = JSON.stringify(options.messages);
      const child = packed.includes('Settle knowledge after the main answer');
      if (child) {
        childStarted();
        const names = (options.tools || []).map((tool: any) => tool.name);
        assert.ok(!names.includes('generate_market_result'));
        assert.ok(!names.includes('topic_update'));
        assert.ok(names.includes('source_read_blocks'));
        assert.ok(names.includes('stage_extraction'));
        await new Promise<void>((resolve, reject) => {
          releaseChild = resolve;
          if (options.signal.aborted) reject(new Error('aborted'));
          else options.signal.addEventListener('abort', () => reject(new Error('aborted')), { once: true });
        });
        if (mode === 'fail') throw new Error('controlled failure');
        yield { type: 'block-start', index: 0, blockType: 'tool-call' };
        const result = mode === 'draft' ? { decision: 'update', wikiUpdates: [{
          slug: 'companies/test', baseInputHash: 'a'.repeat(64), kind: 'operating_model',
          content: '材料支持的经营模式草案', refs: ['source:doc:rev:' + 'b'.repeat(64) + ':b2'], rationale: '新增原文',
        }] } : emptyResult;
        yield { type: 'block-end', index: 0, block: { type: 'tool-call', id: 'review-result', name: 'structured_output', arguments: result } };
        yield { type: 'finish', reason: 'tool-calls' };
      } else {
        if (mode === 'cancel-main') throw new Error('controlled main failure');
        if (mode === 'draft') {
          mainStarted();
          await new Promise<void>(resolve => { releaseMain = resolve; });
        }
        yield { type: 'block-start', index: 0, blockType: 'text' };
        yield { type: 'block-end', index: 0, block: { type: 'text', text: '主回答完成' } };
        yield { type: 'finish', reason: 'stop' };
      }
    }
  }
  try {
    for (const name of ['dsh-agent', 'dsh-session', 'dsh-session-projection', 'dsh-llm', 'dsh-system-prompt', 'dsh-tools', 'dsh-agent-loop', 'dsh-subagent', 'dsh-skill']) {
      await ctx.plugin((await runtime(name)).default, name === 'dsh-tools' ? { mode: 'native' } : {});
    }
    await ctx.plugin(await runtime('dsh-subagent-spawn-in-process'), {});
    ctx.llm.registerAdapter(['controlled'], new ControlledModel());
    await ctx.plugin(Object.assign((inner: any) => installResearchTools(inner, async () => ({ tools: [], close() {} })),
      { inject: ['tools', 'agents', 'subagents', 'skills', 'systemPrompt'] }));
    const handle = await ctx.agents.create({ sessionId: 'review-runtime-parent', agentOptions: { provider: 'controlled', model: 'controlled' } });
    const parent = handle.agent;
    parent.followup({ content: [{ type: 'text', text: '主问题' }], source: { kind: 'user' } });
    await parent.whenIdle();
    assert.match(JSON.stringify(requests[0]), /先给结论/);
    for (const scenario of ['complete', 'fail', 'timeout']) {
      mode = scenario;
      const started = new Promise<void>(resolve => { childStarted = resolve; });
      const signal = scenario === 'timeout' ? AbortSignal.timeout(100) : new AbortController().signal;
      const outcome = runBackgroundReview(ctx.subagents, parent, snapshot, signal).then((value: any) => ({ value }), (error: any) => ({ error }));
      await Promise.race([started, outcome.then((result: any) => { throw result.error || new Error('child completed before model request'); })]);
      const child = ctx.agents.list().find((agent: any) => agent.id !== parent.id);
      assert.ok(child);
      assert.equal(ctx.tools.get('generate_market_result', child), undefined);
      assert.equal(ctx.tools.get('topic_update', child), undefined);
      const before = requests.length;
      parent.followup({ content: [{ type: 'text', text: `后续问题 ${scenario}` }], source: { kind: 'user' } });
      await parent.whenIdle();
      assert.equal(requests.length, before + 1);
      assert.ok(!JSON.stringify(requests.at(-1).messages).includes('第一题材料快照'));
      if (scenario !== 'timeout') releaseChild();
      else await new Promise(resolve => setTimeout(resolve, 120));
      const result = await outcome;
      if (scenario === 'complete') assert.equal(result.value.status, 'no_increment');
      else assert.ok(result.error || result.value?.status === 'failed' || result.value?.status === 'cancelled');
      await new Promise(resolve => setImmediate(resolve));
      assert.equal(requests.length, before + 1, 'child result must not request another parent response');
      assert.equal(parent.inbox.hasPending, false);
      assert.deepEqual(ctx.agents.list().map((agent: any) => agent.id), [parent.id]);
    }
    const events = parent.session.snapshotEvents();
    assert.equal(events.filter((event: any) => event.type === 'turn/start').length, 4);
    assert.ok(events.filter((event: any) => event.type === 'turn/end').every((event: any) => event.data.reason.kind === 'completed'));
    mode = 'cancel-main';
    parent.followup({ content: [{ type: 'text', text: '失败的一问' }], source: { kind: 'user' } });
    await parent.whenIdle();
    // Drive the actual installer/host handoff, including its finalization notification.
    mode = 'draft';
    const mainReady = new Promise<void>(resolve => { mainStarted = resolve; });
    const reviewReady = new Promise<void>(resolve => { childStarted = resolve; });
    t.mock.method(globalThis, 'fetch', async (url: any, options: any) => {
      const pathname = new URL(url).pathname;
      let value;
      if (pathname.endsWith('/wiki/research-memory')) {
        value = { version: 9, entries: [{ stance: 'corrected', text: '本轮更正的偏好' }] };
      } else if (pathname.endsWith('/wiki/page-drafts/research')) {
        value = options.method === 'POST' ? { draft_token: 'controlled-draft', published: false }
          : { spec: { slug: 'companies/test', type: 'company', research_blocks: [] }, base_input_hash: 'a'.repeat(64) };
      } else if (pathname.endsWith('/wiki/extractions/finalize')) {
        const body = JSON.parse(options.body);
        value = { results: body.candidates.map(() => ({ outcome: 'accepted' })) };
      } else if (/\/blocks\/b[12]$/.test(pathname)) {
        value = { document_id: 'doc', parse_revision_id: 'rev', parsed_content_sha256: 'b'.repeat(64), block_id: pathname.split('/').at(-1), text: '原文材料' };
      } else throw new Error(`Unexpected Backend request ${pathname}`);
      return new Response(JSON.stringify(value));
    });
    parent.followup({ content: [{ type: 'text', text: '读取原文并回答' }], source: { kind: 'user' } });
    await mainReady;
    for (const [name, args] of [
      ['wiki_read', { slug: 'companies/test' }],
      ['source_read_blocks', { sources: [{ documentId: 'doc', parseRevisionId: 'rev', parsedContentSha256: 'b'.repeat(64), blockIds: ['b1'] }] }],
    ]) {
      const result = await ctx.tools.execute({ agent: parent, name, arguments: args, callId: name, signal: new AbortController().signal });
      assert.ok(!result.isError, JSON.stringify(result.content));
    }
    releaseMain();
    await parent.whenIdle();
    await reviewReady;
    const handedOff = JSON.stringify(requests.at(-1));
    assert.match(handedOff, /本轮更正的偏好/);
    assert.match(handedOff, /sourceTurn\\?":6/);
    assert.match(handedOff, /finalAnswer\\?":\\?"主回答完成/);
    const settlementChild = ctx.agents.list().find((agent: any) => agent.id !== parent.id);
    const childRead = await ctx.tools.execute({ agent: settlementChild, name: 'source_read_blocks', arguments: {
      sources: [{ documentId: 'doc', parseRevisionId: 'rev', parsedContentSha256: 'b'.repeat(64), blockIds: ['b2'] }],
    }, callId: 'child-read', signal: new AbortController().signal });
    assert.ok(!childRead.isError, JSON.stringify(childRead.content));
    const staged = await ctx.tools.execute({ agent: settlementChild, name: 'stage_extraction', arguments: {
      document_id: 'doc', parse_revision_id: 'rev', parsed_content_sha256: 'b'.repeat(64), block_id: 'b2', candidate_kind: 'entity',
      entities: [{ key: 'company', entity_type: 'Company', canonical_name: '原文材料', entity_id: 'company:600011.SH' }],
      supports: [{ block_id: 'b2', role: 'entity:company' }],
    }, callId: 'child-stage', signal: new AbortController().signal });
    assert.ok(!staged.isError, JSON.stringify(staged.content));
    assert.equal(parent.inbox.hasPending, false);
    const requestCount = requests.length;
    const reviewDone = new Promise<void>((resolve, reject) => {
      ctx.on('session/event', (session: any, event: any) => {
        if (session.id === parent.id && event.type === 'stock-research/maintenance') {
          try {
          assert.equal(event.data.status, 'awaiting_authorization');
          assert.equal(event.data.question, '读取原文并回答');
          assert.equal(event.data.extraction.accepted, 1);
          assert.ok(maintenanceDefinition.match(event));
          resolve();
          } catch (error) { reject(error); }
        }
      });
    });
    releaseChild();
    await reviewDone;
    const saved = listBackgroundTasks().find((task: any) => task.id === settlementChild.session.id);
    assert.equal(saved.extraction.accepted, 1);
    assert.equal(saved.draft_token, 'controlled-draft');
    assert.equal(saved.parent_session_id, parent.session.id);
    assert.equal(requests.length, requestCount);
    assert.equal(parent.inbox.hasPending, false);
    assert.equal(parent.session.snapshotEvents().filter((event: any) => event.type === 'turn/start').length, 6);

    // 2026-09-24（公司研究任务修复 §2）：本轮出现过的工具失败不再否决整理；
    // 整理只能引用快照内成功读取的材料，失败的读取不进入依据。
    const failedTurnReady = new Promise<void>(resolve => { mainStarted = resolve; });
    parent.followup({ content: [{ type: 'text', text: '来源失败后仍按已读材料维护' }], source: { kind: 'user' } });
    await failedTurnReady;
    for (const [name, args] of [
      ['wiki_read', { slug: 'companies/test' }],
      ['source_read_blocks', { sources: [{ documentId: 'doc', parseRevisionId: 'rev', parsedContentSha256: 'b'.repeat(64), blockIds: ['b1'] }] }],
    ]) {
      const result = await ctx.tools.execute({ agent: parent, name, arguments: args, callId: name, signal: new AbortController().signal });
      assert.ok(!result.isError);
    }
    const failed = await ctx.tools.execute({ agent: parent, name: 'search_external', arguments: { query: '来源请求失败' }, callId: 'failed-search', signal: new AbortController().signal });
    assert.equal(failed.isError, true);
    const beforeFailedClose = requests.length;
    releaseMain();
    await parent.whenIdle();
    await parent.runMaintenance(async () => {});
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(requests.length, beforeFailedClose + 1, 'a failed tool no longer prevents the maintenance model call');
    const lastReview = requests.at(-1);
    assert.doesNotMatch(JSON.stringify(lastReview), /来源请求失败/, 'the failed search result must not enter the settlement snapshot');
    await handle.dispose();
  } finally { await ctx.fiber.dispose(); }
});

test('slow parent finalize does not delay the next user model request', { timeout: 15000 }, async t => {
  const previous = { enabled: process.env.STOCK_RESEARCH_ACCUMULATE, token: process.env.STOCK_RESEARCH_HOOK_TOKEN, home: process.env.DSH_HOME };
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'native-finalize-'));
  process.env.DSH_HOME = home;
  process.env.STOCK_RESEARCH_ACCUMULATE = '1';
  process.env.STOCK_RESEARCH_HOOK_TOKEN = 'controlled-test-token';
  t.after(() => {
    for (const [key, value] of [['STOCK_RESEARCH_ACCUMULATE', previous.enabled], ['STOCK_RESEARCH_HOOK_TOKEN', previous.token], ['DSH_HOME', previous.home]]) {
      if (value === undefined) delete process.env[key!]; else process.env[key!] = value;
    }
    fs.rmSync(home, { recursive: true, force: true });
  });
  const ctx = new Context();
  const requests: any[] = [];
  let mainStarted: () => void = () => {};
  let releaseMain: () => void = () => {};
  let releaseFinalize: () => void = () => {};
  const finalizeStarted = Promise.withResolvers<void>();
  const followupStarted = Promise.withResolvers<number>();
  class ControlledModel extends LlmAdapter {
    async *stream(options: any) {
      requests.push(options);
      if (requests.length === 1) {
        mainStarted();
        await new Promise<void>(resolve => { releaseMain = resolve; });
      } else {
        followupStarted.resolve(Date.now());
      }
      yield { type: 'block-start', index: 0, blockType: 'text' };
      yield { type: 'block-end', index: 0, block: { type: 'text', text: '主回答完成' } };
      yield { type: 'finish', reason: 'stop' };
    }
  }
  try {
    for (const name of ['dsh-agent', 'dsh-session', 'dsh-session-projection', 'dsh-llm', 'dsh-system-prompt', 'dsh-tools', 'dsh-agent-loop', 'dsh-subagent', 'dsh-skill']) {
      await ctx.plugin((await runtime(name)).default, name === 'dsh-tools' ? { mode: 'native' } : {});
    }
    await ctx.plugin(await runtime('dsh-subagent-spawn-in-process'), {});
    ctx.llm.registerAdapter(['controlled'], new ControlledModel());
    await ctx.plugin(Object.assign((inner: any) => installResearchTools(inner, async () => ({ tools: [], close() {} })),
      { inject: ['tools', 'agents', 'subagents', 'skills', 'systemPrompt'] }));
    t.mock.method(globalThis, 'fetch', async (url: any, options: any) => {
      const pathname = new URL(url).pathname;
      if (pathname.endsWith('/wiki/extractions/finalize')) {
        finalizeStarted.resolve();
        await new Promise<void>(resolve => { releaseFinalize = resolve; });
        const body = JSON.parse(options.body);
        return new Response(JSON.stringify({ results: (body.candidates || []).map(() => ({ outcome: 'accepted' })) }));
      }
      if (/\/blocks\//.test(pathname)) {
        return new Response(JSON.stringify({
          document_id: 'doc', parse_revision_id: 'rev', parsed_content_sha256: 'b'.repeat(64),
          block_id: pathname.split('/').at(-1), text: '原文材料',
        }));
      }
      throw new Error(`Unexpected Backend request ${pathname}`);
    });
    const handle = await ctx.agents.create({ sessionId: 'finalize-runtime-parent', agentOptions: { provider: 'controlled', model: 'controlled' } });
    const parent = handle.agent;
    const mainReady = new Promise<void>(resolve => { mainStarted = resolve; });
    parent.followup({ content: [{ type: 'text', text: '读取原文并回答' }], source: { kind: 'user' } });
    await mainReady;
    const read = await ctx.tools.execute({
      agent: parent, name: 'source_read_blocks',
      arguments: { sources: [{ documentId: 'doc', parseRevisionId: 'rev', parsedContentSha256: 'b'.repeat(64), blockIds: ['b1'] }] },
      callId: 'read', signal: new AbortController().signal,
    });
    assert.ok(!read.isError, JSON.stringify(read.content));
    releaseMain();
    await finalizeStarted.promise;
    const queuedAt = Date.now();
    parent.followup({ content: [{ type: 'text', text: '立刻下一问' }], source: { kind: 'user' } });
    const followupAt = await Promise.race([
      followupStarted.promise,
      new Promise<number>((_resolve, reject) => setTimeout(() => reject(new Error('followup blocked by finalize')), 1000)),
    ]);
    assert.ok(followupAt - queuedAt < 1000);
    assert.equal(requests.length, 2);
    assert.ok(!JSON.stringify(requests.at(-1).messages).includes('读取原文并回答') || JSON.stringify(requests.at(-1).messages).includes('立刻下一问'));
    releaseFinalize();
    await parent.whenIdle();
    await handle.dispose();
  } finally { await ctx.fiber.dispose(); }
});

test('maintenance projection is silent except for validated drafts and keeps question identity', () => {
  const status = { type: 'stock-research/status', data: { text: '未授权写入' } };
  assert.ok(researchStatusDefinition.match(status as never));
  assert.equal(researchStatusDefinition.start({} as never, { event: status } as never).text, status.data.text);
  const event = (status: string) => ({ type: 'stock-research/maintenance', seq: 12, data: {
    status, questionIdentity: 'question-a', proposal: { research_blocks: [{ content: '草案正文' }] },
    draft: { draft_token: 'test-token', published: false },
  } });
  for (const status of ['no_increment', 'failed', 'cancelled']) assert.equal(maintenanceDefinition.match(event(status) as never), null);
  const draft = event('awaiting_authorization');
  assert.deepEqual(maintenanceDefinition.match(draft as never), { id: 'question-a', role: 'start' });
  const state = maintenanceDefinition.start({} as never, { event: draft } as never);
  const node = maintenanceDefinition.buildViewNode({ state, start: { event: draft }, id: 'question-a' } as never);
  assert.equal(node?.anchorSeq, 12);
  assert.equal(node?.data.content, '草案正文');
});
