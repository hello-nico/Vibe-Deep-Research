import test from 'node:test';
import assert from 'node:assert/strict';
import { Readable } from 'node:stream';
import { EventEmitter } from 'node:events';
// @ts-expect-error DSH plugin is JavaScript.
import { installPageModel, PAGE_MODEL_SYSTEM } from '../dsh/finance-ui/model.mjs';

function response() {
  return Object.assign(new EventEmitter(), {
    statusCode: 200, destroyed: false, writableEnded: false, body: '', headers: {} as Record<string, string>,
    setHeader(key: string, value: string) { this.headers[key] = value; },
    end(body = '') { this.body = body; this.writableEnded = true; },
  });
}

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
    const res = response();
    await handler(req, res); return res;
  }
  assert.deepEqual(JSON.parse((await invoke('GET')).body), { configured: false });
  assert.equal((await invoke('POST')).statusCode, 409);
  selection = { provider: 'fixture-provider', model: 'fixture-model' };
  assert.deepEqual(JSON.parse((await invoke('GET')).body), { configured: true });
  assert.equal(seen, undefined);
  const posted = JSON.parse((await invoke('POST')).body);
  assert.equal(posted.reply, '测试回答');
  assert.equal(typeof posted.request_id, 'string');
  assert.equal(seen.provider, selection.provider);
  assert.equal(seen.model, selection.model);
  assert.equal(seen.tools, undefined);
  assert.equal(seen.system, PAGE_MODEL_SYSTEM);
  assert.match(PAGE_MODEL_SYSTEM, /没有工具/);
  assert.match(PAGE_MODEL_SYSTEM, /不能声称已查询/);
  assert.match(PAGE_MODEL_SYSTEM, /不要主动披露内部地址/);
  finish = 'length';
  assert.equal((await invoke('POST')).statusCode, 502);
});

test('page model cancels, times out, and does not echo the user input', async () => {
  let handler: any;
  let mode: 'hang' | 'timeout' = 'hang';
  let streamStarted: () => void = () => {};
  installPageModel({ webServer: { register(route: any) { handler = route.handler; } },
    agentDefaultModel: { currentSelection: () => ({ provider: 'fixture-provider', model: 'fixture-model' }) },
    llm: { async *stream(request: any) {
      streamStarted();
      if (mode === 'timeout') throw Object.assign(new Error('timed out'), { name: 'TimeoutError' });
      await new Promise((_resolve, reject) => {
        request.signal.addEventListener('abort', () => reject(Object.assign(new Error('aborted'), { name: 'AbortError' })), { once: true });
      });
    } },
  });
  const hangingReq = Object.assign(Readable.from([Buffer.from(JSON.stringify({ message: '秘密提问', history: [] }))]), { method: 'POST' });
  const hangingRes = response();
  const started = new Promise<void>(resolve => { streamStarted = resolve; });
  const hanging = handler(hangingReq, hangingRes);
  await started;
  hangingRes.emit('close');
  await hanging;
  assert.equal(hangingRes.statusCode, 499);
  const cancelled = JSON.parse(hangingRes.body);
  assert.match(cancelled.error, /取消/);
  assert.doesNotMatch(JSON.stringify(cancelled), /秘密提问/);
  assert.equal(typeof cancelled.request_id, 'string');
  assert.equal(hangingRes.headers['X-Request-Id'], cancelled.request_id);

  mode = 'timeout';
  const timedReq = Object.assign(Readable.from([Buffer.from(JSON.stringify({ message: '秘密提问', history: [] }))]), { method: 'POST' });
  const timedRes = response();
  await handler(timedReq, timedRes);
  assert.equal(timedRes.statusCode, 504);
  const timed = JSON.parse(timedRes.body);
  assert.match(timed.error, /超时/);
  assert.doesNotMatch(JSON.stringify(timed), /秘密提问/);
});
