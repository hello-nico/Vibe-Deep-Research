import assert from "node:assert/strict";
import test from "node:test";
import { latestResearch, researchProgressLine, runningReport, type ReportTaskStore } from "../src/verticals/finance/lib/reportTasks.ts";

const now = Date.parse("2026-09-26T03:00:00Z");
const store = (bindings: ReportTaskStore["sessions"]): ReportTaskStore => ({ sessions: bindings });

test("latest research picks the newest binding for the slug and separates run failure from settlement failure", () => {
  const s = store({
    old: { kind: "research", slug: "companies/300308-sz", bound_at: "2026-09-20T01:00:00Z", run_status: "failed" },
    now: { kind: "research", slug: "companies/300308-sz", bound_at: "2026-09-26T02:17:10Z", run_status: "completed", finished_at: "2026-09-26T02:19:12Z", settlement_status: "failed" },
    other: { kind: "research", slug: "companies/601288-sh", bound_at: "2026-09-26T02:50:00Z" },
    report: { kind: "report", slug: "companies/300308-sz", bound_at: "2026-09-26T02:59:00Z" },
  });
  const latest = latestResearch(s, "companies/300308-sz", () => false, now);
  assert.equal(latest?.sessionId, "now");
  assert.equal(latest?.runFailed, false);
  assert.equal(researchProgressLine(latest, null, false, false, now)?.text, "9 月 26 日 已研究，结论未写入研究页，可重新发起");
  assert.equal(latestResearch(s, "companies/000001-sz", () => false, now), null);
});

test("progress line puts running and pending draft first, and keeps the summary otherwise", () => {
  const running = { sessionId: "a", status: "researching" as const, runFailed: false, startedAt: "2026-09-26T02:57:00Z" };
  assert.deepEqual(researchProgressLine(running, null, false, true, now), { text: "公司研究进行中 · 已用 3 分钟", tone: "active" });
  assert.equal(researchProgressLine({ ...running, status: "settling" }, null, false, true, now)?.text, "研究已完成，正在整理结论");
  const done = { sessionId: "a", status: "awaiting_authorization" as const, runFailed: false, startedAt: "2026-09-26T02:00:00Z" };
  assert.equal(researchProgressLine(done, null, true, true, now)?.tone, "active");
  assert.equal(researchProgressLine(done, null, false, true, now), null);
  assert.equal(researchProgressLine(null, null, false, false, now)?.text, "还没有研究结论，可发起公司研究");
  assert.equal(researchProgressLine({ ...done, status: "failed", runFailed: true, finishedAt: "2026-09-25T16:29:33Z" }, null, false, false, now)?.text, "9 月 26 日 的研究没有完成，可重新发起");
  assert.equal(researchProgressLine({ ...done, status: "no_increment" }, null, false, false, now)?.text, "9 月 26 日 已研究，这次没有新增结论");
});

test("report generation is a long-running task shown after research phases, before pending drafts", () => {
  const s = store({
    rep: { kind: "report", slug: "companies/300308-sz", bound_at: "2026-09-26T02:55:00Z" },
    done: { kind: "report", slug: "companies/300308-sz", bound_at: "2026-09-26T01:00:00Z" },
  });
  const report = runningReport(s, "companies/300308-sz", id => id === "rep", now);
  assert.deepEqual(report, { startedAt: "2026-09-26T02:55:00Z" });
  assert.deepEqual(researchProgressLine(null, report, true, true, now), { text: "图文报告生成中 · 已用 5 分钟", tone: "active" });
  const settling = { sessionId: "a", status: "settling" as const, runFailed: false };
  assert.equal(researchProgressLine(settling, report, false, true, now)?.text, "研究已完成，正在整理结论");
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
