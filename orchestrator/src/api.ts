#!/usr/bin/env node
/**
 * 本机 HTTP 数据服务：Bearer 鉴权，提供端点取数、页面查询、台账与 Client 选择。
 * 会话由 DSH 执行，研究资料由 Stock Backend 管理。
 * 用法：node orchestrator/src/api.ts [--port 8765] [--host 127.0.0.1]
 */
import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import { productVersion } from "./version.ts";

import crypto from "node:crypto";

import {
addResearchSymbol,addWatch,listPrefs,listResearchRoster,listWatch,
removeResearchSymbol,removeWatch,setPref,
} from "./client_store.ts";
import { NOFOLLOW_FLAG,restrictPrivateFile } from "./fsutil.ts";
import { ServiceError,fetchEndpoint,ledgerKinds,ledgerLabels,ledgerList,ledgerRemove,ledgerSnapshot,ledgerUpsert,listEndpoints,pageQuery,redact,safePath,serviceContext,thermoSeries,type ServiceContext } from "./service.ts";


// **composition root**:插件在入口注册,Core 模块一律不 import 它
// (Core 消费者靠副作用 import 硬接某个包,换垂类时靠入口 import 恢复不了 —— ESM 会缓存)。
import "./finance/register.ts";
const MAX_BODY = 256 * 1024;

function send(res: http.ServerResponse, code: number, body: unknown): void {
  const data = typeof body === "string" ? body : JSON.stringify(body);
  res.writeHead(code, { "Content-Type": "application/json; charset=utf-8", "Content-Length": Buffer.byteLength(data), ...SECURITY_HEADERS });
  res.end(data);
}

/** 所有响应统一带：不缓存、不发 Referer、禁止 MIME 嗅探。 */
const SECURITY_HEADERS = { "Cache-Control": "no-store", "Referrer-Policy": "no-referrer", "X-Content-Type-Options": "nosniff" } as const;

/** `max` 只对明确需要大体积的路由放宽(导入要带 base64 文件);其余一律用默认 256KB */
function readBody(req: http.IncomingMessage, max = MAX_BODY): Promise<Record<string, unknown>> {
  return new Promise((resolve, reject) => {
    // 🔴 按**字节**计,不按字符计。原来 `buf += c` 先把 chunk 解码成字符串,再拿 `buf.length`
    //    (UTF-16 码元数)跟字节上限比 —— 一个中文字 3 字节只算 1,256KB 的上限实际能塞进约 768KB。
    //    顺带:攒 Buffer 也避免了在 chunk 边界上把多字节字符切成两半。
    const chunks: Buffer[] = [];
    let bytes = 0;
    let over = false;
    req.on("data", (c: Buffer) => {
      if (over) return; // 已经判超限了:继续把数据读完丢掉,别再累计也别再攒
      bytes += c.length;
      if (bytes > max) {
        // 超限之后:**继续读、但一律丢掉**。
        // 🔴 两条更"干脆"的做法都试过,都是错的:
        //    ① `req.destroy()` —— 掐断连接,客户端拿到 EPIPE / "network error",
        //       看不到那句"请求体过大",只会以为网断了;
        //    ② `req.pause()` —— 不读了但也不收,客户端卡在上传上、连接被长期占住;
        //       想在响应 flush 之后再 destroy socket 也不行:客户端还在写,照样 EPIPE。
        //    ⇒ 只有边读边丢才能同时做到:内存有界(丢掉不攒)、客户端写得完、
        //      写完就能读到我们回的 413。这也是通用 HTTP 服务器的常规做法。
        if (!over) {
          over = true;
          chunks.length = 0;
          reject(new ServiceError("body_too_large", "请求体过大"));
        }
        return;
      }
      chunks.push(c);
    });
    req.on("end", () => { const buf = Buffer.concat(chunks).toString("utf8"); if (!buf.trim()) return resolve({}); try { const v = JSON.parse(buf); resolve(v && typeof v === "object" && !Array.isArray(v) ? v : {}); } catch { reject(new ServiceError("bad_json", "请求体不是合法 JSON")); } });
    req.on("error", reject);
  });
}

/** 浏览器跨站防护:带 Origin 的请求只接受本机来源;POST 必须是 application/json(浏览器表单 / text/plain 的无预检请求一律拒绝) */
function crossSiteReject(req: http.IncomingMessage): { code: number; error: string } | null {
  const origin = req.headers.origin;
  if (origin !== undefined && !/^https?:\/\/(127\.0\.0\.1|localhost|\[::1\])(:\d+)?$/.test(String(origin))) return { code: 403, error: "forbidden_origin" };
  const sfs = req.headers["sec-fetch-site"];
  if (sfs && sfs !== "same-origin" && sfs !== "none") return { code: 403, error: "forbidden_cross_site" };
  if (req.method === "POST" && !String(req.headers["content-type"] ?? "").toLowerCase().startsWith("application/json")) return { code: 415, error: "content_type_must_be_json" };
  return null;
}

/** 把浏览器主动停止 / 连接中断变成模型调用的 AbortSignal，避免页面停了后台仍继续计费。 */
async function withRequestAbort<T>(
  req: http.IncomingMessage,
  res: http.ServerResponse,
  run: (signal: AbortSignal) => Promise<T>,
): Promise<T> {
  const ac = new AbortController();
  const abort = () => ac.abort();
  const responseClosed = () => { if (!res.writableEnded) abort(); };
  req.once("aborted", abort);
  res.once("close", responseClosed);
  try {
    if (req.aborted) ac.abort();
    return await run(ac.signal);
  } finally {
    req.removeListener("aborted", abort);
    res.removeListener("close", responseClosed);
  }
}

export function createApiServer(ctx: ServiceContext, opts: { token: string }): http.Server {
  if (!opts.token || opts.token.length < 16) throw new Error("API token 必须 ≥ 16 字符(默认随机生成并写入 .local/api.token)");
  return http.createServer(async (req, res) => {
    try {
      const url = new URL(req.url ?? "/", "http://localhost");
      const cs = crossSiteReject(req);
      if (cs) return send(res, cs.code, { error: cs.error });
      // 鉴权:Bearer 对所有路由有效;Cookie(由 /login 用 token 换取)只对 COOKIE_GET_ROUTES 白名单里的只读 GET 有效(POST / 其它 GET 仍只认 Bearer,防 CSRF)
      const bearerOk = (req.headers.authorization ?? "") === `Bearer ${opts.token}`;
      if (!bearerOk) return send(res, 401, { error: "unauthorized" });
      const parts = url.pathname.split("/").filter(Boolean);
      const q = Object.fromEntries(url.searchParams.entries());
      if (req.method === "GET" && url.pathname === "/health") return send(res, 200, { ok: true, version: productVersion() });
      if (req.method === "GET" && url.pathname === "/endpoints") return send(res, 200, listEndpoints(ctx, { layer: q.layer, market: q.market, q: q.q, enabled_only: q.enabled_only === "1", for_ui: q.all !== "1" }));
      // 界面查询:页面按**名字**要一屏数据,不点名物理端点(见 service.pageQuery)
      if (req.method === "GET" && parts[0] === "page" && parts[1] && parts.length === 2) {
        return await withRequestAbort(req, res, async (signal) => send(res, 200, await pageQuery(ctx, { query: parts[1], symbol: q.symbol, refresh: q.refresh === "1", signal })));
      }
      // 用户在界面上拨过某个块参数的那次查询走 POST:参数是结构化的,塞查询串会变成字符串猜类型。
      // ⚠️ 能拨哪些键由垂类的 `userArgs` 白名单说了算,这里不放宽(见 service.pickUserArgs)。
      if (req.method === "POST" && parts[0] === "page" && parts[1] && parts.length === 2) {
        return await withRequestAbort(req, res, async (signal) => {
          const b = (await readBody(req)) as { symbol?: string; refresh?: boolean; blockArgs?: Record<string, Record<string, unknown>> };
          return send(res, 200, await pageQuery(ctx, { query: parts[1], symbol: b?.symbol, refresh: b?.refresh === true, blockArgs: b?.blockArgs, signal }));
        });
      }
      if (req.method === "POST" && url.pathname === "/fetch") {
        return await withRequestAbort(req, res, async (signal) => {
          const b = await readBody(req);
          return send(res, 200, await fetchEndpoint(ctx, { ...b, signal } as never));
        });
      }
      // 端点观测序列(只读)。⚠️ 端点 id 会被拼进文件路径 —— service 层用**注册表白名单**校验,
      //    不做路径清洗(清洗规则总有想不到的编码形式,白名单没有想不到的情形)
      if (req.method === "GET" && parts[0] === "series" && parts[1] && parts.length === 2) {
        return send(res, 200, thermoSeries(ctx, decodeURIComponent(parts[1])));
      }

      // ---- 用户自有台账 ----
      // 🔴 写操作一律用 POST(含删除),不用 DELETE:crossSiteReject 的"必须 application/json"
      //    这条只覆盖 POST，所有写操作统一接受 Bearer、来源及 JSON 内容类型检查。
      //    路径可读性让位于"所有写操作走同一套防护"。
      if (req.method === "GET" && url.pathname === "/ledger") {
        // 一次读盘拿两半:分两次调会让 records 与 issues 来自不同快照(见 service.ledgerSnapshot)
        const snap = ledgerSnapshot(ctx);
        return send(res, 200, { kinds: ledgerKinds(ctx), labels: ledgerLabels(ctx), records: snap.records, issues: snap.issues });
      }
      if (req.method === "GET" && parts[0] === "ledger" && parts[1] && parts.length === 2) return send(res, 200, ledgerList(ctx, parts[1]));
      if (req.method === "POST" && parts[0] === "ledger" && parts[1] && parts.length === 2) {
        const b = await readBody(req);
        // 兼容两种写法:{...字段} 或 {record:{...}}。
        // ⚠️ 用 hasOwnProperty 而不是 `b.record ?? b` —— 后者会把显式的 `{"record": null}`
        //    回退成"整个请求体就是记录",把一个结构错误伪装成字段校验错误。
        const rec = Object.prototype.hasOwnProperty.call(b, "record") ? b.record : b;
        return send(res, 200, ledgerUpsert(ctx, { kind: parts[1], record: rec as Record<string, unknown> }));
      }
      if (req.method === "POST" && parts[0] === "ledger" && parts[1] && parts[2] === "delete" && parts.length === 3) {
        const b = await readBody(req);
        return send(res, 200, ledgerRemove(ctx, { kind: parts[1], id: String(b.id ?? "") }));
      }
      if (req.method === "GET" && url.pathname === "/client/watch") return send(res, 200, listWatch(ctx));
      if (req.method === "POST" && url.pathname === "/client/watch") {
        const b = await readBody(req);
        return send(res, 200, addWatch(ctx, b.symbol));
      }
      if (req.method === "POST" && url.pathname === "/client/watch/delete") {
        const b = await readBody(req);
        return send(res, 200, removeWatch(ctx, b.symbol));
      }
      if (req.method === "GET" && url.pathname === "/client/research") return send(res, 200, listResearchRoster(ctx));
      if (req.method === "POST" && url.pathname === "/client/research") {
        const b = await readBody(req);
        return send(res, 200, addResearchSymbol(ctx, b.symbol));
      }
      if (req.method === "POST" && url.pathname === "/client/research/delete") {
        const b = await readBody(req);
        return send(res, 200, removeResearchSymbol(ctx, b.symbol));
      }
      if (req.method === "GET" && url.pathname === "/client/prefs") return send(res, 200, { prefs: listPrefs(ctx) });
      if (req.method === "POST" && url.pathname === "/client/prefs") {
        const b = await readBody(req);
        return send(res, 200, { prefs: setPref(ctx, b.key, b.value) });
      }
      return send(res, 404, { error: "not found" });
    } catch (e) {
      if (e instanceof URIError) return send(res, 400, { error: "bad_path", message: "网址编码无效，请从栏目入口重新打开" });
      if (e instanceof ServiceError) {
        // 🔴 请求体过大要回 **413**,不能混在 400 里。
        //    上一版注释写着"照常回一个 413",代码却走统一的 400 —— 又一次**声称与代码不符**
        //    (自己的测试只断言了 error 码、没断言状态码,所以放过去了)。
        if (e.code === "body_too_large") {
          // Connection: close = 这条连接用完不复用;剩下的请求体由 readBody **边读边丢**,
          // 客户端写完就能读到这个响应(不要在这里 destroy socket —— 它还在写,会变成 EPIPE)
          res.setHeader("Connection", "close");
          return send(res, 413, { error: e.code, message: redact(e.message, 200) });
        }
        return send(res, 400, { error: e.code, message: redact(e.message, 200) });
      }
      console.error(`[api] internal error: ${redact(e instanceof Error ? e.stack ?? e.message : String(e), 600)}`);
      return send(res, 500, { error: "internal" });
    }
  });
}

/** token:VRA_API_TOKEN 优先;否则随机生成并写入 <dataRoot>/api.token(0600),客户端从该文件读 */
export function resolveToken(ctx: ServiceContext, env: NodeJS.ProcessEnv = process.env): { token: string; source: "env" | "file" | "generated"; file: string } {
  const file = safePath(ctx, "api.token");  // 文件本身若是符号链接 → safePath 拒绝(不跟随读 / 写数据区外文件)
  if (env.VRA_API_TOKEN && env.VRA_API_TOKEN.length >= 16) return { token: env.VRA_API_TOKEN, source: "env", file };
  if (fs.existsSync(file)) {
    if (!fs.lstatSync(file).isFile()) throw new ServiceError("path_symlink", "api.token 不是普通文件");
    restrictPrivateFile(file);
    const t = fs.readFileSync(file, "utf8").trim();
    if (t.length >= 16) return { token: t, source: "file", file };
  }
  const token = crypto.randomBytes(24).toString("hex");
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const fd = fs.openSync(file, fs.constants.O_WRONLY | fs.constants.O_CREAT | fs.constants.O_TRUNC | NOFOLLOW_FLAG, 0o600);
  fs.writeSync(fd, token + "\n");
  fs.closeSync(fd);
  restrictPrivateFile(file);
  return { token, source: "generated", file };
}

/** 回环地址判定，用于服务绑定前置检查。 */
export function isLoopbackHost(host: string): boolean {
  return host === "127.0.0.1" || host === "localhost" || host === "::1" || host === "[::1]";
}

/**
 * 解析 `--port`。
 * 🔴 **必须能接受 0**（0 = 让系统分配一个空闲端口，嵌入式启动方可用它避开"端口被占"）。
 *    原来写的是 `Number(x || 8765) || 8765` —— `0` 是 falsy，两个 `||` 各吃掉它一次,
 *    于是 `--port 0` 会**静默变成 8765**：不报错、看着正常、绑到了另一个端口。
 */
export function parsePortArg(args: readonly string[], fallback = 8765): number {
  const i = args.indexOf("--port");
  if (i < 0 || i + 1 >= args.length) return fallback;
  const raw = args[i + 1]!;
  if (!/^\d+$/.test(raw)) return fallback;
  const n = Number(raw);
  return n >= 0 && n <= 65535 ? n : fallback;
}

/**
 * 这个文件是不是被当入口跑的。
 * 源码开发走 `api.ts`，若以后部署编译产物也要识别 `api.js` / `api.mjs` / `api.cjs`。
 */
export function isEntryPath(argv1: string | undefined): boolean {
  return /[\\/]api\.(ts|js|mjs|cjs)$/.test(argv1 ?? "");
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const port = parsePortArg(args);
  const host = args.includes("--host") ? args[args.indexOf("--host") + 1] : "127.0.0.1";
  const loopback = isLoopbackHost(host);
  if (!loopback && !process.env.VRA_API_TOKEN) { console.error("[api] 非回环地址绑定必须显式设置 VRA_API_TOKEN"); process.exit(2); }
  const ctx = serviceContext();
  const tk = resolveToken(ctx);
  const srv = createApiServer(ctx, { token: tk.token });
  // 🔴 打印**实际绑上的端口**,不是请求的那个 —— `--port 0` 时请求的是 0,
  //    调用方（桌面外壳）就是靠这一行知道该连哪儿的
  srv.listen(port, host, () => {
    // 🔴 **整行都用实际端口**。只改前半段的话,给用户点的那个登录链接仍然写着 `:0`,
    //    照着点必然打不开 —— 而这一行看起来是「已经修好了」的。
    const p = actualPort(srv, port);
    console.error(`[api] listening http://${host}:${p}  token 来源=${tk.source}; 请求头 Authorization: Bearer <token>`);
  });
}

/** 实际绑定的端口;取不到就退回请求值(只可能发生在非 TCP 的 address() 上) */
function actualPort(srv: http.Server, requested: number): number {
  const a = srv.address();
  return a && typeof a === "object" ? a.port : requested;
}

if (isEntryPath(process.argv[1])) {
  main().catch((e) => { console.error(`[api] ${e instanceof Error ? e.message : String(e)}`); process.exit(1); });
}
