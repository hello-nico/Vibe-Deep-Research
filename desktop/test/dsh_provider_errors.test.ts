import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';

const runtime = new URL('../dsh/runtime/', import.meta.url);
const llm = await import(new URL('node_modules/@deepseek-ai/dsh-llm/lib/index.js', runtime).href);

function installedFunction(packageName: string, name: string, end: string, context: Record<string, unknown>) {
  const path = new URL(`node_modules/@deepseek-ai/${packageName}/lib/index.js`, runtime);
  const source = readFileSync(path, 'utf8');
  const start = source.indexOf(`function ${name}(`);
  assert.notEqual(start, -1, `${name} must exist in the installed package`);
  const stop = source.indexOf(end, start);
  assert.notEqual(stop, -1, `${name} must retain its following boundary`);
  return runInNewContext(`${source.slice(start, stop)}; ${name}`, context) as (...args: unknown[]) => unknown;
}

test('installed DeepSeek adapter distinguishes quota, authentication and refusal', () => {
  const classify = installedFunction('dsh-llm-deepseek', 'providerError', '\n//#endregion', {
    isQuotaExceededError: llm.isQuotaExceededError,
    isContextWindowExceededError: llm.isContextWindowExceededError,
    ProviderRequestId: (value: string) => value,
    LlmError: class extends Error { code: string; constructor(message: string, code: string) { super(message); this.code = code; } },
  });
  const code = (status: number, message: string) => (classify({ error: { message } }, status) as { code: string }).code;
  assert.equal(code(401, 'invalid api key'), 'AUTH');
  assert.equal(code(403, 'permission denied'), 'FORBIDDEN');
  assert.equal(code(403, 'insufficient balance'), 'QUOTA');
});

test('installed pi-ai adapter distinguishes quota, authentication and refusal', () => {
  const classify = installedFunction('dsh-llm-pi-ai', 'classifyPiAiError', '\n/**', {
    isQuotaExceededError: llm.isQuotaExceededError,
    QUOTA_EXCEEDED_CODE: 'QUOTA',
  });
  assert.equal(classify('401 invalid api key'), 'AUTH');
  assert.equal(classify('403 permission denied'), 'FORBIDDEN');
  assert.equal(classify('403 insufficient balance'), 'QUOTA');
});
