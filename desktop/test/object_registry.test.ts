import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { loadFinanceModule } from './load_finance_module.ts';

const { objectHref, objectLabel, registeredObject, resolveObjectLabels, rememberObjectLabel, loadReadyIndustryProfiles, readableRelatedWikiRefs } = await loadFinanceModule<typeof import('../src/verticals/finance/lib/objectRegistry.ts') & { rememberObjectLabel: (ref: string, label: string) => void }>('lib/objectRegistry.ts');

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

test('申万旧页仅在产业研究已就绪时映射到主页', async () => {
  const original = globalThis.fetch;
  assert.equal(objectHref('industries/801161-si'), undefined);
  assert.equal(objectLabel('industries/801161-si'), '产业研究');
  globalThis.fetch = async () => new Response(JSON.stringify({ items: [
    { industry_code: '801161.SI', industry_name: '电力', status: 'ready' },
    { industry_code: '801162.SI', industry_name: '电网', status: 'building' },
  ] }), { status: 200, headers: { 'content-type': 'application/json' } });
  try {
    await loadReadyIndustryProfiles();
    assert.equal(objectHref('industries/801161-si'), '/sectors/profiles/801161.SI');
    assert.equal(objectHref('industries/801162-si'), undefined);
  } finally { globalThis.fetch = original; }
});

test('相关材料仅保留 Backend 可读页清单中的 slug', async () => {
  const original = globalThis.fetch;
  globalThis.fetch = async input => {
    const url = String(input);
    assert.match(url, /kind=themes/);
    return new Response(JSON.stringify({ items: [{ slug: 'themes/readable', title: '可读主题' }], total: 1 }), { status: 200, headers: { 'content-type': 'application/json' } });
  };
  try {
    const readable = await readableRelatedWikiRefs(['themes/readable', 'themes/unreadable']);
    assert.deepEqual([...readable], ['themes/readable']);
  } finally { globalThis.fetch = original; }
});

test('阅读器不保留站内材料栈，链接由对象登记层跳转', () => {
  const source = readFileSync(new URL('../src/verticals/finance/components/ResearchKnowledge.tsx', import.meta.url), 'utf8');
  assert.doesNotMatch(source, /setTrail|useSearchParams|params\.set\('reader'\)|返回上一份材料/);
  assert.match(source, /openRegisteredObject\(item\.slug\)/);
  const report = readFileSync(new URL('../src/verticals/finance/components/WikiReport.tsx', import.meta.url), 'utf8');
  assert.match(report, /openRegisteredObject\(link\.to\)/);
});
