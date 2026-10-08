import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { dirname } from 'node:path';
import test from 'node:test';

const require = createRequire(import.meta.url);
async function loadSuggestionActions() {
  const vitePackage = require.resolve('vite/package.json');
  const esbuildPath = require.resolve('esbuild', { paths: [dirname(vitePackage)] });
  const { build } = require(esbuildPath);
  const result = await build({
    entryPoints: [new URL('../src/verticals/finance/dsh/suggestion-actions.ts', import.meta.url).pathname],
    bundle: true,
    format: 'esm',
    platform: 'browser',
    write: false,
  });
  const source = result.outputFiles[0]?.text;
  if (!source) throw new Error('esbuild did not return bundled suggestion actions');
  return import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`);
}

const actionsModule = loadSuggestionActions();

const tracking = {
  tracking_key: 'aluminium-margin', hypothesis: '铝价与电价差决定利润弹性',
  baseline: { as_of: '2026-10-08', known_at: '2026-10-08T10:00:00+08:00', basis_refs: ['result:' + 'a'.repeat(32)] },
  observables: ['铝价', '电价'], conditions: { strengthen: ['价差扩大'], weaken: ['价差收窄'], overturn: ['成本关系失效'] },
  next_source: '下一期行情成果', last_assessment: null,
};

test('相关问题只在空闲且无草稿时写入并提交', async () => {
  const { sendSuggestedQuestion } = await actionsModule;
  const calls: string[] = [];
  const actions = { setDraft: (text: string) => calls.push(`draft:${text}`), submit: () => calls.push('submit') };
  assert.equal(sendSuggestedQuestion('继续看什么？', { draft: '', phase: 'plain' }, actions, false), true);
  assert.deepEqual(calls, ['draft:继续看什么？', 'submit']);
  calls.length = 0;
  assert.equal(sendSuggestedQuestion('覆盖', { draft: '已有内容', phase: 'plain' }, actions, false), false);
  assert.equal(sendSuggestedQuestion('忙时发送', { draft: '', phase: 'submitting' }, actions, false), false);
  assert.equal(sendSuggestedQuestion('运行中发送', { draft: '', phase: 'plain' }, actions, true), false);
  assert.deepEqual(calls, []);
});

test('关注公司只调用 addWatch 能力', async () => {
  const { followSuggestedCompany } = await actionsModule;
  const calls: string[] = [];
  await followSuggestedCompany('600011.SH', async symbol => { calls.push(symbol); });
  assert.deepEqual(calls, ['600011.SH']);
});

test('默认关注路径仅写入与回读自选，不启动研究', async t => {
  const { followSuggestedCompany } = await actionsModule;
  const calls: { path: string; method: string; body?: unknown }[] = [];
  t.mock.method(globalThis, 'fetch', async (input: string | URL | Request, init?: RequestInit) => {
    calls.push({ path: String(input), method: init?.method || 'GET', ...(init?.body ? { body: JSON.parse(String(init.body)) } : {}) });
    return Response.json({ symbols: ['600011'], added: true });
  });
  await followSuggestedCompany('600011.SH');
  assert.deepEqual(calls, [
    { path: '/finance-api/client/watch', method: 'POST', body: { symbol: '600011' } },
    { path: '/finance-api/client/watch', method: 'GET' },
  ]);
});

test('观察项按问题路由、读取最新版本并带 revision 写入', async () => {
  const { startSuggestedIndicator } = await actionsModule;
  const calls: { route: string; init?: RequestInit }[] = [];
  const request = async <T>(route: string, init?: RequestInit): Promise<T> => {
    calls.push({ route, init });
    if (route.endsWith('/route')) return { action: 'create', topic: { topic_id: 'topic:abc123abc123' } } as T;
    if (!init) return { topic_id: 'topic:abc123abc123', revision: 7 } as T;
    return { topic_id: 'topic:abc123abc123', revision: 8 } as T;
  };
  await startSuggestedIndicator('铝价如何传导？', tracking, undefined, request);
  assert.equal(calls.length, 3);
  assert.deepEqual(JSON.parse(String(calls[0]?.init?.body)), {
    question: '铝价如何传导？', title: '铝价如何传导？', subjects: [], research_intent: true, confirm_new: false,
  });
  assert.equal(calls[1]?.route, '/wiki/research-topics/topic%3Aabc123abc123');
  assert.deepEqual(JSON.parse(String(calls[2]?.init?.body)), { tracking_items: [tracking], expected_revision: 7 });
});

test('长文路由按接口上限截断且不拆开 Unicode 字符', async () => {
  const { startSuggestedIndicator } = await actionsModule;
  const question = `🙂${'长'.repeat(2100)}`;
  let routeBody: { question: string; title: string } | undefined;
  const request = async <T>(route: string, init?: RequestInit): Promise<T> => {
    if (route.endsWith('/route')) {
      routeBody = JSON.parse(String(init?.body));
      return { action: 'touch', topic: { topic_id: 'topic:abc123abc123' } } as T;
    }
    if (!init) return { revision: 2 } as T;
    return { revision: 3 } as T;
  };
  await startSuggestedIndicator(question, tracking, undefined, request);
  assert.equal(Array.from(routeBody?.question || '').length, 2000);
  assert.equal(Array.from(routeBody?.title || '').length, 200);
  assert.equal(routeBody?.question.startsWith('🙂'), true);
});

test('完全相同的跟踪草稿已存在时不重复更新 revision', async () => {
  const { startSuggestedIndicator } = await actionsModule;
  let writes = 0;
  const request = async <T>(route: string, init?: RequestInit): Promise<T> => {
    if (route.endsWith('/route')) return { action: 'touch', topic: { topic_id: 'topic:abc123abc123' } } as T;
    if (!init) return { revision: 4, tracking_items: [{ ...tracking, last_assessment: { outcome: 'strengthened' } }] } as T;
    writes++;
    return { revision: 5 } as T;
  };
  await startSuggestedIndicator('铝价如何传导？', tracking, undefined, request);
  assert.equal(writes, 0);
});

test('同 tracking_key 但草稿不同仍提交更新', async () => {
  const { startSuggestedIndicator } = await actionsModule;
  let writes = 0;
  const request = async <T>(route: string, init?: RequestInit): Promise<T> => {
    if (route.endsWith('/route')) return { action: 'touch', topic: { topic_id: 'topic:abc123abc123' } } as T;
    if (!init) return { revision: 4, tracking_items: [{ ...tracking, hypothesis: '旧假设' }] } as T;
    writes++;
    return { revision: 5 } as T;
  };
  await startSuggestedIndicator('铝价如何传导？', tracking, undefined, request);
  assert.equal(writes, 1);
});

test('路由歧义保留候选选择，选定后用 matched_topic_id 重试', async () => {
  const { startSuggestedIndicator, SuggestionChoiceNeeded } = await actionsModule;
  const candidates = [{ topic_id: 'topic:abc123abc123', title: '铝价传导' }];
  await assert.rejects(
    () => startSuggestedIndicator('铝价如何传导？', tracking, undefined, async () => ({ action: 'choose', candidates }) as never),
    error => error instanceof SuggestionChoiceNeeded && error.candidates === candidates,
  );
  const bodies: unknown[] = [];
  const request = async <T>(route: string, init?: RequestInit): Promise<T> => {
    if (init?.body) bodies.push(JSON.parse(String(init.body)));
    if (route.endsWith('/route')) return { action: 'touch', topic: { topic_id: candidates[0].topic_id } } as T;
    if (!init) return { revision: 2 } as T;
    return { revision: 3 } as T;
  };
  await startSuggestedIndicator('铝价如何传导？', tracking, candidates[0].topic_id, request);
  assert.equal((bodies[0] as { matched_topic_id: string }).matched_topic_id, candidates[0].topic_id);
});

test('版本冲突重读一次并只重试一次', async () => {
  const { startSuggestedIndicator } = await actionsModule;
  let reads = 0, writes = 0;
  const request = async <T>(route: string, init?: RequestInit): Promise<T> => {
    if (route.endsWith('/route')) return { action: 'touch', topic: { topic_id: 'topic:abc123abc123' } } as T;
    if (!init) return { revision: ++reads } as T;
    writes++;
    if (writes === 1) throw Object.assign(new Error('冲突'), { status: 409 });
    return { revision: 3 } as T;
  };
  await startSuggestedIndicator('铝价如何传导？', tracking, undefined, request);
  assert.equal(reads, 2);
  assert.equal(writes, 2);
});

test('两次版本冲突仍失败时返回原因，不做第三次写入', async () => {
  const { startSuggestedIndicator } = await actionsModule;
  let reads = 0, writes = 0;
  const request = async <T>(route: string, init?: RequestInit): Promise<T> => {
    if (route.endsWith('/route')) return { action: 'touch', topic: { topic_id: 'topic:abc123abc123' } } as T;
    if (!init) return { revision: ++reads } as T;
    writes++;
    throw Object.assign(new Error('仍有版本冲突'), { status: 409 });
  };
  await assert.rejects(startSuggestedIndicator('铝价如何传导？', tracking, undefined, request), /仍有版本冲突/);
  assert.equal(reads, 2);
  assert.equal(writes, 2);
});
