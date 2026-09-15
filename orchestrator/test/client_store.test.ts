import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, test } from "node:test";

import {
  addResearchSymbol,
  addWatch,
  closeClientStores,
  listPrefs,
  listResearchRoster,
  listWatch,
  removeResearchSymbol,
  removeWatch,
  setPref,
} from "../src/client_store.ts";

afterEach(() => closeClientStores());

function dataRoot(): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "vibe-client-"));
  return root;
}

test("自选按对象增删且唯一，旧 watch.json 只迁一次", () => {
  const root = dataRoot();
  fs.mkdirSync(path.join(root, "ledger"));
  fs.writeFileSync(path.join(root, "ledger", "watch.json"), JSON.stringify({
    kind: "watch",
    records: [
      { id: "watch-1", symbol: "600519", created_at: "2026-01-01T00:00:00Z" },
      { id: "watch-2", symbol: "AAPL", created_at: "2026-01-02T00:00:00Z" },
      { id: "watch-3", symbol: "00700.HK", created_at: "2026-01-03T00:00:00Z" },
    ],
  }));
  const ctx = { dataRoot: root };
  assert.deepEqual(listWatch(ctx).symbols, ["600519", "AAPL", "00700.HK"]);
  assert.equal(addWatch(ctx, "600519").added, false);
  assert.equal(addWatch(ctx, "300750").added, true);
  const concurrent = addWatch(ctx, "300750");
  assert.equal(concurrent.added, false);
  assert.ok(concurrent.symbols.includes("300750"));
  const afterRemove = removeWatch(ctx, "AAPL");
  assert.equal(afterRemove.removed, true);
  assert.deepEqual(afterRemove.symbols, ["600519", "00700.HK", "300750"]);
  closeClientStores();
  assert.ok(fs.existsSync(path.join(root, "client", "choices.sqlite")));
  assert.deepEqual(listWatch(ctx).symbols, ["600519", "00700.HK", "300750"]);
});

test("研究名单默认空开始，不从自选回填", () => {
  const ctx = { dataRoot: dataRoot() };
  addWatch(ctx, "600519");
  assert.deepEqual(listResearchRoster(ctx).symbols, []);
  assert.equal(addResearchSymbol(ctx, "600519").added, true);
  assert.deepEqual(listResearchRoster(ctx).symbols, ["600519"]);
  removeWatch(ctx, "600519");
  assert.deepEqual(listResearchRoster(ctx).symbols, ["600519"]);
  assert.equal(removeResearchSymbol(ctx, "600519").removed, true);
  assert.deepEqual(listResearchRoster(ctx).symbols, []);
});

test("只持久化白名单偏好键", () => {
  const ctx = { dataRoot: dataRoot() };
  setPref(ctx, "vr-theme", "light");
  setPref(ctx, "vr-sidebar", "collapsed");
  assert.deepEqual(listPrefs(ctx), { "vr-theme": "light", "vr-sidebar": "collapsed" });
  assert.throws(() => setPref(ctx, "vr-llm", "secret"), /不是可持久化/);
});
