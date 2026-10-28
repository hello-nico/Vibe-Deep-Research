import assert from 'node:assert/strict';
import test from 'node:test';
import { createRequire, registerHooks } from 'node:module';
import path from 'node:path';
import { realpathSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

const requireRuntime = createRequire(new URL('../dsh/runtime/package.json', import.meta.url));
const runtime = async (name: string) => import(requireRuntime.resolve(`@deepseek-ai/${name}`));
const checkout = path.resolve(import.meta.dirname, '../..');
const inWorktree = path.basename(path.dirname(checkout)) === '.worktrees';
const stockRoot = path.resolve(checkout, inWorktree ? '../../../Stock-Research' : '../Stock-Research');
const stockRepo = process.env.VRA_RESEARCH_REPO ?? (inWorktree
  ? path.join(stockRoot, '.worktrees', path.basename(checkout)) : stockRoot);
const stock = pathToFileURL(path.join(realpathSync(stockRepo), 'dsh/dist') + path.sep);
registerHooks({ resolve(specifier, context, nextResolve) {
  if (context.parentURL?.startsWith(stock.href) && specifier.startsWith('@deepseek-ai/')) {
    return nextResolve(pathToFileURL(requireRuntime.resolve(specifier)).href, context);
  }
  return nextResolve(specifier, context);
} });
const { installResearchTools } = await import(new URL('research-tools.mjs', stock).href);
const { Context } = await runtime('cordis');
const { LlmAdapter } = await runtime('dsh-llm');

for (const status of ['ready', 'failed']) test(`installed DSH: late ${status} stays idle and reaches the next user question`, async t => {
  const ctx = new Context();
  const requests: any[] = [];
  let release: () => void = () => {};
  let polled: () => void = () => {};
  const pollStarted = new Promise<void>(resolve => { polled = resolve; });
  const job = { job_id: 'job:aaaaaaaaaaaaaaaa', symbol: '600011.SH', report_type: 'quarterly_report',
    company_name: '华能国际', report_name: '三季报', status: 'pending' };
  t.mock.method(globalThis, 'fetch', async (url: any) => {
    const pathname = new URL(url).pathname;
    if (pathname.endsWith('/periodic-reports/ingest')) return Response.json(job);
    if (pathname.includes('/periodic-reports/jobs/')) {
      polled();
      return new Promise<Response>(resolve => { release = () => resolve(Response.json({ ...job, status,
        error: status === 'failed' ? 'controlled parse failure' : null })); });
    }
    if (pathname.endsWith('/wiki/research-memory')) return Response.json({ version: 0, entries: [] });
    throw new Error(`Unexpected Backend path ${pathname}`);
  });
  class ControlledModel extends LlmAdapter {
    async *stream(options: any) {
      requests.push(options);
      if (requests.length === 1) {
        yield { type: 'block-start', index: 0, blockType: 'tool-call' };
        yield { type: 'block-end', index: 0, block: { type: 'tool-call', id: 'ingest', name: 'source_ingest_periodic_report',
          arguments: JSON.stringify({ symbol: job.symbol, reportType: job.report_type }) } };
        yield { type: 'finish', reason: 'tool-calls' };
      } else {
        yield { type: 'block-start', index: 0, blockType: 'text' };
        yield { type: 'block-end', index: 0, block: { type: 'text', text: '回答完成' } };
        yield { type: 'finish', reason: 'stop' };
      }
    }
  }
  try {
    for (const name of ['dsh-fs-local', 'dsh-working-directory', 'dsh-agent', 'dsh-session', 'dsh-session-projection',
      'dsh-llm', 'dsh-system-prompt', 'dsh-tools', 'dsh-agent-loop', 'dsh-subagent', 'dsh-skill']) {
      await ctx.plugin((await runtime(name)).default, name === 'dsh-tools' ? { mode: 'native' } : {});
    }
    ctx.llm.registerAdapter(['controlled'], new ControlledModel());
    await ctx.plugin(Object.assign((inner: any) => installResearchTools(inner, async () => ({ tools: [], close() {} })),
      { inject: ['tools', 'agents', 'subagents', 'skills', 'systemPrompt'] }));
    const handle = await ctx.agents.create({ sessionId: `late-ingest-${status}`, agentOptions: { provider: 'controlled', model: 'controlled' } });
    const agent = handle.agent;
    agent.followup({ content: [{ type: 'text', text: '读三季报' }], source: { kind: 'user' } });
    await pollStarted;
    await agent.whenIdle();
    assert.equal(requests.length, 2);
    release();
    for (let i = 0; i < 50 && !agent.session.snapshotEvents().some((event: any) => event.type === 'plugin:stock-research/periodic-report'); i++) {
      await new Promise(resolve => setTimeout(resolve, 10));
    }
    await new Promise(resolve => setTimeout(resolve, 30));
    const events = agent.session.snapshotEvents();
    assert.equal(events.filter((event: any) => event.type === 'plugin:stock-research/periodic-report').length, 1);
    assert.equal(events.filter((event: any) => event.type === 'turn/start').length, 1);
    assert.equal(requests.length, 2);
    agent.followup({ content: [{ type: 'text', text: '现在继续' }], source: { kind: 'user' } });
    await agent.whenIdle();
    assert.equal(requests.length, 3);
    assert.ok(JSON.stringify(requests.at(-1).messages).includes(status === 'ready' ? '周期报告已入库' : '周期报告入库失败'));
    assert.equal(agent.session.snapshotEvents().filter((event: any) => event.type === 'turn/start').length, 2);
    await handle.dispose();
  } finally { await ctx.fiber.dispose(); }
});
