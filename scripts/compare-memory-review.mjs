// Bounded, explicitly authorized comparison. Inputs contain synthetic text only.
import fs from 'node:fs';
import { createHash } from 'node:crypto';
import { spawn } from 'node:child_process';

const [samplesPath, outputPath, authorization] = process.argv.slice(2);
if (!samplesPath || !outputPath || authorization !== '--authorized-52-calls') {
  throw new Error('Usage: node compare-memory-review.mjs samples.json output.jsonl --authorized-52-calls');
}
const source = fs.readFileSync(samplesPath, 'utf8');
const data = JSON.parse(source);
if (data.cases.length !== 26 || !data.reviewed_by) throw new Error('Require 26 reviewed samples');
// Never resume an interrupted run by silently repeating possibly executed calls.
const file = fs.openSync(outputPath, 'wx', 0o600);
const record = value => { fs.writeSync(file, JSON.stringify(value) + '\n'); fs.fsyncSync(file); };
record({ type: 'run', samples_sha256: createHash('sha256').update(source).digest('hex'),
  model: 'DeepSeek-V4.1-Flash via existing DSH default', max_calls: 52, retries: 0,
  questions: data.questions_draft, started_at: new Date().toISOString() });

const jevProgram = `import asyncio,json,sys
from dataclasses import replace
from app.services.jev_gateway import evaluate,JevConfig,JevError
request=json.load(sys.stdin)
async def main():
    try:
        config=replace(JevConfig.from_environment(), max_retries=0, timeout_seconds=30)
        payload,audit=await evaluate(request['state'],request['questions'],config=config)
        print(json.dumps({'payload':payload,'audit':audit.as_dict()},ensure_ascii=False))
    except JevError as e:
        print(json.dumps({'failure':e.failure_record()}))
asyncio.run(main())`;

function jev(input) {
  return new Promise(resolve => {
    const child = spawn('docker', ['exec', '-i', 'stock-research-backend', 'python', '-c', jevProgram], { stdio: ['pipe', 'pipe', 'pipe'] });
    let stdout = '';
    child.stdout.on('data', value => { stdout += value; });
    // Do not persist process diagnostics that might reveal unrelated host state.
    child.stderr.resume();
    child.on('error', () => resolve({ failure: { code: 'channel_unavailable' } }));
    child.on('close', code => {
      try { resolve(code === 0 ? JSON.parse(stdout) : { failure: { code: 'channel_failed' } }); }
      catch { resolve({ failure: { code: 'invalid_channel_response' } }); }
    });
    child.stdin.end(JSON.stringify(input));
  });
}

async function model(state) {
  const message = JSON.stringify({ questions: data.questions_draft, ...state })
    + '\n只返回 JSON 对象，about_user 和 supported 两个字段的值为 true 或 false。';
  try {
    const response = await fetch('http://127.0.0.1:5941/finance-model', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ history: [], message }), signal: AbortSignal.timeout(65000),
    });
    const payload = await response.json();
    if (!response.ok) return { failure: { code: 'model_http_error', status: response.status }, request_id: payload.request_id };
    const raw = String(payload.reply || '').trim();
    let answer;
    try { answer = JSON.parse(raw.replace(/^```(?:json)?\s*|\s*```$/g, '')); } catch {}
    return { raw, answer, request_id: payload.request_id, usage: null, usage_note: 'Existing finance-model endpoint does not expose usage/model metadata' };
  } catch { return { failure: { code: 'model_transport_or_timeout' } }; }
}

try {
  for (const item of data.cases) {
    // Explicit allowlist: expected, reason, category, provenance never cross channels.
    const state = { candidate: item.candidate, user_quote: item.user_quote };
    const questions = Object.fromEntries(Object.entries(data.questions_draft).map(([id, instructions]) => [id, { type: 'boolean', instructions }]));
    record({ type: 'dispatch', id: item.id, channels: ['jev', 'model'], calls: 2, at: new Date().toISOString() });
    const start = performance.now();
    const [j, m] = await Promise.all([jev({ state, questions }), model(state)]);
    const probabilities = {};
    let jAnswer = {}, mAnswer = m.answer;
    for (const id of ['about_user', 'supported']) {
      const value = j.payload?.answers?.[id];
      if (value?.type !== 'boolean' || typeof value.probability !== 'number' || !Number.isFinite(value.probability) || value.probability < 0 || value.probability > 1) { jAnswer = null; break; }
      probabilities[id] = value.probability;
      jAnswer[id] = value.probability >= 0.5;
    }
    if (!mAnswer || Object.keys(mAnswer).length !== 2 || typeof mAnswer.about_user !== 'boolean' || typeof mAnswer.supported !== 'boolean') mAnswer = null;
    record({ type: 'result', id: item.id, expected: item.expected, elapsed_ms: Math.round(performance.now() - start),
      jev: { ...j, answer: jAnswer, probabilities }, model: { ...m, answer: mAnswer } });
    process.stdout.write(`${item.id} completed; Jev=${jAnswer ? 'parsed' : 'failed'}, model=${mAnswer ? 'parsed' : 'failed'}\n`);
  }
} finally { fs.closeSync(file); }
