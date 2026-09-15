/**
 * 加入研究名单 —— 独立于自选与 Wiki 是否存在。空名单不能降级为全部公司。
 */
import { backend } from "./backend";
import { normalizeMarketSymbol } from "./marketSymbol";

let cache: string[] = [];
let seq = 0;
let saveQueue: Promise<void> = Promise.resolve();

export async function hydrateRoster(): Promise<void> {
  const mine = ++seq;
  const { symbols } = await backend.clientResearch();
  if (mine !== seq) return;
  cache = symbols;
}

export function loadRoster(): string[] {
  return [...cache];
}

function enqueue(work: () => Promise<void>): Promise<void> {
  const next = saveQueue.catch(() => undefined).then(work);
  saveQueue = next.catch(() => undefined);
  return next;
}

export function addToRoster(symbol: string): Promise<void> {
  const code = normalizeMarketSymbol(symbol);
  if (!code) return Promise.reject(new Error("无法识别的代码"));
  return enqueue(async () => {
    try {
      const result = await backend.clientResearchAdd(code);
      seq++;
      cache = result.symbols;
    } finally {
      await hydrateRoster().catch(() => undefined);
    }
  });
}

export function removeFromRoster(symbol: string): Promise<void> {
  const code = normalizeMarketSymbol(symbol);
  if (!code) return Promise.reject(new Error("无法识别的代码"));
  return enqueue(async () => {
    try {
      const result = await backend.clientResearchRemove(code);
      seq++;
      cache = result.symbols;
    } finally {
      await hydrateRoster().catch(() => undefined);
    }
  });
}
