/**
 * 数据源注册表(datasources/registry.json)读取与阶段计划推导(Phase 1 M1)。
 * core = 仅 legacy 8 脚本(Phase 0 行为,硬测试默认);full = 注册表里所有启用、市场匹配、声明了 stages 的端点(非 legacy 经 fetch_endpoint.py 通用取数器执行)。
 * 不 import config.ts 的运行时值(避免循环依赖);阶段列表由调用方传入。
 */
import fs from "node:fs";
import path from "node:path";
import { currentPlugin } from "./plugin.ts";

export type ScopeKind = "core" | "full";
export type StageLevel = "required" | "optional";

export interface EndpointDef {
  id: string;
  title?: string;
  layer?: string;
  market: string[];
  source?: string;
  compliance?: string;
  module: string;
  function: string;
  symbol_kind?: "cn6" | "us" | "hk" | "global" | "raw" | "none";
  symbol_param?: string;
  stages?: Record<string, StageLevel>;
  enabled?: boolean;
  critical?: boolean;
  args?: Record<string, unknown>;
  auth_env?: string;
  mapper?: string;
  mapper_module?: string;
  notes?: string;
  libs?: string[];
  sample?: string;
  /** 产业温度计:只在研究主体命中这些标签(datasources/industry_tags.json)时才取 */
  industry_tags?: string[];
  /** 温度计历史序列:这些证据字段(白名单)在归档时写进用户数据区序列,下次运行生成 _prev / _change_* 比较证据(orchestrator/src/finance/thermo_history.ts) */
  history_fields?: string[];
  /**
   * 快照最多能放多久(秒)。缺省 = 不限(界面打开就用上次的,直到用户点刷新)。
   * 🔴 **产出里含"按此刻算出来"的字段的端点必须写这个**,尤其是 `0` = 从不缓存。
   *    这类字段缓存下来就会被永久冻结:上午算出来的状态,晚上再打开还是它,
   *    而且**永远不会自己好**。垂类里往往有整条逻辑建在这种字段上
   *    (Codex 架构评审 arch-r1 §B)。
   */
  cache_max_age_sec?: number | null;
  /**
   * 这个端点给谁看。缺省 `ui`(界面和 agent 都能用)。
   * `agent` = **界面不展示、只让 AI 调用**(如管制与准入、名单核查)——
   * 🔴 光靠"前端不渲染"守不住:以后任何一个通用端点列表组件都会把它列出来。
   */
  exposure?: "ui" | "agent" | "internal";
  [k: string]: unknown;
}

export interface Registry { version: string; endpoints: EndpointDef[] }

export const REGISTRY_REL = path.join("datasources", "registry.json");

export function registryPath(repoRoot: string): string {
  return path.join(repoRoot, REGISTRY_REL);
}

/** 读注册表;文件不存在 → null(调用方回退 Phase 0 常量);内容非法 → 抛错(配置错误必须冒泡) */
export function loadRegistry(repoRoot: string): Registry | null {
  const p = registryPath(repoRoot);
  if (!fs.existsSync(p)) return null;
  const reg = JSON.parse(fs.readFileSync(p, "utf8")) as Registry;
  if (!reg || typeof reg.version !== "string" || !Array.isArray(reg.endpoints)) throw new Error(`注册表结构非法:${p}`);
  const seen = new Set<string>();
  for (const e of reg.endpoints) {
    if (!e?.id || !e.module || !e.function || !Array.isArray(e.market)) throw new Error(`注册表端点缺字段(id/module/function/market):${JSON.stringify(e).slice(0, 120)}`);
    if (seen.has(e.id)) throw new Error(`注册表端点 id 重复:${e.id}`);
    seen.add(e.id);
    if (e.history_fields !== undefined && !(Array.isArray(e.history_fields) && e.history_fields.length > 0 && e.history_fields.every((x) => typeof x === "string" && /^[a-z0-9_]{1,80}$/.test(x)))) throw new Error(`端点 ${e.id} 的 history_fields 非法:须为非空的小写字段名数组`);
  }
  return reg;
}

/** 运行市场 → 注册表端点作用域标签。映射本身是垂类知识,由契约给(Plugin.marketRegion);未知取值抛错,绝不猜 */
export function regionOf(market: string): string {
  return currentPlugin().marketRegion(market);
}

export function endpointsById(reg: Registry): Record<string, EndpointDef> {
  const out: Record<string, EndpointDef> = {};
  for (const e of reg.endpoints) out[e.id] = e;
  return out;
}

/** 取数命令:legacy → 脚本自身;其余 → fetch_endpoint.py --endpoint <id>(symbol_kind=none 不传 --symbol) */
export function fetchArgv(def: EndpointDef | undefined, script: string, opts: { scriptsDir: string; symbol: string; runDir: string }): string[] {
  if (!def || def.module === "legacy") {
    const file = def?.function ?? `${script}.py`;
    return [path.join(opts.scriptsDir, file), "--symbol", opts.symbol, "--out-dir", opts.runDir];
  }
  const argv = [path.join(opts.scriptsDir, "fetch_endpoint.py"), "--endpoint", def.id, "--out-dir", opts.runDir];
  if (def.symbol_kind !== "none") argv.push("--symbol", opts.symbol);
  return argv;
}
