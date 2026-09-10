import assert from "node:assert/strict";
import test from "node:test";

import {
  asResearchErrorMessage,
  researchErrorMessage,
  researchUploadSymbol,
} from "../src/verticals/finance/lib/researchSymbol.ts";

test("研报上传代码：6 位和交易所后缀都能点，请求只发 6 位", () => {
  assert.equal(researchUploadSymbol("000933"), "000933");
  assert.equal(researchUploadSymbol("000933.SZ"), "000933");
  assert.equal(researchUploadSymbol("000933.sz"), "000933");
  assert.equal(researchUploadSymbol("sz000933"), "000933");
  assert.equal(researchUploadSymbol("600011"), "600011");
  assert.equal(researchUploadSymbol("600011.SH"), "600011");
  assert.equal(researchUploadSymbol("920001"), "920001");
  assert.equal(researchUploadSymbol("920001.BJ"), "920001");
  assert.equal(researchUploadSymbol("AAPL"), null);
  assert.equal(researchUploadSymbol("00700.HK"), null);
  assert.equal(researchUploadSymbol(""), null);
});

test("研报上传错误不露出 HTTP 状态和英文校验原文", () => {
  assert.equal(
    asResearchErrorMessage(new Error("symbol must include a market suffix, e.g. 600011.SH (allowed: .SH .SZ .BJ .HK .US)")),
    "公司代码无法识别，请核对 6 位 A 股代码后重试",
  );
  assert.equal(
    researchErrorMessage(422, {
      detail: [{ type: "string_pattern_mismatch", loc: ["query", "symbol"], msg: "String should match pattern '^\\d{6}$'" }],
    }),
    "公司代码无法识别，请核对 6 位 A 股代码后重试",
  );
  assert.equal(researchErrorMessage(422, { detail: [{ msg: "文件不是有效的 PDF" }] }), "文件不是有效的 PDF");
  assert.equal(researchErrorMessage(500, null), "研报没有保存成功，请稍后重试");
  assert.equal(asResearchErrorMessage(new Error("研报不能超过 32 MB")), "研报不能超过 32 MB");
});
