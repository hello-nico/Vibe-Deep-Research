import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { workspaceSelectMatches, workspaceSelectMenuBox } from "../src/verticals/finance/lib/workspaceSelect.ts";

const read = (path: string) => readFileSync(new URL(`../src/${path}`, import.meta.url), "utf8");

const SELECT_PAGES = [
  "verticals/finance/pages/IndustryCenter.tsx",
  "verticals/finance/pages/CompanyWiki.tsx",
  "verticals/finance/components/ResearchResult.tsx",
];

test("产品下拉共用 WorkspaceSelect，页面不再各自写原生 select", () => {
  for (const path of SELECT_PAGES) {
    const source = read(path);
    assert.match(source, /WorkspaceSelect/, path);
    assert.doesNotMatch(source, /<select\b/, path);
  }
  assert.doesNotMatch(read("verticals/finance/pages/CompanyWiki.tsx"), /<details[\s\S]*aria-label="切换公司"/);
  const css = read("index.css");
  assert.match(css, /\.workspace-select-menu \{/);
  assert.match(css, /background: Highlight/);
});

test("下拉菜单优先出现在触发器下方，底部空间不够时翻到上方", () => {
  const below = workspaceSelectMenuBox(
    { top: 40, left: 20, bottom: 80, width: 160 },
    { width: 800, height: 600 },
    { height: 200, width: 180 },
  );
  assert.ok(below.top >= 80);
  assert.equal(below.minWidth, 180);
  const above = workspaceSelectMenuBox(
    { top: 500, left: 20, bottom: 540, width: 160 },
    { width: 800, height: 560 },
    { height: 220, width: 160 },
  );
  assert.ok(above.top < 500);
  assert.ok(above.top >= 12);
});

test("可搜索下拉按名称和附加信息过滤", () => {
  const option = { label: "长江电力", detail: "600900" };
  assert.equal(workspaceSelectMatches(option, ""), true);
  assert.equal(workspaceSelectMatches(option, "电力"), true);
  assert.equal(workspaceSelectMatches(option, "600900"), true);
  assert.equal(workspaceSelectMatches(option, "贵州茅台"), false);
});
