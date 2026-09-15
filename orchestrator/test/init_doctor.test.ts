import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { scanSecrets } from "../src/doctor.ts";
import { assertDataRootInside,detectPython,gitignoreCovers,runInit } from "../src/init.ts";


import "../src/finance/register.ts"; // 测试文件也是入口:插件要先注册
const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
/** doctor 的 skills 隔离检查按 env.HOME 找用户级 skill:测试用空的假 HOME,不依赖开发者机器上的 ~/.agents/skills */
const FAKE_HOME = fs.mkdtempSync(path.join(os.tmpdir(), "vra-fake-home-"));

function tmpRepo(): string {
  const repo = fs.mkdtempSync(path.join(os.tmpdir(), "vra-init-"));
  fs.writeFileSync(path.join(repo, "AGENTS.md"), "# c\n");
  fs.writeFileSync(path.join(repo, "vibe-research.config.json"), JSON.stringify({ paths: { data_root: ".local" } }));
  return repo;
}

test("init:幂等建 .local 目录 + 配置骨架 + .gitignore;已有配置不改;--force 先备份;provider 非 openai 默认 api_key;不碰产品根之外", async () => {
  const repo = tmpRepo();
  const r1 = runInit({ repoRoot: repo });
  assert.equal(r1.dataRoot, path.join(repo, ".local"));
  for (const sub of ["client", "mcp"]) assert.ok(fs.existsSync(path.join(repo, ".local", sub)), sub);
  assert.ok(r1.steps.filter((s) => s.id.startsWith("dir:")).every((s) => s.action === "created"));
  const cfg = JSON.parse(fs.readFileSync(path.join(repo, ".local", "config.json"), "utf8"));
  assert.equal(cfg.python, null); assert.deepEqual(cfg.provider, { profile: "openai" }, "骨架不写 auth(写了会被当成用户显式指定)");
  assert.ok(fs.readFileSync(path.join(repo, ".gitignore"), "utf8").split("\n").includes(".local/"));
  assert.ok(r1.next.some((n) => n.includes("scripts/start")) && r1.next.some((n) => n.includes("接入 AI")));
  assert.ok(r1.next.every((n) => !n.includes("codex login") && !n.includes("~/.codex")));
  // 第二次:全部 exists / kept,文件不变
  const before = fs.readFileSync(path.join(repo, ".local", "config.json"), "utf8");
  const r2 = runInit({ repoRoot: repo });
  assert.ok(r2.steps.filter((s) => s.id.startsWith("dir:")).every((s) => s.action === "exists"));
  assert.equal(r2.steps.find((s) => s.id === "config")?.action, "kept");
  assert.equal(r2.steps.find((s) => s.id === "gitignore")?.action, "exists");
  assert.equal(fs.readFileSync(path.join(repo, ".local", "config.json"), "utf8"), before);
  // --force:备份后重写;provider=deepseek → api_key;python 显式
  const r3 = runInit({ repoRoot: repo, force: true, provider: "deepseek", python: "/x/python" });
  assert.equal(r3.steps.find((s) => s.id === "config:backup")?.action, "backed_up");
  assert.ok(fs.readdirSync(path.join(repo, ".local")).some((f) => f.startsWith("config.json.bak-")));
  const cfg3 = JSON.parse(fs.readFileSync(path.join(repo, ".local", "config.json"), "utf8"));
  assert.equal(cfg3.python, "/x/python"); assert.deepEqual(cfg3.provider, { profile: "deepseek" });
  assert.throws(() => runInit({ repoRoot: repo, provider: "../evil" }), /非法 provider id/);
  // python 自动探测 .venv
  const pyRel = process.platform === "win32" ? path.join(".venv", "Scripts", "python.exe") : path.join(".venv", "bin", "python");
  fs.mkdirSync(path.dirname(path.join(repo, pyRel)), { recursive: true }); fs.writeFileSync(path.join(repo, pyRel), "");
  assert.equal(detectPython(repo), path.join(repo, pyRel));
  assert.equal(detectPython(repo, "/explicit"), "/explicit");
  // 数据根逃出产品根 → 拒绝(词法 / 符号链接 / realpath 三种)
  const repo2 = tmpRepo(); fs.writeFileSync(path.join(repo2, "vibe-research.config.json"), JSON.stringify({ paths: { data_root: "../outside" } }));
  assert.throws(() => runInit({ repoRoot: repo2 }), /不在产品根/);
  const repo3 = tmpRepo(); const outside = fs.mkdtempSync(path.join(os.tmpdir(), "vra-out-")); fs.symlinkSync(outside, path.join(repo3, ".local"));
  assert.throws(() => runInit({ repoRoot: repo3 }), /符号链接|产品根之外/);
  assert.ok(!fs.existsSync(path.join(outside, "config.json")), "不得写到符号链接指向的仓库外目录");
  const repo4 = tmpRepo(); fs.mkdirSync(path.join(repo4, "data")); fs.symlinkSync(outside, path.join(repo4, "data", "link"));
  fs.writeFileSync(path.join(repo4, "vibe-research.config.json"), JSON.stringify({ paths: { data_root: "data/link/.local" } }));
  assert.throws(() => assertDataRootInside(repo4, path.join(repo4, "data", "link", ".local")), /产品根之外/, "祖先是符号链接也拒绝");
  // 悬空符号链接:.gitignore → 拒绝且不在仓库外创建文件;.local → 拒绝;子目录是(悬空)符号链接 → 拒绝
  const repo6 = tmpRepo(); const dangling = path.join(os.tmpdir(), `vra-dangling-${process.pid}`, "nope");
  fs.symlinkSync(dangling, path.join(repo6, ".gitignore"));
  assert.throws(() => runInit({ repoRoot: repo6 }), /符号链接/); assert.ok(!fs.existsSync(dangling));
  const repo7 = tmpRepo(); fs.symlinkSync(dangling, path.join(repo7, ".local"));
  assert.throws(() => runInit({ repoRoot: repo7 }), /符号链接/); assert.ok(!fs.existsSync(dangling));
  const repo8 = tmpRepo(); fs.mkdirSync(path.join(repo8, ".local")); fs.symlinkSync(dangling, path.join(repo8, ".local", "client"));
  assert.throws(() => runInit({ repoRoot: repo8 }), /不是目录/); assert.ok(!fs.existsSync(dangling));
  // --force 同秒两次:备份不覆盖
  const repo5 = tmpRepo(); runInit({ repoRoot: repo5 }); runInit({ repoRoot: repo5, force: true }); runInit({ repoRoot: repo5, force: true });
  assert.equal(fs.readdirSync(path.join(repo5, ".local")).filter((f) => f.startsWith("config.json.bak-")).length, 2);
  // .gitignore 等价规则识别
  for (const t of [".local/", "/.local/", ".local", "/.local", ".local/**", "# x\r\n/.local/**\r\n"]) assert.ok(gitignoreCovers(t, ".local/"), t);
  assert.ok(!gitignoreCovers(".local2/\n.locale/", ".local/"));
});

test("doctor:版本解析 / 比较;密钥扫描命中 sk-… / Bearer / 环境密钥值,跳过 .local 与测试目录", async () => {
  const repo = tmpRepo();
  fs.mkdirSync(path.join(repo, "src")); fs.mkdirSync(path.join(repo, "test")); fs.mkdirSync(path.join(repo, ".local"));
  fs.writeFileSync(path.join(repo, "src", "a.ts"), 'const k = "sk-" + "ABCDEFGHIJKLMNOPQRSTUVWX0123";\nconst h = "Bearer abcdefghijklmnopqrstuvwxyz";\nconst v = "SUPERSECRETVALUE1234567890";\n');
  fs.writeFileSync(path.join(repo, "test", "t.ts"), '"sk-ABCDEFGHIJKLMNOPQRSTUVWX0123"');
  fs.writeFileSync(path.join(repo, ".local", "x.json"), '"sk-ABCDEFGHIJKLMNOPQRSTUVWX0123"');
  // 第一行被 "sk-" + 拼接打散,不应命中;第二行 Bearer 命中;第三行经环境变量值命中;测试目录里的 sk- 与 .local 不命中
  const r1 = scanSecrets(repo, { MY_API_KEY: "SUPERSECRETVALUE1234567890", SHORT_KEY: "abc" });
  assert.deepEqual(r1.hits.map((h) => `${h.file}:${h.line}:${h.what}`).sort(), ["src/a.ts:2:Bearer token", "src/a.ts:3:环境变量 MY_API_KEY 的值"]);
  assert.equal(r1.truncated, false); assert.ok(r1.scanned >= 3);
  fs.writeFileSync(path.join(repo, "src", "b.md"), "token sk-ABCDEFGHIJKLMNOPQRSTUVWX0123 here\n");
  assert.ok(scanSecrets(repo, {}).hits.some((h) => h.file === "src/b.md" && h.what.startsWith("sk-")));
  // 高置信形态在测试目录也命中:PEM / AWS / GitHub / JWT;字面赋值形态在源码命中
  // 夹具用拼接构造,避免本测试源码自己被扫描命中
  fs.writeFileSync(path.join(repo, "test", "pem.txt"), "-----BEGIN RSA " + "PRIVATE KEY-----\n" + "AKIA" + "ABCDEFGHIJKLMNOP" + "\nghp_" + "a".repeat(36) + "\n");
  fs.writeFileSync(path.join(repo, "src", "c.py"), 'api_key = "' + "abcdefghij" + "0123456789" + 'xyz"\n');
  fs.writeFileSync(path.join(repo, "test", "more.txt"), "ASIA" + "ABCDEFGHIJKLMNOP" + "\ngithub_pat_" + "A1".repeat(12) + "\nxapp-" + "1-A2B3C4D5E6" + "\nxoxe-" + "1234567890-abc" + "\n");
  const r2 = scanSecrets(repo, {});
  const whats = new Set(r2.hits.filter((h) => h.file === "test/pem.txt").map((h) => h.what));
  assert.ok(whats.has("PEM 私钥") && whats.has("AWS access key") && whats.has("GitHub token"), [...whats].join(","));
  const more = r2.hits.filter((h) => h.file === "test/more.txt").map((h) => h.what);
  assert.deepEqual(more, ["AWS access key", "GitHub token", "Slack token", "Slack token"], more.join(","));
  assert.ok(r2.hits.some((h) => h.file === "src/c.py" && /字面赋值/.test(h.what)));

});
