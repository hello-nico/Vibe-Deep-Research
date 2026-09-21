import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const api = readFileSync(new URL("../src/verticals/finance/lib/api.ts", import.meta.url), "utf8");
const localService = readFileSync(new URL("../src/verticals/finance/lib/localService.ts", import.meta.url), "utf8");
const dailyReview = readFileSync(new URL("../src/verticals/finance/pages/DailyReview.tsx", import.meta.url), "utf8");
const website = readFileSync(new URL("../../website/index.html", import.meta.url), "utf8");

test("取数映射不再用 num0 把缺失字段伪装成数字零", () => {
  assert.doesNotMatch(api, /\bnum0\b|\bn0\s*\(/);
  assert.doesNotMatch(localService, /export const num0/);
});

test("官网可不展示 Star；展示时缺值为未知，不保留硬编码数字", () => {
  if (/data-stars/.test(website)) assert.match(website, /data-stars[^>]*>—<\/strong>/);
  assert.doesNotMatch(website, /data-stars[^>]*>2\.1k<\/strong>/);
});

test("页面不把缺失值伪装成零或不完整的二十日合计", () => {
  assert.doesNotMatch(dailyReview, /change_pct\s*\?\?\s*0/);
});
