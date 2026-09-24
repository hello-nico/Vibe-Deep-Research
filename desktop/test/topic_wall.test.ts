import assert from 'node:assert/strict';
import test from 'node:test';
import { loadFinanceModule } from './load_finance_module.ts';
import { researchRoute } from '../dsh/finance-ui/research.mjs';

const model = await loadFinanceModule<typeof import('../src/verticals/finance/components/topic-wall/model.ts')>('components/topic-wall/model.ts');

test('墙排布按对象身份确定，研究对象居中，资料记录在左，其他对象在右', () => {
  const nodes = [
    { ref: 'companies/600900-sh', kind: 'company', origins: ['subject'] },
    { ref: 'document:' + 'a'.repeat(32), kind: 'document', origins: ['basis'] },
    { ref: 'companies/000883-sz', kind: 'company', origins: ['relation'] },
  ];
  assert.deepEqual(model.layoutWall(nodes), model.layoutWall([...nodes].reverse()));
  const points = model.layoutWall(nodes, 1100);
  assert.equal(points[nodes[1]!.ref]?.x, 40);
  assert.equal(points[nodes[0]!.ref]?.x, 450);
  assert.equal(points[nodes[2]!.ref]?.x, 860);
  // the left column starts below the judgment note in the top-left corner
  assert.ok(points[nodes[1]!.ref]!.y >= model.NOTE.y + model.NOTE.h);
  assert.equal(model.layoutWall(nodes, 1400)[nodes[0]!.ref]?.x, 600); // centre follows the canvas width
  const edge = model.boxEdge({ x: 0, y: 32 }, { x: 300, y: 32 });
  assert.equal(edge.x, 300 - model.NODE_W / 2 - 4); // lines stop at the card edge, not under it
});

test('四类连线的样式和判断后的变化标记各自分明', () => {
  assert.equal(model.wallLineStyle('hard').marker, true);
  assert.match(model.wallLineStyle('link').stroke, /--primary/);
  assert.ok(model.wallLineStyle('hypothesis').dash);
  assert.equal(model.wallLineStyle('basis').marker, true);
  const changed = model.changedBasisRefs({ topic_id: 'topic:aaaaaaaaaaaa', revision: 1, judged_at: null, baseline: true, pinned_refs: 0, pages: [
    { ref: 'page:companies/600900-sh@old', slug: 'companies/600900-sh', pinned: 'old', current: 'new', status: 'changed', summary: { research: 1, data: 0, timeline: 0 } },
    { ref: 'page:companies/000883-sz@old', slug: 'companies/000883-sz', pinned: 'old', current: 'old', status: 'unchanged', summary: null },
  ] });
  assert.deepEqual([...changed], ['companies/600900-sh']);
});

test('假设说明校验、无序端点去重及待确认升格提案按假设 ID 匹配', () => {
  const edge = { edge_id: 'link:111111111111', kind: 'hypothesis' as const, from: 'companies/a', to: 'companies/b', label: '可能相关', basis: [] };
  assert.match(model.validateHypothesis('', 'companies/a', 'companies/b', []), /1–200/);
  assert.match(model.validateHypothesis('说明', 'companies/a', 'companies/a', []), /不同/);
  assert.match(model.validateHypothesis('说明', 'companies/b', 'companies/a', [edge]), /已有假设/);
  assert.equal(model.validateHypothesis('说明', 'companies/a', 'companies/b', []), null);
  const proposals = [
    { proposal_id: 'proposal:old', target_id: edge.to, reason: '旧提案', status: 'confirmed', hypothesis_id: edge.edge_id },
    { proposal_id: 'proposal:new', target_id: edge.to, reason: '已核对依据', status: 'pending', hypothesis_id: edge.edge_id },
  ];
  assert.equal(model.hypothesisProposal(proposals, edge.edge_id)?.proposal_id, 'proposal:new');
  assert.equal(model.hypothesisProposal(proposals, 'link:other'), undefined);
});

test('本机布局存储失败时回退自动排布，清除失败也不阻断', () => {
  const previous = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
  Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: {
    getItem() { throw new Error('denied'); }, setItem() { throw new Error('denied'); }, removeItem() { throw new Error('denied'); },
  } });
  try {
    assert.deepEqual(model.readWallPositions('topic:aaaaaaaaaaaa'), {});
    assert.doesNotThrow(() => model.writeWallPositions('topic:aaaaaaaaaaaa', { one: { x: 2, y: 3 } }));
    assert.doesNotThrow(() => model.clearWallPositions('topic:aaaaaaaaaaaa'));
  } finally { if (previous) Object.defineProperty(globalThis, 'localStorage', previous); else delete (globalThis as { localStorage?: Storage }).localStorage; }
});

test('代理只放行依据变化和差异读取，不放行写操作', () => {
  assert.equal(researchRoute('GET', '/wiki/research-topics/topic:24ff5def6bf2/basis-changes'), true);
  assert.equal(researchRoute('GET', '/wiki/pages/diff'), true);
  assert.equal(researchRoute('POST', '/wiki/research-topics/topic:24ff5def6bf2/basis-changes'), false);
  assert.equal(researchRoute('POST', '/wiki/pages/diff'), false);
});
