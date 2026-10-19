/** 本机数据服务：Client 选择与页面仍在用的查询。行情、公告与新闻由 Backend 提供。 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { loadProductConfig } from "./productConfig.ts";
import { redact } from "./service_redact.ts";

export { redact } from "./service_redact.ts";

export interface ServiceContext { repoRoot: string; dataRoot: string; python: string; node: string; }

export function repoRootFromHere(): string {
  return path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
}

/** 从产品配置链解析服务上下文(vibe-research.config.json ← .local/config.json ← VRA_*);VRA_REPO_ROOT 可指定仓库(测试 / 多副本) */
export function serviceContext(opts: { repoRoot?: string; python?: string; env?: NodeJS.ProcessEnv } = {}): ServiceContext {
  const env = opts.env ?? process.env;
  const repoRoot = path.resolve(opts.repoRoot ?? env.VRA_REPO_ROOT ?? repoRootFromHere());
  const pc = loadProductConfig(repoRoot, { env });
  return { repoRoot, dataRoot: pc.resolved.dataRoot, python: opts.python ?? pc.python ?? "python3", node: process.execPath };
}

export class ServiceError extends Error {
  code: string;
  constructor(code: string, message: string) { super(message); this.code = code; }
}

/** 用户数据区内的安全路径:词法前缀 + 已存在的每一级都不得是符号链接 + 最深存在祖先的 realpath 仍在 dataRoot 的 realpath 内 */
export function safePath(ctx: Pick<ServiceContext, "dataRoot">, ...segments: string[]): string {
  const rootAbs = path.resolve(ctx.dataRoot);
  const abs = path.resolve(rootAbs, ...segments);
  if (abs !== rootAbs && !abs.startsWith(rootAbs + path.sep)) throw new ServiceError("path_escape", `路径越出用户数据区`);
  let cur = abs;
  const chain: string[] = [];
  while (cur !== rootAbs && cur.startsWith(rootAbs + path.sep)) { chain.unshift(cur); cur = path.dirname(cur); }
  for (const p of chain) {
    if (!fs.existsSync(p)) break;
    if (fs.lstatSync(p).isSymbolicLink()) throw new ServiceError("path_symlink", `用户数据区内存在符号链接,拒绝访问:${path.relative(rootAbs, p)}`);
  }
  const deepest = chain.filter((p) => fs.existsSync(p)).pop() ?? rootAbs;
  if (fs.existsSync(rootAbs)) {
    const realRoot = fs.realpathSync(rootAbs);
    const realDeep = fs.realpathSync(deepest);
    if (realDeep !== realRoot && !realDeep.startsWith(realRoot + path.sep)) throw new ServiceError("path_escape", "路径 realpath 越出用户数据区");
  }
  return abs;
}

/** 本机取数子进程已移除；保留空实现供卸载路径调用。 */
export function abortActiveFetches(): void {}
