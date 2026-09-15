import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import "../src/finance/register.ts";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
test("Mac source policy accepts exact public roots, rejects private sidecars, and locks UI dependencies", () => {
  const script = `import { allowedSource, blockedSource } from './packaging/macos/source-policy.mjs';
    const accept = p => allowedSource.test(p) && !blockedSource.test(p);
    console.log(JSON.stringify(process.argv.slice(1).map(accept)));`;
  const good = ["AGENTS.md", "LICENSE", "NOTICE", "codex-version.json", "vibe-research.config.json", ".vibe-research-root", "orchestrator/package.json", "orchestrator/package-lock.json", "scripts/check-node.mjs", "orchestrator/src/ingest.ts", "calc/tool.py"];
  const bad = ["AGENTS.md.private", "LICENSE.backup", "NOTICE-private", "codex-version.json.bak", "vibe-research.config.json.backup", ".vibe-research-root.private", "orchestrator/package.json.backup", "orchestrator/package-lock.json.private", "scripts/check-node.mjs.bak", "providers/.env.local", "providers/auth.json", "calc/test/foo.py", "calc/example.py.private", ".local/auth.json"];
  bad.push("providers/auth.JSON", "calc/private.PEM", "orchestrator/src/debug.BAK", "providers/.ENV.local");
  const actual = JSON.parse(execFileSync(process.execPath, ["--input-type=module", "-e", script, ...good, ...bad], { cwd: root, encoding: "utf8" }));
  assert.deepEqual(actual, [...good.map(() => true), ...bad.map(() => false)]);
  const builder = fs.readFileSync(path.join(root, "packaging/macos/build.mjs"), "utf8");
  assert.match(builder, /allowedSource: allowed, blockedSource: blocked.*import\('\.\/source-policy\.mjs'\)/);
  const install = builder.indexOf("['ci', '--include=dev', '--ignore-scripts', '--prefix', 'desktop']");
  assert.ok(install > 0 && install < builder.indexOf("['run', 'build', '--prefix', 'desktop']"));
});
test("Mac Python runtime lock matches the validated baseline and hashes every requirement", () => {
  const read = (name: string) => fs.readFileSync(path.join(root, "packaging/macos", name), "utf8");
  const pins = read("python-constraints.txt").split("\n").filter(line => line && !line.startsWith("#")).sort();
  const lock = read("python-requirements.lock");
  const records = lock.replace(/\\\r?\n\s*/g, " ").trim().split("\n");
  assert.equal(records.length, 40);
  assert.deepEqual(records.map(line => line.split(/\s+/)[0]).sort(), pins);
  for (const record of records) assert.match(record, /^[\w.-]+==[\w.+-]+(?:\s+--hash=sha256:[a-f0-9]{64})+$/);
  assert.doesNotMatch(lock, /file:|\/Users\/|\/private\/|https?:\/\/[^\s]*@/);
  const builder = read("build.mjs");
  assert.match(builder, /'--require-hashes'/);
  assert.match(builder, /'pip', 'check'/);
  assert.match(builder, /pythonLockSha256: hash\(pythonLock\)/);
  assert.match(builder, /'pip', 'list'.*'--format', 'json'/);
  assert.doesNotMatch(builder, /'pip', 'freeze'/);
});
