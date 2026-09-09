import fs from 'node:fs';
import path from 'node:path';
import { randomUUID, timingSafeEqual } from 'node:crypto';

export function stageMessages(messages) {
  if (!Array.isArray(messages) || messages.length > 100) throw new Error('Invalid messages');
  return messages.map(message => {
    if (!['user', 'assistant', 'tool'].includes(message.role)) throw new Error('Invalid role');
    const content = message.role === 'assistant' && Array.isArray(message.dshContent) ? message.dshContent : message.role === 'tool'
      ? [{ type: 'tool-result', toolCallId: message.tool_call_id, content: [{ type: 'text', text: message.content ?? '' }] }]
      : [...(message.content ? [{ type: 'text', text: message.content }] : []), ...(message.tool_calls ?? []).map(call => ({
        type: 'tool-call', id: call.id, name: call.function.name, arguments: call.function.arguments,
      }))];
    return { id: randomUUID(), role: message.role === 'tool' ? 'user' : message.role, content,
      source: { kind: 'plugin', plugin: 'vibe-finance-ui/stage-model' } };
  });
}

/** Model transport only. Stage execution and tool dispatch stay in the orchestrator. */
export function installStageModel(ctx) {
  ctx.webServer.register({ kind: 'exact', path: '/finance-stage-model', async handler(req, res) {
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Cache-Control', 'no-store');
    const controller = new AbortController();
    res.once('close', () => { if (!res.writableEnded) controller.abort(); });
    try {
      const expected = Buffer.from(`Bearer ${fs.readFileSync(path.join(process.env.VRA_FINANCE_DATA_ROOT, 'api.token'), 'utf8').trim()}`);
      const actual = Buffer.from(req.headers.authorization ?? '');
      if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) { res.writeHead(401); res.end(); return; }
      if (req.method !== 'POST') { res.writeHead(405); res.end(); return; }
      const parts = []; let size = 0;
      for await (const part of req) {
        size += part.length;
        if (size > 2_000_000) { res.writeHead(413); res.end(); return; }
        parts.push(part);
      }
      const input = JSON.parse(Buffer.concat(parts).toString('utf8'));
      const selected = input.selection ?? ctx.agentDefaultModel.currentSelection();
      if (!selected?.provider || !selected?.model) { res.writeHead(409); res.end(); return; }
      const selection = { provider: selected.provider, model: selected.model, ...(selected.reasoningEffort ? { reasoningEffort: selected.reasoningEffort } : {}) };
      const started = Date.now(); let text = '', reason, usage = null; const calls = [], blocks = [];
      for await (const chunk of ctx.llm.stream({ ...selection, messages: stageMessages(input.messages), tools: input.tools, signal: controller.signal })) {
        if (chunk.type === 'text-delta') text += chunk.text;
        if (chunk.type === 'block-end') blocks.push(chunk.block);
        if (chunk.type === 'block-end' && chunk.block.type === 'tool-call') calls.push({ id: chunk.block.id, type: 'function', function: { name: chunk.block.name, arguments: chunk.block.arguments } });
        if (chunk.type === 'finish') { reason = chunk.reason.kind; usage = chunk.usage ?? null; }
      }
      if (!['stop', 'tool-calls'].includes(reason)) throw new Error('Incomplete model response');
      res.end(JSON.stringify({ selection, message: { role: 'assistant', content: text, dshContent: blocks, ...(calls.length ? { tool_calls: calls } : {}) }, finishReason: calls.length ? 'tool_calls' : 'stop', usage, durationMs: Date.now() - started }));
    } catch {
      if (!res.destroyed) { res.statusCode = 502; res.end(JSON.stringify({ error: 'DSH 阶段模型调用失败，请检查模型设置。' })); }
    }
  } });
}
