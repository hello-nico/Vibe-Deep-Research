import test from 'node:test';
import assert from 'node:assert/strict';
import { Readable } from 'node:stream';
import { EventEmitter } from 'node:events';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
// @ts-expect-error Native DSH plugin is authored as JavaScript.
import { installStageModel, stageMessages } from '../dsh/finance-ui/stage-model.mjs';

test('stage transport preserves tool call identity and results', () => {
  const messages = stageMessages([
    { role: 'assistant', tool_calls: [{ id: 'call1', function: { name: 'calc', arguments: '{"x":2}' } }] },
    { role: 'tool', tool_call_id: 'call1', content: '4' },
  ]);
  assert.equal(messages[0].content[0].id, 'call1');
  assert.equal(messages[1].content[0].toolCallId, 'call1');
  assert.equal(messages[1].content[0].content[0].text, '4');
});

test('stage endpoint uses DSH selection, rejects unauthenticated calls and incomplete replies', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'stage-model-'));
  const previous = process.env.VRA_FINANCE_DATA_ROOT;
  process.env.VRA_FINANCE_DATA_ROOT = dir;
  fs.writeFileSync(path.join(dir, 'api.token'), 'test-transport-token');
  let handler: any, seen: any, finish = 'tool-calls';
  installStageModel({ webServer: { register(value: any) { handler = value.handler; } },
    agentDefaultModel: { currentSelection: () => ({ provider: 'test-provider', model: 'test-model' }) },
    llm: { async *stream(request: any) { seen = request;
      yield { type: 'block-end', block: { type: 'tool-call', id: 'call1', name: 'calc', arguments: '{}' } };
      yield { type: 'finish', reason: { kind: finish } };
    } },
  });
  async function invoke(auth: string) {
    const req = Object.assign(Readable.from([Buffer.from(JSON.stringify({ messages: [{ role: 'user', content: 'research' }], tools: [] }))]), { method: 'POST', headers: { authorization: auth } });
    const res = Object.assign(new EventEmitter(), { statusCode: 200, destroyed: false, writableEnded: false, body: '', setHeader() {}, writeHead(code: number) { this.statusCode = code; }, end(body = '') { this.body = body; this.writableEnded = true; } });
    await handler(req, res); return res;
  }
  try {
    assert.equal((await invoke('')).statusCode, 401);
    const response = await invoke('Bearer test-transport-token');
    assert.equal(seen.provider, 'test-provider');
    assert.equal(JSON.parse(response.body).message.tool_calls[0].id, 'call1');
    finish = 'length';
    assert.equal((await invoke('Bearer test-transport-token')).statusCode, 502);
  } finally {
    if (previous === undefined) delete process.env.VRA_FINANCE_DATA_ROOT; else process.env.VRA_FINANCE_DATA_ROOT = previous;
    fs.rmSync(dir, { recursive: true });
  }
});
