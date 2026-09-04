/** 统一任务 API 的 composition：真实路由适配器 + Quick 执行器。Deep 执行器在 M3 接入。 */
import type { ChatReply, ChatRequest } from "./engines/direct_transport.ts";
import { DeterministicEngine } from "./engines/deterministic_engine.ts";
import { QuickEngine, type QuickProvider } from "./engines/quick_engine.ts";
import { directCapabilityOf } from "./providers.ts";
import { loadProductConfig } from "./productConfig.ts";
import { resolveRuntimeProvider, RuntimeProviderError, type LlmOverride } from "./runtime_provider.ts";
import { ServiceError, type ServiceContext } from "./service.ts";
import { ProductTaskOperations, ReportTaskMaterials } from "./task_adapters.ts";
import { TaskRouteError, TaskRouter, type RouteDecision, type TaskEvent } from "./task_router.ts";

export interface UnifiedTaskRequest {
  readonly task: unknown;
  readonly execute?: boolean;
  readonly llm?: LlmOverride;
  /** 两段式 UI 把 route-only 的决定绑定到执行请求；材料变化时拒绝，不得悄悄换路线。 */
  readonly expectedRouteFingerprint?: string;
}
export interface UnifiedTaskResult {
  readonly status: "routed" | "completed" | "failed";
  readonly executionAvailable: boolean;
  readonly route: RouteDecision;
  readonly events: readonly TaskEvent[];
}

export interface TaskServiceDependencies {
  /** 仅用于测试或受控传输替换；HTTP 请求不能注入。 */
  readonly quickProvider?: QuickProvider;
  readonly complete?: (request: ChatRequest) => Promise<ChatReply>;
}

function requestOf(value: unknown): UnifiedTaskRequest {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new ServiceError("invalid_task_request", "任务请求必须是对象");
  }
  const raw = value as Record<string, unknown>;
  const extra = Object.keys(raw).filter((key) => !["task", "execute", "llm", "expectedRouteFingerprint"].includes(key));
  if (extra.length) throw new ServiceError("invalid_task_request", `任务请求含契约外字段:${extra.join(",")}`);
  if (!("task" in raw)) throw new ServiceError("invalid_task_request", "任务请求缺少 task");
  if (raw.execute !== undefined && typeof raw.execute !== "boolean") {
    throw new ServiceError("invalid_task_request", "execute 必须是布尔值");
  }
  if (raw.expectedRouteFingerprint !== undefined &&
      (typeof raw.expectedRouteFingerprint !== "string" || !/^[a-f0-9]{64}$/.test(raw.expectedRouteFingerprint))) {
    throw new ServiceError("invalid_task_request", "expectedRouteFingerprint 必须是 64 位路由指纹");
  }
  if (raw.llm !== undefined) {
    if (!raw.llm || typeof raw.llm !== "object" || Array.isArray(raw.llm)) {
      throw new ServiceError("invalid_task_request", "llm 必须是对象");
    }
    const llm = raw.llm as Record<string, unknown>;
    const bad = Object.keys(llm).filter((key) => !["provider", "baseURL", "apiKey", "model"].includes(key));
    if (bad.length || typeof llm.provider !== "string" ||
        ["baseURL", "apiKey", "model"].some((key) => llm[key] !== undefined && typeof llm[key] !== "string")) {
      throw new ServiceError("invalid_task_request", "llm 配置字段无效");
    }
  }
  if (raw.execute === false && raw.llm !== undefined) {
    throw new ServiceError("invalid_task_request", "只路由时不得携带 llm 配置");
  }
  return { task: raw.task, ...(raw.execute === undefined ? {} : { execute: raw.execute }),
    ...(raw.llm === undefined ? {} : { llm: raw.llm as LlmOverride }),
    ...(raw.expectedRouteFingerprint === undefined ? {} : { expectedRouteFingerprint: raw.expectedRouteFingerprint as string }) };
}

function quickProviderOf(ctx: ServiceContext, llm?: LlmOverride): QuickProvider {
  try {
    const resolved = llm
      ? resolveRuntimeProvider(ctx.repoRoot, ctx.dataRoot, llm)
      : (() => {
          const pc = loadProductConfig(ctx.repoRoot, { dataRootOverride: ctx.dataRoot, requireAuth: false });
          return { runtime: "codex" as const, profile: pc.providerProfile!, auth: pc.provider.auth,
            model: pc.providerProfile?.default_model ?? null, env: process.env };
        })();
    if (resolved.runtime !== "codex" || resolved.auth !== "api_key") {
      throw new ServiceError("quick_provider_unsupported", "Quick 需要已配置的直连 API；当前订阅登录只用于 Deep。");
    }
    const capability = directCapabilityOf(resolved.profile);
    if (!capability.supported || !capability.baseURL) {
      throw new ServiceError("quick_provider_unsupported", `当前模型尚未通过 Quick 直连验证：${capability.reason}`);
    }
    const apiKey = resolved.env[resolved.profile.env_key];
    const model = resolved.model ?? capability.model;
    if (!apiKey || !model) throw new ServiceError("quick_provider_unsupported", "Quick 直连缺少 API key 或模型名");
    return Object.freeze({ name: resolved.profile.id, baseURL: capability.baseURL, apiKey, model,
      structuredOutput: capability.structuredOutput });
  } catch (error) {
    if (error instanceof ServiceError) throw error;
    if (error instanceof RuntimeProviderError) throw new ServiceError(error.code, error.message);
    throw new ServiceError("quick_provider_unsupported", error instanceof Error ? error.message : "Quick 模型配置不可用");
  }
}

export async function runUnifiedTask(ctx: ServiceContext, input: unknown, signal?: AbortSignal,
  dependencies: TaskServiceDependencies = {}): Promise<UnifiedTaskResult> {
  const req = requestOf(input);
  const materials = new ReportTaskMaterials(ctx.dataRoot);
  const operations = new ProductTaskOperations(ctx);
  const router = new TaskRouter({ materials, operations });
  let route: RouteDecision;
  try { route = await router.route(req.task, signal); }
  catch (error) {
    if (signal?.aborted) throw new ServiceError("cancelled", "任务已取消");
    if (error instanceof TaskRouteError) throw new ServiceError(error.code, error.message);
    throw error;
  }
  if (req.execute !== false && req.expectedRouteFingerprint === undefined) {
    throw new ServiceError("invalid_task_request", "执行任务前必须先路由并带回 expectedRouteFingerprint");
  }
  if (req.expectedRouteFingerprint !== undefined && route.routeFingerprint !== req.expectedRouteFingerprint) {
    throw new ServiceError("route_changed", "所选材料在路由后发生变化，请重新开始任务");
  }
  const executionAvailable = route.target !== "deep";
  if (req.execute === false || !executionAvailable) {
    return Object.freeze({ status: "routed", executionAvailable, route, events: Object.freeze([]) });
  }
  const engine = route.target === "deterministic"
    ? new DeterministicEngine(operations)
    : new QuickEngine({ provider: dependencies.quickProvider ?? quickProviderOf(ctx, req.llm),
        materials, requestTimeoutMs: 120_000, ...(dependencies.complete ? { complete: dependencies.complete } : {}) });
  const events: TaskEvent[] = [];
  for await (const event of engine.run(route, signal)) events.push(event);
  const status = events.at(-1)?.type === "completed" ? "completed" : "failed";
  return Object.freeze({ status, executionAvailable: true, route, events: Object.freeze(events) });
}
