import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

test("盘面预览消费能力快照，来源由 Provider 披露，不写死同花顺", () => {
  const peek = fs.readFileSync(new URL("../src/verticals/finance/components/CompanyPeek.tsx", import.meta.url), "utf8");
  const lib = fs.readFileSync(new URL("../src/verticals/finance/lib/companyPeek.ts", import.meta.url), "utf8");
  const css = fs.readFileSync(new URL("../src/index.css", import.meta.url), "utf8");
  assert.match(peek, /finance-company-peek glass/);
  assert.match(peek, /workspace-action-primary/);
  assert.match(peek, /aria-label="关闭"/);
  assert.match(peek, /provider-snapshot/);
  assert.match(peek, /peekIdentityLine\(code, snapshot\)/);
  assert.match(peek, /peekTimeLine\(snapshot\)/);
  assert.match(lib, /providerName/);
  assert.match(lib, /市盈率 TTM/);
  assert.match(lib, /截至 \$\{asOf\}/);
  assert.match(lib, /报告期 \$\{reportPeriod\}/);
  assert.match(lib, /peekAsOf\(snapshot\)/);
  assert.match(css, /\.finance-company-peek \{/);
  assert.doesNotMatch(peek, /同花顺|loadTonghuashun/);
  assert.doesNotMatch(peek, /rows\.find\(row => row\.period\)/);
  assert.doesNotMatch(lib, /同花顺/);
});
