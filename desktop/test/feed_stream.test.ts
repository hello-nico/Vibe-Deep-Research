import test from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { createServer as createHttpServer } from 'node:http';
import { createServer, type ViteDevServer } from 'vite';

let server: ViteDevServer;
let stream: any;
test.before(async () => {
  server = await createServer({ configFile: false, root: fileURLToPath(new URL('../', import.meta.url)),
    resolve: { alias: { '@': fileURLToPath(new URL('../src/verticals/finance', import.meta.url)) } },
    server: { middlewareMode: true, hmr: { server: createHttpServer() }, watch: null }, appType: 'custom' });
  stream = await server.ssrLoadModule('/src/verticals/finance/lib/feedStream.ts');
});
test.after(async () => { await server.close(); });

const price = { date: '2026-10-19', var_id: 'cmdty:SHFE.AL', name: '沪铝', unit: '元/吨', from: '23270', to: '22970', change: '-300', change_pct: '-0.013', rule: 'daily',
  companies: [{ symbol: '000807.SZ', name: '云铝股份', impact: '-627000000', pct_of_base: '0.057', neutral_price_delta: '-1.81' }] };
const recon = { symbol: '000933.SZ', company: '神火', period: '2026Q3', date: '2026-10-20', headline: '神火三季报：单季净利润 27.05 亿元，比上季多 2.14 亿元', explain: '沪铝变化约带来 +1.20 亿元', details: ['沪铝：本季均价'] };
const flip = { symbol: '000933.SZ', company: '神火', kind: 'crossed', text: '沪铝跌破 22,500 元/吨，神火估值从偏高变为明显高估' };
const filing = { symbol: '603799.SH', name: '华友钴业', title: '华友钴业：收购进展公告', when: '2026-10-26 09:30', url: 'https://example.com/a', industry: '能源金属' };

test('四类卡片结构一致：第一句、涉及、类型 · 日期，都有「讨论」与「看公司」', () => {
  const cards = [stream.priceStream(price), stream.reconStream(recon), stream.flipStream(flip, '2026-10-26'), stream.filingStream(filing)];
  assert.deepEqual(cards.map((card: any) => card.type), ['价格', '财报', '估值', '公告']);
  for (const card of cards) {
    assert.ok(card.title.length > 0 && card.discuss.question && card.discuss.title && card.companies.length === 1, card.type);
    assert.doesNotMatch(card.involved.map((piece: any) => piece.text).join(''), /^涉及：/, card.type);
  }
  assert.equal(cards[3].involved.map((piece: any) => piece.text).join(''), '华友钴业 · 能源金属', '公告只写公司与领域');
  assert.equal(cards[1].involved.map((piece: any) => piece.text).join(''), '神火 · 沪铝变化约带来 +1.20 亿元');
  assert.equal(stream.reconStream({ ...recon, explain: undefined }).involved[0].text, '神火');
  assert.equal(stream.filingStream({ ...filing, industry: '' }).involved[0].text, '华友钴业');
  assert.doesNotMatch(JSON.stringify(cards[3]), /支柱/);
});

test('排序与筛选：估值卡置顶；其余日期倒序；价格筛选时估值卡也在；公告只有公告', () => {
  const cards = [stream.priceStream(price), stream.filingStream(filing), stream.reconStream(recon), stream.flipStream(flip, '2026-10-26')];
  assert.deepEqual(stream.streamOf(cards, '全部').map((card: any) => card.type), ['估值', '公告', '财报', '价格']);
  assert.deepEqual(stream.streamOf(cards, '财报').map((card: any) => card.type), ['财报']);
  assert.deepEqual(stream.streamOf(cards, '价格').map((card: any) => card.type), ['估值', '价格']);
  assert.deepEqual(stream.streamOf(cards, '公告').map((card: any) => card.type), ['公告']);
});

test('「讨论」问句是自然问题，不提页面与系统机制', () => {
  for (const card of [stream.reconStream(recon), stream.flipStream(flip, '2026-10-26'), stream.filingStream(filing)])
    assert.doesNotMatch(card.discuss.question, /页面|卡片|动态|系统|数据包|凭据|接口/);
});

test('「全部」里同公司同日公告合并：非例行优先作第一句，底行「另有 N 份」，展开列其余标题与链接；「公告」筛选不合并', () => {
  const row = (patch: Record<string, unknown>) => ({ ...filing, ...patch });
  const rows = [
    row({ title: '例行：关于召开会议', routine: true, url: 'https://example.com/r' }),
    row({ title: '重要：收购进展', url: 'https://example.com/i' }),
    row({ title: '另一份：提示性公告', url: '' }),
    row({ symbol: '603799.SH', when: '2026-10-25 10:00', title: '前一天的公告' }),
    row({ symbol: '000933.SZ', name: '神火股份', title: '别家同日公告' }),
  ];
  const merged = stream.filingStreams(rows, true);
  assert.equal(merged.length, 3, '同公司同日 3 份合成 1 张，另一天与另一家各自一张');
  assert.equal(merged[0].title[0].text, '重要：收购进展', '最重要（非例行）的一份作第一句');
  assert.deepEqual(merged[0].extra.map((item: any) => item.title), ['例行：关于召开会议', '另一份：提示性公告']);
  assert.equal(merged[0].extra[0].url, 'https://example.com/r');
  assert.equal(merged[0].extra[1].url, undefined);
  assert.equal(merged[1].extra, undefined, '单份不带 extra');
  assert.equal(stream.filingStreams(rows, false).length, 5, '公告筛选不合并');
  assert.equal(stream.filingStreams(rows.slice(0, 1), true)[0].title[0].text, '例行：关于召开会议', '全是例行时取第一份');
});
