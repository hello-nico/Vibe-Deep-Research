import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import { readFileSync } from "node:fs";
// @ts-expect-error DSH plugin is JavaScript.
import { apply, bindPluginRoutes } from "../dsh/finance-ui/server.mjs";
// @ts-expect-error DSH plugin is JavaScript.
import { installPageModel } from "../dsh/finance-ui/model.mjs";
// @ts-expect-error DSH plugin is JavaScript.
import { installHostState } from "../dsh/finance-ui/host-state.mjs";

function fakeWebServer() {
  const routes = new Map<string, { handler: unknown }>();
  return {
    routes,
    register(route: { kind: string; path: string; handler: unknown }) {
      const key = `${route.kind}:${route.path}`;
      if (routes.has(key)) throw new Error(`duplicate ${key}`);
      routes.set(key, route);
      return () => { routes.delete(key); };
    },
  };
}

function pluginCtx(webServer: ReturnType<typeof fakeWebServer>) {
  const effects: Array<() => void> = [];
  return {
    webServer,
    agentDefaultModel: { currentSelection: () => null },
    llm: { async *stream() {} },
    effect(factory: () => () => void) { effects.push(factory()); },
    effects,
  };
}

test("HTTP 插件卸载会注销路由，再次挂载不会留下旧 handler", () => {
  const webServer = fakeWebServer();
  const ctx = pluginCtx(webServer);
  bindPluginRoutes(ctx, track => { track(installPageModel(ctx)); track(installHostState(ctx)); });
  assert.equal(webServer.routes.has("exact:/finance-model"), true);
  assert.equal(webServer.routes.has("exact:/finance-topic-sessions"), true);
  assert.equal(webServer.routes.has("exact:/finance-assistant-sessions"), true);
  const first = webServer.routes.get("exact:/finance-model")?.handler;
  for (const dispose of ctx.effects.splice(0).reverse()) dispose();
  assert.equal(webServer.routes.size, 0);
  bindPluginRoutes(ctx, track => { track(installPageModel(ctx)); track(installHostState(ctx)); });
  assert.equal(webServer.routes.has("exact:/finance-model"), true);
  assert.notEqual(webServer.routes.get("exact:/finance-model")?.handler, first);
});

test("路由安装中途失败会回滚已注册项，再次挂载不会冲突", () => {
  const webServer = fakeWebServer();
  const original = webServer.register.bind(webServer);
  webServer.register = (route: { kind: string; path: string; handler: unknown }) => {
    if (route.path === "/finance-background-tasks") throw new Error("install failed");
    return original(route);
  };
  const ctx = pluginCtx(webServer);
  assert.throws(() => bindPluginRoutes(ctx, track => {
    track(installPageModel(ctx));
    track(installHostState(ctx));
  }), /install failed/);
  assert.equal(ctx.effects.length, 0);
  assert.equal(webServer.routes.size, 0);
  webServer.register = original;
  bindPluginRoutes(ctx, track => { track(installPageModel(ctx)); track(installHostState(ctx)); });
  assert.equal(webServer.routes.has("exact:/finance-model"), true);
  assert.equal(webServer.routes.has("exact:/finance-background-tasks"), true);
});

test("旧阶段模型入口和源码已删除，产品护栏由同一份 patch/persona 继承", () => {
  assert.equal(fs.existsSync(new URL("../dsh/finance-ui/stage-model.mjs", import.meta.url)), false);
  const server = readFileSync(new URL("../dsh/finance-ui/server.mjs", import.meta.url), "utf8");
  assert.doesNotMatch(server, /installStageModel|stage-model/);
  // sessionPersistence 服务 reportTasksWithLineage（报告任务血缘，M9.5），不属 M9.9。
  assert.match(server, /inject = \["webServer", "llm", "agentDefaultModel", "sessions", "sessionPersistence", "agents", "subagents"\]/);
  const patch = readFileSync(new URL("../dsh/finance-ui/cordis.patch.yml", import.meta.url), "utf8");
  assert.match(patch, /surfaceContext:\s*false/);
  assert.match(patch, /includeRuntimeContext:\s*false/);
  const persona = readFileSync(new URL("../dsh/presets/vibe/agent.cordis.yml", import.meta.url), "utf8");
  assert.match(persona, /Do not volunteer internal deployment addresses/);
  assert.match(persona, /Describe only capabilities actually available in this session/);
  assert.match(persona, /not a guarantee that/);
  assert.match(persona, /explanations do not require a full research workflow/);
  // 页面问助手不带研究纪律，产品底线必须由 persona 自带，不能引用模型看不到的文本。
  assert.match(persona, /Do not give investment actions/);
  assert.match(persona, /never from memory/);
  assert.doesNotMatch(persona, /Follow the Stock-Research research\s+discipline/);
});

test("真实插件的每个注册失败点都回滚，并可重装卸载", () => {
  for (let failAt = 1; failAt <= 16; failAt++) {
    const webServer = fakeWebServer();
    const register = webServer.register.bind(webServer);
    let count = 0;
    webServer.register = route => {
      if (++count === failAt) throw new Error('injected failure');
      return register(route);
    };
    const ctx = { ...pluginCtx(webServer), on() {} };
    assert.throws(() => apply(ctx), /injected failure/, `registration ${failAt}`);
    assert.equal(webServer.routes.size, 0, `registration ${failAt}`);
    webServer.register = register;
    apply(ctx);
    assert.equal(webServer.routes.size, 16);
    for (const dispose of ctx.effects.splice(0).reverse()) dispose();
    assert.equal(webServer.routes.size, 0);
  }
});
