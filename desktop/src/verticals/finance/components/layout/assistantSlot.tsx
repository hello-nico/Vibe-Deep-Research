import { createContext, useContext, useEffect, useRef, type ReactNode } from "react";

/** 「问助手」按钮的落点：页首（或对象页工具栏）右侧的一个占位；外壳把按钮放进当前登记的占位。 */
const SlotContext = createContext<((el: HTMLElement | null) => void) | null>(null);

export function AssistantSlotProvider({ onHost, children }: { onHost: (el: HTMLElement | null) => void; children: ReactNode }) {
  return <SlotContext.Provider value={onHost}>{children}</SlotContext.Provider>;
}

export function AssistantSlot() {
  const register = useContext(SlotContext);
  const ref = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    const el = ref.current;
    register?.(el);
    return () => register?.(null);
  }, [register]);
  return <span ref={ref} className="assistant-slot contents" data-assistant-slot />;
}
