import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { LocalAgentStageAgent } from "../src/engines/local_agent_stage_agent.ts";

test("本机订阅 Agent 每阶段只得到五个受控 MCP 工具，并如实记账产物变更", async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "vra-local-stage-"));
  const runDir = path.join(root, "run");
  fs.mkdirSync(path.join(runDir, "stages"), { recursive: true });
  const events = path.join(runDir, "events.jsonl");
  try {
    const runner = new LocalAgentStageAgent({ agent: "codebuddy", runId: "r1", runDir,
      repoRoot: root, python: "python3", eventsPath: events, timeoutMs: 10_000,
      complete: async (agent, options) => {
        assert.equal(agent, "codebuddy");
        assert.equal(options.controlledMcp?.serverName, "vra");
        assert.deepEqual(options.controlledMcp?.allowedTools.sort(), [
          "mcp__vra__calculate", "mcp__vra__list_run_files", "mcp__vra__read_run_file",
          "mcp__vra__write_report", "mcp__vra__write_stage",
        ]);
        assert.ok(!options.systemPrompt.includes("Bash"));
        fs.writeFileSync(path.join(runDir, "stages", "profile.json"), "{}\n");
        return '{"summary":"done"}';
      },
    });
    const result = await runner.runTurn("profile", 0, "做公司画像", { type: "object" });
    assert.equal(result.failed, null);
    assert.equal(result.threadId, null);
    assert.deepEqual(result.commands, []);
    assert.deepEqual(result.fileChanges, [path.join(runDir, "stages", "profile.json")]);
    assert.match(fs.readFileSync(events, "utf8"), /local_agent\.turn_end/);
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});

test("本机订阅 Agent 失败转成 turn failure，不把它冒充成模型空回复", async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "vra-local-stage-fail-"));
  try {
    const runner = new LocalAgentStageAgent({ agent: "claude", runId: "r2", runDir: root,
      repoRoot: root, python: "python3", eventsPath: path.join(root, "events.jsonl"), timeoutMs: 10_000,
      complete: async () => { throw new Error("boom"); } });
    const result = await runner.runTurn("profile", 0, "x");
    assert.match(result.failed ?? "", /boom/);
    assert.equal(result.itemCount, 0);
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});
