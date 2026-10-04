#!/usr/bin/env node
// Mechanical checks for docs/contracts/invariants.md.
//   #16 DSH patches: every patch targets an exactly pinned dependency at the patched version
//       (package.json and package-lock.json) and is registered in desktop/dsh/runtime/README.md.
//   #17 Server plugin registrations: every webServer/tools registration in desktop/dsh/finance-ui/*.mjs
//       hands its disposer to track(), returns it from an install function whose call is tracked,
//       or stores it in a dispose-named field.
// Usage: node scripts/verify-invariants.mjs [repo-root]
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";

const root = resolve(process.argv[2] ?? join(import.meta.dirname, ".."));
const errors = [];
const fail = (message) => errors.push(message);

// #16
const runtime = join(root, "desktop/dsh/runtime");
const patchDir = join(runtime, "patches");
if (existsSync(patchDir)) {
  const pkg = JSON.parse(readFileSync(join(runtime, "package.json"), "utf8"));
  const pins = { ...pkg.dependencies, ...pkg.overrides };
  const lock = existsSync(join(runtime, "package-lock.json"))
    ? JSON.parse(readFileSync(join(runtime, "package-lock.json"), "utf8")).packages ?? {}
    : {};
  const readme = readFileSync(join(runtime, "README.md"), "utf8");
  for (const file of readdirSync(patchDir).filter((n) => n.endsWith(".patch"))) {
    // patch-package naming: @scope+name+version.patch
    const match = /^(@[^+]+)\+(.+)\+(\d[^+]*)\.patch$/.exec(file) ?? /^([^@+][^+]*)\+(\d[^+]*)\.patch$/.exec(file);
    if (!match) { fail(`patches/${file}: unrecognized patch file name`); continue; }
    const [name, version] = match.length === 4 ? [`${match[1]}/${match[2]}`, match[3]] : [match[1], match[2]];
    const short = name.split("/").pop();
    if (pins[name] !== version) fail(`patches/${file}: ${name} must be pinned to exactly ${version} in package.json (found ${pins[name] ?? "none"})`);
    const locked = lock[`node_modules/${name}`]?.version;
    if (locked !== undefined && locked !== version) fail(`patches/${file}: package-lock.json has ${name}@${locked}`);
    if (!new RegExp(`^\\|\\s*${short.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "m").test(readme)) {
      fail(`patches/${file}: ${short} is not registered in desktop/dsh/runtime/README.md patch table`);
    }
  }
}

// #17
const plugin = join(root, "desktop/dsh/finance-ui");
if (existsSync(plugin)) {
  const files = readdirSync(plugin).filter((n) => n.endsWith(".mjs"));
  const sources = Object.fromEntries(files.map((n) => [n, readFileSync(join(plugin, n), "utf8")]));
  const all = Object.values(sources).join("\n");
  for (const [name, text] of Object.entries(sources)) {
    const lines = text.split("\n");
    lines.forEach((line, index) => {
      if (!/\.(webServer|tools)\.register\(/.test(line)) return;
      const where = `desktop/dsh/finance-ui/${name}:${index + 1}`;
      if (/track\(\s*[\w.]+\.register\(/.test(line)) return;
      if (/\bdispose\w*\s*[:=]\s*[\w.]+\.register\(/i.test(line)) return;
      if (/^\s*return\s+[\w.]+\.register\(/.test(line)) {
        const fn = lines.slice(0, index).reverse().map((l) => /^\s*(?:export\s+)?function\s+(\w+)/.exec(l)).find(Boolean)?.[1];
        if (fn && new RegExp(`track\\(\\s*${fn}\\(`).test(all)) return;
        fail(`${where}: ${fn ?? "enclosing function"} returns a registration but no call site passes it to track()`);
        return;
      }
      fail(`${where}: registration disposer is not passed to track() or stored in a dispose field`);
    });
  }
}

if (errors.length) {
  console.error(`verify-invariants: ${errors.length} problem(s)`);
  for (const e of errors) console.error(`  ${e}`);
  process.exit(1);
}
console.log("verify-invariants: ok");
