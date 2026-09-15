#!/usr/bin/env node
/**
 * 受控取数 MCP（stdio）：仅提供端点目录与取数，复用 service.ts 的校验和快照。
 * 用法：node orchestrator/src/mcp.ts --repo-root <repo>
 */
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { productVersion } from "./version.ts";

import { ServiceError,fetchEndpoint,listEndpoints,redact,serviceContext,type ServiceContext } from "./service.ts";


// **composition root**:插件在入口注册,Core 模块一律不 import 它
// (Core 消费者靠副作用 import 硬接某个包,换垂类时靠入口 import 恢复不了 —— ESM 会缓存)。
import "./finance/register.ts";
function text(obj: unknown): { content: { type: "text"; text: string }[] } {
  return { content: [{ type: "text", text: typeof obj === "string" ? obj : JSON.stringify(obj, null, 1) }] };
}

/** 异步版 wrap:取数已改成不阻塞事件循环的 spawn,这里必须 await(同一套错误脱敏) */
async function wrapAsync<T>(fn: () => Promise<T>): Promise<{ content: { type: "text"; text: string }[]; isError?: boolean }> {
  try { return text(await fn()); }
  catch (e) {
    if (e instanceof ServiceError) return { ...text({ error: e.code, message: redact(e.message, 200) }), isError: true };
    console.error(`[mcp] internal error: ${redact(e instanceof Error ? e.stack ?? e.message : String(e), 600)}`);
    return { ...text({ error: "internal" }), isError: true };
  }
}

function wrap<T>(fn: () => T): { content: { type: "text"; text: string }[]; isError?: boolean } {
  try { return text(fn()); }
  catch (e) {
    // ServiceError:code + 脱敏消息;其它异常只回 internal(细节进 stderr),避免把绝对路径 / URL 凭据 / 底层错误透给客户端
    if (e instanceof ServiceError) return { ...text({ error: e.code, message: redact(e.message, 200) }), isError: true };
    console.error(`[mcp] internal error: ${redact(e instanceof Error ? e.stack ?? e.message : String(e), 600)}`);
    return { ...text({ error: "internal" }), isError: true };
  }
}

export function buildServer(ctx: ServiceContext): McpServer {
  const server = new McpServer({ name: "vibe-research-agent", version: productVersion() });
  server.registerTool("list_endpoints", { title: "列出数据端点", description: "按层 / 市场 / 关键词列出 datasources/registry.json 里的端点(id / 标题 / 市场 / 源 / 合规级 / symbol_kind / 阶段 / 是否需要环境变量)。",
    inputSchema: { layer: z.string().optional(), market: z.string().optional(), q: z.string().optional(), enabled_only: z.boolean().optional() } },
    (a) => wrap(() => listEndpoints(ctx, a)));
  server.registerTool("fetch_endpoint", { title: "取数", description: "按端点 id 取数(由取数器子进程执行,原始响应落 .local/mcp/<session>/raw/),返回契约信封:status / evidence(每条带单位 · 币种 · 期间 · 来源 · raw_ref)/ extra / errors。不做任何计算。",
    // 🔴 一致性必须暴露给调用方。原来没有这个参数 ⇒ MCP **永远只能拿到旧快照**:
    //    agent 想"核实当下"也拿不到新数据,而且它无从知道自己拿的是旧的
    //    (Codex 架构评审 arch-r1 §A)。默认给 fresh —— agent 调取数多半是要当下的事实;
    //    要省钱 / 要离线时自己选 prefer_cache 或 cache_only。
    inputSchema: {
      endpoint: z.string(), symbol: z.string().optional(), args: z.record(z.string(), z.unknown()).optional(), session: z.string().optional(),
      consistency: z.enum(["fresh", "prefer_cache", "cache_only"]).optional().describe("fresh=必须真取(默认);prefer_cache=有快照就用;cache_only=只读快照,绝不联网"),
    } },
    (a) => wrapAsync(() => {
      const { consistency, ...rest } = a as typeof a & { consistency?: "fresh" | "prefer_cache" | "cache_only" };
      return fetchEndpoint(ctx, { ...rest, consistency: { mode: consistency ?? "fresh" } });
    }));
  return server;
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const i = args.indexOf("--repo-root");
  const ctx = serviceContext({ repoRoot: i >= 0 ? args[i + 1] : undefined });
  const server = buildServer(ctx);
  await server.connect(new StdioServerTransport());
}

if (process.argv[1] && (process.argv[1].endsWith("/mcp.ts") || process.argv[1].endsWith("\\mcp.ts"))) {
  main().catch((e) => { console.error(`[mcp] ${e instanceof Error ? e.message : String(e)}`); process.exit(1); });
}
