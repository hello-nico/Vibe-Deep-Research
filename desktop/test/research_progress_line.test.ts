import assert from "node:assert/strict";
import test from "node:test";
import { runningReport, type ReportTaskStore } from "../src/verticals/finance/lib/reportTasks.ts";

const now = Date.parse("2026-09-26T03:00:00Z");
const store = (bindings: ReportTaskStore["sessions"]): ReportTaskStore => ({ sessions: bindings });

test("running report is found by its bound session or the fresh pending window", () => {
  const s = store({
    rep: { kind: "report", slug: "companies/300308-sz", bound_at: "2026-09-26T02:55:00Z" },
    done: { kind: "report", slug: "companies/300308-sz", bound_at: "2026-09-26T01:00:00Z" },
  });
  const report = runningReport(s, "companies/300308-sz", id => id === "rep", now);
  assert.deepEqual(report, { startedAt: "2026-09-26T02:55:00Z" });
  assert.equal(runningReport(s, "companies/300308-sz", () => false, now), null);
  const pending: ReportTaskStore = { sessions: {}, pending: { kind: "report", slug: "companies/300308-sz", requested_at: "2026-09-26T02:59:55Z" } };
  assert.ok(runningReport(pending, "companies/300308-sz", () => false, now));
});

test("checked label appears only when the latest check is on a later day than the data date", async () => {
  const { companyCheckedLabel } = await import("../src/verticals/finance/lib/companyRoster.ts");
  assert.equal(companyCheckedLabel("2026-09-09", ["2026-09-26T03:36:17Z", null]), "09-26");
  assert.equal(companyCheckedLabel("2026-09-09", ["2026-09-20T01:00:00Z", "2026-09-26T03:36:17Z"]), "09-26");
  assert.equal(companyCheckedLabel("2026-09-26", ["2026-09-26T03:36:17Z"]), null);
  assert.equal(companyCheckedLabel("2026-09-09", [undefined, "bad"]), null);
});
