import fs from "node:fs";
import path from "node:path";
import { parseEnv } from "node:util";
import { readConfiguredDataRoot, resolveDataRoot } from "./data_root.ts";

/** M3 config contains paths only; model settings and credentials remain DSH-owned. */
export function resolveDshPaths(repoRoot: string, env: NodeJS.ProcessEnv = process.env) {
  const dataRoot = resolveDataRoot(repoRoot, readConfiguredDataRoot(repoRoot), env);
  const configFile = path.resolve(repoRoot, env.VRA_DSH_CONFIG ?? "dsh.config.json");
  if (env.VRA_DSH_CONFIG && !fs.existsSync(configFile)) throw new Error("指定的 DSH 配置文件不存在");
  const config = fs.existsSync(configFile) ? JSON.parse(fs.readFileSync(configFile, "utf8")) : {};
  if (!config || typeof config !== "object" || Array.isArray(config)) throw new Error("DSH 路径配置必须为对象");
  function resolve(key: string, variable: string, fallback: string) {
    const value = env[variable] ?? config[key] ?? fallback;
    if (typeof value !== "string" || !value.trim() || value.includes("\0")) throw new Error(`无效的 DSH 路径: ${key}`);
    return path.resolve(repoRoot, value);
  }
  const researchRepo = resolve("researchRepo", "VRA_RESEARCH_REPO", path.join(repoRoot, "..", "Stock-Research"));
  const researchConfig = readResearchConfig(researchRepo, env);
  return {
    dataRoot,
    researchRepo,
    home: resolve("home", "DSH_HOME", path.join(dataRoot, "dsh")),
    workspace: resolve("workspace", "VRA_DSH_WORKSPACE", path.resolve(researchRepo, researchConfig.STOCK_RESEARCH_WORKSPACE || "workspace")),
    runtime: resolve("runtime", "VRA_DSH_RUNTIME", path.join(repoRoot, "desktop", "dsh", "runtime")),
  };
}

/** Read only research connection settings; never import Backend hook credentials. */
export function readResearchConfig(repo: string, env: NodeJS.ProcessEnv = process.env): Record<string, string> {
  const file = path.join(repo, ".env");
  const local = fs.existsSync(file) ? parseEnv(fs.readFileSync(file, "utf8")) : {};
  const result: Record<string, string> = {};
  for (const key of ["STOCK_RESEARCH_WORKSPACE", "STOCK_RESEARCH_BACKEND_URL", "STOCK_RESEARCH_PI_GBRAIN_ROOT", "STOCK_RESEARCH_PI_GBRAIN_DATABASE_URL"]) {
    const value = env[key] ?? local[key];
    if (value) result[key] = value;
  }
  return result;
}

export function researchRuntimeEnv(paths: ReturnType<typeof resolveDshPaths>, env: NodeJS.ProcessEnv = process.env) {
  const config = readResearchConfig(paths.researchRepo, env);
  const database = config.STOCK_RESEARCH_PI_GBRAIN_DATABASE_URL;
  if (!database) throw new Error("Stock-Research 未配置宿主可访问的 GBrain 数据库，请检查 STOCK_RESEARCH_PI_GBRAIN_DATABASE_URL");
  let hostname: string;
  try { hostname = new URL(database).hostname; } catch { throw new Error("研究插件的 GBrain 数据库地址格式无效"); }
  if (hostname === "postgres") throw new Error("研究插件需要宿主可访问的 GBrain 数据库地址");
  return {
    STOCK_RESEARCH_BACKEND_URL: config.STOCK_RESEARCH_BACKEND_URL || "http://127.0.0.1:8700/api/v1",
    STOCK_RESEARCH_WORKSPACE: paths.workspace,
    STOCK_RESEARCH_GBRAIN_ROOT: config.STOCK_RESEARCH_PI_GBRAIN_ROOT || path.join(paths.workspace, "wiki"),
    STOCK_RESEARCH_GBRAIN_DATABASE_URL: database,
  };
}

export function prepareDshPaths(paths: Pick<ReturnType<typeof resolveDshPaths>, 'home' | 'workspace' | 'runtime'>) {
  function assertSeparate(home: string, workspace: string) {
    if (home === workspace || home.startsWith(workspace + path.sep) || workspace.startsWith(home + path.sep)) {
      throw new Error("DSH 状态目录和工作目录不能相同或互相包含");
    }
  }
  assertSeparate(paths.home, paths.workspace);
  for (const directory of [paths.home, paths.workspace]) {
    fs.mkdirSync(directory, { recursive: true, mode: 0o700 });
    if (!fs.statSync(directory).isDirectory()) throw new Error("DSH 路径不是目录");
    fs.accessSync(directory, fs.constants.R_OK | fs.constants.W_OK | fs.constants.X_OK);
  }
  assertSeparate(fs.realpathSync(paths.home), fs.realpathSync(paths.workspace));
  const manifest = JSON.parse(fs.readFileSync(path.join(paths.runtime, "node_modules/@deepseek-ai/dsh/package.json"), "utf8"));
  if (manifest.version !== "0.1.2-rc.1") throw new Error("M3 需要钉住的 DSH 0.1.2-rc.1 运行环境");
}
