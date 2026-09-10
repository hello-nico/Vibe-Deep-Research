import assert from 'node:assert/strict';
import test from 'node:test';
import { createServer } from 'vite';
import { createServer as createHttpServer } from 'node:http';
import { fileURLToPath } from 'node:url';

test('财务估值数字截断两位小数且不四舍五入，API 来源收成可回读快照', async () => {
  const server = await createServer({ configFile: false, root: fileURLToPath(new URL('../', import.meta.url)), server: { middlewareMode: true, hmr: { server: createHttpServer() }, watch: null }, appType: 'custom' });
  try {
    const { truncateDecimal, formatFactValue, providerSnapshot, factLabel } = await server.ssrLoadModule('/src/verticals/finance/lib/wikiFacts.ts');
    assert.equal(truncateDecimal(9.298393), '9.29');
    assert.equal(truncateDecimal(8.283194), '8.28');
    assert.equal(truncateDecimal(0.446576), '0.44');
    assert.equal(truncateDecimal(144.1), '144.10');
    assert.equal(formatFactValue({ value: 9.298393, unit: '倍' }), '9.29 倍');
    assert.equal(formatFactValue({ value: '34502809176.39', unit: '元' }), '345.02 亿元');
    assert.equal(factLabel({ metric: 'pe_ttm', period: 'TTM' }), 'TTM 市盈率（TTM）');
    const snapshot = providerSnapshot({
      source: 'provider', provider: 'hithink', observed_at: '2026-08-19T00:00:00+08:00', stale: true,
    });
    assert.match(snapshot, /来源：扶摇/);
    assert.match(snapshot, /数据截至：2026-08-19 00:00:00/);
    assert.match(snapshot, /本次未更新，保留原值/);
    assert.equal(providerSnapshot({ source: 'claim', ref: 'claim:1' }), '');
  } finally { await server.close(); }
});
