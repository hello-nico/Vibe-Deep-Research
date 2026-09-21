/**
 * 产品配置:宪法 / skills / calc / 数据根等路径从产品自己的配置读。
 * 模型接入与凭据由 DSH 配置入口拥有,这里没有任何 provider / 引擎字段。
 * 优先级(低 → 高):内置默认 ← <repo>/vibe-research.config.json(产品,入库)← <dataRoot>/config.json(用户私有,gitignore)← 环境变量。
 * 旧 provider / engine / defaults 字段是六阶段引擎退役前的遗留:读取时剥除,不参与校验,也不再生效。
 */
import fs from "node:fs";
import path from "node:path";

import { resolveDataRoot } from "./data_root.ts";
import { validateWith } from "./schemas.ts";

export interface ProductConfig {
  python: string | null;
  paths: { constitution: string; skills: string; calc_cli: string; data_root: string };
}

export const PRODUCT_CONFIG_FILE = "vibe-research.config.json";
export const USER_CONFIG_FILE = "config.json"; // 位于 data_root 下

export const DEFAULT_PRODUCT_CONFIG: ProductConfig = {
  python: null,
  paths: { constitution: "AGENTS.md", skills: ".agents/skills", calc_cli: "calc/cli.py", data_root: ".local" },
};

/** 退役字段:平行 Provider 控制链与六阶段引擎遗留,读到就剥除(用户旧配置无需迁移)。 */
const RETIRED_CONFIG_KEYS = ["provider", "engine", "defaults"] as const;

export const productConfigSchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    python: { type: ["string", "null"] },
    paths: { type: "object", additionalProperties: false, properties: {
      constitution: { type: "string", minLength: 1 }, skills: { type: "string", minLength: 1 }, calc_cli: { type: "string", minLength: 1 }, data_root: { type: "string", minLength: 1 } } },
  },
} as const;

type Partialish = { [K in keyof ProductConfig]?: Partial<ProductConfig[K]> };

function readLayer(file: string, label: string): Partialish {
  if (!fs.existsSync(file)) return {};
  let parsed: unknown;
  try { parsed = JSON.parse(fs.readFileSync(file, "utf8")); } catch (e) { throw new Error(`${label} 不是合法 JSON:${file}(${e instanceof Error ? e.message : String(e)})`); }
  if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
    for (const key of RETIRED_CONFIG_KEYS) delete (parsed as Record<string, unknown>)[key];
  }
  const errs = validateWith("product-config", productConfigSchema, parsed);
  if (errs.length) throw new Error(`${label} 不符合 schema:${file}\n  ${errs.slice(0, 5).join("\n  ")}`);
  return parsed as Partialish;
}

function mergeLayer(base: ProductConfig, layer: Partialish): ProductConfig {
  return {
    python: layer.python !== undefined ? layer.python : base.python,
    paths: { ...base.paths, ...(layer.paths ?? {}) },
  };
}

export interface LoadedProductConfig extends ProductConfig {
  /** 已解析为绝对路径 */
  resolved: { dataRoot: string; constitution: string; skills: string; calcCli: string; scriptsRel: string };
  sources: string[];
}

/** 读取并合并各层;相对路径一律相对产品根(repoRoot)解析 */
export function loadProductConfig(repoRoot: string, opts: {
    userConfigPath?: string;
    /**
     * 覆盖数据根。**一次决定两样东西**:用户配置在哪、产物落在哪。
     * 不提供这个口子时,调用方只能单独塞 `userConfigPath` —— 那会让"用户配置"按调用方给的根找、
     * 而"产物"仍按 repoRoot 推的根找:同一个用户的两份设置被从两个地方读。
     */
    dataRootOverride?: string;
    env?: NodeJS.ProcessEnv;
  } = {}): LoadedProductConfig {
  const env = opts.env ?? process.env;
  const sources: string[] = ["builtin"];
  let cfg = DEFAULT_PRODUCT_CONFIG;
  const productFile = path.join(repoRoot, PRODUCT_CONFIG_FILE);
  if (fs.existsSync(productFile)) { cfg = mergeLayer(cfg, readLayer(productFile, "产品配置")); sources.push(productFile); }
  /**
   * 数据根。**只在这里算一次,后面所有地方都用它。**
   * 优先级:调用方显式 override > `VRA_DATA_ROOT` > 产品配置里的 `paths.data_root`(相对产品根)。
   * `VRA_DATA_ROOT` 让源码目录与用户数据目录可以分离，换代码副本或升级代码时不迁移用户资料。
   */
  const dataRoot = resolveDataRoot(repoRoot, cfg.paths.data_root, env, opts.dataRootOverride);
  const userFile = opts.userConfigPath ?? path.join(dataRoot, USER_CONFIG_FILE);
  if (fs.existsSync(userFile)) {
    const layer = readLayer(userFile, "用户配置");
    if (layer.paths && "data_root" in layer.paths) throw new Error(`用户配置不得修改 paths.data_root(它决定了用户配置自身的位置):${userFile}`);
    cfg = mergeLayer(cfg, layer); sources.push(userFile);
  }
  if (env.VRA_PYTHON) { cfg = mergeLayer(cfg, { python: env.VRA_PYTHON }); sources.push("env"); }
  const abs = (p: string) => path.resolve(repoRoot, p);
  return {
    ...cfg,
    resolved: {
      dataRoot,
      constitution: abs(cfg.paths.constitution),
      skills: abs(cfg.paths.skills),
      calcCli: abs(cfg.paths.calc_cli),
      scriptsRel: path.join(cfg.paths.skills, "data-access", "scripts"),
    },
    sources,
  };
}
