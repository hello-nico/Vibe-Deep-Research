import * as React from "react";
import { createPortal } from "react-dom";

export interface SlotProps {
  renderSlot(name: string, owner: object): React.ReactNode;
  useConnectionState<T>(selector: (state: string | undefined) => T): T;
}
export const FinanceSlots = React.createContext<SlotProps | null>(null);

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
    {conversation && createPortal(<div style={{ height: "100%", display: "flex", flexDirection: "column", minHeight: 0 }}>{slots.renderSlot("conversation", {})}</div>, conversation)}
    {settings && createPortal(slots.renderSlot("sidebar", {}), settings)}
    {status && createPortal(<ConnectionStatus slots={slots} />, status)}
  </>;
}
function ConnectionStatus({ slots }: { slots: SlotProps }) {
  const connection = slots.useConnectionState(state => state);
  return <span role="status">{connection === "connected" ? "" : connection === "disconnected" ? "DSH 连接中断" : "DSH 连接中"}</span>;
}
