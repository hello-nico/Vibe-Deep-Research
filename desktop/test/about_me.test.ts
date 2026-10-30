// 设置 · 关于我：一张列表，顶部补充，逐条删除。
import assert from 'node:assert/strict';
import test, { before, after } from 'node:test';
import { createServer as createHttpServer } from 'node:http';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';
import * as React from 'react';
import { Window } from 'happy-dom';

let server: Awaited<ReturnType<typeof createServer>>, win: Window, root: ReturnType<typeof import('react-dom/client')['createRoot']>, container: HTMLElement;
let lib: Record<string, any>, aboutMe: Record<string, any>, router: Record<string, any>;
const previous = { window: globalThis.window, document: globalThis.document, fetch: globalThis.fetch, IS_REACT_ACT_ENVIRONMENT: globalThis.IS_REACT_ACT_ENVIRONMENT };
const puts: any[] = [];
const docs: Record<string, any> = {
  soul: { kind: 'soul', version: 3, title: '', entries: [
    { id: 'a', stance: 'stated', category: '水平与表达偏好', text: '回答先给结论', updated_at: '2026-10-02T08:00:00Z' },
    { id: 'b', stance: 'stated', category: '持仓与关注', text: '认为煤炭业务会继续拖累利润', source_session: 's1', updated_at: '2026-10-14T08:00:00Z' },
  ] },
  recent: { kind: 'recent', version: 7, title: '', entries: [
    { id: 'c', stance: 'inferred', category: '投资风格与约束', text: '关心有色金属和电力', updated_at: '2026-10-10T08:00:00Z' },
    { id: 'd', stance: 'corrected', text: '金额默认用亿元' },
    { id: 'e', stance: 'corrected', category: '纠正', text: '不要把收入写成利润', updated_at: '2026-10-01T08:00:00Z' },
  ] },
};

before(async () => {
  win = new Window();
  Object.assign(globalThis, { window: win, document: win.document, IS_REACT_ACT_ENVIRONMENT: true,
    fetch: async (url: string, init?: { method?: string; body?: string }) => {
      if (init?.method === 'PUT') {
        const body = JSON.parse(String(init.body)); puts.push(body);
        const doc = docs[body.kind];
        for (const op of body.operations) {
          if (op.op === 'delete') doc.entries = doc.entries.filter((entry: any) => entry.id !== op.id);
          else doc.entries = [...doc.entries, { id: 'new', stance: op.stance, category: op.category, text: op.text, updated_at: '2026-10-20T08:00:00Z' }];
        }
        doc.version += 1;
        return Response.json(doc);
      }
      return Response.json(docs[new URL(String(url), 'http://x').searchParams.get('kind') || 'soul']);
    } });
  server = await createServer({ configFile: false, root: fileURLToPath(new URL('../', import.meta.url)),
    resolve: { alias: { '@': fileURLToPath(new URL('../src/verticals/finance', import.meta.url)) } },
    server: { middlewareMode: true, hmr: { server: createHttpServer() }, watch: null }, appType: 'custom',
    ssr: { noExternal: ['react-router-dom', 'react-router'], resolve: { conditions: ['module-sync', 'node', 'import', 'development'] } } });
  lib = await server.ssrLoadModule('/src/verticals/finance/lib/aboutMe.ts');
  aboutMe = await server.ssrLoadModule('/src/verticals/finance/components/AboutMe.tsx');
  router = await server.ssrLoadModule('react-router-dom');
  container = win.document.createElement('div') as unknown as HTMLElement;
  win.document.body.append(container);
  root = (await import('react-dom/client')).createRoot(container);
});
after(async () => { await React.act(async () => root?.unmount()); await server?.close(); win?.happyDOM.abort(); Object.assign(globalThis, previous); });

const opened: string[] = [];
const texts = () => [...container.querySelectorAll('.group-row-title')].map(node => node.textContent);
async function show() {
  await React.act(async () => root.render(React.createElement(router.MemoryRouter, null, React.createElement(aboutMe.AboutMe, { onOpenSource: (id: string) => opened.push(id) }))));
  await React.act(async () => { await new Promise(resolve => setTimeout(resolve, 20)); });
}
async function type(value: string) {
  const input = container.querySelector('input[aria-label="补充关于我"]') as HTMLInputElement;
  const setter = Object.getOwnPropertyDescriptor(win.HTMLInputElement.prototype, 'value')!.set!;
  await React.act(async () => { setter.call(input, value); input.dispatchEvent(new win.Event('input', { bubbles: true })); });
}
const submit = () => React.act(async () => { (container.querySelector('button[type=submit]') as HTMLElement).click(); await new Promise(resolve => setTimeout(resolve, 20)); });

test('画像与近期合成一列，按更新时间倒序，没有时间的排最后', () => {
  assert.deepEqual(lib.aboutMeItems(docs.soul, docs.recent).map((item: any) => item.id), ['b', 'c', 'a', 'e', 'd']);
  assert.deepEqual(lib.aboutMeItems(null, null), []);
});

test('旧记忆只在展示副本清理叙述前缀并改句首用户为我', () => {
  const original = { kind: 'soul', version: 1, title: '', entries: [
    { id: 'p1', stance: 'stated', text: '用户要求：回答先给结论' },
    { id: 'p2', stance: 'inferred', text: '用户表达对甲公司的判断：利润承压' },
    { id: 'p3', stance: 'stated', text: '用户偏好简短回答，也会询问其他用户的需求' },
  ] };
  const snapshot = structuredClone(original);
  assert.deepEqual(lib.aboutMeItems(original, null).map((item: any) => item.text), [
    '回答先给结论',
    '我对甲公司的判断：利润承压',
    '我偏好简短回答，也会询问其他用户的需求',
  ]);
  assert.deepEqual(original, snapshot);
});

test('四类按固定顺序始终分组、类内按时间排序，旧条目无分类放进末尾「其他」', () => {
  assert.deepEqual(lib.aboutMeSections(docs.soul, docs.recent).map((section: any) => ({
    category: section.label,
    ids: section.items.map((item: any) => item.id),
  })), [
    { category: '水平与表达偏好', ids: ['a'] },
    { category: '持仓与关注', ids: ['b'] },
    { category: '投资风格与约束', ids: ['c'] },
    { category: '纠正', ids: ['e'] },
    { category: '其他', ids: ['d'] },
  ]);
  assert.deepEqual(lib.aboutMeSections(null, { kind: 'recent', version: 1, title: '', entries: [{ id: 'x', stance: 'stated', text: '旧条目' }] }).map((section: any) => section.label),
    ['其他', '水平与表达偏好', '持仓与关注', '投资风格与约束', '纠正'], '有记忆的组排前，空组排后');
  assert.deepEqual(lib.aboutMeSections(null, null).map((section: any) => [section.label, section.items.length, Boolean(section.hint)]),
    [['水平与表达偏好', 0, true], ['持仓与关注', 0, true], ['投资风格与约束', 0, true], ['纠正', 0, true]], '没有记忆时四类仍在，各带说明');
});

test('来源文案统一为我说的、从对话中记下', () => {
  assert.equal(lib.aboutMeSource({ stance: 'stated' }), '我说的');
  assert.equal(lib.aboutMeSource({ stance: 'stated', source_session: 's1' }), '我说的');
  assert.equal(lib.aboutMeSource({ stance: 'inferred' }), '从对话中记下');
  assert.equal(lib.aboutMeSource({ stance: 'corrected' }), '我说的');
});

test('一张列表按四类显示，旧条目放进「其他」，来源会话可点开', async () => {
  await show();
  assert.deepEqual(texts(), ['回答先给结论', '认为煤炭业务会继续拖累利润', '关心有色金属和电力', '不要把收入写成利润', '金额默认用亿元']);
  assert.deepEqual([...container.querySelectorAll('[data-memory-category]')].map(node => node.textContent),
    ['水平与表达偏好', '持仓与关注', '投资风格与约束', '纠正', '其他']);
  assert.equal(container.querySelector('[data-memory-empty]'), null, '每类都有记忆时不出说明');
  assert.doesNotMatch(container.querySelector('.grid')!.className, /max-w-/, '和其他页面一样铺满内容区');
  const descriptions = [...container.querySelectorAll('.group-row-desc')].map(node => node.textContent);
  assert.match(descriptions[1]!, /^我说的 · 10月14日$/);
  assert.match(descriptions[2]!, /^从对话中记下 · 10月10日$/);
  assert.equal(descriptions[4], '我说的');
  await React.act(async () => { (container.querySelector('.group-row-desc button') as HTMLElement).click(); });
  assert.deepEqual(opened, ['s1']);
  assert.match(container.textContent!, /不对的直接删掉，助手以后不再按它来。/);
  assert.doesNotMatch(container.textContent!, /soul|recent|stance|议题建议/);
});

test('空输入不提交', async () => {
  puts.length = 0;
  await type('   ');
  await submit();
  assert.deepEqual(puts, []);
});

test('记下：显式选择四类之一，写入 soul 的 stated 与 user_authorized，类内置顶', async () => {
  puts.length = 0;
  const category = container.querySelector('[role="combobox"][aria-label="关于我的类别"]') as HTMLButtonElement;
  assert.equal(container.querySelector('select'), null, '用统一下拉，不用原生 select');
  await React.act(async () => category.click());
  const option = [...win.document.querySelectorAll('[role="option"]')].find(node => node.textContent!.includes('持仓与关注')) as unknown as HTMLElement;
  await React.act(async () => option.click());
  await type('我持有神火，偏中长线');
  await submit();
  assert.deepEqual(puts, [{ kind: 'soul', version: 3, operations: [{ op: 'upsert', stance: 'stated', category: '持仓与关注', text: '我持有神火，偏中长线', user_authorized: true }] }]);
  assert.deepEqual(texts().slice(0, 3), ['回答先给结论', '我持有神火，偏中长线', '认为煤炭业务会继续拖累利润']);
  assert.equal((container.querySelector('input[aria-label="补充关于我"]') as HTMLInputElement).value, '');
  assert.match(category.textContent!, /持仓与关注/);
});

test('删除：按条目所属文档的版本发 delete，立即生效，不弹确认', async () => {
  puts.length = 0;
  const row = [...container.querySelectorAll('.group-row')].find(node => node.textContent!.includes('关心有色金属和电力'))!;
  await React.act(async () => { (row.querySelector('button.btn') as HTMLElement).click(); await new Promise(resolve => setTimeout(resolve, 20)); });
  assert.deepEqual(puts, [{ kind: 'recent', version: 7, operations: [{ op: 'delete', id: 'c' }] }]);
  assert.ok(!texts().includes('关心有色金属和电力'));
  assert.equal(container.querySelector('[role=dialog]'), null);
});
