import type { LucideIcon } from "lucide-react";
import { Layers3 } from "lucide-react";
import type { ReactNode } from "react";
import { ObjectCard, type ObjectTone } from "./ui/ObjectCard";

/** 行业 / 产业 / 资料目录共用的对象卡（三行骨架，同类等高）；样式全部来自 ObjectCard。 */
export function DashboardCard({
  title,
  description,
  href,
  onClick,
  ready = true,
  footer,
  icon = Layers3,
  tone = "industry",
  code,
  data,
  note,
  openLabel = "查看",
}: {
  title: string;
  description: string;
  href?: string;
  onClick?: () => void;
  ready?: boolean;
  footer: string;
  icon?: LucideIcon;
  tone?: ObjectTone;
  code?: string;
  /** 数据线：状态胶囊、关注公司数等。 */
  data?: ReactNode;
  /** 卡片头部右侧的小说明。 */
  note?: ReactNode;
  openLabel?: string;
}) {
  return <ObjectCard icon={icon} tone={tone} name={title} code={code} keyValue={note}
    text={description} data={data} foot={footer}
    to={ready ? href : undefined} onOpen={ready && !href ? onClick : undefined} openLabel={openLabel} />;
}

export { DashboardCard as IndustryDashboardCard };
