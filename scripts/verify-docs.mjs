#!/usr/bin/env node
// Docs layout gate: status lives in the directory (Task checks: verify-protocol),
// archived files stay frozen, and non-archived Markdown links resolve.
// Usage: node scripts/verify-docs.mjs [repo-root]
import { execFileSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";

const root = resolve(process.argv[2] ?? join(import.meta.dirname, ".."));
const docs = join(root, "docs");
const errors = [];
const fail = (message) => errors.push(message);

const allowed = {
  [docs]: ["README.md", "task-protocol.md", "design.md", "整体验收规范.md", "开发工作流范式.md", "contracts", "decisions", "tasks"],
  [join(docs, "decisions")]: ["proposed", "implemented", "rejected"],
  [join(docs, "tasks")]: ["active", "archived"],
};
for (const [dir, names] of Object.entries(allowed)) {
  if (!existsSync(dir)) continue;
  for (const name of readdirSync(dir)) {
    if (name === ".DS_Store") continue;
    if (!names.includes(name)) fail(`${relative(root, join(dir, name))}: not allowed here; allowed: ${names.join(", ")}`);
  }
}

// Archived files are frozen: a file that already existed at the same path in HEAD must be unchanged.
const git = (...args) => execFileSync("git", ["-c", "core.quotepath=off", ...args], { cwd: root, encoding: "utf8" });
let inGit = true;
try { git("rev-parse", "--verify", "HEAD"); } catch { inGit = false; }
if (inGit) {
  const archivedInHead = new Set(git("ls-tree", "-r", "--name-only", "HEAD", "--", "docs/tasks/archived").split("\n").filter(Boolean));
  const changed = git("diff", "--name-only", "--no-renames", "HEAD", "--", "docs/tasks/archived").split("\n").filter(Boolean);
  for (const path of changed) if (archivedInHead.has(path)) fail(`${path}: archived files are frozen`);
}

const skip = new Set(["node_modules", ".git", ".local", "output", ".venv", ".pnpm-store", "vendor", "dist", "build"]);
const archivedDir = join(docs, "tasks", "archived");
function* markdown(dir) {
  for (const name of readdirSync(dir)) {
    if (skip.has(name)) continue;
    const path = join(dir, name);
    if (path === archivedDir) continue;
    const info = statSync(path);
    if (info.isDirectory()) yield* markdown(path);
    else if (name.endsWith(".md") && !name.endsWith(".log.md")) yield path;
  }
}
const link = /\]\((<[^>]+>|[^)\s]+)(?:\s+"[^"]*")?\)/g;
for (const file of markdown(root)) {
  const text = readFileSync(file, "utf8").replace(/```[\s\S]*?```/g, "").replace(/`[^`\n]*`/g, "");
  for (const match of text.matchAll(link)) {
    let target = match[1].replace(/^<|>$/g, "");
    if (/^[a-z][a-z0-9+.-]*:/i.test(target) || target.startsWith("#")) continue;
    target = decodeURIComponent(target.split("#")[0]);
    if (!target) continue;
    if (!existsSync(resolve(dirname(file), target))) fail(`${relative(root, file)}: broken link -> ${match[1]}`);
  }
}

if (errors.length) {
  console.error(`verify-docs: ${errors.length} problem(s)`);
  for (const e of errors) console.error(`  ${e}`);
  process.exit(1);
}
console.log("verify-docs: ok");
