import test from 'node:test';
import assert from 'node:assert/strict';
import { Readable } from 'node:stream';
import { EventEmitter } from 'node:events';
// @ts-expect-error DSH plugin is JavaScript.
import { installPageModel } from '../dsh/finance-ui/model.mjs';

test('page model reads DSH selection without a model call and uses it for replies', async () => {
  let handler: any, seen: any, selection: any = null, finish = 'stop';
  installPageModel({ webServer: { register(route: any) { handler = route.handler; } },
    agentDefaultModel: { currentSelection: () => selection },
    llm: { async *stream(request: any) { seen = request;
      yield { type: 'text-delta', text: '测试回答' };
      yield { type: 'finish', reason: { kind: finish } };
    } },
  });
  async function invoke(method: string) {
    const req = Object.assign(Readable.from([Buffer.from(JSON.stringify({ message: '测试', history: [] }))]), { method });
    const res = Object.assign(new EventEmitter(), { statusCode: 200, destroyed: false, writableEnded: false, body: '', setHeader() {}, end(body = '') { this.body = body; this.writableEnded = true; } });
    await handler(req, res); return res;
  }
  assert.deepEqual(JSON.parse((await invoke('GET')).body), { configured: false });
  assert.equal((await invoke('POST')).statusCode, 409);
  selection = { provider: 'fixture-provider', model: 'fixture-model' };
  assert.deepEqual(JSON.parse((await invoke('GET')).body), { configured: true });
  assert.equal(seen, undefined);
  assert.equal(JSON.parse((await invoke('POST')).body).reply, '测试回答');
  assert.equal(seen.provider, selection.provider);
  assert.equal(seen.model, selection.model);
  assert.equal(seen.tools, undefined);
  finish = 'length';
  assert.equal((await invoke('POST')).statusCode, 502);
});
