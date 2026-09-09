import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import { resolveDshPaths, prepareDshPaths } from "../../orchestrator/src/dsh_paths.ts";

const repo = fileURLToPath(new URL("../../", import.meta.url));
const paths = resolveDshPaths(repo);
prepareDshPaths(paths);
const result = spawnSync(process.execPath, [
  path.join(paths.runtime, "node_modules/@deepseek-ai/dsh/lib/bin.js"),
  "plugin", "--profile", "web", "add", `link:${path.join(repo, "desktop/dsh/finance-ui")}`,
], {
  cwd: repo,
  env: { ...process.env, DSH_HOME: paths.home, PATH: `${path.join(paths.runtime, "node_modules/.bin")}${path.delimiter}${process.env.PATH ?? ""}` },
  stdio: "inherit",
});
if (result.error) throw result.error;
process.exitCode = result.status ?? 1;
