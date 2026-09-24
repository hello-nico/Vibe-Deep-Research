import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { loadFinanceModule } from './load_finance_module.ts';

const { objectHref, objectLabel, registeredObject, resolveObjectLabels, rememberObjectLabel } = await loadFinanceModule<typeof import('../src/verticals/finance/lib/objectRegistry.ts') & { rememberObjectLabel: (ref: string, label: string) => void }>('lib/objectRegistry.ts');

test('对象登记层给出主页、版本查询和抽屉', () => {
  assert.equal(objectHref('companies/600309'), '/research?company=companies%2F600309-sh');
  assert.equal(objectHref('industries/nbs-电力'), '/sectors/%E7%94%B5%E5%8A%9B');
  const doc = `document:${'a'.repeat(32)}/r1/${'b'.repeat(64)}`;
  assert.match(objectHref(doc) || '', /\/my-reports\/read\/a{32}\?from=%2F&revision=r1&hash=b{64}/);
  assert.equal(objectHref('topic:abcdef123456'), '/my-research/topics/abcdef123456');
  assert.equal(objectHref(`profile:sw2:801010:${'a'.repeat(64)}`), '/sectors/profiles/801010');
  assert.equal(registeredObject('themes/example')?.drawer, true);
  assert.equal(objectHref('themes/example'), undefined);
  assert.equal(registeredObject('comparisons/example')?.drawer, true);
});

test('名称缓存命中，存储不可用时保留内存名称', () => {
  assert.equal(objectLabel('themes/unknown'), '主题研究');
  const previous = Object.getOwnPropertyDescriptor(globalThis, 'sessionStorage');
  Object.defineProperty(globalThis, 'sessionStorage', { configurable: true, get() { throw new Error('blocked'); } });
  try {
    assert.doesNotThrow(() => rememberObjectLabel('themes/example', '  新主题  '));
    assert.equal(objectLabel('themes/example'), '新主题');
  } finally {
    if (previous) Object.defineProperty(globalThis, 'sessionStorage', previous);
    else delete (globalThis as { sessionStorage?: Storage }).sessionStorage;
  }
});

test('同类对象并发补名复用一次 Wiki 列表请求', async () => {
  const original = globalThis.fetch;
  let count = 0;
  globalThis.fetch = async () => {
    count++;
    return new Response(JSON.stringify({ items: [{ slug: 'comparisons/example', title: '对比研究示例' }], total: 1 }), { status: 200, headers: { 'content-type': 'application/json' } });
  };
  try {
    await Promise.all([resolveObjectLabels(['comparisons/example']), resolveObjectLabels(['comparisons/example'])]);
    assert.equal(count, 1);
    assert.equal(objectLabel('comparisons/example'), '对比研究示例');
  } finally { globalThis.fetch = original; }
});

test('研究材料页面已下线，旧路径由通配路由重定向', () => {
  const source = readFileSync(new URL('../src/verticals/finance/router.tsx', import.meta.url), 'utf8');
  assert.doesNotMatch(source, /path: "\/my-research\/material"/);
  assert.match(source, /path: "\/my-research\/\*", element: <Navigate to="\/my-research" replace \/>/);
});
