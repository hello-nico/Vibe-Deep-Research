import assert from 'node:assert/strict';
import test from 'node:test';
import { createRequire } from 'node:module';
import { maintenanceDefinition, researchStatusDefinition } from '../src/verticals/finance/dsh/result-projection.ts';

// Exercise the installed product runtime; only the model and Backend are controlled.
const requireRuntime = createRequire(new URL('../dsh/runtime/package.json', import.meta.url));
const runtime = async (name: string) => import(requireRuntime.resolve(`@deepseek-ai/${name}`));
const { Context } = await runtime('cordis');
const { LlmAdapter } = await runtime('dsh-llm');
const stock = new URL('../../../Stock-Research/dsh/dist/', import.meta.url);
const { runBackgroundReview } = await import(new URL('background-review.mjs', stock).href);
const { installResearchTools } = await import(new URL('research-tools.mjs', stock).href);
const snapshot = {
  questionIdentity: 'first-question', question: '第一题材料快照', reviewed_as_of: '2026-09-15',
  accepted_pages: [{ spec: { slug: 'companies/test', research_blocks: [] }, base_input_hash: 'a'.repeat(64) }],
  source_blocks: [{ text: '原文材料', source_ref: 'source:test' }], candidates: [],
};
const emptyResult = { noIncrementReason: '无增量', slug: '', baseInputHash: '', content: '', refs: [], rationale: '' };

test('native spawn isolates requests, tools, completion and cancellation from parent', { timeout: 15000 }, async (t) => {
  const ctx = new Context();
  const requests: any[] = [];
  let childStarted: () => void = () => {};
  let releaseChild: () => void = () => {};
  let mode = 'complete';
  let mainStarted: () => void = () => {};
  let releaseMain: () => void = () => {};
  class ControlledModel extends LlmAdapter {
    async *stream(options: any) {
      requests.push(options);
      const child = JSON.stringify(options.messages).includes('Compare the newly read original source blocks');
      if (child) {
        assert.deepEqual(options.tools.map((tool: any) => tool.name), ['structured_output']);
        childStarted();
        await new Promise<void>((resolve, reject) => {
          releaseChild = resolve;
          if (options.signal.aborted) reject(new Error('aborted'));
          else options.signal.addEventListener('abort', () => reject(new Error('aborted')), { once: true });
        });
        if (mode === 'fail') throw new Error('controlled failure');
        yield { type: 'block-start', index: 0, blockType: 'tool-call' };
        const result = mode === 'draft' ? { noIncrementReason: '', slug: 'companies/test', baseInputHash: 'a'.repeat(64),
          content: '材料支持的经营模式草案', refs: ['source:doc:rev:' + 'b'.repeat(64) + ':b1'], rationale: '新增原文' } : emptyResult;
        yield { type: 'block-end', index: 0, block: { type: 'tool-call', id: 'review-result', name: 'structured_output', arguments: result } };
        yield { type: 'finish', reason: 'tool-calls' };
      } else {
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
    for (const scenario of ['complete', 'fail', 'timeout']) {
      mode = scenario;
      const started = new Promise<void>(resolve => { childStarted = resolve; });
      const signal = scenario === 'timeout' ? AbortSignal.timeout(100) : new AbortController().signal;
      const outcome = runBackgroundReview(ctx.subagents, parent, snapshot, signal).then((value: any) => ({ value }), (error: any) => ({ error }));
      await Promise.race([started, outcome.then((result: any) => { throw result.error || new Error('child completed before model request'); })]);
      const child = ctx.agents.list().find((agent: any) => agent.id !== parent.id);
      assert.ok(child);
      assert.equal(ctx.tools.get('stock_read_wiki_research', child), undefined);
      const before = requests.length;
      parent.followup({ content: [{ type: 'text', text: `后续问题 ${scenario}` }], source: { kind: 'user' } });
      await parent.whenIdle();
      assert.equal(requests.length, before + 1);
      assert.ok(!JSON.stringify(requests.at(-1).messages).includes('第一题材料快照'));
      if (scenario !== 'timeout') releaseChild();
      else await new Promise(resolve => setTimeout(resolve, 120));
      const result = await outcome;
      if (scenario === 'complete') assert.equal(result.value.status, 'no_increment');
      else assert.ok(result.error);
      await new Promise(resolve => setImmediate(resolve));
      assert.equal(requests.length, before + 1, 'child result must not request another parent response');
      assert.equal(parent.inbox.hasPending, false);
      assert.deepEqual(ctx.agents.list().map((agent: any) => agent.id), [parent.id]);
    }
    const events = parent.session.snapshotEvents();
    assert.equal(events.filter((event: any) => event.type === 'turn/start').length, 4);
    assert.ok(events.filter((event: any) => event.type === 'turn/end').every((event: any) => event.data.reason.kind === 'completed'));
    // Drive the actual installer/host handoff, including its finalization notification.
    mode = 'draft';
    const mainReady = new Promise<void>(resolve => { mainStarted = resolve; });
    const reviewReady = new Promise<void>(resolve => { childStarted = resolve; });
    t.mock.method(globalThis, 'fetch', async (url: any, options: any) => {
      const pathname = new URL(url).pathname;
      let value;
      if (pathname.endsWith('/wiki/page-drafts/research')) {
        value = options.method === 'POST' ? { draft_token: 'controlled-draft', published: false }
          : { spec: { slug: 'companies/test', type: 'company', research_blocks: [] }, base_input_hash: 'a'.repeat(64) };
      } else if (pathname.endsWith('/blocks/b1')) {
        value = { document_id: 'doc', parse_revision_id: 'rev', parsed_content_sha256: 'b'.repeat(64), block_id: 'b1', text: '原文材料' };
      } else throw new Error(`Unexpected Backend request ${pathname}`);
      return new Response(JSON.stringify(value));
    });
    parent.followup({ content: [{ type: 'text', text: '读取原文并回答' }], source: { kind: 'user' } });
    await mainReady;
    for (const [name, args] of [
      ['stock_read_wiki_research', { slug: 'companies/test' }],
      ['stock_read_source_blocks', { sources: [{ documentId: 'doc', parseRevisionId: 'rev', parsedContentSha256: 'b'.repeat(64), blockIds: ['b1'] }] }],
    ]) {
      const result = await ctx.tools.execute({ agent: parent, name, arguments: args, callId: name, signal: new AbortController().signal });
      assert.ok(!result.isError, JSON.stringify(result.content));
    }
    releaseMain();
    await parent.whenIdle();
    await reviewReady;
    assert.equal(parent.inbox.hasPending, false);
    const status = parent.session.snapshotEvents().find((event: any) => event.type === 'stock-research/status');
    assert.ok(status);
    assert.ok(researchStatusDefinition.match(status));
    assert.equal(researchStatusDefinition.start({} as never, { event: status } as never).text, status.data.text);
    const requestCount = requests.length;
    const reviewDone = new Promise<void>(resolve => {
      ctx.on('session/event', (session: any, event: any) => {
        if (session.id === parent.id && event.type === 'stock-research/maintenance') {
          assert.equal(event.data.status, 'awaiting_authorization');
          assert.equal(event.data.question, '读取原文并回答');
          assert.ok(maintenanceDefinition.match(event));
          resolve();
        }
      });
    });
    releaseChild();
    await reviewDone;
    assert.equal(requests.length, requestCount);
    assert.equal(parent.inbox.hasPending, false);
    assert.equal(parent.session.snapshotEvents().filter((event: any) => event.type === 'turn/start').length, 5);
    await handle.dispose();
  } finally { await ctx.fiber.dispose(); }
});

test('maintenance projection is silent except for validated drafts and keeps question identity', () => {
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
