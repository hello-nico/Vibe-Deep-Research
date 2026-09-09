import fs from "node:fs";
import path from "node:path";
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
  return {
    home: resolve("home", "DSH_HOME", path.join(dataRoot, "dsh")),
    workspace: resolve("workspace", "VRA_DSH_WORKSPACE", path.join(dataRoot, "dsh-workspace")),
    runtime: resolve("runtime", "VRA_DSH_RUNTIME", path.join(repoRoot, "desktop", "dsh", "runtime")),
  };
}

export function prepareDshPaths(paths: ReturnType<typeof resolveDshPaths>) {
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
