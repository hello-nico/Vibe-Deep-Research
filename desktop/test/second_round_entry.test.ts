import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const client = readFileSync(new URL('../src/verticals/finance/dsh/client.tsx', import.meta.url), 'utf8');

test('产品启动通过 DSH locale 服务选内建中文', () => {
  assert.match(client, /"locale"/);
  assert.match(client, /client\.locale\.getLocale\(\)\.active !== 'zh'\) client\.locale\.setLocale\('zh'\)/);
});

test('议题新会话建好即展示开场，不向模型发送继续研究提示', () => {
  const topic = readFileSync(new URL('../src/verticals/finance/pages/TopicWorkspace.tsx', import.meta.url), 'utf8');
  assert.match(topic, /\.\.\.\(fresh \? \{\} : \{ prompt: prompt\(\) \}\)/);
  assert.match(client, /input\.onSessionReady\?\.\(id\);\s*if \(input\.fresh\) return id;\s*await withSession\(id/);
});

test('公司研究页的所属行业复用对象登记层入口', () => {
  const reader = readFileSync(new URL('../src/verticals/finance/components/ResearchKnowledge.tsx', import.meta.url), 'utf8');
  assert.match(reader, /key === 'industry' \? <CompanyIndustryLink page=\{page\}>/);
});
