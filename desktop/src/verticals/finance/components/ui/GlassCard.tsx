import { type ReactNode } from "react";
import { Card } from "./Card";

interface Props {
  children: ReactNode;
  className?: string;
  /** 旧属性，已无效果（不再有光晕）。 */
  glow?: boolean;
  onClick?: () => void;
}

// 保留公共组件名，方便未迁移页面；视觉统一为 Card：白底、淡描边，无阴影、渐变与模糊。
export function GlassCard({ children, className, onClick }: Props) {
  return <Card onClick={onClick} className={`p-5 ${className ?? ""}`}>{children}</Card>;
}
