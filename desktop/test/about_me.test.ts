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
    { id: 'a', stance: 'stated', text: '回答先给结论', updated_at: '2026-10-02T08:00:00Z' },
    { id: 'b', stance: 'stated', text: '认为煤炭业务会继续拖累利润', source_session: 's1', updated_at: '2026-10-14T08:00:00Z' },
  ] },
  recent: { kind: 'recent', version: 7, title: '', entries: [
    { id: 'c', stance: 'inferred', text: '关心有色金属和电力', updated_at: '2026-10-10T08:00:00Z' },
    { id: 'd', stance: 'corrected', text: '金额默认用亿元' },
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
          else doc.entries = [...doc.entries, { id: 'new', stance: op.stance, text: op.text, updated_at: '2026-10-20T08:00:00Z' }];
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
  assert.deepEqual(lib.aboutMeItems(docs.soul, docs.recent).map((item: any) => item.id), ['b', 'c', 'a', 'd']);
  assert.deepEqual(lib.aboutMeItems(null, null), []);
});

test('来源文案：自己填写、对话里说的、从对话中推断、自己改过', () => {
  assert.equal(lib.aboutMeSource({ stance: 'stated' }), '自己填写');
  assert.equal(lib.aboutMeSource({ stance: 'stated', source_session: 's1' }), '对话里说的');
  assert.equal(lib.aboutMeSource({ stance: 'inferred' }), '从对话中推断');
  assert.equal(lib.aboutMeSource({ stance: 'corrected' }), '自己改过');
});

test('列表按序显示，来源与日期在下一行，对话里说的可点开那次对话', async () => {
  await show();
  assert.deepEqual(texts(), ['认为煤炭业务会继续拖累利润', '关心有色金属和电力', '回答先给结论', '金额默认用亿元']);
  const descriptions = [...container.querySelectorAll('.group-row-desc')].map(node => node.textContent);
  assert.match(descriptions[0]!, /^对话里说的 · 10月14日$/);
  assert.match(descriptions[1]!, /^从对话中推断 · 10月10日$/);
  assert.equal(descriptions[3], '自己改过');
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

test('记下：写入 soul，stated 且 user_authorized，新条目出现在最上面，输入框清空', async () => {
  puts.length = 0;
  await type('我持有神火，偏中长线');
  await submit();
  assert.deepEqual(puts, [{ kind: 'soul', version: 3, operations: [{ op: 'upsert', stance: 'stated', text: '我持有神火，偏中长线', user_authorized: true }] }]);
  assert.equal(texts()[0], '我持有神火，偏中长线');
  assert.equal((container.querySelector('input[aria-label="补充关于我"]') as HTMLInputElement).value, '');
});

test('删除：按条目所属文档的版本发 delete，立即生效，不弹确认', async () => {
  puts.length = 0;
  const row = [...container.querySelectorAll('.group-row')].find(node => node.textContent!.includes('关心有色金属和电力'))!;
  await React.act(async () => { (row.querySelector('button.btn') as HTMLElement).click(); await new Promise(resolve => setTimeout(resolve, 20)); });
  assert.deepEqual(puts, [{ kind: 'recent', version: 7, operations: [{ op: 'delete', id: 'c' }] }]);
  assert.ok(!texts().includes('关心有色金属和电力'));
  assert.equal(container.querySelector('[role=dialog]'), null);
});
