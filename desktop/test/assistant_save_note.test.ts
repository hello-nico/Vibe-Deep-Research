// 问助手回答存入沉淀（Task §4A）：已结束轮次的保存按钮与保存内容格式。
import assert from 'node:assert/strict';
import test from 'node:test';
import { createServer } from 'vite';
import { createServer as createHttpServer } from 'node:http';
import { fileURLToPath } from 'node:url';
import { createElement } from 'react';
import { Window } from 'happy-dom';

import {
  askNoteContent,
  askNoteTitle,
  assistantTurnSaves,
} from '../src/verticals/finance/lib/taskTrajectory.ts';

const WRAPPED_QUESTION = [
  '本轮已绑定的 URL 依据（统一读取，未入库）。',
  '',
  '当前页面：资讯雷达',
  '模式：Ask',
  '用户问题：',
  '这条消息影响哪些公司',
].join('\n');

const FINISHED_STEP = {
  id: '3', kind: 'assistant', title: '模型输出', body: '回答正文，见依据。', time: 1727000000000,
};

function stepsWith(overrides = {}) {
  return [
    { id: '1', kind: 'user', title: '任务已提交', body: WRAPPED_QUESTION },
    { id: '2', kind: 'tool', title: '读取来源网页' },
    { ...FINISHED_STEP, ...overrides },
  ];
}

test('分轮配对：问题取最近一次 user 步骤的可见文本，保存内容符合 §3 格式', () => {
  const saves = assistantTurnSaves(stepsWith());
  assert.deepEqual([...saves.keys()], ['3']);
  assert.equal(saves.get('3')?.question, '这条消息影响哪些公司');
  assert.equal(saves.get('3')?.answer, '回答正文，见依据。');
  assert.equal(askNoteTitle('这条消息影响哪些公司'), '问助手 · 这条消息影响哪些公司');
  const content = askNoteContent({
    question: '这条消息影响哪些公司',
    answer: '回答正文，见依据。',
    pageName: '资讯雷达',
    finishedAt: new Date('2026-09-23T10:00:00+08:00').getTime(),
  });
  assert.equal(content, [
    '## 问题',
    '这条消息影响哪些公司',
    '## 回答',
    '回答正文，见依据。',
    '',
    '---',
    '来源：资讯雷达 · 2026/09/23 10:00',
  ].join('\n'));
});

test('长问题标题只取前 40 字；无完成时间时来源只有页面名', () => {
  assert.equal(askNoteTitle('长'.repeat(60)), `问助手 · ${'长'.repeat(40)}`);
  const content = askNoteContent({ question: 'q', answer: 'a', pageName: '公司研究' });
  assert.equal(content, ['## 问题', 'q', '## 回答', 'a', '', '---', '来源：公司研究'].join('\n'));
});

test('运行中、中止、失败、空回答与非最终回答不进入保存配对', () => {
  assert.equal(assistantTurnSaves(stepsWith({ streaming: true })).size, 0);
  assert.equal(assistantTurnSaves(stepsWith({ failed: true })).size, 0);
  assert.equal(assistantTurnSaves(stepsWith({ body: '' })).size, 0);
  // 后面还有本轮 turn-error：不是已结束的最终回答
  const failed = stepsWith();
  failed.push({ id: '4', kind: 'turn-error', title: '本轮未完成', body: '超时' });
  assert.equal(assistantTurnSaves(failed).size, 0);
  // 无 user 前导的 assistant 不保存
  assert.equal(assistantTurnSaves([FINISHED_STEP]).size, 0);
});

async function boot() {
  const win = new Window({ url: 'http://localhost/' });
  const previous = {
    window: globalThis.window, document: globalThis.document,
    localStorage: globalThis.localStorage, sessionStorage: globalThis.sessionStorage,
    MessageEvent: globalThis.MessageEvent, CustomEvent: globalThis.CustomEvent,
    HTMLElement: globalThis.HTMLElement, IS_REACT_ACT_ENVIRONMENT: globalThis.IS_REACT_ACT_ENVIRONMENT,
    fetch: globalThis.fetch,
  };
  Object.assign(globalThis, {
    window: win, document: win.document,
    localStorage: win.localStorage, sessionStorage: win.sessionStorage,
    MessageEvent: win.MessageEvent, CustomEvent: win.CustomEvent,
    HTMLElement: win.HTMLElement, IS_REACT_ACT_ENVIRONMENT: true,
  });
  const server = await createServer({ configFile: false, root: fileURLToPath(new URL('../', import.meta.url)),
    resolve: { alias: [{ find: '@', replacement: fileURLToPath(new URL('../src/verticals/finance', import.meta.url)) }] },
    server: { middlewareMode: true, hmr: { server: createHttpServer() }, watch: null }, appType: 'custom',
    ssr: { noExternal: ['react-router-dom', 'react-router'], resolve: { conditions: ['module-sync', 'node', 'import', 'development'] } } });
  const reactDomClient = await import('react-dom/client');
  const testUtils = await import('react-dom/test-utils');
  const { act } = testUtils;
  const container = win.document.createElement('div');
  win.document.body.appendChild(container);
  const root = reactDomClient.createRoot(container);
  const render = async element => { await act(async () => { root.render(element); }); };
  const cleanup = async () => {
    await act(async () => { root.unmount(); });
    await server.close();
    Object.assign(globalThis, previous);
    win.close();
  };
  const Provider = (await server.ssrLoadModule('/src/verticals/finance/dsh/research-session.tsx')).ResearchSessionContext.Provider;
  const transcript = await server.ssrLoadModule('/src/verticals/finance/components/TaskTranscript.tsx');
  return { container, render, cleanup, act, Provider, TaskTranscript: transcript.TaskTranscript };
}

function sessionMock(steps) {
  const snapshot = {
    running: false, failed: false, openState: 'open', hasMore: false, loadingOlder: false,
    runningCalls: [], steps, streaming: false,
  };
  return {
    trajectory: () => ({ subscribe: () => () => {}, getSnapshot: () => snapshot }),
    sessionState: () => null,
  };
}

test('已结束轮次显示保存按钮，点击按 §3 内容保存为问助手记录', async () => {
  const env = await boot();
  try {
    const bodies: Array<Record<string, unknown>> = [];
    globalThis.fetch = (async (_url, init) => {
      bodies.push(JSON.parse(String(init?.body || '{}')) as Record<string, unknown>);
      return new Response(JSON.stringify({ note_id: 'n1', category: 'ask', title: bodies[0].title, body: bodies[0].body, created_at: '2026-09-23T10:00:00Z' }), { status: 200 });
    }) as typeof fetch;
    await env.render(createElement(env.Provider, { value: sessionMock(stepsWith()) },
      createElement(env.TaskTranscript, { sessionId: 's1', saveTurns: { pageName: '资讯雷达' } })));
    const button = [...env.container.querySelectorAll('button')].find(b => b.textContent?.includes('保存为记录'));
    assert.ok(button, '已结束回答下方应有保存按钮');
    await env.act(async () => { button.click(); await new Promise(resolve => { setTimeout(resolve, 0); }); });
    assert.equal(bodies.length, 1);
    assert.equal(bodies[0].category, 'ask');
    assert.equal(bodies[0].title, '问助手 · 这条消息影响哪些公司');
    const body = String(bodies[0].body);
    assert.match(body, /^## 问题\n这条消息影响哪些公司\n## 回答\n回答正文，见依据。\n\n---\n来源：资讯雷达/);
    assert.ok(env.container.textContent.includes('已保存为记录'));
  } finally { await env.cleanup(); }
});

test('运行中、失败轮次与未开启属性时不显示保存按钮', async () => {
  const env = await boot();
  try {
    globalThis.fetch = (async () => Response.json({})) as typeof fetch;
    for (const steps of [stepsWith({ streaming: true }), stepsWith({ failed: true })]) {
      await env.render(createElement(env.Provider, { value: sessionMock(steps) },
        createElement(env.TaskTranscript, { sessionId: 's1', saveTurns: { pageName: '资讯雷达' } })));
      assert.equal([...env.container.querySelectorAll('button')].filter(b => b.textContent?.includes('保存为记录')).length, 0);
    }
    await env.render(createElement(env.Provider, { value: sessionMock(stepsWith()) },
      createElement(env.TaskTranscript, { sessionId: 's1' })));
    assert.equal([...env.container.querySelectorAll('button')].filter(b => b.textContent?.includes('保存为记录')).length, 0, '未开启 saveTurns 不显示');
  } finally { await env.cleanup(); }
});

test('运行中的最后一步不是本轮回答，不显示保存', () => {
  const steps = [
    { id: 'u1', kind: 'user', title: '', body: '海螺水泥上半年营收？' },
    { id: 'a1', kind: 'assistant', title: '', body: '我先读取研究页。' },
  ] as Parameters<typeof assistantTurnSaves>[0];
  assert.equal(assistantTurnSaves(steps, true).size, 0);
  assert.equal(assistantTurnSaves(steps, false).get('a1')?.answer, '我先读取研究页。');
});
