import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { fetchArgv,loadRegistry } from "../src/registry.ts";


import "../src/finance/register.ts"; // 测试文件也是入口:插件要先注册
const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");

test("用户端点目录与当前注册表逐项一致，不只验证标题数字", () => {
  const reg = loadRegistry(REPO)!;
  const catalog = fs.readFileSync(path.join(REPO, "datasources/CATALOG.md"), "utf8");
  assert.ok(catalog.includes(`共 ${reg.endpoints.length} 个`));
  const ids = [...catalog.matchAll(/^\| `([^`]+)` \|/gm)].map(match => match[1]);
  assert.deepEqual(ids.sort(), reg.endpoints.map(endpoint => endpoint.id).sort());
});

test("fetchArgv:legacy 走脚本自身;其余走 fetch_endpoint.py;symbol_kind=none 不传 --symbol", () => {
  const o = { scriptsDir: "/s", symbol: "300308", runDir: "/r" };
  assert.deepEqual(fetchArgv({ id: "fetch_quote", module: "legacy", function: "fetch_quote.py", market: ["CN"] }, "fetch_quote", o), ["/s/fetch_quote.py", "--symbol", "300308", "--out-dir", "/r"]);
  assert.deepEqual(fetchArgv(undefined, "fetch_quote", o), ["/s/fetch_quote.py", "--symbol", "300308", "--out-dir", "/r"]);
  assert.deepEqual(fetchArgv({ id: "em_reports", module: "eastmoney", function: "eastmoney_reports", market: ["CN"], symbol_kind: "cn6" }, "em_reports", o), ["/s/fetch_endpoint.py", "--endpoint", "em_reports", "--out-dir", "/r", "--symbol", "300308"]);
  assert.deepEqual(fetchArgv({ id: "em_hot_rank", module: "eastmoney", function: "em_hot_rank", market: ["CN"], symbol_kind: "none" }, "em_hot_rank", o), ["/s/fetch_endpoint.py", "--endpoint", "em_hot_rank", "--out-dir", "/r"]);
});
