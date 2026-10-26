import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const runtime = new URL('../dsh/runtime/node_modules/@deepseek-ai/', import.meta.url);
const { DeepSeekAdapter, resolveAdapterOptions } = await import(new URL('dsh-llm-deepseek/lib/index.js', runtime).href);
const { BlockAssembler } = await import(new URL('dsh-llm/lib/index.js', runtime).href);
const fixture = JSON.parse(readFileSync(new URL('./fixtures/tool-arguments-trailing-closers.json', import.meta.url), 'utf8'));

// Exercise the installed adapter, SSE translator and real block assembler. Only
// transport/auth/storage boundaries are controlled; no user home or key is read.
async function replay(t: any, parts: string[], stopReason = 'tool_use') {
  const warnings: unknown[][] = [];
  t.mock.method(console, 'warn', (...args: unknown[]) => { warnings.push(args); });
  const events = [
    { type: 'message_start', message: { usage: { input_tokens: 1, output_tokens: 0 } } },
    { type: 'content_block_start', index: 0,
      content_block: { type: 'tool_use', id: 'call-fixture', name: 'save_company_page_research', input: {} } },
    ...parts.map(partial_json => ({ type: 'content_block_delta', index: 0,
      delta: { type: 'input_json_delta', partial_json } })),
    { type: 'content_block_stop', index: 0 },
    { type: 'message_delta', delta: { stop_reason: stopReason }, usage: { output_tokens: 1 } },
    { type: 'message_stop' },
  ];
  t.mock.method(globalThis, 'fetch', async (url: string) => {
    assert.equal(url, 'https://fixture.invalid/anthropic/v1/messages');
    return new Response(events.map(event => `event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`).join(''),
      { headers: { 'content-type': 'text/event-stream' } });
  });
  const options = resolveAdapterOptions({ baseURL: 'https://fixture.invalid/anthropic' }, {});
  const adapter = new DeepSeekAdapter({
    options: () => options,
    resolveAuth: async () => ({ headers: {} }),
    prepareExtensions: async () => ({ fields: {}, accept: async () => {} }),
    resolveUserId: () => 'bracefix-test',
    resolveFiles: () => new Proxy({}, { get() { throw new Error('image-free replay must not access file storage'); } }),
  });
  const assembler = new BlockAssembler();
  const chunks: any[] = [];
  let error: any;
  try {
    for await (const chunk of adapter.stream({ provider: 'deepseek', model: 'deepseek-flash', messages: [], tools: [] })) {
      chunks.push(chunk);
      assembler.push(chunk);
    }
  } catch (caught) { error = caught; }
  return { warnings, chunks, error, assembler };
}

for (const sample of fixture.samples) {
  test(`installed adapter repairs captured save arguments: ${sample.session.slice(0, 8)}`, async t => {
    const raw = sample.chunks.join('');
    assert.throws(() => JSON.parse(raw), SyntaxError);
    assert.equal(raw, sample.expectedPrefix + '}');
    const result = await replay(t, sample.chunks);
    assert.ifError(result.error);
    const block = result.chunks.find(chunk => chunk.type === 'block-end').block;
    assert.equal(block.arguments, sample.expectedPrefix, 'canonical block must be fixed before emission');
    const assembled = result.assembler.blocks();
    assert.equal(assembled.length, 1);
    assert.equal(assembled[0].arguments, sample.expectedPrefix);
    assert.deepEqual(JSON.parse(assembled[0].arguments), JSON.parse(sample.expectedPrefix));
    assert.equal(result.chunks.at(-1).type, 'finish');
    assert.equal(result.chunks.at(-1).reason.kind, 'tool-calls');
    assert.deepEqual(result.warnings, [[
      'llm-deepseek: tool_arguments_trailing_closers_repaired', { removedCharacters: 1 },
    ]]);
    assert.ok(!JSON.stringify(result.warnings).includes(sample.expectedPrefix));
  });
}

const escaped = JSON.stringify({ text: 'quoted " } ] \\ and slash \\"', list: [{ nested: [1, 2] }], unicode: '研究😀' });
for (const valid of ['{}', ' \t{"a":[1,{"b":"}"}]}\r\n', escaped]) {
  test(`valid JSON is byte-for-byte unchanged (${valid.length} chars)`, async t => {
    const result = await replay(t, [valid]);
    assert.ifError(result.error);
    assert.equal(result.assembler.blocks()[0].arguments, valid);
    assert.deepEqual(result.warnings, []);
  });
}

test('nested strings and escapes do not end the first JSON value early', async t => {
  const prefix = '\n' + escaped;
  const suffix = ' \t]} }\r\n';
  const raw = prefix + suffix;
  const result = await replay(t, Array.from(raw));
  assert.ifError(result.error);
  assert.equal(result.assembler.blocks()[0].arguments, prefix);
  assert.equal((result.warnings[0][1] as any).removedCharacters, suffix.length);
});

for (const invalid of ['{"a":1', '{"a":"unterminated}', '{"a":"bad\\q"}}', '{"a":[1,]}}',
  '{"a":[1}}', '{"a":1} false', '{"a":1},}', '{"a":1}{"b":2}', '{"a":1}]}extra',
  '{"a":1}/*comment*/}', '{"a":undefined}}', ' \t\r\n']) {
  test(`unsupported malformed arguments still fail: ${invalid}`, async t => {
    const result = await replay(t, [invalid]);
    assert.equal(result.error?.code, 'MALFORMED_RESPONSE');
    assert.match(result.error.message, /tool input is invalid JSON/);
    assert.equal(result.chunks.some(chunk => chunk.type === 'finish'), false);
    assert.deepEqual(result.warnings, []);
  });
}

for (const nonObject of ['[1,2]}', '"text"}', 'true}', 'null}', '12.5e2]']) {
  test(`existing object validation remains enforced: ${nonObject}`, async t => {
    const result = await replay(t, [nonObject]);
    assert.equal(result.error?.code, 'MALFORMED_RESPONSE');
    assert.match(result.error.message, /expected a JSON object/);
  });
}

test('max-token truncation still drops incomplete tool calls', async t => {
  const result = await replay(t, ['{"a":'], 'max_tokens');
  assert.ifError(result.error);
  assert.deepEqual(result.assembler.blocks(), []);
  assert.equal(result.chunks.at(-1).reason.kind, 'max-tokens');
  assert.deepEqual(result.warnings, []);
});
