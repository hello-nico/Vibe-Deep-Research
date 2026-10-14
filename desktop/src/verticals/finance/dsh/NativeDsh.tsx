import * as React from "react";
import { createPortal } from "react-dom";
import { PageHeader } from "../components/ui/PageHeader";
import { GroupCard, GroupRow } from "../components/ui/Card";
import { WorkspaceTabs } from "../components/ui/WorkspaceTabs";
import { ResearchSessionContext } from "./research-session";

export interface SlotProps {
  renderSlot(name: string, owner: object, options?: { entryKey?: string }): React.ReactNode;
  useConnectionState<T>(selector: (state: string | undefined) => T): T;
}
export const FinanceSlots = React.createContext<SlotProps | null>(null);

export function openModelSettings() {
  document.querySelector<HTMLButtonElement>('#dsh-settings [data-slot="sidebar.settings"] button')?.click();
}
// 记忆页带路由链接，进设置的「记忆」时才加载。
const MemoryPanel = React.lazy(async () => ({ default: (await import("../components/MemoryPanel")).MemoryPanel }));
const SETTINGS_SEGMENTS = [{ value: "model", label: "模型" }, { value: "memory", label: "记忆" }] as const;

export function ModelSettings() {
  const [tab, setTab] = React.useState<(typeof SETTINGS_SEGMENTS)[number]["value"]>("model");
  const researchSessions = React.useContext(ResearchSessionContext);
  return <div>
    <PageHeader title="设置" assistant={false} actions={<WorkspaceTabs aria-label="设置分段" value={tab} onChange={setTab} options={SETTINGS_SEGMENTS} />} />
    {tab === "memory"
      ? <React.Suspense fallback={<p role="status" className="text-sm text-muted-foreground">正在读取记忆…</p>}><MemoryPanel onOpenSource={id => { void researchSessions?.openSession(id); }} /></React.Suspense>
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
