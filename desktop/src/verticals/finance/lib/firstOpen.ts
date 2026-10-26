import { marketOfSymbol, normalizeMarketSymbol } from "./marketSymbol";
import { symbolFromCompanySlug } from "./research";
import type { WikiItem } from "./research";

/** 示例公司：只显示已研究过的，没有研究过的不出现。 */
export const FIRST_OPEN_EXAMPLES = [
  { name: "神火股份", symbol: "000933" },
  { name: "长江电力", symbol: "600900" },
  { name: "农业银行", symbol: "601288" },
] as const;

export type FirstOpenPick = { symbol: string; name: string } | { hint: string };

export function firstOpenExamples(pages: readonly WikiItem[]) {
  const researched = new Set(pages.map(page => symbolFromCompanySlug(page.slug)));
  return FIRST_OPEN_EXAMPLES.filter(item => researched.has(item.symbol));
}

/** 名称只匹配已研究过的公司（没有名称搜索接口）；其余按代码规则解析，只支持 A 股。 */
export function resolveFirstOpenInput(input: string, pages: readonly WikiItem[]): FirstOpenPick {
  const text = input.trim();
  if (!text) return { hint: "" };
  const named = pages.filter(page => page.title.includes(text) && symbolFromCompanySlug(page.slug));
  const exact = named.filter(page => page.title === text);
  const hit = exact.length === 1 ? exact : named;
  if (hit.length === 1) return { symbol: symbolFromCompanySlug(hit[0]!.slug)!, name: hit[0]!.title };
  if (hit.length > 1) return { hint: "有多家公司匹配，请输入 6 位代码" };
  const code = normalizeMarketSymbol(text);
  if (!code) return { hint: "没认出这家公司，请输入 6 位 A 股代码" };
  if (marketOfSymbol(code) !== "CN") return { hint: "港股、美股暂不支持研究，请输入 A 股公司" };
  return { symbol: code, name: code };
}
