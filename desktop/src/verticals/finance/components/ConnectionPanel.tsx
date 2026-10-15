import { useCallback, useEffect, useState } from "react";
import { GroupCard, GroupRow } from "./ui/Card";
import { CLIENT_OUTDATED, SERVER_OUTDATED } from "../lib/researchSymbol";
import "./connection-panel.css";

/** 宿主连接配置接口（GET/PUT /finance-backend-connection、POST …/test）；令牌只写不读。 */
const ENDPOINT = "/finance-backend-connection";
type Outcome = "ok" | "unreachable" | "unauthorized" | "server_outdated" | "client_outdated";
const OUTCOME_TEXT: Record<Outcome, string> = {
  ok: "已连接", unreachable: "连不上这个地址", unauthorized: "访问令牌不对",
  server_outdated: SERVER_OUTDATED, client_outdated: CLIENT_OUTDATED,
};

async function call<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${ENDPOINT}${path}`, init && { ...init, headers: { "Content-Type": "application/json" } });
  if (!response.ok) throw new Error(String(response.status));
  return await response.json() as T;
}
const outcomeOf = (body: { status?: string; result?: string }): Outcome | null => {
  const value = body.status ?? body.result;
  return value === "ok" || value === "unreachable" || value === "unauthorized" || value === "server_outdated" || value === "client_outdated" ? value : null;
};

export function ConnectionPanel() {
  const [url, setUrl] = useState("");
  const [token, setToken] = useState("");
  const [hasToken, setHasToken] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const read = useCallback(async () => {
    const body = await call<{ url?: string; has_token?: boolean }>("");
    setUrl(body.url ?? ""); setHasToken(Boolean(body.has_token)); setLoaded(true);
  }, []);
  useEffect(() => { read().catch(() => { setLoaded(true); setMessage("暂时读取不到连接设置"); }); }, [read]);
  const put = (body: { url: string; token?: string }) => call("", { method: "PUT", body: JSON.stringify(body) });
  const run = async (action: () => Promise<void>, failure: string) => {
    setBusy(true); setMessage("");
    try { await action(); } catch { setMessage(failure); } finally { setBusy(false); }
  };
  const save = () => run(async () => {
    await put({ url: url.trim(), ...(token ? { token } : {}) });
    setToken(""); await read(); setMessage("已保存");
  }, "没有保存成功，请检查地址是否完整（以 http:// 或 https:// 开头）");
  const test = () => run(async () => {
    await put({ url: url.trim(), ...(token ? { token } : {}) });
    setToken(""); await read();
    const outcome = outcomeOf(await call<{ status?: string; result?: string }>("/test", { method: "POST", body: "{}" }));
    setMessage(outcome ? OUTCOME_TEXT[outcome] : "暂时测不了，请稍后重试");
  }, "暂时测不了，请稍后重试");
  const clear = () => run(async () => {
    await put({ url: url.trim(), token: "" });
    setToken(""); await read(); setMessage("访问令牌已清除");
  }, "没有清除成功，请稍后重试");
  return <GroupCard label="连接">
    <GroupRow title="服务器地址" description="不填就用本机。">
      <input className="connection-input" aria-label="服务器地址" type="url" value={url} placeholder="https://" disabled={!loaded || busy} onChange={event => setUrl(event.target.value)} />
    </GroupRow>
    <GroupRow title="访问令牌" description="保存后不会再显示。">
      <input className="connection-input" aria-label="访问令牌" type="password" autoComplete="off" value={token} placeholder={hasToken ? "已保存" : ""} disabled={!loaded || busy} onChange={event => setToken(event.target.value)} />
    </GroupRow>
    <GroupRow title={<span role="status" className="connection-message">{message || " "}</span>}>
      <button type="button" className="btn" disabled={!loaded || busy || !hasToken} onClick={() => void clear()}>清除令牌</button>
      <button type="button" className="btn" disabled={!loaded || busy} onClick={() => void test()}>测试连接</button>
      <button type="button" className="btn btn-primary" disabled={!loaded || busy} onClick={() => void save()}>保存</button>
    </GroupRow>
  </GroupCard>;
}
