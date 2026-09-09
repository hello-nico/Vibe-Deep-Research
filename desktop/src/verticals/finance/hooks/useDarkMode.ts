import { useEffect, useState } from "react";

import { storageGet, storageSet } from "@/lib/storage";

// 恢复公开版暖橙主题，保留既有深浅主题选择。
// 机制：亮色时给 <html> 加 .light（暗色为无类名的默认态）。
export function useDarkMode() {
  const [dark, setDark] = useState(() => {
    if (document.body.classList.contains("vibe-dsh-host")) return document.body.hasAttribute("data-ds-dark-theme");
    const saved = storageGet("vr-theme");
    if (saved) return saved === "dark";
    return true; // 默认暗色
  });

  useEffect(() => {
    document.documentElement.classList.toggle("light", !dark);
    document.documentElement.classList.toggle("dark", dark);
    storageSet("vr-theme", dark ? "dark" : "light");
  }, [dark]);

  useEffect(() => {
    const sync = (event: Event) => setDark((event as CustomEvent<boolean>).detail);
    window.addEventListener("dsh-theme-change", sync);
    return () => window.removeEventListener("dsh-theme-change", sync);
  }, []);

  return { dark, toggle: () => {
    setDark(!dark);
    window.dispatchEvent(new CustomEvent("vibe-theme-change", { detail: !dark }));
  } };
}
