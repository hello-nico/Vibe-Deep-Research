import path from "node:path";
import fs from "node:fs";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import { resolveDshPaths, prepareDshPaths } from "../../orchestrator/src/dsh_paths.ts";

const repo = fileURLToPath(new URL("../../", import.meta.url));
const paths = resolveDshPaths(repo);
prepareDshPaths(paths);
const research = path.join(paths.researchRepo, "dsh");
if (!fs.existsSync(path.join(research, "package.json"))) throw new Error("未找到 Stock-Research/dsh，请配置 VRA_RESEARCH_REPO");
function run(command: string, args: string[], cwd: string, env = process.env) {
  const result = spawnSync(command, args, { cwd, env, stdio: "inherit" });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`安装或构建失败（${result.status}），请查看上方输出`);
}
// Reuse an existing pnpm store rather than replacing the research checkout's dependencies.
const modulesFile = path.join(research, "node_modules/.modules.yaml");
const store = fs.existsSync(modulesFile)
  ? fs.readFileSync(modulesFile, "utf8").match(/["']?storeDir["']?:\s*["']?([^"'\r\n,]+)/)?.[1]?.trim() : undefined;
run("pnpm", ["install", "--frozen-lockfile", ...(store ? ["--store-dir", store] : [])], research);
run("npm", ["run", "build"], research);
for (const plugin of [research, path.join(repo, "desktop/dsh/finance-ui")]) run(process.execPath, [
  path.join(paths.runtime, "node_modules/@deepseek-ai/dsh/lib/bin.js"),
  "plugin", "--profile", "web", "add", `link:${plugin}`,
], repo, { ...process.env, DSH_HOME: paths.home, PATH: `${path.join(paths.runtime, "node_modules/.bin")}${path.delimiter}${process.env.PATH ?? ""}` });
