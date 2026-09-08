import fs from "node:fs";
import path from "node:path";

/** All desktop-owned runtime state stays beneath the launcher's explicit data root. */
export function desktopRuntimePaths(dataRoot: string) {
  function privateDirectory(name: string) {
    const directory = path.join(dataRoot, name);
    fs.mkdirSync(directory, { recursive: true, mode: 0o700 });
    if (fs.lstatSync(directory).isSymbolicLink()) throw new Error(`运行目录不能是符号链接: ${name}`);
    fs.chmodSync(directory, 0o700);
    return directory;
  }
  return {
    codexHome: privateDirectory("codex-home"),
    dshHome: privateDirectory("dsh"),
    temporaryDirectory: privateDirectory("tmp"),
  };
}
