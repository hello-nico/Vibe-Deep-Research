import * as React from "react";
import { createPortal } from "react-dom";
import { PageHeader } from "../components/ui/PageHeader";
import { GroupCard, GroupRow } from "../components/ui/Card";
import { WorkspaceTabs } from "../components/ui/WorkspaceTabs";
import { openModelSettings } from "./settings-entry";
import { ResearchSessionContext } from "./research-session";

export interface SlotProps {
  renderSlot(name: string, owner: object, options?: { entryKey?: string }): React.ReactNode;
  useConnectionState<T>(selector: (state: string | undefined) => T): T;
}
export const FinanceSlots = React.createContext<SlotProps | null>(null);

export { openModelSettings };
// 关于我带路由链接，进设置时才加载。
const AboutMe = React.lazy(async () => ({ default: (await import("../components/AboutMe")).AboutMe }));
const ConnectionPanel = React.lazy(async () => ({ default: (await import("../components/ConnectionPanel")).ConnectionPanel }));
const SETTINGS_SEGMENTS = [{ value: "about", label: "关于我" }, { value: "model", label: "模型" }, { value: "connection", label: "连接" }] as const;

export function ModelSettings() {
  const [tab, setTab] = React.useState<(typeof SETTINGS_SEGMENTS)[number]["value"]>("about");
  const researchSessions = React.useContext(ResearchSessionContext);
  return <div>
    <PageHeader title="设置" assistant={false} actions={<WorkspaceTabs aria-label="设置分段" value={tab} onChange={setTab} options={SETTINGS_SEGMENTS} />} />
    {tab === "connection"
      ? <React.Suspense fallback={<p role="status" className="text-sm text-muted-foreground">正在读取连接设置…</p>}><ConnectionPanel /></React.Suspense>
      : tab === "about"
      ? <React.Suspense fallback={<p role="status" className="text-sm text-muted-foreground">正在读取…</p>}><AboutMe onOpenSource={id => { void researchSessions?.openSession(id); }} /></React.Suspense>
      : <GroupCard label="模型">
        <GroupRow title="模型与接入" description="对话、资讯翻译、要点提炼与研究任务共用设置中的模型，无需重复接入。">
          <button type="button" onClick={openModelSettings} className="btn btn-primary">打开模型设置</button>
        </GroupRow>
      </GroupCard>}
  </div>;
}

/** Product seats only. DSH owns the React root and plugin Loader. */
export function NativeDshHost() {
  const slots = React.useContext(FinanceSlots);
  const [mounted, setMounted] = React.useState(false);
  React.useLayoutEffect(() => { setMounted(true); }, []);
  if (!slots || !mounted) return null;
  const conversation = document.getElementById("dsh-conversation");
  const settings = document.getElementById("dsh-settings");
  const status = document.getElementById("dsh-status");
  return <>
    {conversation && createPortal(<div style={{ height: "100%", display: "flex", flexDirection: "column", minHeight: 0 }}>{slots.renderSlot("main", {}, { entryKey: "conversation" })}</div>, conversation)}
    {settings && createPortal(slots.renderSlot("sidebar", {}), settings)}
    {status && createPortal(<ConnectionStatus slots={slots} />, status)}
  </>;
}
function ConnectionStatus({ slots }: { slots: SlotProps }) {
  const connection = slots.useConnectionState(state => state);
  return <span role="status">{connection === "connected" ? "" : connection === "disconnected" ? "研究服务连接中断" : "正在连接研究服务"}</span>;
}
