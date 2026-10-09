import assert from "node:assert/strict";
import test from "node:test";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { dshLaunchArgs } from "../dsh-dev.ts";
import { DSH_RUNTIME_ENV_KEYS, pickEnv } from "../../orchestrator/src/config.ts";

const runtime = "/fixture/runtime", overlay = "/fixture/home/finance-runtime.patch.yml";
const target = "http://127.0.0.1:5941", origin = "http://127.0.0.1:5930";
// 修订前 spawn 的参数快照；不调用读取个人配置的 resolveDshPaths。
const original = ["/fixture/runtime/node_modules/@deepseek-ai/dsh/lib/bin.js",
  "--profile", "web", "--patch", overlay, "--no-open", "--port", "5941", "--trusted-host", "127.0.0.1:5930"];

test("实验开关未设置时启动参数逐字保持原样", () => {
  const prior = process.env.VRA_DSH_EXPERIMENT_PATCH;
  delete process.env.VRA_DSH_EXPERIMENT_PATCH;
  try { assert.deepEqual(dshLaunchArgs(runtime, overlay, target, origin), original); }
  finally {
    if (prior === undefined) delete process.env.VRA_DSH_EXPERIMENT_PATCH;
    else process.env.VRA_DSH_EXPERIMENT_PATCH = prior;
  }
});

test("有效实验文件只在固定叠加层之后追加一次 patch", () => {
  const dir = mkdtempSync(path.join(tmpdir(), "vibe-dsh-experiment-"));
  const patch = path.join(dir, "experiment.patch.yml");
  writeFileSync(patch, "[]\n");
  const prior = process.env.VRA_DSH_EXPERIMENT_PATCH;
  process.env.VRA_DSH_EXPERIMENT_PATCH = patch;
  try {
    assert.deepEqual(dshLaunchArgs(runtime, overlay, target, origin),
      [...original.slice(0, 5), "--patch", patch, ...original.slice(5)]);
  } finally {
    if (prior === undefined) delete process.env.VRA_DSH_EXPERIMENT_PATCH;
    else process.env.VRA_DSH_EXPERIMENT_PATCH = prior;
  }
});

test("不存在、相对路径、空路径或目录拒绝启动", () => {
  const dir = mkdtempSync(path.join(tmpdir(), "vibe-dsh-invalid-"));
  for (const patch of ["experiment.patch.yml", ""]) {
    assert.throws(() => dshLaunchArgs(runtime, overlay, target, origin, patch), /必须.*绝对路径/);
  }
  for (const patch of [path.join(dir, "missing.yml"), dir]) {
    assert.throws(() => dshLaunchArgs(runtime, overlay, target, origin, patch), /必须.*已存在的文件/);
  }
});

test("实验开关不进入 DSH 环境白名单或子进程环境", () => {
  assert.ok(!DSH_RUNTIME_ENV_KEYS.includes("VRA_DSH_EXPERIMENT_PATCH"));
  const env = pickEnv(DSH_RUNTIME_ENV_KEYS, { DSH_HOME: "/fixture/home" }, {
    PATH: "/fixture/bin", VRA_DSH_EXPERIMENT_PATCH: "/fixture/experiment.patch.yml",
  });
  assert.equal(env.PATH, "/fixture/bin");
  assert.equal(env.DSH_HOME, "/fixture/home");
  assert.equal(Object.hasOwn(env, "VRA_DSH_EXPERIMENT_PATCH"), false);
});
