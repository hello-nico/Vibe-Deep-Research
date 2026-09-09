import assert from "node:assert/strict";
import test from "node:test";
import { marketRequest } from "../src/verticals/finance/lib/marketRequest.ts";

test("一路挂起仍会结束本轮等待，允许下一轮重试", async () => {
  const results = await Promise.allSettled([
    marketRequest(Promise.resolve("已取得行情"), 10),
    marketRequest(new Promise(() => {}), 10),
  ]);
  assert.equal(results[0].status, "fulfilled");
  assert.equal(results[1].status, "rejected");
  assert.equal(await marketRequest(Promise.resolve("重试成功"), 10), "重试成功");
});

test("超时后迟到的数据不覆盖下一轮结果", async () => {
  let finish!: (value: string) => void;
  let displayed = "";
  const old = marketRequest(new Promise<string>((resolve) => { finish = resolve; }), 10)
    .then((value) => { displayed = value; });
  await assert.rejects(old, /加载超时/);
  displayed = await marketRequest(Promise.resolve("新行情"), 10);
  finish("旧行情");
  await Promise.resolve();
  assert.equal(displayed, "新行情");
});

test("数据源错误保留原始原因", async () => {
  const error = new Error("数据源不可用");
  await assert.rejects(marketRequest(Promise.reject(error)), (actual) => actual === error);
});
