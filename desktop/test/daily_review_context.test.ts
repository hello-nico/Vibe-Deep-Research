import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import vm from "node:vm";
import ts from "typescript";

test("全球指数失败进入可见状态与 AI 摘要，不静默消失", async () => {
  const text = fs.readFileSync(new URL("../src/verticals/finance/pages/DailyReview.tsx", import.meta.url), "utf8");
  const source = ts.createSourceFile("DailyReview.tsx", text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const expressions = new Map<string, ts.Expression>();
  function visit(n: ts.Node): void {
    if (ts.isVariableDeclaration(n) && n.initializer) expressions.set(n.name.getText(source), n.initializer);
    ts.forEachChild(n, visit);
  }
  visit(source);
  const compile = (name: string) => ts.transpileModule(`(${expressions.get(name)!.getText(source)})`, {
    compilerOptions: { target: ts.ScriptTarget.ES2022 },
  }).outputText;
  let globalErr: string | null = null;
  let globalDone = false;
  let pageMeta: unknown = { business_date: "2026-09-03" };
  let requests = 0;
  let releasePage!: (v: { blocks: never[] }) => void;
  const pagePromise = new Promise<{ blocks: never[] }>(resolve => { releasePage = resolve; });
  const fetchingRef = { current: false };
  const noop = () => {};
  const load = vm.runInNewContext(compile("loadIndices"), {
    Error,
    fetchingRef, reviewLoading: false,
    api: { indices: async () => [], globalIndices: async () => { throw new Error("全球指数未接入"); },
      emotion: async () => null, turnoverTop: async () => null, marketOverview: async () => null },
    backend: { page: () => { requests++; return pagePromise; } },
    setIndices: noop, setIdxErr: noop, setIdxDone: noop, setGlobalIdx: noop,
    setGlobalDone: (v: boolean) => { globalDone = v; }, setGlobalErr: (v: string | null) => { globalErr = v; },
    setEmotion: noop, setEmoDone: noop, setTurnover: noop, setToDone: noop,
    setPageErr: noop, setPageMeta: (v: unknown) => { pageMeta = v; }, setOverview: noop, setOvDone: noop,
  }) as () => Promise<void>;
  const first = load();
  assert.equal(pageMeta, null, "刷新开始必须撤下旧业务日，不能等新请求返回才清理");
  await load();
  assert.equal(requests, 1, "前一轮尚未结束时重复刷新不能叠加请求");
  releasePage({ blocks: [] });
  await first;
  assert.equal(fetchingRef.current, false, "各请求结束后可以重新刷新");
  assert.equal(globalDone, true);
  assert.match(globalErr!, /全球指数未接入/);
  const summary = vm.runInNewContext(compile("dataSummary"), {
    pageMeta: null, indices: [], globalIdx: [], globalErr, globalDone, dataReady: true,
    idxDone: true, emoDone: true, toDone: true, ovDone: true, pageErr: null,
    sentiment: null, sentCells: [], emotion: null, sectors: [], turnover: null,
  });
  assert.match(summary, /【海外指数】.*未接入/);
  assert.doesNotMatch(text, /\{globalIdx\.length > 0 &&\s*\(/, "面板不再以有数据为显示前提；状态标签仍可以检查数据是否为空");
});

test("盘面各块完成态决定 dataReady，不再依赖本页复盘按钮", () => {
  const text = fs.readFileSync(new URL("../src/verticals/finance/pages/DailyReview.tsx", import.meta.url), "utf8");
  const source = ts.createSourceFile("DailyReview.tsx", text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const expressions = new Map<string, ts.Expression>();
  function visit(node: ts.Node): void {
    if (ts.isVariableDeclaration(node) && node.initializer) expressions.set(node.name.getText(source), node.initializer);
    ts.forEachChild(node, visit);
  }
  visit(source);
  const compile = (key: string) => ts.transpileModule(`(${expressions.get(key)!.getText(source)})`, {
    compilerOptions: { target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const flags = { idxDone: true, globalDone: true, emoDone: true, toDone: true, ovDone: true };
  for (const key of Object.keys(flags)) {
    assert.equal(vm.runInNewContext(compile("dataReady"), { ...flags, [key]: false }), false, key);
  }
  assert.equal(vm.runInNewContext(compile("dataReady"), flags), true);
  assert.match(text, /disabled=\{!dataReady\}/);
  assert.doesNotMatch(text, /runReview|reviewLoading/);
});
