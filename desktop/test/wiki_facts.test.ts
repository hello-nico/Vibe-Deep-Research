import assert from 'node:assert/strict';
import test from 'node:test';
import { createServer } from 'vite';
import { createServer as createHttpServer } from 'node:http';
import { fileURLToPath } from 'node:url';

test('财务估值数字截断两位小数且不四舍五入，API 来源收成可回读快照', async () => {
  const server = await createServer({ configFile: false, root: fileURLToPath(new URL('../', import.meta.url)), server: { middlewareMode: true, hmr: { server: createHttpServer() }, watch: null }, appType: 'custom' });
  try {
    const { truncateDecimal, formatFactValue, providerSnapshot, providerDisclosure, factLabel } = await server.ssrLoadModule('/src/verticals/finance/lib/wikiFacts.ts');
    assert.equal(truncateDecimal(9.298393), '9.29');
    assert.equal(truncateDecimal(8.283194), '8.28');
    assert.equal(truncateDecimal(0.446576), '0.44');
    assert.equal(truncateDecimal(144.1), '144.10');
    assert.equal(formatFactValue({ value: 9.298393, unit: '倍' }), '9.29 倍');
    assert.equal(formatFactValue({ value: '34502809176.39', unit: '元' }), '345.02 亿元');
    assert.equal(factLabel({ metric: 'pe_ttm', period: 'TTM' }), 'TTM 市盈率（TTM）');
    const hithink = providerDisclosure({
      source: 'provider', provider: 'hithink', metric: 'pe_ttm', period: 'TTM', unit: '倍',
      observed_at: '2026-09-10T19:44:20+08:00', stale: true,
      ref: 'provider:hithink:600011.SH:pe_ttm:2026-09-10T19:44:20+08:00',
    });
    assert.equal(hithink.name, '扶摇');
    assert.match(hithink.summary, /同花顺扶摇/);
    assert.equal(hithink.endpoint, 'https://fuyao.aicubes.cn/api/a-share/valuations/snapshot?thscodes=600011.SH');
    assert.match(hithink.docs, /valuations/);
    assert.equal(hithink.symbol, '600011.SH');
    const snapshot = providerSnapshot({
      source: 'provider', provider: 'hithink', metric: 'pe_ttm', period: 'TTM', unit: '倍',
      observed_at: '2026-08-19T00:00:00+08:00', stale: true,
      ref: 'provider:hithink:600011.SH:pe_ttm:2026-08-19T00:00:00+08:00',
    });
    assert.match(snapshot, /\*\*扶摇\*\*/);
    assert.match(snapshot, /接口：`GET https:\/\/fuyao\.aicubes\.cn\/api\/a-share\/valuations\/snapshot\?thscodes=600011\.SH`/);
    assert.match(snapshot, /数据截至：2026-08-19 00:00:00/);
    assert.match(snapshot, /本次未更新，保留原值/);
    const sina = providerDisclosure({
      source: 'provider', provider: 'sina', metric: 'revenue', period: '2025-12-31 年初至今', unit: '元',
      observed_at: '2026-03-25T00:00:00+08:00',
    });
    assert.equal(sina.name, '新浪财经');
    assert.match(sina.endpoint, /CompanyFinanceService\.getFinanceReport2022/);
    const tencent = providerDisclosure({
      source: 'provider', provider: 'tencent', metric: 'pb', period: '最新披露净资产', unit: '倍',
      ref: 'provider:tencent:600900.SH:pb:2026-09-10T15:00:00+08:00',
    });
    assert.equal(tencent.endpoint, 'https://qt.gtimg.cn/q=sh600900');
    const unknown = providerDisclosure({ source: 'provider', provider: 'other', metric: 'pe_ttm' });
    assert.equal(unknown.endpoint, undefined);
    assert.match(unknown.summary, /未登记/);
    assert.equal(providerSnapshot({ source: 'claim', ref: 'claim:1' }), '');
  } finally { await server.close(); }
});
