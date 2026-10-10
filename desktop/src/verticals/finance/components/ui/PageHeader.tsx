import { type ReactNode } from "react";
import { AssistantSlot } from "../layout/assistantSlot";
import "./ui.css";

interface Props {
  title: string;
  /** 可选的一行灰字；默认不用。 */
  subtitle?: string;
  search?: ReactNode;
  actions?: ReactNode;
  /** 对话首页等不挂「问助手」的页面设为 false。 */
  assistant?: boolean;
}

/** 页首：左侧标题，右侧搜索、动作与「问助手」；不放面包屑、橙色小标题和装饰性说明。 */
export function PageHeader({ title, subtitle, search, actions, assistant = true }: Props) {
  return (
    <header className="page-head">
      <div className="page-head-title">
        <h1 className="workspace-title">{title}</h1>
        {subtitle && <p className="page-head-sub">{subtitle}</p>}
      </div>
      <div className="page-head-actions">
        {search}
        {actions}
        {assistant && <AssistantSlot />}
      </div>
    </header>
  );
}
