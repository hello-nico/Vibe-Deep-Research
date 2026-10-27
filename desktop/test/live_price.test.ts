import test from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { createServer as createHttpServer } from 'node:http';
import { createServer, type ViteDevServer } from 'vite';

type SensitivityModel = never;
type TrackedVariable = Record<string, unknown> & { var_id: string };
let server: ViteDevServer;
let verdictLine: (args: Record<string, unknown>) => { implied: string; flip: string };
let livePriceOf: (variable: unknown) => { value: number; when: string } | null;
let loadLivePrice: (symbol: string, varId: string, read: never) => Promise<{ value: number; when: string } | null>;
test.before(async () => {
  server = await createServer({ configFile: false, root: fileURLToPath(new URL('../', import.meta.url)),
    server: { middlewareMode: true, hmr: { server: createHttpServer() }, watch: null }, appType: 'custom' });
  ({ verdictLine } = await server.ssrLoadModule('/src/verticals/finance/lib/companyNarrative.ts') as never);
  ({ livePriceOf, loadLivePrice } = await server.ssrLoadModule('/src/verticals/finance/lib/trackingVariables.ts') as never);
});
test.after(async () => { await server.close(); });

const al = { id: 'cmdty:SHFE.AL', name: '沪铝', unit: '元/吨', current: 22970, coef: 1, min: 18000, max: 28000, step: 10, anchor: 24000, anchorLabel: '对比期均价' };
const model = { baseProfit: 1, shares: 1, variables: [al], ruleOfThumb: [], tiers: [], flips: [], implied: { id: al.id, value: 23258 } } as unknown as SensitivityModel;
const tracked = (patch: Partial<TrackedVariable>): TrackedVariable => ({ var_id: al.id, name: '沪铝', tier: 'market_daily', status: 'ok', companies: [], last_date: '2026-10-23', latest: '23350', ...patch });

test('现在取最近收盘并标时点；有盘中报价用盘中；日收盘兜底不算盘中', () => {
  assert.deepEqual(livePriceOf(tracked({})), { value: 23350, when: '10-23 收盘' });
  assert.deepEqual(livePriceOf(tracked({ intraday: { price: '23480', as_of: '2026-10-26T14:05:00+08:00', source: 'sina', session: 'day' } })), { value: 23480, when: '10-26 14:05 盘中' });
  assert.deepEqual(livePriceOf(tracked({ intraday: { price: '23350', as_of: '2026-10-23', source: 'daily_close', stale: true, session: 'closed' } })), { value: 23350, when: '10-23 收盘' });
  assert.equal(livePriceOf(tracked({ status: 'gap', latest: null })), null);
  assert.equal(livePriceOf(undefined), null);
});

test('页首：有最新价写「现在 … ，时点」，没有写「研究时」，隐含值不变', () => {
  const live = verdictLine({ grade: '偏高', model, live: { value: 23350, when: '10-23 收盘' } });
  assert.equal(live.implied, '按现在的股价，大致对应 沪铝约 23,258 元/吨（现在 23,350 元/吨，10-23 收盘）');
  assert.equal(verdictLine({ grade: '偏高', model, live: null }).implied, '按现在的股价，大致对应 沪铝约 23,258 元/吨（研究时 22,970 元/吨）');
});

test('跳档价的远近以最新价为准', () => {
  const flipping = { ...model, flips: [{ id: al.id, value: 24000, grade: '合理', invalid: false }] } as unknown as SensitivityModel;
  assert.equal(verdictLine({ grade: '偏高', model: flipping }).flip, '', '研究时的价离跳档价 离跳档价 4.5%，超出 3% 不提示');
  const near = verdictLine({ grade: '偏高', model: flipping, live: { value: 23350, when: '10-23 收盘' } });
  assert.match(near.flip, /^涨过 24,000 元\/吨/);
});

test('百分比变量不用最新价', () => {
  const pct = { ...al, id: 'x', unit: '%', current: 0, step: 1 };
  const m = { ...model, variables: [pct], implied: { id: 'x', value: 3 } } as unknown as SensitivityModel;
  assert.equal(verdictLine({ grade: '偏高', model: m, live: { value: 9, when: '10-23 收盘' } }).implied, '按现在的股价，大致对应沪铝比对比期高约 3.0%');
});

test('loadLivePrice 读跟踪接口取指定变量；读失败或没有该变量为 null', async () => {
  const routes: string[] = [];
  const read = (async (route: string) => { routes.push(route); return { variables: [tracked({}), tracked({ var_id: 'other', latest: '1' })] }; }) as <T>(route: string) => Promise<T>;
  assert.deepEqual(await loadLivePrice('000933.SZ', al.id, read as never), { value: 23350, when: '10-23 收盘' });
  assert.deepEqual(routes, ['/tracking/variables?symbols=000933.SZ']);
  assert.deepEqual(await loadLivePrice('000933', al.id, read as never), { value: 23350, when: '10-23 收盘' }, '不带后缀也行');
  assert.equal(await loadLivePrice('000933.SZ', 'none', read as never), null);
  assert.equal(await loadLivePrice('000933.SZ', al.id, (async () => { throw new Error('x'); }) as never), null);
});
