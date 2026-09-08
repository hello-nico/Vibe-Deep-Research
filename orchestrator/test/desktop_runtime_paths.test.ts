import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";
import { desktopRuntimePaths } from "../src/desktop_runtime_paths.ts";

test("desktop identities never share their runtime stores", (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "vdr-identity-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const original = desktopRuntimePaths(path.join(root, "original"));
  fs.writeFileSync(path.join(original.codexHome, "sentinel"), "original");
  const isolated = desktopRuntimePaths(path.join(root, "test"));
  for (const directory of Object.values(isolated)) {
    assert.equal(fs.statSync(directory).mode & 0o777, 0o700);
    assert.deepEqual(fs.readdirSync(directory), []);
    assert.ok(directory.startsWith(path.join(root, "test") + path.sep));
  }
  assert.equal(fs.readFileSync(path.join(original.codexHome, "sentinel"), "utf8"), "original");
});

test("a symlink cannot redirect the test DSH store into another identity", (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "vdr-identity-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const original = path.join(root, "original");
  const isolated = path.join(root, "test");
  fs.mkdirSync(original); fs.mkdirSync(isolated);
  fs.symlinkSync(original, path.join(isolated, "dsh"));
  assert.throws(() => desktopRuntimePaths(isolated), /符号链接/);
  assert.deepEqual(fs.readdirSync(original), []);
});
