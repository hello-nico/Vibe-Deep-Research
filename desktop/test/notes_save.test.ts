import assert from "node:assert/strict";
import test from "node:test";
import { createServer } from "vite";
import { createServer as createHttpServer } from "node:http";
import { fileURLToPath } from "node:url";

test("同一次保存重试共用 operation_id，成功后另行保存换新 ID", async () => {
  const bodies: Array<{ operation_id: string; title: string }> = [];
  let failOnce = true;
  const previousFetch = globalThis.fetch;
  globalThis.fetch = (async (_url: string | URL | Request, init?: RequestInit) => {
    const payload = JSON.parse(String(init?.body || "{}")) as { operation_id: string; title: string };
    bodies.push(payload);
    if (failOnce) {
      failOnce = false;
      return new Response(JSON.stringify({ detail: { code: "unavailable", message: "down" } }), {
        status: 503,
        headers: { "Content-Type": "application/json" },
      });
    }
    return new Response(JSON.stringify({
      note_id: `note-${bodies.length}`,
      category: "ask",
      title: payload.title,
      body: "正文",
      created_at: "2026-01-01T00:00:00Z",
    }), { status: 200, headers: { "Content-Type": "application/json" } });
  }) as typeof fetch;
  const server = await createServer({
    configFile: false,
    root: fileURLToPath(new URL("../", import.meta.url)),
    server: { middlewareMode: true, hmr: { server: createHttpServer() }, watch: null },
    appType: "custom",
  });
  try {
    const { addNote } = await server.ssrLoadModule("/src/verticals/finance/lib/notes.ts");
    await assert.rejects(() => addNote("问助手", "电力", "正文", "op-first"));
    await addNote("问助手", "电力", "正文", "op-independent");
    await addNote("问助手", "电力", "正文", "op-first");
    assert.equal(bodies[0].operation_id, bodies[2].operation_id);
    assert.notEqual(bodies[0].operation_id, bodies[1].operation_id);
    await addNote("问助手", "电力", "正文");
    await addNote("问助手", "电力", "正文");
    assert.notEqual(bodies[3].operation_id, bodies[4].operation_id);
  } finally {
    globalThis.fetch = previousFetch;
    await server.close();
  }
});
