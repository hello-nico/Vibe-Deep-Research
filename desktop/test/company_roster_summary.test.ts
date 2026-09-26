import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { clipCompanyOneLiner, companyAsOfLabel, companyIndustryLabel } from "../src/verticals/finance/lib/companyRoster.ts";

const companyWiki = readFileSync(new URL("../src/verticals/finance/pages/CompanyWiki.tsx", import.meta.url), "utf8");

test("名单摘要辅助函数按预览卡规则取值", () => {
  assert.equal(companyIndustryLabel({
    industry: "化学制品",
    industry_code: "801030.SI",
    parent_industry: "化工",
    one_liner: null,
    as_of: "2026-08-18",
  }), "化学制品");
  assert.equal(companyIndustryLabel({
    industry: null,
    industry_code: "801030.SI",
    parent_industry: "化工",
    one_liner: null,
    as_of: null,
  }), "化工");
  assert.equal(companyIndustryLabel({
    industry: null,
    industry_code: null,
    parent_industry: null,
    one_liner: null,
    as_of: null,
  }), null);
  assert.equal(companyAsOfLabel("2026-08-18"), "08-18");
  assert.equal(companyAsOfLabel(null), null);
  assert.equal(clipCompanyOneLiner("原料下降的利润改善取决于售价保持稳定。"), "原料下降的利润改善取决于售价保持稳定。");
  assert.equal(clipCompanyOneLiner("甲".repeat(61)), `${"甲".repeat(60)}…`);
  assert.equal(clipCompanyOneLiner("  "), null);
});

test("个股名单不把申万标签链到行业研究页，报告状态懒加载", () => {
  assert.match(companyWiki, /\/sectors\/profiles\/\$\{encodeURIComponent\(code\)\}/);
  assert.doesNotMatch(companyWiki, /to=\{`\/sectors\/\$\{/);
  assert.match(companyWiki, /IntersectionObserver/);
  assert.match(companyWiki, /\/wiki\/reports\?slug=/);
  assert.match(companyWiki, /view=report/);
  assert.match(companyWiki, /listRunningCompanySymbols/);
  assert.match(companyWiki, /status === 'ready'/);
  assert.match(companyWiki, /function CompanyRosterRow[\s\S]*<RosterOneLiner text=\{row\.summary\?\.one_liner\} lines=\{1\} progress=\{progress\} \/>/);
  assert.match(companyWiki, /function CompanyRosterCard[\s\S]*<RosterOneLiner text=\{row\.summary\?\.one_liner\} lines=\{2\} progress=\{progress\} \/>/);
});
