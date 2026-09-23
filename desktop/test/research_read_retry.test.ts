import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import ts from 'typescript';

const source = readFileSync(new URL('../src/verticals/finance/lib/research.ts', import.meta.url), 'utf8');
const compiled = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;
const exports: Record<string, unknown> = {};
new Function('exports', 'require', compiled)(exports, () => ({ researchErrorMessage: (status: number) => `HTTP ${status}` }));
const researchRead = exports.researchRead as (route: string, init?: RequestInit) => Promise<unknown>;

const busy = () => new Response(JSON.stringify({ detail: { retryable: true, message: '资料正在更新' } }), {
  status: 503, headers: { 'content-type': 'application/json', 'retry-after': '0' },
});
const ok = () => new Response(JSON.stringify({ items: [1] }), {
  status: 200, headers: { 'content-type': 'application/json' },
});

test('retryable Wiki read recovers and stops after three retries', async () => {
  const original = globalThis.fetch;
  let calls = 0;
  try {
    globalThis.fetch = async () => (++calls < 3 ? busy() : ok());
    assert.deepEqual(await researchRead('/wiki/pages/read'), { items: [1] });
    assert.equal(calls, 3);

    calls = 0;
    globalThis.fetch = async () => { calls++; return busy(); };
    await assert.rejects(researchRead('/wiki/pages/read'), /资料仍在更新，请稍后重试/);
    assert.equal(calls, 4);
  } finally {
    globalThis.fetch = original;
  }
});

test('non-retryable 503 and POST are not replayed', async () => {
  const original = globalThis.fetch;
  let calls = 0;
  try {
    globalThis.fetch = async () => {
      calls++;
      return new Response(JSON.stringify({ detail: { retryable: false } }), {
        status: 503, headers: { 'content-type': 'application/json' },
      });
    };
    await assert.rejects(researchRead('/wiki/pages/read'), /HTTP 503/);
    assert.equal(calls, 1);

    calls = 0;
    globalThis.fetch = async () => { calls++; return busy(); };
    await assert.rejects(researchRead('/wiki/pages/ensure', { method: 'POST' }), /HTTP 503/);
    assert.equal(calls, 1);
  } finally {
    globalThis.fetch = original;
  }
});
