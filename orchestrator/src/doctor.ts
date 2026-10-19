#!/usr/bin/env node
/** 检查本机数据服务的运行环境、目录权限与凭据隔离。网络探针复用 Backend 连接测试。 */
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

// 复用产品 `/finance-backend-connection/test` 的 testConnection，无单独类型声明。
// @ts-expect-error JS 模块
import { testConnection } from "../../desktop/dsh/finance-ui/backend-connection.mjs";
import { nowIso,writeJson } from "./fsutil.ts";
import { assertDataRootInside,parseArgs,resolveDataRoot } from "./init.ts";
import { repoRootFromHere } from "./service.ts";


// **composition root**:插件在入口注册,Core 模块一律不 import 它
import "./finance/register.ts";
export type CheckStatus = "ok" | "warn" | "fail" | "skip";
export interface Check { id: string; title: string; status: CheckStatus; detail: string; fix?: string }
export interface ExecResult { status: number | null; stdout: string; stderr: string }
export type Exec = (cmd: string, args: string[], opts?: { env?: Record<string, string>; cwd?: string; timeoutMs?: number }) => ExecResult;
export interface DoctorResult { generated_at: string; repoRoot: string; dataRoot: string; checks: Check[]; tally: Record<CheckStatus, number>; exit_code: 0 | 2 | 3; report: string | null }
/**
 * 不扫的目录。
 * 🔴 `payload` / `release` 是**桌面外壳的构建产物**(装配好的载荷、打好的 App)。
 *    它们里面是三万多个文件(整棵 Python + 引擎二进制),不排掉就会把 SCAN_MAX_FILES 的
 *    额度吃光 —— 表现是"密钥扫描 warn:文件数超过 5000,已截断未全扫",**真正的源码反而没扫到**。
 *    ⚠️ 跳过它们不降低覆盖:`payload/app` 是按清单从仓库源文件拷过去的副本,原件本来就在扫描范围内;
 *    另外两块(Python 依赖、引擎二进制)是第三方产物,不是我们的产品文件。
 */
const SCAN_SKIP_DIRS = new Set([".local", "node_modules", ".venv", ".git", "assets", "__pycache__", ".pytest_cache", "test", "tests", "dist", "htmlcov", "payload", "release", ".pnpm-store"]);
const SCAN_SKIP_EXT = new Set([".png", ".jpg", ".jpeg", ".gif", ".pdf", ".ico", ".woff", ".woff2", ".zip", ".gz", ".lock"]);
const SCAN_MAX_BYTES = 2 * 1024 * 1024;
const SCAN_MAX_FILES = 5000;
/** 高置信形态:任何目录(含测试目录)都查 */
const SECRET_PATTERNS_STRICT: { name: string; re: RegExp }[] = [
  { name: "PEM 私钥", re: /-----BEGIN [A-Z ]*PRIVATE KEY-----/ },
  { name: "AWS access key", re: /\b(AKIA|ASIA)[0-9A-Z]{16}\b/ },
  { name: "GitHub token", re: /\b(gh[pousr]_[A-Za-z0-9]{36,}|github_pat_[A-Za-z0-9_]{22,})\b/ },
  { name: "Slack token", re: /\b(xox[abper]-[A-Za-z0-9-]{10,}|xapp-[A-Za-z0-9-]{10,})\b/ },
  { name: "JWT", re: /\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\b/ },
];
/** 普通形态:测试目录跳过(测试夹具常放假密钥) */
const SECRET_PATTERNS: { name: string; re: RegExp }[] = [
  { name: "sk-… 形态密钥", re: /\bsk-[A-Za-z0-9_-]{20,}/ },
  { name: "Bearer token", re: /bearer\s+[A-Za-z0-9._-]{20,}/i },
  // 字面赋值:只认 api_key / secret / password(token 太泛,测试约定词会误报),值 ≥ 20 位且同时含字母与数字
  { name: "api_key/secret/password 字面赋值", re: /\b(api[_-]?key|secret|password)\b\s*[:=]\s*["'](?=[^"']*[A-Za-z])(?=[^"']*\d)[A-Za-z0-9_\-./+]{20,}["']/i },
];
const TEST_DIRS = new Set(["test", "tests"]);

/** 子进程最小环境:基础 + 代理 + 证书(不透传任何密钥类变量);需要的其他变量由调用处显式加 */
export function minimalEnv(base: NodeJS.ProcessEnv = process.env): Record<string, string> {
  const out: Record<string, string> = {};
  for (const k of ["PATH", "HOME", "LANG", "LC_ALL", "TMPDIR", "HTTP_PROXY", "HTTPS_PROXY", "NO_PROXY", "http_proxy", "https_proxy", "no_proxy", "SSL_CERT_FILE", "REQUESTS_CA_BUNDLE"]) if (base[k]) out[k] = base[k] as string;
  return out;
}

export const defaultExec: Exec = (cmd, args, opts = {}) => {
  const r = spawnSync(cmd, args, { encoding: "utf8", env: opts.env ?? minimalEnv(), cwd: opts.cwd, timeout: opts.timeoutMs ?? 60_000, stdio: ["ignore", "pipe", "pipe"] });
  return { status: r.error ? null : r.status, stdout: r.stdout ?? "", stderr: (r.stderr ?? "") + (r.error ? ` ${r.error.message}` : "") };
};

/** 遍历产品文件(跳过 .local / node_modules / .venv / 二进制 / 符号链接);测试目录单独标记;最多 SCAN_MAX_FILES 个(超出 → truncated=true,不静默) */
function walkFiles(root: string): { files: { p: string; inTest: boolean }[]; truncated: boolean } {
  const out: { p: string; inTest: boolean }[] = [];
  let truncated = false;
  const rec = (dir: string, inTest: boolean) => {
    if (truncated) return;
    for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
      if (out.length >= SCAN_MAX_FILES) { truncated = true; return; }
      if (ent.isSymbolicLink()) continue;
      const p = path.join(dir, ent.name);
      if (ent.isDirectory()) { if (TEST_DIRS.has(ent.name)) rec(p, true); else if (!SCAN_SKIP_DIRS.has(ent.name)) rec(p, inTest); }
      else if (ent.isFile() && !SCAN_SKIP_EXT.has(path.extname(ent.name).toLowerCase())) out.push({ p, inTest });
    }
  };
  rec(root, false);
  return { files: out, truncated };
}

/** 密钥扫描:高置信形态(PEM / AWS / GitHub / Slack / JWT)全树查;sk-… / Bearer / 字面赋值 / 当前环境密钥值只查非测试目录 */
export function scanSecrets(repoRoot: string, env: NodeJS.ProcessEnv): { hits: { file: string; line: number; what: string }[]; scanned: number; truncated: boolean } {
  const envVals = Object.entries(env).filter(([k, v]) => /KEY|TOKEN|SECRET|PASSWORD/i.test(k) && typeof v === "string" && v.length >= 16).map(([k, v]) => ({ k, v: v as string }));
  const hits: { file: string; line: number; what: string }[] = [];
  const { files, truncated } = walkFiles(repoRoot);
  for (const { p: f, inTest } of files) {
    let text: string;
    try { if (fs.statSync(f).size > SCAN_MAX_BYTES) continue; text = fs.readFileSync(f, "utf8"); } catch { continue; }
    const rel = path.relative(repoRoot, f);
    text.split("\n").forEach((l, i) => {
      for (const pat of SECRET_PATTERNS_STRICT) if (pat.re.test(l)) hits.push({ file: rel, line: i + 1, what: pat.name });
      if (inTest) return;
      for (const pat of SECRET_PATTERNS) if (pat.re.test(l)) hits.push({ file: rel, line: i + 1, what: pat.name });
      for (const { k, v } of envVals) if (l.includes(v)) hits.push({ file: rel, line: i + 1, what: `环境变量 ${k} 的值` });
    });
  }
  return { hits, scanned: files.length, truncated };
}

const BACKEND_STATUS: Record<string, string> = {
  ok: "已连接",
  unreachable: "连不上这个地址",
  unauthorized: "访问令牌不对",
  server_outdated: "服务器版本过旧",
  client_outdated: "客户端需要更新",
};

export function formatDoctor(r: DoctorResult): string {
  const mark: Record<CheckStatus, string> = { ok: "OK  ", warn: "WARN", fail: "FAIL", skip: "SKIP" };
  const lines = [`[doctor] 产品根 ${r.repoRoot}`, `[doctor] 数据根 ${r.dataRoot}`, ""];
  for (const c of r.checks) { lines.push(`${mark[c.status]}  ${c.title}:${c.detail}`); if (c.fix && c.status !== "ok") lines.push(`      修复:${c.fix}`); }
  lines.push("", `合计:ok ${r.tally.ok} · warn ${r.tally.warn} · fail ${r.tally.fail} · skip ${r.tally.skip} → 退出码 ${r.exit_code}${r.report ? `;报告 ${r.report}` : ""}`);
  return lines.join("\n");
}

/** Checks the local data service. DSH tests model connections in its own settings. */
export async function runDoctor(opts: { repoRoot?: string; env?: NodeJS.ProcessEnv; exec?: Exec; net?: boolean; python?: string; writeReport?: boolean } = {}): Promise<DoctorResult> {
  const repoRoot = path.resolve(opts.repoRoot ?? repoRootFromHere());
  const dataRoot = resolveDataRoot(repoRoot);
  const env = opts.env ?? process.env;
  const checks: Check[] = [];
  const add = (id: string, title: string, ok: boolean, detail: string) => checks.push({ id, title, status: ok ? "ok" : "fail", detail });
  add("node", "Node.js", Number(process.versions.node.split('.')[0]) >= 22, process.versions.node);
  try { assertDataRootInside(repoRoot, dataRoot); add("data_root", "本机数据目录", true, dataRoot); }
  catch (error) { add("data_root", "本机数据目录", false, String(error)); }
  const mounted = fs.existsSync(path.join(repoRoot, "desktop/dsh/finance-ui/local-data.mjs")) && fs.existsSync(path.join(repoRoot, "orchestrator/src/api.ts"));
  add("mount", "数据服务挂载", mounted, "产品由 DSH 插件挂载；诊断入口 node orchestrator/src/api.ts");
  const scan = scanSecrets(repoRoot, env);
  checks.push({ id: "secrets", title: "工作树凭据扫描", status: scan.hits.length ? "fail" : scan.truncated ? "warn" : "ok", detail: `${scan.scanned} 个文件，${scan.hits.length} 个待核查命中${scan.truncated ? '，扫描达到上限' : ''}；不替代发布前完整历史扫描` });
  if (opts.net) {
    try {
      const status = await testConnection(env);
      add("backend", "Backend 连接", status === "ok", BACKEND_STATUS[status] ?? String(status));
    } catch (error) { add("backend", "Backend 连接", false, String(error)); }
  }
  const tally = { ok: 0, warn: 0, fail: 0, skip: 0 };
  for (const check of checks) tally[check.status]++;
  const result: DoctorResult = { generated_at: nowIso(), repoRoot, dataRoot, checks, tally, exit_code: tally.fail ? 3 : tally.warn ? 2 : 0, report: null };
  if (opts.writeReport !== false && !checks.some(c => c.id === "data_root" && c.status === "fail")) {
    result.report = path.join(dataRoot, "doctor", `${Date.now()}.json`);
    writeJson(result.report, result);
  }
  return result;
}

if (process.argv[1] && (process.argv[1].endsWith("/doctor.ts") || process.argv[1].endsWith("\\doctor.ts"))) {
  const a = parseArgs(process.argv.slice(2));
  await (async () => {
  try {
    const r = await runDoctor({ net: a.net === true });
    console.log(a.json === true ? JSON.stringify(r, null, 2) : formatDoctor(r));
    process.exit(r.exit_code);
  } catch (e) { console.error(`[doctor] ${e instanceof Error ? e.message : String(e)}`); process.exit(3); }
  })();
}
