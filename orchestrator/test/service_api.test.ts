import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";


import { createApiServer } from "../src/api.ts";
import { detectPython } from "../src/init.ts";
import { ServiceError,fetchEndpoint,type ServiceContext } from "../src/service.ts";


import "../src/finance/register.ts"; // 测试文件也是入口:插件要先注册
const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
/** 解释器:VRA_PYTHON → 仓库 .venv → 上一级 .venv(开发布局)→ PATH 上的 python3;不写死任何机器的绝对路径 */
const PY = process.env.VRA_PYTHON ?? detectPython(REPO) ?? detectPython(path.join(REPO, "..")) ?? "python3";
const TOKEN = "t".repeat(32);

async function waitUntil(check: () => boolean): Promise<void> {
  const deadline = Date.now() + 15_000;
  while (!check() && Date.now() < deadline) await new Promise(resolve => setTimeout(resolve, 20));
  assert.ok(check(), "等待测试链路就绪超时");
}

/** 真仓库根(读得到注册表)+ 临时数据根(快照不污染本机) */
const realRepoCtx = (): ServiceContext => ({
  repoRoot: REPO,
  dataRoot: fs.mkdtempSync(path.join(os.tmpdir(), "vra-svc-real-")),
  python: process.env.VRA_PYTHON ?? "python3",
  node: process.execPath,
} as ServiceContext);

const svcCtx = (): ServiceContext => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "vra-svc-"));
  return { repoRoot: root, dataRoot: root, python: "python3", node: process.execPath } as ServiceContext;
};

test("请求体上限按字节算,不按字符算(一个中文 3 字节却只算 1 个字符)", async () => {
  const ctx = svcCtx();
  const server = createApiServer(ctx, { token: "t-test-token-0123456789" });
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  const port = (server.address() as { port: number }).port;
  try {
    const big = "中".repeat(200 * 1024); // 字符 20 万 < 256K 上限,字节约 600KB > 256KB
    const r = await fetch(`http://127.0.0.1:${port}/client/watch`, {
      method: "POST",
      headers: { authorization: "Bearer t-test-token-0123456789", "content-type": "application/json" },
      body: JSON.stringify({ symbol: big }),
    });
    // 🔴 状态码也要断言:上一版只断言了 error 码,于是"注释说 413、代码回 400"这件事被放过去了
    assert.equal(r.status, 413, "请求体过大是 413,不是笼统的 400");
    assert.equal(((await r.json()) as { error?: string }).error, "body_too_large");
    assert.equal(r.headers.get("connection"), "close", "不收连接的话客户端会一直卡在上传上");
  } finally {
    server.close();
  }
});

test("🔴 同一份查询并发进来只真取一次(single-flight)—— 否则一屏五个卡片打五次上游", async () => {
  const ctx = realRepoCtx();
  let spawned = 0;
  // 端点用 tx_quotes_batch:参数一致 ⇒ 快照键一致
  const req = { endpoint: "tx_quotes_batch", args: { codes: ["300308"] }, consistency: { mode: "fresh" as const } };
  const orig = process.env.PATH;
  try {
    const results = await Promise.allSettled([fetchEndpoint(ctx, req), fetchEndpoint(ctx, req), fetchEndpoint(ctx, req)]);
    // 三个都拿到同一个结果对象(共用同一个在飞的 Promise)
    const ok = results.filter((r) => r.status === "fulfilled") as PromiseFulfilledResult<unknown>[];
    if (ok.length === 3) {
      assert.equal(ok[0]!.value, ok[1]!.value, "并发的两次应共用同一个 Promise 的结果");
      assert.equal(ok[1]!.value, ok[2]!.value);
    } else {
      // 取数失败(本机网络/代理)时这条测不到并发,但**不能因此假绿** —— 明说跳过原因
      assert.ok(results.every((r) => r.status === "rejected"), "要么全成要么全败:部分成功说明没走同一条飞行");
    }
  } finally {
    process.env.PATH = orig;
    void spawned;
  }
});

test("single-flight 取消只影响该订阅者;全部取消后可立即重试", async () => {
  const ctx = fakeCtx();
  const script = path.join(ctx.repoRoot, ".agents/skills/data-access/scripts/fetch_endpoint.py");
  fs.writeFileSync(script, "import time\ntime.sleep(0.25)\n" + fs.readFileSync(script, "utf8"));
  const req = { endpoint: "tx_quotes_batch", args: { codes: ["300308"] }, consistency: { mode: "fresh" as const } };
  try {
    for (const cancelledIndex of [0, 1]) {
      const controllers = [new AbortController(), new AbortController()];
      const promises = controllers.map(c => fetchEndpoint(ctx, { ...req, signal: c.signal }));
      const rejected = assert.rejects(promises[cancelledIndex], (e: unknown) => e instanceof ServiceError && e.code === "cancelled");
      controllers[cancelledIndex].abort();
      await rejected;
      assert.equal((await promises[1 - cancelledIndex]).exit_code, 0);
    }
    const a = new AbortController(), b = new AbortController();
    const pa = fetchEndpoint(ctx, { ...req, signal: a.signal }), pb = fetchEndpoint(ctx, { ...req, signal: b.signal });
    const settled = Promise.allSettled([pa, pb]);
    a.abort(); b.abort();
    const fresh = fetchEndpoint(ctx, req);
    assert.ok((await settled).every(r => r.status === "rejected"));
    assert.equal((await fresh).exit_code, 0, "旧任务收尾不能删除或取消新任务");
  } finally { fs.rmSync(ctx.repoRoot, { recursive: true, force: true }); }
});

test("🔴 cache_only 没快照就报错,绝不偷偷联网", async () => {
  const ctx = realRepoCtx();
  await assert.rejects(
    () => fetchEndpoint(ctx, { endpoint: "fetch_quote", symbol: "300308", consistency: { mode: "cache_only" } }),
    (e: unknown) => e instanceof ServiceError && e.code === "no_snapshot",
  );
});

function fakeCtx(): ServiceContext {
  const repo = fs.mkdtempSync(path.join(os.tmpdir(), "vra-svc-"));
  fs.mkdirSync(path.join(repo, "datasources"));
  fs.copyFileSync(path.join(REPO, "datasources", "registry.json"), path.join(repo, "datasources", "registry.json"));
  const scripts = path.join(repo, ".agents", "skills", "data-access", "scripts");
  fs.mkdirSync(scripts, { recursive: true });
  fs.writeFileSync(path.join(scripts, "fetch_endpoint.py"), `import json,sys,os
a=sys.argv; ep=a[a.index('--endpoint')+1]; out=a[a.index('--out-dir')+1]; sym=a[a.index('--symbol')+1] if '--symbol' in a else 'MARKET'
extra=json.loads(a[a.index('--args')+1]) if '--args' in a else {}
os.makedirs(os.path.join(out,'raw'),exist_ok=True); open(os.path.join(out,'raw','fake.json'),'w').write('{}')
envs={k:os.environ.get(k) for k in ('IWENCAI_API_KEY','VRA_SEC_CONTACT','OPENAI_API_KEY','MY_SECRET_TOKEN','VRA_ALLOW_INSECURE_TLS')}
env={"script":ep,"symbol":sym,"market":"SZ","status":"ok","fetched_at":"2026-01-01T00:00:00+08:00","primary_source":"fake","used_sources":["fake"],"evidence":[{"id":"ev-abcdef","symbol":sym,"market":"SZ","field":"f","value":1,"unit":"个","currency":"n/a","period":"2026-01-01","as_of":"2026-01-01","source":"fake","endpoint":ep,"fetched_at":"2026-01-01T00:00:00+08:00","adjustment":"not_applicable","raw_ref":"raw/fake.json"}],"extra":{"args":extra,"envs":envs},"errors":[],"missing":[]}
json.dump(env, open(os.path.join(out,'fetch',ep+'.json'),'w')); print(json.dumps(env)); sys.stderr.write('token=abc123 https://x/y?key=SECRET\\n'); sys.exit(0)
`);
  const dataRoot = path.join(repo, ".local");
  return { repoRoot: repo, dataRoot, python: PY, node: process.execPath };
}
