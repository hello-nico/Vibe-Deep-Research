/** 本机数据服务（orchestrator，8765）客户端：页面取数、快照及 Client 选择与偏好。与 Stock Backend 客户端 `research.ts` 区分。 */

export class ApiError extends Error {
  readonly status: number;
  readonly code: string;
  constructor(
    message: string,
    status: number,
    code = "",
  ) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
  }
}

async function call<T>(path: string, init?: RequestInit): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`/finance-api${path}`, {
      ...init,
      headers: {
        Accept: "application/json",
        ...(init?.body ? { "Content-Type": "application/json" } : {}),
        ...init?.headers,
      },
    });
  } catch (e) {
    // 用户取消/切换模式不是连接故障，保留 AbortError 给界面识别。
    init?.signal?.throwIfAborted();
    // fetch 只在网络层失败时抛。这里不能静默成空数据,否则页面把"连不上"渲染成"没有数据"
    throw new ApiError(`连不上本机服务，请确认工作台已启动（${e instanceof Error ? e.message : String(e)}）`, 0, "network");
  }
  const text = await res.text();
  let body: unknown = null;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    // 代理错误页是 HTML,直接 res.json() 会炸在 "Unexpected token <",把真正原因埋掉
    throw new ApiError('本机服务返回了无法识别的内容，请刷新后重试', res.status, "bad_response");
  }
  if (!res.ok) {
    const b = body as { error?: string; message?: string } | null;
    const code = b?.error ?? String(res.status);
    const raw = b?.message ?? b?.error ?? `HTTP ${res.status}`;
    throw new ApiError(raw, res.status, code);
  }
  return body as T;
}

export const localService = {
  health: () => call<{ ok: boolean; version: string }>("/health"),

  clientWatch: () => call<{ symbols: string[] }>("/client/watch"),
  clientWatchAdd: (symbol: string) =>
    call<{ symbols: string[]; added: boolean }>("/client/watch", { method: "POST", body: JSON.stringify({ symbol }) }),
  clientWatchRemove: (symbol: string) =>
    call<{ symbols: string[]; removed: boolean }>("/client/watch/delete", { method: "POST", body: JSON.stringify({ symbol }) }),
  clientResearch: () => call<{ symbols: string[] }>("/client/research"),
  clientResearchAdd: (symbol: string) =>
    call<{ symbols: string[]; added: boolean }>("/client/research", { method: "POST", body: JSON.stringify({ symbol }) }),
  clientResearchRemove: (symbol: string) =>
    call<{ symbols: string[]; removed: boolean }>("/client/research/delete", { method: "POST", body: JSON.stringify({ symbol }) }),
  clientResearchTouch: (symbol: string) =>
    call<{ symbols: string[]; touched: boolean }>("/client/research/touch", { method: "POST", body: JSON.stringify({ symbol }) }),
  clientPrefs: () => call<{ prefs: Record<string, string> }>("/client/prefs"),
  clientPrefSet: (key: string, value: string) =>
    call<{ prefs: Record<string, string> }>("/client/prefs", { method: "POST", body: JSON.stringify({ key, value }) }),
};
