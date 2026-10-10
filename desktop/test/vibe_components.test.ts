import assert from 'node:assert/strict';
import test, { after, before } from 'node:test';
import { createServer as createHttpServer } from 'node:http';
import { fileURLToPath } from 'node:url';
import { readFileSync } from 'node:fs';
import * as React from 'react';
import { createServer } from 'vite';
import { Window } from 'happy-dom';
import { hideUnfencedSuggestions, unfencedSuggestionRanges, parseVibe, readVibeCheck, summarizeVibeMarkdown, vibeBlocks, type VibeCheck } from '../src/verticals/finance/dsh/vibe.ts';

const id = 'result:' + 'a'.repeat(32);
const code = `<section question="利润来自发电">
<grid cols="2"><stat><item label="收入" ref="claim:income" unit="亿元"/><item label="坏指标" ref="claim:missing" unit="亿元"/></stat>
<compare title="毛利率对比"><bar label="电力" ref="claim:power"/><bar label="煤炭" ref="claim:coal"/></compare></grid>
<row><flow note="其他条件不变"><step>煤价回落</step><step>燃料成本下降</step><step>利润改善</step></flow></row>
<chart ref="${id}" title="行情趋势"/><alien label="目录外"/>
<stat><item label="保留指标" ref="claim:kept" unit="亿元"/><item label={invalid}/></stat>
</section><suggest type="question"><q>煤价如何传导？</q></suggest>`;
const source = `前文\n\n\`\`\`vibe\n${code}\n\`\`\`\n\n后文`;
const value = (amount: number | string, unit: string) => ({ value: amount, unit, period: '本季', source_title: '已核对财报' });
const check: VibeCheck = { turn: 1, blocks: [{ index: 0, ok: true, elements: [
  { path: '0', component: 'section', status: 'ok' },
  { path: '0.0', component: 'grid', status: 'ok' },
  { path: '0.0.0', component: 'stat', status: 'ok' },
  { path: '0.0.0.0', component: 'item', status: 'ok', values: { 'claim:income': value('235.67', '亿元') } },
  { path: '0.0.0.1', component: 'item', status: 'dropped', reason: 'unresolved_ref' },
  { path: '0.0.1', component: 'compare', status: 'ok' },
  { path: '0.0.1.0', component: 'bar', status: 'ok', values: { 'claim:power': value(20.45, '%') } },
  { path: '0.0.1.1', component: 'bar', status: 'ok', values: { 'claim:coal': value(-8.31, '%') } },
  { path: '0.1', component: 'row', status: 'ok' },
  { path: '0.1.0', component: 'flow', status: 'ok' },
  ...['0', '1', '2'].map(n => ({ path: `0.1.0.${n}`, component: 'step', status: 'ok' as const })),
  { path: '0.2', component: 'chart', status: 'ok' },
  { path: '0.3', component: 'alien', status: 'dropped', reason: 'unknown_component' },
  { path: '0.4', component: 'stat', status: 'ok' },
  { path: '0.4.0', component: 'item', status: 'ok', values: { 'claim:kept': value(11.22, '亿元') } },
  { path: '0.4.1', component: 'item', status: 'dropped', reason: 'syntax_attributes' },
  { path: '1', component: 'suggest', status: 'ok' },
  { path: '1.0', component: 'q', status: 'ok' },
] }], suggest: { type: 'question', items: [{ text: '煤价如何传导？' }] } };

let server: Awaited<ReturnType<typeof createServer>>, win: Window, root: ReturnType<typeof import('react-dom/client')['createRoot']>;
let ui: Record<string, any>, suggestions: Record<string, any>, resultNodes: Record<string, any>, layout: Record<string, any>;
let container: HTMLElement;
const previous = { window: globalThis.window, document: globalThis.document, fetch: globalThis.fetch, MutationObserver: globalThis.MutationObserver, Element: globalThis.Element, HTMLElement: globalThis.HTMLElement, HTMLAnchorElement: globalThis.HTMLAnchorElement, IS_REACT_ACT_ENVIRONMENT: globalThis.IS_REACT_ACT_ENVIRONMENT };
before(async () => {
  win = new Window();
  Object.assign(globalThis, { window: win, document: win.document, MutationObserver: win.MutationObserver, Element: win.Element, HTMLElement: win.HTMLElement, HTMLAnchorElement: win.HTMLAnchorElement, IS_REACT_ACT_ENVIRONMENT: true });
  server = await createServer({ configFile: false, root: fileURLToPath(new URL('../', import.meta.url)),
    resolve: { alias: { '@': fileURLToPath(new URL('../src/verticals/finance', import.meta.url)) } },
    server: { middlewareMode: true, hmr: { server: createHttpServer() }, watch: null }, appType: 'custom',
    ssr: { noExternal: ['react-router-dom', 'react-router'], resolve: { conditions: ['module-sync', 'node', 'import', 'development'] } } });
  ui = await server.ssrLoadModule('/src/verticals/finance/dsh/vibe-node.tsx');
  suggestions = await server.ssrLoadModule('/src/verticals/finance/dsh/suggestion-node.tsx');
  resultNodes = await server.ssrLoadModule('/src/verticals/finance/dsh/result-node.tsx');
  layout = await server.ssrLoadModule('/src/verticals/finance/components/layout/ConversationWorkspace.tsx');
  container = win.document.createElement('div') as unknown as HTMLElement;
  win.document.body.append(container);
  root = (await import('react-dom/client')).createRoot(container);
});
after(async () => {
  await React.act(async () => root?.unmount());
  await server?.close();
  win?.happyDOM.abort();
  Object.assign(globalThis, previous);
});

function actions(running = false, draft = '') {
  const calls: string[] = [];
  return { calls, inputActions: { setDraft: (text: string) => calls.push(text), submit: () => calls.push('submit') },
    useInput: (select: (state: any) => any) => select({ draft, phase: 'plain' }),
    useSession: (select: (state: any) => any) => select({ running }) };
}
async function mount(text: string, event: unknown, options: Record<string, unknown> = {}, input = actions()) {
  await React.act(async () => root.render(React.createElement(BlockFixture, { key: text, text, event, options, input })));
  return input;
}
function BlockFixture({ text, event, options, input }: any) {
  const [suggestionTarget, setSuggestionTarget] = React.useState<HTMLElement | null>(null);
  const block = vibeBlocks(text)[0]!;
  const context = { check: event, texts: [text], actions: input, phase: 'running', visibleBlocks: new Set<number>(), suggestionTarget };
  return React.createElement(ui.VibeContext.Provider, { value: context },
    React.createElement(ui.VibeBlock, { code: block.code, options: { source: text, offset: block.offset, pending: false, ...options } }),
    React.createElement('div', { ref: setSuggestionTarget, 'data-vibe-suggestions-tail': '', style: { display: 'contents' } }));
}
// The portal anchor has no layout box; it is not part of the answer body.
const bodyHTML = () => [...container.children].filter(node => !node.hasAttribute('data-vibe-suggestions-tail')).map(node => node.outerHTML).join('');
const click = async (label: string) => {
  const button = [...container.querySelectorAll('button')].find(b => b.getAttribute('aria-label') === label || b.textContent === label);
  assert.ok(button, label);
  await React.act(async () => button.click());
};

const lifecycleText = '前文\n\n```vibe\n<stat><item label="收入" ref="claim:income" unit="亿元"/></stat>\n```\n\n后文';
const lifecycleCheck: VibeCheck = { turn: 1, blocks: [{ index: 0, ok: true, elements: [
  { path: '0', component: 'stat', status: 'ok' },
  { path: '0.0', component: 'item', status: 'ok', values: { 'claim:income': value(1.23, '亿元') } },
] }] };
function assistantHarness(text = lifecycleText, component?: React.ComponentType<any>, textBlocks = [text]) {
  let Wrapper: any;
  const native = { options: { key: 'assistant-step' }, component: component ?? ((props: any) => React.createElement(React.Fragment, null,
    React.createElement('p', null, '前文'),
    ...vibeBlocks(text).map(block => React.createElement(ui.VibeBlock, { key: block.offset, code: block.code,
      options: { source: text, offset: block.offset, pending: props.pending } })),
    React.createElement('p', null, '后文'))) };
  const release = ui.installVibeAssistantContext({ slots: {
    inject: (_key: string, factory: () => () => void) => factory(), entries: () => [native], subscribe: () => () => {},
    register: (_options: unknown, component: any) => { Wrapper = component; return () => {}; },
  } });
  const disposeRenderer = ui.registerVibeRenderer(() => null);
  return {
    async render({ endedAt, event, pending = false, interrupted = false }: { endedAt?: number; event?: unknown; pending?: boolean; interrupted?: boolean } = {}) {
      const turn = { turn: 1, ...(endedAt === undefined ? {} : { end: { time: endedAt, data: { reason: { kind: interrupted ? 'cancelled' : 'completed' } } } }) };
      await React.act(async () => root.render(React.createElement(Wrapper, { ...actions(), pending,
        node: { location: { kind: 'turn', turn }, data: { step: 2, status: interrupted ? 'interrupted' : 'settled',
          ...(interrupted ? {} : { finalNode: {} }), blocks: textBlocks.map(text => ({ kind: 'text', text })) } },
        useTurnData: (key: string) => key === 'turn-process' ? { answerStep: 2 } : event,
        useChat: (select: (snapshot: any) => unknown) => select({ timeline: { turns: new Map([[1, turn]]) } }),
      })));
    },
    copy: () => (globalThis as Record<symbol, any>)[ui.VIBE_COPY](text) as string,
    async close() { await React.act(async () => root.render(null)); release(); disposeRenderer(); },
  };
}

test('a running turn keeps its placeholder without an event and copies only prose', async t => {
  t.mock.timers.enable({ apis: ['Date', 'setTimeout'], now: 1_700_000_000_000 });
  const harness = assistantHarness();
  try {
    await harness.render({ pending: true });
    await React.act(async () => t.mock.timers.tick(60_000));
    assert.match(container.textContent || '', /前文.*正在准备研究组件.*后文/);
    assert.equal(harness.copy(), '前文\n\n\n\n后文');
  } finally { await harness.close(); }
});

test('completed and cancelled turns hide missing checks exactly ten seconds after the turn ends', async t => {
  t.mock.timers.enable({ apis: ['Date', 'setTimeout'], now: 1_700_000_000_000 });
  t.mock.method(console, 'warn', () => {});
  for (const interrupted of [false, true]) {
    const harness = assistantHarness();
    try {
      await harness.render({ pending: true });
      // Completion is independent of the shell's unclosed-fence pending flag.
      await harness.render({ endedAt: Date.now(), pending: interrupted, interrupted });
      await React.act(async () => t.mock.timers.tick(9_999));
      assert.ok(container.querySelector('[role="status"]'));
      await React.act(async () => t.mock.timers.tick(1));
      assert.equal(bodyHTML(), '<p>前文</p><p>后文</p>');
      assert.equal(harness.copy(), '前文\n\n\n\n后文');
    } finally { await harness.close(); }
  }
});

test('late checks render normally both during the grace period and after the block was hidden', async t => {
  t.mock.timers.enable({ apis: ['Date', 'setTimeout'], now: 1_700_000_000_000 });
  t.mock.method(console, 'warn', () => {});
  for (const delay of [500, 15_000]) {
    const harness = assistantHarness();
    try {
      await harness.render();
      const endedAt = Date.now();
      await harness.render({ endedAt });
      await React.act(async () => t.mock.timers.tick(delay));
      if (delay > 10_000) assert.equal(bodyHTML(), '<p>前文</p><p>后文</p>');
      await harness.render({ endedAt, event: lifecycleCheck });
      assert.match(container.textContent || '', /前文.*收入.*1\.23.*后文/);
      assert.equal(container.querySelector('[role="status"]'), null);
      assert.match(harness.copy(), /研究组件：收入/);
      assert.ok(!harness.copy().includes('claim:income'));
    } finally { await harness.close(); }
  }
});

test('historical turns without a check hide immediately, even if their end timestamp is recent', async t => {
  t.mock.method(console, 'warn', () => {});
  const harness = assistantHarness();
  try {
    await harness.render({ endedAt: Date.now(), pending: true });
    assert.equal(bodyHTML(), '<p>前文</p><p>后文</p>');
    assert.equal(harness.copy(), '前文\n\n\n\n后文');
  } finally { await harness.close(); }
});

test('malformed and mismatched events hide only the affected block and omit it from copying', async t => {
  t.mock.method(console, 'warn', () => {});
  const harness = assistantHarness();
  try {
    const malformed = readVibeCheck({ turn: 1, blocks: 'bad' }) ?? { turn: 1, failed: true };
    await harness.render({ event: malformed, pending: true });
    assert.equal(bodyHTML(), '<p>前文</p><p>后文</p>');
    assert.equal(harness.copy(), '前文\n\n\n\n后文');
    await harness.render({ event: { ...lifecycleCheck, blocks: [] } });
    assert.equal(bodyHTML(), '<p>前文</p><p>后文</p>');
    assert.equal(harness.copy(), '前文\n\n\n\n后文');
  } finally { await harness.close(); }

  const mixed = assistantHarness(lifecycleText + '\n\n```vibe\n<flow note="隐去的说明"><step>上游</step></flow>\n```');
  try {
    await mixed.render({ event: { ...lifecycleCheck, blocks: [...lifecycleCheck.blocks,
      { index: 1, ok: true, elements: [{ path: '0', component: 'alien', status: 'ok' }] }] } });
    assert.ok(container.textContent?.includes('1.23'));
    assert.ok(!container.textContent?.includes('隐去的说明'));
    assert.match(mixed.copy(), /研究组件：收入/);
    assert.ok(!mixed.copy().includes('隐去的说明'));
    await mixed.render({ event: { ...lifecycleCheck, blocks: [{ index: 0, ok: false, elements: [{ path: '0', component: 'stat', status: 'dropped' }] }] } });
    assert.equal(bodyHTML(), '<p>前文</p><p>后文</p>');
    assert.ok(!mixed.copy().includes('收入'));
  } finally { await mixed.close(); }
});

test('C4 fixture renders layouts, bound values and flow; drops bad siblings; reuses result reads', async () => {
  const requests: string[] = [];
  globalThis.fetch = async input => { requests.push(String(input)); return new Response('', { status: 404 }); };
  assert.deepEqual(readVibeCheck(check), check);
  await mount(source, check);
  for (const text of ['利润来自发电', '235.67', '20.45', '-8.31', '11.22', '本季', '煤价回落', '利润改善', '行情趋势']) assert.ok(container.textContent?.includes(text), text);
  for (const text of ['坏指标', '目录外', 'invalid', '组件校验不可用']) assert.ok(!container.textContent?.includes(text), text);
  assert.equal(container.querySelector('[data-evidence-ref="claim:income"]')?.getAttribute('data-citation-label'), '已核对财报');
  assert.ok(container.querySelector('.md\\:grid-cols-2'));
  const positive = container.querySelector<HTMLElement>('[data-value="20.45"]')!;
  const negative = container.querySelector<HTMLElement>('[data-value="-8.31"]')!;
  assert.ok(Number.parseFloat(positive.style.left) > 0, 'Positive bar starts at the zero baseline');
  assert.equal(negative.style.left, '0%');
  assert.ok(Math.abs(Number.parseFloat(negative.style.width) - Number.parseFloat(positive.style.left)) < 0.001, 'Negative bar ends at the zero baseline');
  assert.deepEqual(requests, ['/finance-research/research-results/' + encodeURIComponent(id)]);
  const data = actions();
  await mount(source, check, {}, data);
  await click('煤价如何传导？');
  assert.deepEqual(data.calls, ['煤价如何传导？', 'submit']);
  assert.ok(container.textContent?.includes('已发出'));
});

test('open fences and absent events stay placeholders; late events replace them without exposing IDs', async () => {
  const text = '```vibe\n<stat><item label="收入" ref="claim:income" unit="亿元"/></stat>\n```';
  const event = { turn: 1, blocks: [{ index: 0, ok: true, elements: [
    { path: '0', component: 'stat', status: 'ok' },
    { path: '0.0', component: 'item', status: 'ok', values: { 'claim:income': value(1.23, '亿元') } },
  ] }] };
  await mount(text, undefined);
  assert.match(container.textContent || '', /正在准备/);
  assert.ok(!container.textContent?.includes('claim:income'));
  await mount(text, event, { pending: true });
  assert.match(container.textContent || '', /正在准备/);
  await mount(text, event);
  assert.ok(container.textContent?.includes('1.23'));
  assert.ok(!container.textContent?.includes('正在准备'));
});

test('a failed event hides the whole block with one console diagnostic', async () => {
  const warnings: string[] = [], saved = console.warn;
  console.warn = (message: string) => warnings.push(message);
  try {
    await mount(source, { turn: 1, failed: true });
    await mount(source, { turn: 1, failed: true });
    assert.equal(bodyHTML(), '');
    assert.equal(warnings.length, 1);
    const broken = structuredClone(check);
    broken.blocks[0]!.elements[3]!.values!['claim:income']!.value = 'NaN';
    assert.equal(readVibeCheck(broken), undefined);
    assert.equal(readVibeCheck({ ...check, turn: -1 }), undefined);
    assert.equal(readVibeCheck({ ...check, turn: Number.MAX_SAFE_INTEGER + 1 }), undefined);
  } finally { console.warn = saved; }
});

test('company suggestions call Client addWatch only and show watched and failure states', async () => {
  const text = '```vibe\n<suggest type="company"><q code="600011.SH">可以观察燃料成本</q></suggest>\n```';
  const event = { turn: 1, blocks: [{ index: 0, ok: true, elements: [
    { path: '0', component: 'suggest', status: 'ok' }, { path: '0.0', component: 'q', status: 'ok' },
  ] }], suggest: { type: 'company', items: [{ symbol: '600011.SH', reason: '可以观察燃料成本' }] } };
  let watched = false, fail = true;
  const requests: { url: string; method: string; body?: unknown }[] = [];
  globalThis.fetch = async (input, init) => {
    const url = String(input), method = init?.method || 'GET';
    requests.push({ url, method, ...(init?.body ? { body: JSON.parse(String(init.body)) } : {}) });
    assert.equal(url, '/finance-api/client/watch', 'Recommendation must not call research or Topic APIs');
    if (method === 'POST' && fail) return Response.json({ message: '夹具关注失败' }, { status: 500 });
    if (method === 'POST') watched = true;
    return Response.json({ symbols: watched ? ['600011'] : [], added: watched });
  };
  await mount(text, event);
  await click('关注 600011.SH');
  assert.ok(container.querySelector('[role="alert"]'));
  fail = false;
  await click('关注 600011.SH');
  assert.ok(container.textContent?.includes('已关注'));
  assert.deepEqual(requests.filter(r => r.method === 'POST').map(r => r.body), [{ symbol: '600011' }, { symbol: '600011' }]);
  await React.act(async () => root.render(null));
  requests.length = 0;
  await mount(text, event);
  assert.ok([...container.querySelectorAll('button')].some(button => button.querySelector('.finance-suggest-status')?.textContent === '已关注' && button.disabled));
  assert.deepEqual(requests.map(r => r.method), ['GET']);
});

test('question click respects busy input; historical suggestion events share the read-only view', async () => {
  const event = { ...check, blocks: [{ index: 0, ok: true, elements: [{ path: '0', component: 'suggest', status: 'ok' }] }] };
  const text = '```vibe\n<suggest type="question"><q>煤价如何传导？</q></suggest>\n```';
  const busy = actions(true);
  await mount(text, event, {}, busy);
  await click('煤价如何传导？');
  assert.deepEqual(busy.calls, []);
  for (const data of [{ type: 'question', items: [{ text: '历史追问' }] },
    { type: 'company', items: [{ symbol: '600011.SH', reason: '历史公司理由' }] },
    { type: 'indicator', items: [{ name: '历史观察', reason: '历史理由', tracking_item: { tracking_key: 'fixture' } }] }]) {
    await React.act(async () => root.render(React.createElement(suggestions.SuggestionNode, { node: { data }, ...actions() })));
    assert.equal(container.querySelectorAll('button').length, 0);
    assert.match(container.textContent || '', /历史/);
  }
});

test('discarded suggestions and empty nested layouts leave no answer containers or copy summary', async () => {
  const text = '前文\n```vibe\n<section question="推荐"><row><suggest type="question"><q>下一步？</q></suggest></row></section>\n```\n后文';
  const elements = [
    { path: '0', component: 'section', status: 'ok' as const },
    { path: '0.0', component: 'row', status: 'ok' as const },
    { path: '0.0.0', component: 'suggest', status: 'ok' as const },
  ];
  const harness = assistantHarness(text);
  try {
    for (const event of [
      { turn: 1, blocks: [{ index: 0, ok: false, elements: [{ ...elements[0], status: 'dropped', reason: 'suggest_rejected' }] }] },
      { turn: 1, blocks: [{ index: 0, ok: true, elements }] },
      { turn: 1, blocks: [{ index: 0, ok: true, elements }], suggest: { type: 'question', items: [] } },
    ]) {
      await harness.render({ event });
      assert.equal(bodyHTML(), '<p>前文</p><p>后文</p>');
      assert.equal(container.querySelector('[data-vibe-block], .finance-suggest, [role="status"]'), null);
      const tail = container.querySelector<HTMLElement>('[data-vibe-suggestions-tail]')!;
      assert.equal(tail.childNodes.length, 0);
      assert.equal(tail.style.display, 'contents');
      assert.equal(harness.copy(), '前文\n\n后文');
    }
  } finally { await harness.close(); }
});

test('a validated middle suggestion moves after all prose and other blocks, including on late arrival', async () => {
  const text = '前文\n```vibe\n<section question="后续方向"><suggest type="question"><q>下一步？</q></suggest></section>\n```\n正文继续\n```vibe\n<stat><item label="收入" ref="claim:income" unit="亿元"/></stat>\n```\n后文';
  const event = { turn: 1, blocks: [
    { index: 0, ok: true, elements: [
      { path: '0', component: 'section', status: 'ok' }, { path: '0.0', component: 'suggest', status: 'ok' },
    ] },
    { ...lifecycleCheck.blocks[0], index: 1 },
  ], suggest: { type: 'question', placement: 'answer_end', items: [{ text: '下一步？' }] } };
  const harness = assistantHarness(text);
  try {
    await harness.render();
    assert.equal(container.querySelector('.finance-suggest'), null);
    await harness.render({ event });
    const tail = container.lastElementChild!;
    assert.ok(tail.hasAttribute('data-vibe-suggestions-tail'));
    assert.equal(tail.previousElementSibling?.textContent, '后文');
    assert.equal(tail.querySelectorAll('.finance-suggest').length, 1);
    assert.equal(container.querySelectorAll('[data-vibe-block]').length, 1, 'the suggestion-only section leaves no inline box');
    assert.doesNotMatch(bodyHTML(), /下一步|后续方向/);
    assert.match(harness.copy(), /下一步/);
    const button = tail.querySelector('button')!;
    assert.equal(button.getAttribute('aria-label'), '下一步？');
    assert.equal(button.querySelector('.finance-suggest-text')?.textContent, '下一步？');
    assert.equal(container.textContent?.includes('继续问'), false);
    await click('下一步？');
    assert.equal(button.querySelector('.finance-suggest-status')?.textContent, '已发出');
  } finally { await harness.close(); }
});

test('empty stat, compare and flow layouts collapse while accepted siblings retain their grid', async () => {
  const text = '```vibe\n<grid cols="2"><stat><item label="缺指标" ref="claim:missing"/></stat><flow><step>丢弃步骤</step></flow><compare title="空对比"><bar ref="claim:missing"/></compare><stat><item label="收入" ref="claim:income" unit="亿元"/></stat></grid>\n```';
  const event = { turn: 1, blocks: [{ index: 0, ok: true, elements: [
    { path: '0', component: 'grid', status: 'ok' },
    { path: '0.0', component: 'stat', status: 'ok' }, { path: '0.0.0', component: 'item', status: 'dropped' },
    { path: '0.1', component: 'flow', status: 'ok' }, { path: '0.1.0', component: 'step', status: 'dropped' },
    { path: '0.2', component: 'compare', status: 'ok' }, { path: '0.2.0', component: 'bar', status: 'dropped' },
    { path: '0.3', component: 'stat', status: 'ok' }, { path: '0.3.0', component: 'item', status: 'ok', values: { 'claim:income': value(1.23, '亿元') } },
  ] }] };
  await mount(text, event);
  const grid = container.querySelector('.md\\:grid-cols-2')!;
  assert.ok(grid);
  assert.equal(grid.children.length, 1);
  assert.match(grid.textContent || '', /收入.*1.23/);
  assert.doesNotMatch(container.textContent || '', /缺指标|丢弃步骤|空对比/);
});

test('window actions join a late native titlebar and restore without remounting the conversation seat', async () => {
  await React.act(async () => root.render(React.createElement(layout.ConversationWorkspace, { active: true }, '页面正文')));
  const seat = container.querySelector('#dsh-conversation')!;
  const header = win.document.createElement('header');
  const utilities = win.document.createElement('div');
  utilities.dataset.slot = 'conversation.session.header.utilities';
  header.append(utilities);
  await React.act(async () => { seat.append(header as unknown as Node); await win.happyDOM.waitUntilComplete(); });
  assert.equal(container.querySelector('.conversation-window-actions'), null);
  assert.equal(utilities.querySelectorAll('.finance-window-action').length, 1);
  await click('展开窗口');
  assert.equal(container.firstElementChild?.getAttribute('data-expanded'), 'true');
  assert.equal(utilities.querySelector('button')?.textContent, '还原窗口');
  assert.equal(container.querySelector('#dsh-conversation'), seat);
  await click('还原窗口');
  assert.equal(container.firstElementChild?.getAttribute('data-expanded'), 'false');
  assert.equal(container.querySelector('#dsh-conversation'), seat);
  const replacement = utilities.cloneNode(false) as HTMLElement;
  await React.act(async () => { utilities.replaceWith(replacement as any); await win.happyDOM.waitUntilComplete(); });
  assert.equal(replacement.querySelectorAll('.finance-window-action').length, 1);
  await React.act(async () => root.render(React.createElement(layout.ConversationWorkspace, { active: false }, '页面正文')));
  assert.equal(replacement.querySelector('.finance-window-action'), null);
  await React.act(async () => root.render(null));
});

test('copy keeps surrounding prose and reduces each component block to readable text without raw refs', () => {
  const summary = summarizeVibeMarkdown(source + '\n\n~~~vibe\n<chart ref="' + id + '" title="另一张图"/>');
  assert.match(summary, /^前文/);
  assert.ok(summary.includes('后文') && summary.includes('利润来自发电') && summary.includes('另一张图'));
  assert.ok(!summary.includes('result:') && !summary.includes('claim:') && !summary.includes('```') && !summary.includes('<chart'));
  assert.equal(summarizeVibeMarkdown('```js\nconst x=1\n```'), '```js\nconst x=1\n```');
  assert.equal(parseVibe('<flow note="事实&amp;推断"><step>事实&lt;解释</step></flow>')[0]!.attrs.note, '事实&推断');
});

test('bare recommendations use UTF-16 spans and preserve fenced block offsets and literal examples', () => {
  const bare = '<suggest type="question">\r\n<q>盈利如何兑现？</q>\r\n</suggest>';
  const text = `正文😀\r\n\r\n${bare}\r\n\r\n后文\r\n\r\n\`\`\`vibe\n<flow><step>结论</step></flow>\n\`\`\``;
  const span = { start: text.indexOf(bare), end: text.indexOf(bare) + bare.length };
  assert.deepEqual(unfencedSuggestionRanges(text), [span]);
  const hidden = hideUnfencedSuggestions(text);
  assert.equal(hidden.length, text.length);
  assert.equal(vibeBlocks(hidden)[0]!.offset, vibeBlocks(text)[0]!.offset);
  assert.ok(hidden.includes('后文') && !hidden.includes('<suggest'));
  assert.equal(summarizeVibeMarkdown(text, new Set()), '正文😀\r\n\r\n\r\n\r\n后文\r\n\r\n');
  for (const literal of [`前文 ${bare}`, `> ${bare}`, `- ${bare}`, `    ${bare}`, `\t${bare}`,
    `\`\`\`xml\n${bare}\n\`\`\``, `~~~text\n${bare}\n~~~`, `\`\`\`\n${bare}`, `\`${bare}\``]) {
    assert.equal(hideUnfencedSuggestions(literal), literal);
  }
  for (const invalid of [{ start: -1, end: 1, status: 'ok' }, { start: 2, end: 1, status: 'ok' },
    { start: 0, end: 1, status: 'unknown' }, { start: 0.5, end: 1, status: 'ok' }]) {
    assert.equal(readVibeCheck({ turn: 1, blocks: [], unfencedSuggestions: [invalid] }), undefined);
  }
  assert.equal(readVibeCheck({ turn: 1, blocks: [], unfencedSuggestions: [
    { start: 0, end: 3, status: 'ok' }, { start: 2, end: 4, status: 'ok' },
  ] }), undefined);
});

test('bare suggestions are removed from native prose and only a matched successful event renders at the end', async () => {
  const bare = '<suggest type="question"><q>盈利如何兑现？</q><q>被拒绝的追问</q></suggest>';
  const text = `前文😀\n\n${bare}\n\n后文`;
  let nativeText = '';
  const harness = assistantHarness(text, props => {
    nativeText = props.node.data.blocks[0].text;
    return React.createElement('p', { 'data-prose': '' }, nativeText);
  });
  const event = { turn: 1, blocks: [], unfencedSuggestions: [{ ...unfencedSuggestionRanges(text)[0]!, status: 'ok' as const }],
    suggest: { type: 'question' as const, items: [{ text: '盈利如何兑现？' }] } };
  try {
    for (const rejected of [undefined, { turn: 1, failed: true }, { ...event, unfencedSuggestions: [{ ...event.unfencedSuggestions[0], status: 'dropped' }] },
      { ...event, unfencedSuggestions: [{ ...event.unfencedSuggestions[0], start: 0 }] }, { ...event, suggest: undefined }]) {
      await harness.render({ endedAt: 0, event: rejected });
      assert.ok(!nativeText.includes('<suggest') && nativeText.includes('后文'));
      assert.equal(container.querySelector('.finance-suggest'), null);
      assert.equal(harness.copy(), '前文😀\n\n\n\n后文');
    }
    await harness.render({ endedAt: 0, event });
    assert.equal(container.querySelector('.finance-suggest-title')?.textContent, '相关问题');
    assert.ok(container.querySelector('[data-prose]')!.compareDocumentPosition(container.querySelector('.finance-suggest')!) & win.Node.DOCUMENT_POSITION_FOLLOWING);
    assert.ok(harness.copy().includes('相关推荐：盈利如何兑现？。') && !harness.copy().includes('<suggest'));
    assert.ok(!harness.copy().includes('被拒绝的追问'));
    await click('盈利如何兑现？');
    const company = { ...event, suggest: { type: 'company', items: [{ symbol: '600011.SH', reason: '观察盈利兑现' }] } };
    const originalFetch = globalThis.fetch;
    globalThis.fetch = (async () => new Response(JSON.stringify({ symbols: [] }))) as typeof fetch;
    try {
      await harness.render({ endedAt: 0, event: company });
      assert.equal(container.querySelector('.finance-suggest-title')?.textContent, '相关公司');
      assert.equal(container.querySelector('[aria-label="关注 600011.SH"]')?.textContent?.includes('关注'), true);
    } finally { globalThis.fetch = originalFetch; }
  } finally { await harness.close(); }
});

test('native empty finance slots collapse without hiding a visible result or the footer actions', async () => {
  const installed = readFileSync(new URL('../dsh/runtime/node_modules/@deepseek-ai/dsh-client-ui-chat/lib/client.js', import.meta.url), 'utf8');
  const nativeCss = JSON.parse(installed.match(/const css\$13 = ("[^\n]+")/)![1]!);
  const style = win.document.createElement('style');
  style.textContent = nativeCss + readFileSync(new URL('../src/verticals/finance/dsh/native-dsh.css', import.meta.url), 'utf8');
  win.document.head.append(style);
  await React.act(async () => root.render(null));
  container.innerHTML = '<div id="dsh-conversation"><div class="EvIC1a_column" data-chat-flow><div class="EvIC1a_flowItem" data-chat-flow-kind="assistant-step">正文</div>'
    + '<div class="EvIC1a_flowItem" data-chat-flow-kind="finance-result"><div data-slot="conversation.chat.node" style="display:contents"></div></div>'.repeat(3)
    + '<div class="EvIC1a_flowItem" data-chat-flow-kind="finance-result"><div data-slot="conversation.chat.node" style="display:contents"><figure>有效图表</figure></div></div>'
    + '<div class="EvIC1a_flowItem" data-chat-flow-kind="turn-tail"><div data-actions-reveal="hover"><div data-clock="end" style="opacity:0"><button>复制</button></div></div></div>'
    + '<div class="EvIC1a_flowItem" data-chat-flow-kind="finance-maintenance"><div data-slot="conversation.chat.node" style="display:contents"><details class="my-3"><summary>知识更新草案</summary></details></div></div></div></div>';
  try {
    const results = container.querySelectorAll('[data-chat-flow-kind="finance-result"]');
    for (const empty of [...results].slice(0, 3)) {
      assert.equal(win.getComputedStyle(empty as any).display, 'none');
      assert.equal(win.getComputedStyle(empty as any).marginTop, '0px');
    }
    assert.notEqual(win.getComputedStyle(results[3] as any).display, 'none');
    assert.equal(win.getComputedStyle(container.querySelector('[data-chat-flow-kind="finance-maintenance"]') as any).marginTop, '0px');
    assert.equal(container.querySelector('button')?.textContent, '复制');
  } finally { style.remove(); container.innerHTML = ''; }
});

test('bare paragraphs spanning text blocks disappear without leaving an empty native Markdown block', async () => {
  const bare = '<suggest type="question"><q>盈利如何兑现？</q></suggest>';
  const texts = ['前文\n\n', bare.slice(0, 25), bare.slice(25), '\n\n后文'];
  let rendered: string[] = [];
  const harness = assistantHarness(texts.join(''), props => {
    rendered = props.node.data.blocks.map((block: any) => block.text);
    return React.createElement('div', null, rendered.map((text, index) => React.createElement('p', { key: index }, text)));
  }, texts);
  try {
    await harness.render({ endedAt: 0 });
    assert.deepEqual(rendered, ['前文\n\n', '\n\n后文']);
    assert.equal(container.querySelectorAll('p').length, 2);
    assert.equal(harness.copy(), '前文\n\n\n\n后文');
  } finally { await harness.close(); }
});

test('renderer registration disposes only its own callbacks', () => {
  const host = globalThis as Record<symbol, unknown>;
  const first = ui.registerVibeRenderer(() => null);
  const second = ui.registerVibeRenderer(() => null);
  first();
  assert.equal(typeof host[ui.VIBE_COPY], 'function');
  assert.equal(typeof host[ui.VIBE_RENDERER], 'function');
  second();
  assert.equal(host[ui.VIBE_COPY], undefined);
  assert.equal(host[ui.VIBE_RENDERER], undefined);
});

test('clipboard summary is scoped to mounted assistant replies and leaves code-toolbar copies unchanged', () => {
  const host = globalThis as Record<symbol, any>;
  const disposeRenderer = ui.registerVibeRenderer(() => null);
  const disposeSource = ui.registerVibeCopySource(source, new Set([0]));
  const disposeSecond = ui.registerVibeCopySource(source, new Set([0]));
  const example = `\`\`\`vibe\n<chart ref="${id}"/>\n\`\`\``;
  assert.equal(host[ui.VIBE_COPY](example), example, 'Code example must be copied literally');
  assert.equal(host[ui.VIBE_COPY](source), summarizeVibeMarkdown(source));
  const disposeHidden = ui.registerVibeCopySource(source, new Set());
  assert.equal(host[ui.VIBE_COPY](source), '前文\n\n\n\n后文', 'An identical reply with a hidden block must not copy that block');
  disposeHidden();
  assert.equal(host[ui.VIBE_COPY](source), summarizeVibeMarkdown(source));
  disposeSource();
  assert.equal(host[ui.VIBE_COPY](source), summarizeVibeMarkdown(source));
  disposeSecond();
  assert.equal(host[ui.VIBE_COPY](source), source);
  disposeRenderer();
});

test('assistant wrapper retains native component, props and injection, supports late registration and cleanup', async () => {
  const entries: any[] = [], listeners = new Set<() => void>();
  let releaseContext: () => void, wrapper: any;
  const input = actions();
  const face = { hooks: { presentation: () => 'native hook' } };
  const native = { options: { key: 'assistant-step' }, inject: () => face,
    component: (props: any) => { assert.equal(props.nativeMarker, 'preserved'); return React.createElement(ui.VibeBlock, {
      code: '<flow note="示意"><step>需求</step><step>收入</step><step>利润</step></flow>',
      options: { source: props.node.data.blocks[0].text, offset: 0, pending: false },
    }); } };
  const ctx = { slots: {
    inject: (_key: string, factory: () => () => void) => { releaseContext = factory(); return releaseContext; },
    entries: () => entries, subscribe: (_key: string, cb: () => void) => { listeners.add(cb); return () => listeners.delete(cb); },
    register: (options: any, component: any) => {
      assert.equal(options.priority, -10);
      assert.equal(options.inject(), face);
      wrapper = component;
      return () => { wrapper = undefined; };
    },
  } };
  ui.installVibeAssistantContext(ctx);
  assert.equal(wrapper, undefined);
  entries.push(native); listeners.forEach(cb => cb());
  const text = '```vibe\n<flow note="示意"><step>需求</step><step>收入</step><step>利润</step></flow>\n```';
  const event = { turn: 1, blocks: [{ index: 0, ok: true, elements: [
    { path: '0', component: 'flow', status: 'ok' }, ...['0', '1', '2'].map(n => ({ path: `0.${n}`, component: 'step', status: 'ok' })),
  ] }] };
  const host = globalThis as Record<symbol, any>;
  const disposeRenderer = ui.registerVibeRenderer(() => null);
  await React.act(async () => root.render(React.createElement(wrapper, { nativeMarker: 'preserved', ...input,
    node: { location: { kind: 'turn', turn: { turn: 1 } }, data: { step: 2, finalNode: {}, blocks: [{ kind: 'text', text }] } },
    useChat: (select: (snapshot: any) => unknown) => select({ timeline: { turns: new Map() } }),
    useTurnData: (key: string) => key === 'turn-process' ? { answerStep: 2 } : event,
  })));
  assert.ok(container.textContent?.includes('需求') && !container.textContent?.includes('正在准备'));
  assert.equal(host[ui.VIBE_COPY](text), summarizeVibeMarkdown(text));
  await React.act(async () => root.render(null));
  assert.equal(host[ui.VIBE_COPY](text), text);
  disposeRenderer();
  releaseContext!();
  assert.equal(wrapper, undefined);
  assert.equal(listeners.size, 0);
});

test('separate result card reacts to a late check and hides a validated inline chart', async () => {
  let Component: any, resolve: (() => void)[] = [];
  resultNodes.installResultNode({ effect: (factory: () => () => void) => { resolve.push(factory()); },
    uiConversation: { events: { register() {} } }, slots: {
      inject: (_key: string, factory: () => unknown) => { factory(); }, entries: () => [], subscribe: () => () => {},
      register: (options: any, component: any) => { if (options.key === 'finance-result') Component = component; return () => {}; },
    } });
  const text = `\`\`\`vibe\n<chart ref="${id}" title="走势"/>\n\`\`\``;
  const data = { finalNode: {}, blocks: [{ kind: 'text', text }] };
  const node = { data: { resultId: id }, location: { kind: 'turn', turn: { steps: [{ step: 2, data: { get: () => data } }] } } };
  const request: string[] = [];
  globalThis.fetch = async input => { request.push(String(input)); return new Response('', { status: 404 }); };
  const render = async (check: any) => React.act(async () => root.render(React.createElement(Component, { node,
    useTurnData: (key: string) => key === 'turn-process' ? { answerStep: 2 } : check,
  })));
  try {
    await render(undefined);
    assert.ok(container.textContent?.includes('这份研究成果不存在'));
    await render({ turn: 1, blocks: [{ index: 0, ok: true, elements: [{ path: '0', component: 'chart', status: 'ok' }] }] });
    assert.equal(container.textContent, '');
    assert.equal(request.length, 1);
  } finally { resolve.forEach(dispose => dispose()); }
});
