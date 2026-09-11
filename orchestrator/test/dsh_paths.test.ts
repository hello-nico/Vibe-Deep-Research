import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";
import { resolveDshPaths, prepareDshPaths, readResearchConfig, researchRuntimeEnv } from "../src/dsh_paths.ts";

test("DSH path precedence and explicit configuration errors", t => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "vibe-dsh-paths-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  assert.equal(resolveDshPaths(root, {}).workspace, path.resolve(root, "../Stock-Research/workspace"));
  fs.writeFileSync(path.join(root, "dsh.config.json"), JSON.stringify({ workspace: "configured", home: "state" }));
  assert.equal(resolveDshPaths(root, {}).workspace, path.join(root, "configured"));
  assert.equal(resolveDshPaths(root, { VRA_DSH_WORKSPACE: "override" }).workspace, path.join(root, "override"));
  assert.throws(() => resolveDshPaths(root, { VRA_DSH_CONFIG: "missing.json" }), /不存在/);
  assert.throws(() => resolveDshPaths(root, { VRA_DSH_WORKSPACE: "" }), /无效/);
});

test("DSH state and workspace cannot overlap, including symlink aliases", t => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "vibe-dsh-separate-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const home = path.join(root, "state");
  assert.throws(() => prepareDshPaths({ home, workspace: home, runtime: root }), /不能相同/);
  assert.throws(() => prepareDshPaths({ home, workspace: path.join(home, "work"), runtime: root }), /互相包含/);
  fs.mkdirSync(home);
  const alias = path.join(root, "alias");
  fs.symlinkSync(home, alias);
  assert.throws(() => prepareDshPaths({ home, workspace: alias, runtime: root }), /不能相同/);
});

test("researchRuntimeEnv injects hook into the child process env only", t => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "vibe-dsh-hook-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const research = path.join(root, "Stock-Research");
  fs.mkdirSync(research);
  fs.writeFileSync(path.join(research, ".env"), [
    "STOCK_RESEARCH_PI_GBRAIN_DATABASE_URL=postgresql://stock@127.0.0.1:5432/gbrain",
    "STOCK_RESEARCH_BACKEND_URL=http://127.0.0.1:8700/api/v1",
    "STOCK_RESEARCH_HOOK_TOKEN=host-hook-secret",
  ].join("\n"));
  const env = { VRA_RESEARCH_REPO: research, VRA_DSH_WORKSPACE: path.join(root, "work") };
  const paths = resolveDshPaths(root, env);
  const runtime = researchRuntimeEnv(paths, env);
  assert.equal(runtime.STOCK_RESEARCH_HOOK_TOKEN, "host-hook-secret");
  assert.equal(runtime.STOCK_RESEARCH_ACCUMULATE, "1");
  assert.equal(readResearchConfig(research, {}).STOCK_RESEARCH_HOOK_TOKEN, undefined);
  const unauthorized = researchRuntimeEnv(paths, { ...env, STOCK_RESEARCH_HOOK_TOKEN: "" });
  assert.equal(unauthorized.STOCK_RESEARCH_HOOK_TOKEN, undefined);
  assert.equal(unauthorized.STOCK_RESEARCH_ACCUMULATE, "1");
});
