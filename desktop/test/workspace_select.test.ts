import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { workspaceSelectMatches, workspaceSelectMenuBox } from "../src/verticals/finance/lib/workspaceSelect.ts";

const read = (path: string) => readFileSync(new URL(`../src/${path}`, import.meta.url), "utf8");

const SELECT_PAGES = [
  "verticals/finance/pages/IndustryCenter.tsx",
  "verticals/finance/pages/CompanyWiki.tsx",
  "verticals/finance/components/ResearchResult.tsx",
  "verticals/finance/pages/UploadedReports.tsx",
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
  const end = workspaceSelectMenuBox(
    { top: 40, left: 700, bottom: 80, width: 36 },
    { width: 800, height: 600 },
    { height: 200, width: 176, align: "end" },
  );
  assert.equal(end.minWidth, 176);
  assert.ok(end.left + end.minWidth <= 788);
  assert.ok(end.left >= 700 + 36 - 176);
});

test("可搜索下拉按名称和附加信息过滤", () => {
  const option = { label: "长江电力", detail: "600900" };
  assert.equal(workspaceSelectMatches(option, ""), true);
  assert.equal(workspaceSelectMatches(option, "电力"), true);
  assert.equal(workspaceSelectMatches(option, "600900"), true);
  assert.equal(workspaceSelectMatches(option, "贵州茅台"), false);
});

test("行业与产业研究列表共用检索条，按名称和附加信息过滤", () => {
  const center = read("verticals/finance/pages/IndustryCenter.tsx");
  const profiles = read("verticals/finance/pages/IndustryProfiles.tsx");
  const header = read("verticals/finance/components/ui/PageHeader.tsx");
  for (const source of [center, profiles]) {
    assert.match(source, /WorkspaceSearch/);
    assert.match(source, /workspaceSelectMatches/);
    assert.match(source, /search=\{/);
  }
  assert.match(center, /placeholder="搜索行业名称"/);
  assert.match(center, /没有匹配的行业/);
  assert.match(center, /searchPlaceholder="搜索行业"/);
  assert.match(profiles, /placeholder="搜索产业名称"/);
  assert.match(profiles, /没有匹配的产业/);
  assert.match(header, /search\?: ReactNode/);
  assert.match(header, /\{search && \(/);
  assert.match(header, /subtitle && <p className="mt-2 max-w-4xl/);
  assert.match(header, /!search && actionBar/);
  assert.doesNotMatch(header, /!search && subtitle/);
  assert.doesNotMatch(header, /\{subtitle && <p className="shrink-0/);
  assert.equal(workspaceSelectMatches({ label: "林业", detail: "forestry 行业资料待补充。" }, "林"), true);
  assert.equal(workspaceSelectMatches({ label: "农产品加工", detail: "801120 牧原股份" }, "801120"), true);
  assert.equal(workspaceSelectMatches({ label: "农产品加工", detail: "801120 牧原股份" }, "牧原"), true);
  assert.equal(workspaceSelectMatches({ label: "农产品加工", detail: "801120 牧原股份" }, "半导体"), false);
});
