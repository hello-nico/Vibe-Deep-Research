import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { clipCompanyOneLiner, companyAsOfLabel, companyIndustryLabel } from "../src/verticals/finance/lib/companyRoster.ts";

const companyWiki = readFileSync(new URL("../src/verticals/finance/pages/Watch.tsx", import.meta.url), "utf8");
const stockPage = readFileSync(new URL("../src/verticals/finance/pages/CompanyWiki.tsx", import.meta.url), "utf8");

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

test("关注保持画像入口，改为独立个股页研究进度，撤下报告入口", () => {
  assert.match(companyWiki, /\/sectors\/profiles\/\$\{encodeURIComponent\(row\.summary\.industry_code\.trim\(\)\)\}/);
  assert.doesNotMatch(companyWiki, /to=\{`\/sectors\/\$\{/);
  assert.doesNotMatch(companyWiki, /\/wiki\/reports\?slug=|view=report|WikiReader/);
  assert.match(companyWiki, /companyPageProgress\(state\)/);
  assert.match(companyWiki, /status === "ready"/);
  assert.doesNotMatch(stockPage, /WikiReader|view=report/);
  assert.match(companyWiki, /state\?\.research\?\.sections/);
  assert.doesNotMatch(companyWiki, /row\.summary\?\.one_liner/);
});
