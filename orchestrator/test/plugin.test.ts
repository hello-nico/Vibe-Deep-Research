import assert from "node:assert/strict";
import { test } from "node:test";
import { currentPlugin, registerPlugin, resetPlugin, type Plugin } from "../src/plugin.ts";
import { FINANCE_PLUGIN } from "../src/finance/plugin.ts";

const fresh = (over: Partial<Plugin> = {}) => { resetPlugin(); registerPlugin({ ...FINANCE_PLUGIN, ...over }); };

test("现用页面与台账配置保留；注册快照不随输入变化", () => {
  const input = { ...FINANCE_PLUGIN, evidence: { ...FINANCE_PLUGIN.evidence, markets: [...FINANCE_PLUGIN.evidence.markets] } };
  resetPlugin(); registerPlugin(input); registerPlugin(input);
  input.evidence.markets.push("BAD");
  assert.ok(!currentPlugin().evidence.markets.includes("BAD"));
  assert.ok(Object.isFrozen(currentPlugin().pageQueries));
  assert.ok(currentPlugin().ledger?.kinds.position);
  assert.throws(() => registerPlugin({ ...FINANCE_PLUGIN }), /已注册/);
});

test("退役阶段配置拒绝注册；未知字段和不完整页面不能被静默吞掉", () => {
  assert.throws(() => fresh({ stages: ["profile"] } as Partial<Plugin>), /契约/);
  assert.throws(() => fresh({ pageQueries: { broken: { title: "页", intent: "读数据", needsContext: true, blocks: [{ id: "one", title: "一", endpoint: "test", injectContext: true }] } } }), /映射/);
  assert.throws(() => fresh({ evidence: { ...FINANCE_PLUGIN.evidence, marketWideOnlyCodes: ["BAD"] } }), /市场代码/);
});

test("注册拒绝访问器、非 JSON 值、循环和原型污染；不执行配置 getter", () => {
  let reads = 0;
  const accessor = Object.defineProperty({}, "id", { enumerable: true, get() { reads++; return "x"; } });
  assert.throws(() => fresh({ pageQueries: accessor }), /getter/);
  assert.equal(reads, 0);
  for (const args of [new Date(), { value: undefined }, { value: Infinity }, JSON.parse('{"__proto__":{}}'), { items: Array(2) }]) {
    assert.throws(() => fresh({ pageQueries: { p: { title: "页", intent: "读数据", blocks: [{ id: "one", title: "一", endpoint: "test", args: args as Record<string, unknown> }] } } }));
  }
  const cycle: Record<string, unknown> = {}; cycle.self = cycle;
  assert.throws(() => fresh({ pageQueries: cycle as Plugin["pageQueries"] }), /循环/);
});

test("台账 schema 拒绝未知格式、路径种类名和信封字段覆盖", () => {
  const def = { label: "测试", properties: { date: { type: "string", format: "typo" } }, required: ["date"] };
  assert.throws(() => fresh({ ledger: { kinds: { test: def } } }), /format/);
  assert.throws(() => fresh({ ledger: { kinds: { "../escape": def } } }), /契约/);
  assert.throws(() => fresh({ ledger: { kinds: { test: { label: "测试", properties: { id: { type: "string" } }, required: [] } } } }), /信封/);
});
