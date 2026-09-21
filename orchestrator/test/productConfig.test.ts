import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";

import { DEFAULT_PRODUCT_CONFIG,PRODUCT_CONFIG_FILE,loadProductConfig } from "../src/productConfig.ts";


import "../src/finance/register.ts"; // 测试文件也是入口:插件要先注册
function tmpRepo(): string { return fs.mkdtempSync(path.join(os.tmpdir(), "vra-pc-")); }

test("产品配置:无文件 → 内置默认;相对路径相对产品根解析", () => {
  const repo = tmpRepo();
  const pc = loadProductConfig(repo, { env: {} });
  assert.deepEqual(pc.sources, ["builtin"]);
  assert.equal(pc.resolved.dataRoot, path.join(repo, ".local"));
  assert.equal(pc.resolved.constitution, path.join(repo, "AGENTS.md"));
  assert.equal(pc.resolved.skills, path.join(repo, ".agents", "skills"));
  assert.equal(pc.resolved.calcCli, path.join(repo, "calc", "cli.py"));
  assert.equal(pc.resolved.scriptsRel, path.join(".agents", "skills", "data-access", "scripts"));
  assert.equal(pc.python, DEFAULT_PRODUCT_CONFIG.python);
  assert.deepEqual(Object.keys(pc), ["python", "paths", "resolved", "sources"], "配置里不允许再出现 provider / 引擎字段");
});

test("产品配置:产品文件 ← 用户文件 ← 环境变量 逐层覆盖;schema 校验拒绝未知字段与非法值", () => {
  const repo = tmpRepo();
  fs.writeFileSync(path.join(repo, PRODUCT_CONFIG_FILE), JSON.stringify({ defaults: { max_retries: 1 }, paths: { data_root: "data" } }));
  fs.mkdirSync(path.join(repo, "data"), { recursive: true });
  // 模型接入归 DSH 配置入口:provider 字段读到即剥除,不报错、不生效
  fs.writeFileSync(path.join(repo, "data", "config.json"), JSON.stringify({ provider: { name: "deepseek", auth: "api_key", env_key: "DEEPSEEK_API_KEY" } }));
  let pc = loadProductConfig(repo, { env: {} });
  assert.equal(pc.resolved.dataRoot, path.join(repo, "data"));
  assert.ok(pc.sources.includes(path.join(repo, "data", "config.json")));
  // python:用户层配置 + VRA_PYTHON 环境变量覆盖
  fs.writeFileSync(path.join(repo, "data", "config.json"), JSON.stringify({ python: "/v/bin/python" }));
  pc = loadProductConfig(repo, { env: {} });
  assert.equal(pc.python, "/v/bin/python");
  pc = loadProductConfig(repo, { env: { VRA_PYTHON: "/w/python" } });
  assert.equal(pc.python, "/w/python");
  assert.ok(pc.sources.includes("env"));
  // 用户层不得改 data_root
  fs.writeFileSync(path.join(repo, "data", "config.json"), JSON.stringify({ paths: { data_root: "elsewhere" } }));
  assert.throws(() => loadProductConfig(repo, { env: {} }), /不得修改 paths.data_root/);
  // 未知字段 / 坏 JSON
  fs.writeFileSync(path.join(repo, "data", "config.json"), JSON.stringify({ python: "x", unknown: true }));
  assert.throws(() => loadProductConfig(repo, { env: {} }), /schema/);
  fs.writeFileSync(path.join(repo, "data", "config.json"), "{oops");
  assert.throws(() => loadProductConfig(repo, { env: {} }), /JSON/);
});

/* ===== 数据根:代码与用户数据分离 ===== */

test("VRA_DATA_ROOT 改数据根 —— 用户配置 / 产物必须同时跟着走", () => {
  const repo = tmpRepo();
  const data = tmpRepo();                        // 一个与产品根完全无关的位置
  // 用户配置放在**新数据根**下:能读到它,才证明"读配置的根"确实换了
  fs.writeFileSync(path.join(data, "config.json"), JSON.stringify({ python: "/data/bin/python" }));

  const pc = loadProductConfig(repo, { env: { VRA_DATA_ROOT: data } });

  assert.equal(pc.resolved.dataRoot, data, "产物根没跟着换 —— 会继续往旧代码目录写");
  assert.equal(pc.python, "/data/bin/python", "没读到新数据根下的用户配置 —— 说明读配置的根还是旧的");
  assert.ok(pc.sources.some((s) => s.startsWith(data)), `用户配置来源应指向新数据根:${pc.sources.join(" / ")}`);
});

test("调用方显式 override 优先于 VRA_DATA_ROOT", () => {
  const repo = tmpRepo();
  const viaEnv = tmpRepo();
  const viaOpt = tmpRepo();
  const pc = loadProductConfig(repo, { env: { VRA_DATA_ROOT: viaEnv }, dataRootOverride: viaOpt });
  assert.equal(pc.resolved.dataRoot, viaOpt, "显式 override 应当赢过环境变量");
});
