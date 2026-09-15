import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const SRC = path.join(REPO, "desktop", "src");
const FINANCE = path.join(SRC, "verticals", "finance");

function walk(dir: string): string[] {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const p = path.join(dir, e.name);
    return e.isDirectory() ? walk(p) : /\.tsx?$/.test(e.name) ? [p] : [];
  });
}
const rel = (p: string) => path.relative(SRC, p);

/**
 * 前端的 Core / 垂类边界。
 *
 * 🔴 **2026-08-26 界面整套换成开源版 Vibe-Research 之后,前端的形状变了**:
 *    整套 UI(外壳 / 导航 / 组件 / 页面)都在 `verticals/finance/` 里,
 *    Core 只剩 `src/` 顶层那几个文件(组装根 + 全局样式)。
 *    ⇒ 断言必须跟着改。旧版查的是 `src/core/` 与 `lib/nav.ts`,那两样**已经不存在**,
 *      而 `walk()` 对不存在的目录返回空数组 ⇒ 前三条会**全绿地什么都没查**。
 *      (第四条读文件才炸出来 —— 否则这条棘轮会静默失效,那正是它最该防的事。)
 */

const coreFiles = () =>
  walk(SRC).filter((f) => !rel(f).startsWith("verticals" + path.sep));

test("🔴 Core UI 确实存在 —— 目录改名 / 搬走时,后面几条不许静默变成空查", () => {
  const files = coreFiles().map(rel);
  assert.ok(files.includes(path.join("core", "ai", "AiDock.tsx")), `没找到 Core 组件,现有文件:${files.join(", ")}`);
  assert.ok(fs.existsSync(path.join(FINANCE, "dsh", "client.tsx")), "DSH 产品组装入口缺失");
  assert.ok(fs.existsSync(FINANCE), "垂类目录 verticals/finance 不在了");
  assert.ok(walk(FINANCE).length > 20, `垂类文件太少(${walk(FINANCE).length}),路径大概不对`);
});

test("🔴 只有组装根可以 import 垂类 —— 别处 import 等于绕开注册点", () => {
  const roots = new Set(["main.tsx"]);
  const bad: string[] = [];
  for (const f of coreFiles()) {
    const r = rel(f);
    if (roots.has(r)) continue;
    const s = fs.readFileSync(f, "utf8");
    for (const m of s.matchAll(/from\s+"([^"]+)"/g)) {
      if (/verticals\//.test(m[1]!)) bad.push(`${r} → ${m[1]}`);
    }
  }
  assert.deepEqual(bad, [], `只有 main.tsx 能接垂类:\n  ${bad.join("\n  ")}`);
});

test("Core UI 里不许出现行业词(它换个行业要能原样搬走)", () => {
  // ⚠️ 收词优先收完整术语;"证伪 / 目标"这类二字词会命中普通中文,反而制造噪音。
  const WORDS = ["持仓", "涨停", "复盘", "板块", "行情", "标的", "estimates", "valuation",
    "成本", "建仓", "仓位", "裁决点", "证伪条件", "开盘", "收盘", "换手", "账户", "论点", "股票"];
  const hits: string[] = [];
  for (const f of coreFiles()) {
    const s = fs.readFileSync(f, "utf8");
    for (const w of WORDS) if (s.includes(w)) hits.push(`${rel(f)}:${w}`);
  }
  assert.deepEqual(hits, [], `Core UI 出现行业词:\n  ${hits.join("\n  ")}`);
});

test("侧栏不展示原作者品牌站点或个人联系入口", () => {
  const layoutSrc = fs.readFileSync(path.join(FINANCE, "components", "layout", "Layout.tsx"), "utf8");
  assert.doesNotMatch(layoutSrc, /phoenixtree|linsizhen|simonlin|buymeacoffee|联系作者/i);
  assert.doesNotMatch(layoutSrc, /APP_VERSION|· 本地工作台/);
  assert.match(layoutSrc, /to="\/" aria-label="Vibe Finance 深度对话"/);
});
