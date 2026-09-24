/** 本机数据服务：端点取数、快照、页面查询和台账。DSH 与 Stock Backend 分别拥有会话和研究数据。 */
import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { fetchEnv } from "./config.ts";
import { nowIso } from "./fsutil.ts";
import { LedgerError,kinds as ledgerKindDefs,labels as ledgerLabelDefs,listRecordsChecked,listRecords as listRecordsOf,removeRecord as removeLedgerRecord,upsertRecord as upsertLedgerRecord,type LedgerIssue,type LedgerRecord } from "./ledger.ts";
import { currentPlugin } from "./plugin.ts";
import { loadProductConfig } from "./productConfig.ts";
import { REGISTRY_REL,fetchArgv,loadRegistry,type EndpointDef } from "./registry.ts";
import { redact } from "./service_redact.ts";
import { DEFAULT_CONSISTENCY,readSnapshot,snapshotKey,snapshotUsable,writeSnapshot,type Consistency } from "./snapshot.ts";

export { redact } from "./service_redact.ts";


export interface ServiceContext { repoRoot: string; dataRoot: string; python: string; node: string; }

export function repoRootFromHere(): string {
  return path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
}

/** 从产品配置链解析服务上下文(vibe-research.config.json ← .local/config.json ← VRA_*);VRA_REPO_ROOT 可指定仓库(测试 / 多副本) */
export function serviceContext(opts: { repoRoot?: string; python?: string; env?: NodeJS.ProcessEnv } = {}): ServiceContext {
  const env = opts.env ?? process.env;
  const repoRoot = path.resolve(opts.repoRoot ?? env.VRA_REPO_ROOT ?? repoRootFromHere());
  const pc = loadProductConfig(repoRoot, { env });
  return { repoRoot, dataRoot: pc.resolved.dataRoot, python: opts.python ?? pc.python ?? "python3", node: process.execPath };
}

export class ServiceError extends Error {
  code: string;
  constructor(code: string, message: string) { super(message); this.code = code; }
}

const SYMBOL_RE = /^[A-Za-z0-9.\-]{1,12}$/;       // 主体代码:数字 / 字母 / 点 / 连字符,长度 1-12
const SYMBOL_FREE_RE = /^[^\s\/\\]{1,40}$/;       // raw 类端点(关键词 / 指数)允许中文,但不允许路径分隔符与空白
/** 合法市场取值由契约给(Plugin.evidence.markets)+ 空串;Core 不写死垂类代码(全审 r4) */
const markets = (): Set<string> => new Set(["", ...currentPlugin().evidence.markets]);
const SESSION_RE = /^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/;
/** 注册表未声明、但 mapper 通用读取的参数键 */
const GLOBAL_ARG_KEYS = new Set(["limit", "date"]);
const MAX_ARG_KEYS = 20;
const MAX_ARG_STR = 200;
const MAX_ARG_ARR = 50;

const show = (v: unknown) => JSON.stringify(String(v ?? "")).slice(0, 48);

export function assertSymbol(symbol: unknown, kind: string | undefined): string {
  const s = String(symbol ?? "").trim();
  const re = kind === "raw" || kind === "none" ? SYMBOL_FREE_RE : SYMBOL_RE;
  if (!re.test(s)) throw new ServiceError("bad_symbol", `非法代码 ${show(symbol)}`);
  return s;
}

export function assertMarket(market: unknown): string {
  const m = String(market ?? "").toUpperCase();
  if (!markets().has(m)) throw new ServiceError("bad_market", `非法市场 ${show(market)}(只接受 SH/SZ/BJ/CN/US/HK 或空)`);
  return m;
}

/** args 闭合校验:键 ⊆ 注册表 args 声明 ∪ {limit, date};值只允许 原始类型 / 原始类型数组;限长限量 */
export function assertArgs(ep: EndpointDef, args: unknown): Record<string, unknown> {
  if (args === undefined || args === null) return {};
  if (typeof args !== "object" || Array.isArray(args)) throw new ServiceError("bad_args", "args 必须是对象");
  const allowed = new Set([...Object.keys(ep.args ?? {}), ...GLOBAL_ARG_KEYS]);
  const out: Record<string, unknown> = {};
  const entries = Object.entries(args as Record<string, unknown>);
  if (entries.length > MAX_ARG_KEYS) throw new ServiceError("bad_args", `args 键过多(> ${MAX_ARG_KEYS})`);
  const prim = (v: unknown, k: string) => {
    if (v === null || typeof v === "boolean") return v;
    if (typeof v === "number") { if (!Number.isFinite(v)) throw new ServiceError("bad_args", `args.${k} 不是有限数`); return v; }
    if (typeof v === "string") { if (v.length > MAX_ARG_STR) throw new ServiceError("bad_args", `args.${k} 过长(> ${MAX_ARG_STR})`); return v; }
    throw new ServiceError("bad_args", `args.${k} 只允许 字符串 / 数字 / 布尔 / null 或其数组`);
  };
  for (const [k, v] of entries) {
    if (!allowed.has(k)) throw new ServiceError("bad_args", `端点 ${ep.id} 不接受参数 ${show(k)}(允许:${[...allowed].join(", ") || "无"})`);
    if (Array.isArray(v)) { if (v.length > MAX_ARG_ARR) throw new ServiceError("bad_args", `args.${k} 数组过长`); out[k] = v.map((x) => prim(x, k)); }
    else out[k] = prim(v, k);
  }
  return out;
}

/** 用户数据区内的安全路径:词法前缀 + 已存在的每一级都不得是符号链接 + 最深存在祖先的 realpath 仍在 dataRoot 的 realpath 内 */
export function safePath(ctx: Pick<ServiceContext, "dataRoot">, ...segments: string[]): string {
  const rootAbs = path.resolve(ctx.dataRoot);
  const abs = path.resolve(rootAbs, ...segments);
  if (abs !== rootAbs && !abs.startsWith(rootAbs + path.sep)) throw new ServiceError("path_escape", `路径越出用户数据区`);
  let cur = abs;
  const chain: string[] = [];
  while (cur !== rootAbs && cur.startsWith(rootAbs + path.sep)) { chain.unshift(cur); cur = path.dirname(cur); }
  for (const p of chain) {
    if (!fs.existsSync(p)) break;
    if (fs.lstatSync(p).isSymbolicLink()) throw new ServiceError("path_symlink", `用户数据区内存在符号链接,拒绝访问:${path.relative(rootAbs, p)}`);
  }
  const deepest = chain.filter((p) => fs.existsSync(p)).pop() ?? rootAbs;
  if (fs.existsSync(rootAbs)) {
    const realRoot = fs.realpathSync(rootAbs);
    const realDeep = fs.realpathSync(deepest);
    if (realDeep !== realRoot && !realDeep.startsWith(realRoot + path.sep)) throw new ServiceError("path_escape", "路径 realpath 越出用户数据区");
  }
  return abs;
}

const rel = (ctx: Pick<ServiceContext, "dataRoot">, p: string) => path.relative(path.resolve(ctx.dataRoot), p).split(path.sep).join("/");

// ---------------- 注册表 ----------------
export interface EndpointSummary { id: string; title?: string; layer?: string; market: string[]; source?: string; compliance?: string; symbol_kind?: string; stages: Record<string, string>; enabled: boolean; auth_env?: string; computed?: boolean; notes?: string; args?: Record<string, unknown> }

/**
 * 列端点。
 * 🔴 `for_ui: true` 时**只给 `exposure=ui` 的**。有些端点是给 agent 用的、不该出现在界面上
 *    (管制与准入、名单核查这类):它们对分析有用,但摆在界面上只是噪音。
 *    ⚠️ **光靠"某个页面不去渲染它"守不住** —— 以后任何一个通用端点列表组件都会把它列出来。
 *    所以过滤放在这里,而不是让每个消费方自己记得。
 */
export function listEndpoints(ctx: ServiceContext, filter: { layer?: string; market?: string; q?: string; enabled_only?: boolean; for_ui?: boolean } = {}): EndpointSummary[] {
  const reg = loadRegistry(ctx.repoRoot);
  if (!reg) throw new ServiceError("no_registry", `注册表不存在:${REGISTRY_REL}`);
  const q = String(filter.q ?? "").toLowerCase().slice(0, 80);
  const layer = String(filter.layer ?? "").slice(0, 40);
  const market = String(filter.market ?? "").toUpperCase().slice(0, 4);
  return reg.endpoints
    .filter((e) => (!layer || String(e.layer ?? "").startsWith(layer)) && (!market || e.market.includes(market)) && (!filter.enabled_only || e.enabled !== false)
      && (!q || `${e.id} ${e.title ?? ""} ${e.source ?? ""} ${e.layer ?? ""}`.toLowerCase().includes(q))
      // 缺省视为 ui:绝大多数端点本来就是给人看的,只有显式标了别的才被挡
      && (!filter.for_ui || (e.exposure ?? "ui") === "ui"))
    .map((e) => ({ id: e.id, title: e.title, layer: e.layer, market: e.market, source: e.source, compliance: e.compliance, symbol_kind: e.symbol_kind, stages: e.stages ?? {}, enabled: e.enabled !== false, auth_env: e.auth_env, computed: e.computed === true, notes: e.notes, args: e.args }));
}

export function endpointDef(ctx: ServiceContext, id: unknown): EndpointDef {
  const sid = String(id ?? "");
  const reg = loadRegistry(ctx.repoRoot);
  const ep = reg?.endpoints.find((e) => e.id === sid);
  if (!ep) throw new ServiceError("unknown_endpoint", `注册表无端点 ${show(id)}`);
  return ep;
}

// ---------------- 取数(子进程,落 .local/mcp/<session>/) ----------------
export interface FetchResult {
  envelope: Record<string, unknown>;
  exit_code: number | null;
  out_dir: string;
  duration_ms: number;
  stderr_tail: string;
  /** true = 这份是**上次取的快照**,没有重新取数 */
  cached: boolean;
  /** 这份数据是什么时候取到的。**界面必须显示它** —— 拿旧数据不说是旧的等于骗人 */
  fetched_at: string;
  /** 页面查询专用：真取失败后使用同端点同参数的上次成功快照。 */
  fallback_reason?: string;
}

/**
 * 取数。**默认读上次的快照,不重新取** —— 页面打开一次就把依赖的端点全跑一遍,
 * 既慢又费钱,而多数时候用户只是想再看一眼上次看到的东西。要新数据传 `refresh: true`。
 *
 * 🔴 失败 / 空信封**不写快照**:否则一次网络抖动会被记住,下次打开还是那次失败,而且永远不会自愈。
 */
export async function fetchEndpoint(
  ctx: ServiceContext,
  req: {
    endpoint: string; symbol?: string; args?: Record<string, unknown>; session?: string; timeout_ms?: number;
    /** 兼容写法:`true` 等价于 `consistency: {mode:"fresh"}` */
    refresh?: boolean;
    consistency?: Consistency;
    signal?: AbortSignal;
  },
): Promise<FetchResult> {
  if (req.signal?.aborted) throw new ServiceError("cancelled", "取数已取消");
  const ep = endpointDef(ctx, req.endpoint);
  const session = String(req.session ?? "default");
  if (!SESSION_RE.test(session)) throw new ServiceError("bad_session", `非法 session ${show(session)}`);
  const outDir = safePath(ctx, "mcp", session);
  fs.mkdirSync(path.join(outDir, "fetch"), { recursive: true });
  fs.mkdirSync(path.join(outDir, "raw"), { recursive: true });
  safePath(ctx, "mcp", session, "fetch");  // 创建后再查一次(防 mkdir 途中被替换成链接)
  const scriptsDir = path.join(ctx.repoRoot, ".agents", "skills", "data-access", "scripts");
  // 🔴 命令构造只有一处真相:registry.ts 的 fetchArgv(legacy → 脚本自身;其余 → fetch_endpoint.py)。
  //    这里原先手写了第二份、漏掉 legacy 分支 —— 结果 8 个 legacy 端点经 POST /fetch 一律返回
  //    "ModuleNotFoundError: No module named 'sources.legacy'"(编排器走 fetchArgv 所以一直是好的,
  //    两条路径行为分叉、只有一条坏,最难发现)。同一件事别写两遍。
  //    legacy 脚本的 base_parser 把 --symbol 设成 required(symbol_kind=none 的也一样,只校验格式后忽略),
  //    所以这类端点必须由调用方给一个 —— 不在这里悄悄编个占位代码顶上,
  //    那会让"没给 symbol"和"给了这个 symbol"在落盘与日志里长得一模一样。
  const needSymbol = ep.symbol_kind !== "none" || ep.module === "legacy";
  let symbol = "";
  if (needSymbol) {
    if (req.symbol === undefined) throw new ServiceError("missing_symbol", `端点 ${ep.id} 需要 symbol`);
    symbol = assertSymbol(req.symbol, ep.symbol_kind === "none" ? "cn6" : ep.symbol_kind);
  }
  const args = assertArgs(ep, req.args);
  // 快照键在**参数校验之后**算:用校验过的 args,免得同一份查询因为写法不同算出两把键
  const snapKey = snapshotKey(ep.id, symbol, args);
  const consistency: Consistency = req.consistency ?? (req.refresh ? { mode: "fresh" } : DEFAULT_CONSISTENCY);
  // 端点自己声明的缓存上限(秒)。**调用方放宽不了** —— 它是数据本身的性质:
  // 产出里含"按此刻算出来"的字段时,缓存住就会被永久冻结(上午算的状态晚上还在读)。
  const epMaxAge = typeof ep.cache_max_age_sec === "number" ? ep.cache_max_age_sec * 1000 : null;
  const hit = readSnapshot<FetchResult>(ctx.dataRoot, snapKey);
  if (snapshotUsable(hit, consistency, epMaxAge)) {
    return { ...(hit as NonNullable<typeof hit>).payload, cached: true, fetched_at: (hit as NonNullable<typeof hit>).fetched_at };
  }
  if (consistency.mode === "cache_only") {
    throw new ServiceError("no_snapshot", `端点 ${ep.id} 没有可用快照,而本次要求只读缓存(不联网)`);
  }
  // 🔴 single-flight:同一份查询并发进来时只真取一次。
  //    没有它,一屏五个卡片指向同一端点就会打五次上游;更糟的是**先发后回**的慢请求
  //    会把新结果覆盖成旧的(Codex 架构评审 arch-r1 §F-6)。
  const flightKey = `${ctx.dataRoot}\u0000${snapKey}`;
  const flying = inFlight.get(flightKey);
  if (flying) return subscribeFlight(flying, req.signal);
  const controller = new AbortController();
  const run = (async (): Promise<FetchResult> => {
    const argv = fetchArgv(ep, ep.id, { scriptsDir, symbol, runDir: outDir });
    if (Object.keys(args).length) {
      if (ep.module === "legacy") throw new ServiceError("args_unsupported", `端点 ${ep.id} 是 legacy 脚本,不接受 args`);
      argv.push("--args", JSON.stringify(args));
    }
    // 取数进程:最小环境 + 该端点声明的 auth_env(只此一个)+ 用户显式的 TLS 降级开关
    const extra: Record<string, string> = {};
    if (ep.auth_env && process.env[ep.auth_env]) extra[ep.auth_env] = process.env[ep.auth_env] as string;
    if (process.env.VRA_ALLOW_INSECURE_TLS) extra.VRA_ALLOW_INSECURE_TLS = process.env.VRA_ALLOW_INSECURE_TLS;
    const timeout = Math.min(Math.max(Number(req.timeout_ms) || 180_000, 1_000), 600_000);
    const t0 = Date.now();
    // 🔴 **必须是异步 spawn,不能用 spawnSync** —— spawnSync 会阻塞整个 Node 事件循环,
    //    HTTP 服务在取数期间连别的请求都收不下:实测 3 个并发请求墙钟 ≈ 串行合计,
    //    某个自报 132ms 的请求实际等了 1.83s(全在排队)。看板一屏要打五六个端点,这是致命的。
    //    并发安全性已核实:取数器把信封原子写到 fetch/<script>.json,raw 文件名带时间戳+pid+随机,
    //    且调用方拿的是 stdout 不是文件 —— 同端点并发不会互相污染。
    const p = await runFetchProcess(ctx.python, argv, { cwd: ctx.repoRoot, env: fetchEnv(extra), timeout, signal: controller.signal });
    const dur = Date.now() - t0;
    let envelope: Record<string, unknown>;
    try { envelope = JSON.parse(p.stdout) as Record<string, unknown>; }
    catch { throw new ServiceError("bad_envelope", `取数器未输出合法 JSON(退出码 ${p.status}):${redact(p.stderr || "", 200)}`); }
    const result: FetchResult = { envelope, exit_code: p.status, out_dir: rel(ctx, outDir), duration_ms: dur, stderr_tail: redact(p.stderr || "", 300), cached: false, fetched_at: nowIso() };
    // 🔴 只有"真取到了"才写快照。判据取信封自己的 status 与证据条数 ——
    //    `failed` 或一条证据都没有,就是这次没取到,别让它变成用户下次打开看到的东西。
    const snap = writeSnapshot(ctx.dataRoot, snapKey, { endpoint: ep.id, symbol }, result, (r) => {
      const env = r.envelope as { status?: unknown; evidence?: unknown };
      return r.exit_code === 0 && env.status !== "failed" && Array.isArray(env.evidence) && env.evidence.length > 0;
    });
    return snap ? { ...result, fetched_at: snap.fetched_at } : result;
  })();
  const flight: FetchFlight = { promise: run, controller, subscribers: 0, remove: () => {
    if (inFlight.get(flightKey) === flight) inFlight.delete(flightKey);
  } };
  inFlight.set(flightKey, flight);
  void run.then(flight.remove, flight.remove);
  return subscribeFlight(flight, req.signal);
}

/**
 * 正在飞的取数:同一份查询并发进来时只真取一次,大家共用同一个 Promise。
 * 🔴 没有它:一屏五个卡片指向同一端点会打五次上游;更糟的是**先发后回**的慢请求会把
 *    新结果覆盖成旧的(Codex 架构评审 arch-r1 §F-6)。
 */
interface FetchFlight { promise: Promise<FetchResult>; controller: AbortController; subscribers: number; remove: () => void }
const inFlight = new Map<string, FetchFlight>();

/** 每个等待者独立取消;最后一个离开才停共享子进程,并立即允许新请求。 */
function subscribeFlight(flight: FetchFlight, signal?: AbortSignal): Promise<FetchResult> {
  flight.subscribers++;
  return new Promise((resolve, reject) => {
    let done = false;
    const finish = (error: unknown, result?: FetchResult) => {
      if (done) return;
      done = true;
      signal?.removeEventListener("abort", abort);
      flight.subscribers--;
      if (error) reject(error); else resolve(result!);
    };
    const abort = () => {
      finish(new ServiceError("cancelled", "取数已取消"));
      if (flight.subscribers === 0) { flight.remove(); flight.controller.abort(); }
    };
    flight.promise.then(result => finish(null, result), error => finish(error));
    signal?.addEventListener("abort", abort, { once: true });
    if (signal?.aborted) abort();
  });
}

const FETCH_MAX_BUFFER = 64 * 1024 * 1024;
/** 超时后给 SIGTERM 留的收尾时间,过了再 SIGKILL */
const KILL_GRACE_MS = 2_000;

/**
 * 跑取数子进程。等价于原来的 `spawnSync`,但**不阻塞事件循环**。
 * spawnSync 的三条语义都得手工复刻,漏一条就是"看着一样、行为不同":
 * ① `timeout` 到点杀进程 ② `maxBuffer` 超了要中止(否则一个疯狂输出的脚本能把内存吃光)
 * ③ 起不来(ENOENT / EACCES)要报 spawn_failed —— 与旧的 `p.error` 分支同一个错误码。
 * ⚠️ 用 `close` 而不是 `exit`:`exit` 时 stdout 可能还没读完,会拿到截断的 JSON。
 */
function runFetchProcess(
  cmd: string,
  argv: string[],
  opts: { cwd: string; env: Record<string, string>; timeout: number; input?: string; signal?: AbortSignal },
): Promise<{ status: number | null; stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    // stdin 只在**真要喂东西**时才开管道:取数那条路一直是 "ignore",
    // 改成无条件 "pipe" 会让不读 stdin 的脚本在管道满时挂住。
    const child = spawn(cmd, argv, {
      cwd: opts.cwd, env: opts.env,
      stdio: [opts.input === undefined ? "ignore" : "pipe", "pipe", "pipe"],
    });
    if (opts.input !== undefined) {
      // EPIPE:子进程没读完就退了 —— 交给下面的退出码分支去报,不要在这里炸掉整个 Promise
      child.stdin?.on("error", () => undefined);
      child.stdin?.end(opts.input);
    }
    const out: Buffer[] = [];
    const err: Buffer[] = [];
    let outLen = 0;
    let errLen = 0;
    let aborted: "timeout" | "overflow" | "cancelled" | null = null;
    let hardKill: NodeJS.Timeout | null = null;

    const stop = (why: "timeout" | "overflow" | "cancelled") => {
      if (aborted) return;
      aborted = why;
      child.kill("SIGTERM");
      hardKill = setTimeout(() => child.kill("SIGKILL"), KILL_GRACE_MS);
      hardKill.unref();
    };
    const timer = setTimeout(() => stop("timeout"), opts.timeout);
    timer.unref();
    const abort = () => stop("cancelled");
    opts.signal?.addEventListener("abort", abort, { once: true });
    if (opts.signal?.aborted) stop("cancelled");

    const take = (buf: Buffer[], chunk: Buffer, len: number): number => {
      const next = len + chunk.length;
      if (next > FETCH_MAX_BUFFER) { stop("overflow"); return next; }
      buf.push(chunk);
      return next;
    };
    child.stdout?.on("data", (c: Buffer) => { outLen = take(out, c, outLen); });
    child.stderr?.on("data", (c: Buffer) => { errLen = take(err, c, errLen); });

    const done = () => { clearTimeout(timer); if (hardKill) clearTimeout(hardKill); opts.signal?.removeEventListener("abort", abort); };
    child.on("error", (e) => {
      done();
      reject(new ServiceError("spawn_failed", `取数进程失败:${redact(e.message, 120)}`));
    });
    child.on("close", (code) => {
      done();
      if (aborted === "timeout") {
        return reject(new ServiceError("spawn_failed", `取数进程超时(${Math.round(opts.timeout / 1000)} 秒)已终止`));
      }
      if (aborted === "overflow") {
        return reject(new ServiceError("spawn_failed", `取数进程输出超过 ${FETCH_MAX_BUFFER / 1024 / 1024} MB 已终止`));
      }
      if (aborted === "cancelled") return reject(new ServiceError("cancelled", "取数已取消"));
      resolve({ status: code, stdout: Buffer.concat(out).toString("utf8"), stderr: Buffer.concat(err).toString("utf8") });
    });
  });
}

// ---------------- 用户自有台账 ----------------
// 存储与校验都在 Core 的 ledger.ts;这一层只做两件事:
// ① 把 LedgerError 翻译成 ServiceError(HTTP 层只认后者,否则 500 而不是 400)
// ② 走一次 safePath —— ledger.ts 已按白名单挡住 kind,这里是**第二道**,
//    专门挡"用户数据区里被人塞了符号链接"这类与 kind 无关的情形。

/** 台账的记录种类(界面据此渲染表单);垂类没声明台账就是空表 */
/* ---------------- 界面查询(BFF):按名字要一屏数据 ---------------- */

export interface PageBlockResult {
  id: string; title: string; note?: string;
  /** 默认收起(界面的事;数据照常取回) */
  collapsed?: boolean;
  /**
   * 🔴 **跟着信封走,不是"调用没抛异常"就算 ok**。
   *    取数器可以正常退出却在信封里写 `status:"failed"`(如上游改了签名、参数不被接受),
   *    此前这里一律记成 ok ⇒ 一个证据 0 条、带 traceback 的块在界面上显示成正常,
   *    而调用方按 status 做的"缺口保护"永远不会触发 —— **看着在保护,其实一条都匹配不上**。
   *  missing = 取数调用本身失败(抛异常);failed / partial = 取数器跑了但自报没取全。
   */
  status: "ok" | "partial" | "failed" | "missing" | "stale_fallback";
  /** 取不到时说清是什么问题(界面要显示,不能只留空白) */
  error?: string;
  fetched_at?: string; cached?: boolean;
  /**
   * 这一块允许用户改的参数键 + 当前生效值。
   * 🔴 界面**照它渲染选择器**,不自己写死一份可选项 —— 写死的那份迟早与后端对不上,
   *    而对不上的表现是"选了没反应"或"选项里没有真实存在的那个"。
   */
  user_args?: readonly string[];
  applied_args?: Record<string, unknown>;
  envelope?: Record<string, unknown>;
}

export interface PageResult {
  query: string; title: string; intent: string;
  /** 业务日期上下文(这一页在看哪一天、为什么)。不需要解析的页面为 null */
  context: Record<string, unknown> | null;
  blocks: PageBlockResult[];
  /** 整屏最旧的取数时刻。**整页的新鲜度不能好过它最差的那一块** */
  oldest_fetched_at: string | null;
  /**
   * 各块的取数时刻是否跨了不同的天。
   * 🔴 只在每块标"X 分钟前"不够:一屏并排的几块可能差好几天,而用户会把它们当成同一时刻的快照
   *    (Codex 架构评审 arch-r1 §F-1)。
   */
  mixed_ages: boolean;
}

/**
 * 取一屏数据。**页面只说自己要哪个查询,不点名物理端点**。
 * 端点改名 / 换源在这里吸收;界面上也就不会再印出 `em_limit_up_sentiment` 这种东西。
 */
/**
 * 从调用方传来的参数里,**只挑出这一块允许用户改的那几个键**。
 *
 * 🔴 白名单是唯一的门:没声明 `userArgs` 的块,调用方传什么都不生效。
 *    反过来做(黑名单 / 只挡几个危险键)迟早漏 —— 而漏掉的表现是
 *    "这一块回答的问题被悄悄换掉了",页面上完全看不出来。
 * ⚠️ 只挑键,不判值:值合不合法由端点自己的 `assertArgs` 判(两道各管一件事)。
 */
function pickUserArgs(b: { userArgs?: readonly string[] }, given: Record<string, unknown> | undefined): Record<string, unknown> {
  if (!b.userArgs?.length || !given || typeof given !== "object") return {};
  const out: Record<string, unknown> = {};
  for (const k of b.userArgs) {
    if (Object.prototype.hasOwnProperty.call(given, k) && given[k] !== undefined) out[k] = given[k];
  }
  return out;
}

/**
 * 信封状态 → 块状态。**"取数调用没抛异常"不等于 ok** ——
 * 取数器可以正常退出却在信封里写 `status:"failed"`(上游改了签名、参数不被接受…)。
 * 信封没说 / 说了个没见过的值 → 保守当 failed:**不许把"不知道"渲染成正常**。
 * (抽成纯函数是为了能直接测这条映射;生产路径调的就是它。)
 */
export function blockStatusFromEnvelope(envelope: unknown): PageBlockResult["status"] {
  const es = (envelope as { status?: unknown } | null)?.status;
  return es === "ok" ? "ok" : es === "partial" ? "partial" : "failed";
}

function pageFailureReason(ep: EndpointDef, failed: FetchResult | Error): string {
  const source = ep.source === "eastmoney" ? "东方财富接口" : `${ep.title ?? ep.id}接口`;
  const first = failed instanceof Error ? failed.message
    : (failed.envelope.errors as Array<{ error?: string } | string> | undefined)?.[0];
  const raw = typeof first === "string" ? first : first?.error;
  const http = /\bHTTP\s*(\d{3})\b/i.exec(raw || "");
  return http ? `${source} HTTP ${http[1]}` : `${source}：${redact(raw || "本次取数失败", 160)}`;
}

/** 页面查询才允许旧快照回退；研究、MCP 与体检仍按各自一致性要求取数。 */
export async function fetchPageEndpoint(ctx: ServiceContext, req: Parameters<typeof fetchEndpoint>[1]): Promise<FetchResult> {
  const ep = endpointDef(ctx, req.endpoint);
  const needSymbol = ep.symbol_kind !== "none" || ep.module === "legacy";
  const symbol = needSymbol ? assertSymbol(req.symbol, ep.symbol_kind === "none" ? "cn6" : ep.symbol_kind) : "";
  const args = assertArgs(ep, req.args);
  let failed: FetchResult | Error;
  try {
    const result = await fetchEndpoint(ctx, req);
    if (result.exit_code === 0 && blockStatusFromEnvelope(result.envelope) !== "failed") return result;
    failed = result;
  } catch (error) {
    if (req.signal?.aborted) throw error;
    failed = error instanceof Error ? error : new Error(String(error));
  }
  const hit = readSnapshot<FetchResult>(ctx.dataRoot, snapshotKey(ep.id, symbol, args));
  if (hit?.payload?.exit_code === 0 && blockStatusFromEnvelope(hit.payload.envelope) !== "failed") {
    return { ...hit.payload, cached: true, fetched_at: hit.fetched_at, fallback_reason: pageFailureReason(ep, failed) };
  }
  if (failed instanceof Error) throw failed;
  return failed;
}

/**
 * 按块声明的 `injectAs` **选取并改名**上下文参数。
 * **必须声明**(注册期强制);声明了就**只注入列出的键**,并改成端点认的名字。
 *
 * 🔴 "只注入列出的" 这条是必须的:上下文会同时产出同一概念的多种写法
 *    (如日期的 `YYYY-MM-DD` 与 `YYYYMMDD`),整包塞给端点,多出来的那个键会被
 *    参数白名单当场拒掉 —— 一屏的块会成片 missing。
 * 🔴 声明了却**取不到**那个源键 → 抛错,**不许静默跳过**:跳过之后端点会按自己的默认值
 *    (通常是"最近一期")取数,结果看着完全正常、其实不是你要的那一期 —— 又是一次
 *    "把配置错误伪装成正常数据"。(源键拼错、或上下文改名后块没同步,都会走到这。)
 */
function selectInject(src: Record<string, unknown>, map?: Readonly<Record<string, string>>): Record<string, unknown> {
  // 注册期已强制"吃上下文就必须声明 injectAs" —— 到这里还没有,说明校验被绕过了,不许静默整包塞
  if (!map) throw new ServiceError("bad_plugin", "块声明了 injectContext 却没有 injectAs(注册期校验应已拦下)");
  const out: Record<string, unknown> = {};
  for (const [from, to] of Object.entries(map)) {
    if (!Object.prototype.hasOwnProperty.call(src, from))
      throw new ServiceError("bad_plugin", `injectAs 要的上下文键 ${show(from)} 不存在(上下文实际给出:${Object.keys(src).join(", ") || "无"})`);
    out[to] = src[from];
  }
  return out;
}

export async function pageQuery(
  ctx: ServiceContext,
  req: { query: string; symbol?: string; refresh?: boolean; blockArgs?: Record<string, Record<string, unknown>>; signal?: AbortSignal },
): Promise<PageResult> {
  const defs = currentPlugin().pageQueries ?? {};
  const name = String(req.query ?? "");
  if (!Object.prototype.hasOwnProperty.call(defs, name)) {
    throw new ServiceError("unknown_query", `没有这个界面查询:${show(req.query)};可用:${Object.keys(defs).join(", ") || "(垂类没声明)"}`);
  }
  const def = defs[name]!;
  const consistency: Consistency = req.refresh ? { mode: "fresh" } : DEFAULT_CONSISTENCY;

  // ① 先解析业务日期(如果这一页要)。日历端点自己声明了"从不缓存",所以这里拿到的是当下的时段。
  let context: Record<string, unknown> | null = null;
  let injected: Record<string, unknown> = {};
  /** 上下文没解析出来 —— 吃上下文的块要如实失败,不许按上游默认值取数 */
  let ctxUnavailable = false;
  const ctxDef = currentPlugin().pageContext;
  if (def.needsContext && ctxDef) {
    // 🔴 解析上下文的那次取数**必须 fresh**:它算的是"此刻"(如当前时段),缓存住会被永久冻结。
    //    端点自己也声明了从不缓存,这里是第二道 —— 同一个不变量两边都守,不指望另一边。
    const probe = await fetchEndpoint(ctx, {
      endpoint: ctxDef.endpoint,
      ...(ctxDef.symbol ?? req.symbol ? { symbol: ctxDef.symbol ?? req.symbol } : {}),
      consistency: { mode: "fresh" },
      signal: req.signal,
    });
    const resolved = ctxDef.resolve(probe.envelope);
    if (resolved) {
      context = resolved.values;
      injected = resolved.inject;
    } else {
      // 🔴 拿不到就**说出来**,别默默按默认值取 —— 那会让整页显示错误的业务日期且看不出来
      ctxUnavailable = true;
      context = { error: ctxDef.unavailable };
    }
  }

  // ② 各块并发取(single-flight 会把指向同一端点的块合并成一次真取数)
  const blocks = await Promise.all(
    def.blocks.map(async (b): Promise<PageBlockResult> => {
      const used = pickUserArgs(b, req.blockArgs?.[b.id]);
      try {
        /**
         * 🔴 上下文没解析出来(如日历取不到)时,吃上下文的块**不许照常取**:
         *    端点会按自己的默认值(通常是"最近一期")给数,页面上那一屏顶着
         *    "拿不到上下文"的横幅、下面却是一屏看着正常的数字 —— 用户会照着它做判断。
         *    ⇒ 如实标成失败,把原因原样说出来。
         */
        if (b.injectContext && ctxUnavailable)
          throw new ServiceError("context_unavailable", ctxDef?.unavailable ?? "拿不到这一屏的上下文");
        const r = await fetchPageEndpoint(ctx, {
          endpoint: b.endpoint,
          ...(b.symbol ?? req.symbol ? { symbol: b.symbol ?? req.symbol } : {}),
          // 只有声明了 injectContext 的块才吃上下文参数 —— 不吃的端点会被参数校验当场拒
          // 🔴 用户改的参数**只认白名单里的键**:调用方传来的任何其它键一律丢掉。
          //    白名单是垂类声明的(`userArgs`),没声明就是一个都不许改。
          // 注入前先按块声明的改名表改键(端点之间同一概念参数名不同 —— 见 injectAs)
          args: { ...(b.args ?? {}), ...(b.injectContext ? selectInject(injected, b.injectAs) : {}), ...used },
          consistency,
          signal: req.signal,
        });
        const userArgs = b.userArgs?.length ? { user_args: b.userArgs, applied_args: { ...(b.args ?? {}), ...used } } : {};
        const st = r.fallback_reason ? "stale_fallback" : blockStatusFromEnvelope(r.envelope);
        return { id: b.id, title: b.title, ...(b.note ? { note: b.note } : {}), ...(b.collapsed ? { collapsed: true } : {}), ...userArgs, status: st, ...(st === "failed" || r.fallback_reason ? { error: r.fallback_reason ?? pageFailureReason(endpointDef(ctx, b.endpoint), r) } : {}), fetched_at: r.fetched_at, cached: r.cached, envelope: r.envelope };
      } catch (e) {
        // 一块取不到不该让整屏空白 —— 但也**不能装作没事**:如实标出来
        return { id: b.id, title: b.title, ...(b.note ? { note: b.note } : {}), status: "missing", error: e instanceof Error ? e.message : String(e) };
      }
    }),
  );

  const times = blocks.map((b) => b.fetched_at).filter((t): t is string => Boolean(t));
  const days = new Set(times.map((t) => t.slice(0, 10)));
  return {
    query: name, title: def.title, intent: def.intent, context, blocks,
    oldest_fetched_at: times.length ? times.reduce((a, b) => (a < b ? a : b)) : null,
    mixed_ages: days.size > 1,
  };
}

export function ledgerKinds(_ctx: ServiceContext): Record<string, { label: string; properties: Record<string, unknown>; required: string[] }> {
  const out: Record<string, { label: string; properties: Record<string, unknown>; required: string[] }> = {};
  for (const [k, def] of Object.entries(ledgerKindDefs())) {
    out[k] = { label: def.label, properties: { ...def.properties }, required: [...def.required] };
  }
  return out;
}

/**
 * 字段 / 枚举的显示名。**Core 一个都不认识** —— 原样透传给界面。
 * 没声明的字段界面退回原键名,所以这里不做补全、也不报缺。
 */
export function ledgerLabels(_ctx: ServiceContext): { fields: Record<string, string>; enums: Record<string, string> } {
  const l = ledgerLabelDefs();
  return { fields: { ...l.fields }, enums: { ...l.enums } };
}

function asServiceError(e: unknown): never {
  if (e instanceof LedgerError) throw new ServiceError(e.code, e.message);
  throw e;
}

function ledgerGuard(ctx: ServiceContext, kind: unknown): string {
  const k = String(kind ?? "");
  if (!Object.prototype.hasOwnProperty.call(ledgerKindDefs(), k)) throw new ServiceError("unknown_kind", `台账没有这个种类 ${show(kind)}`);
  safePath(ctx, "ledger", `${k}.json`);
  return k;
}

export function ledgerList(ctx: ServiceContext, kind?: string): Record<string, LedgerRecord[]> {
  try {
    if (kind === undefined) {
      // 🔴 全量读取也要逐种类过一遍 safePath。原来这里直接调 listAll ——
      //    于是"单个种类走第二道防线、全量入口不走",而全量恰恰是界面的主入口:
      //    ledger 目录里若被放了指向数据区外的符号链接,单查挡得住、全查挡不住。
      //    **防线只在次要入口生效 = 没有防线。**
      return ledgerSnapshot(ctx).records;
    }
    const k = ledgerGuard(ctx, kind);
    return { [k]: listRecordsOf(ctx.dataRoot, k) };
  } catch (e) { asServiceError(e); }
}

/**
 * 界面的主入口:**一次读盘**同时给出记录与问题清单。
 *
 * 🔴 不要分两次调(先 list 再 issues)。两次之间文件可能被改 ⇒ 响应里 records 是旧版本、
 *    issues 是新版本:界面会显示"这几条都合规",而它展示的恰恰是那几条坏的;
 *    反过来也可能出现 issue 指向一个响应里根本不存在的 id。
 *    **同一个响应里的两半必须来自同一次读取。**
 */
/**
 * 温度计历史序列(只读)。
 *
 * 🔴 端点 id 只接受**注册表里真实存在**的那些 —— 它会被拼进文件路径,
 *    直接拿用户给的字符串去拼路径就是目录穿越。用白名单比做路径清洗可靠:
 *    清洗规则总有想不到的编码形式,而"不在注册表里就拒绝"没有想不到的情形。
 * ⚠️ 序列**只在完整研究运行时才追加**。手动点看板不写序列 ⇒ 观测很稀疏是正常的,
 *    不是坏了。给出 `observations` 的真实条数,让界面自己说清楚。
 */
export function thermoSeries(ctx: ServiceContext, endpoint: string): {
  endpoint: string; observations: unknown[]; exists: boolean; unreadable: boolean; dropped: number;
} {
  const known = listEndpoints(ctx, { for_ui: false }).some((e) => e.id === endpoint);
  if (!known) throw new ServiceError("unknown_endpoint", `未知端点:${endpoint}`);
  const read = currentPlugin().seriesFor;
  // 垂类没有序列这回事 ⇒ 明说"这个垂类不提供",不要返回空数组冒充"没有观测"
  if (!read) throw new ServiceError("no_series", "当前垂类不提供观测序列");
  const r = read(ctx.dataRoot, endpoint);
  return { endpoint, observations: r.observations, exists: r.exists, unreadable: r.unreadable, dropped: r.dropped };
}

export function ledgerSnapshot(ctx: ServiceContext): {
  records: Record<string, LedgerRecord[]>;
  issues: Record<string, LedgerIssue[]>;
} {
  try {
    const records: Record<string, LedgerRecord[]> = Object.create(null);
    const issues: Record<string, LedgerIssue[]> = Object.create(null);
    for (const k of Object.keys(ledgerKindDefs())) {
      ledgerGuard(ctx, k); // 每个种类都过第二道 safePath(与单查同口径)
      const r = listRecordsChecked(ctx.dataRoot, k);
      records[k] = r.records;
      if (r.issues.length) issues[k] = r.issues;
    }
    return { records, issues };
  } catch (e) { asServiceError(e); }
}

export function ledgerUpsert(ctx: ServiceContext, req: { kind: string; record: Record<string, unknown> }): LedgerRecord {
  const k = ledgerGuard(ctx, req.kind);
  if (k === "note") throw new ServiceError("legacy_note", "研究记录已改由 Backend 保存，不能再写入本地 note 台账");
  if (k === "watch") throw new ServiceError("legacy_watch", "自选已改由本地 SQLite 保存，不能再写入 watch 台账");
  const rec = req.record;
  if (!rec || typeof rec !== "object" || Array.isArray(rec)) throw new ServiceError("bad_record", "record 必须是对象");
  try { return upsertLedgerRecord(ctx.dataRoot, k, rec as Record<string, unknown>); } catch (e) { asServiceError(e); }
}

export function ledgerRemove(ctx: ServiceContext, req: { kind: string; id: string }): { removed: boolean } {
  const k = ledgerGuard(ctx, req.kind);
  if (k === "note") throw new ServiceError("legacy_note", "研究记录已改由 Backend 保存，不能再从本地 note 台账删除");
  if (k === "watch") throw new ServiceError("legacy_watch", "自选已改由本地 SQLite 保存，不能再从 watch 台账删除");
  try { return { removed: removeLedgerRecord(ctx.dataRoot, k, String(req.id ?? "")) }; } catch (e) { asServiceError(e); }
}

// ---------------- 资料导入 ----------------
// 薄封装:只做错误翻译。转写只产**草稿**,落库仍走正常的台账写入(同一套校验与锁)。
