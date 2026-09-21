/**
 * 自选股 —— 产品本地 SQLite，按单个代码增删。
 */
import { localService } from "./localService";
import { normalizeMarketSymbol, parseMarketSymbols } from "./marketSymbol";

let cache: string[] = [];
let seq = 0;
let saveQueue: Promise<void> = Promise.resolve();

export async function hydrateWatch(): Promise<void> {
  const mine = ++seq;
  const { symbols } = await localService.clientWatch();
  if (mine !== seq) return;
  cache = symbols;
}

export function loadWatch(): string[] {
  return [...cache];
}

function enqueue(work: () => Promise<void>): Promise<void> {
  const next = saveQueue.catch(() => undefined).then(work);
  saveQueue = next.catch(() => undefined);
  return next;
}

export function addWatch(symbol: string): Promise<void> {
  const code = normalizeMarketSymbol(symbol);
  if (!code) return Promise.reject(new Error("无法识别的代码"));
  return enqueue(async () => {
    try {
      const result = await localService.clientWatchAdd(code);
      seq++;
      cache = result.symbols;
    } finally {
      await hydrateWatch().catch(() => { /* 保留旧缓存，错误由上面抛出 */ });
    }
  });
}

export function removeWatch(symbol: string): Promise<void> {
  const code = normalizeMarketSymbol(symbol);
  if (!code) return Promise.reject(new Error("无法识别的代码"));
  return enqueue(async () => {
    try {
      const result = await localService.clientWatchRemove(code);
      seq++;
      cache = result.symbols;
    } finally {
      await hydrateWatch().catch(() => { /* 同上 */ });
    }
  });
}

export function parseCodes(raw: string): string[] {
  return parseMarketSymbols(raw);
}

export function addCodes(existing: string[], raw: string): { next: string[]; added: number } {
  const incoming = parseCodes(raw).filter((c) => !existing.includes(c));
  return { next: [...existing, ...incoming], added: incoming.length };
}
