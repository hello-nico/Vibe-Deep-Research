import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";
import { resolveDshPaths, prepareDshPaths } from "../src/dsh_paths.ts";

test("DSH path precedence and explicit configuration errors", t => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "vibe-dsh-paths-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  assert.equal(resolveDshPaths(root, {}).workspace, path.join(root, ".local/dsh-workspace"));
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
