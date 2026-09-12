import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";

export interface TopicSessionGate {
  blocking: boolean;
  message: string;
  setGate: (next: { blocking: boolean; message: string }) => void;
}

const TopicSessionGateContext = createContext<TopicSessionGate | null>(null);

export function TopicSessionGateProvider({ children }: { children: ReactNode }) {
  const [gate, setGateState] = useState({ blocking: false, message: "" });
  const setGate = useCallback((next: { blocking: boolean; message: string }) => setGateState(next), []);
  const value = useMemo<TopicSessionGate>(() => ({
    ...gate,
    setGate,
  }), [gate, setGate]);
  return <TopicSessionGateContext.Provider value={value}>{children}</TopicSessionGateContext.Provider>;
}

export function useTopicSessionGate() {
  const gate = useContext(TopicSessionGateContext);
  if (!gate) throw new Error("议题会话闸门尚未连接");
  return gate;
}
