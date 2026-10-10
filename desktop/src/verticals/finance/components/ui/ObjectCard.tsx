import type { LucideIcon } from "lucide-react";
import { ArrowRight } from "lucide-react";
import { Link } from "react-router-dom";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import "./ui.css";

export type ObjectTone = "stock" | "industry" | "chain" | "material";

/** 对象卡：头部（图标块 + 名称与代码 + 关键数）、主体（一句话 + 数据线）、底部（时点 + 进入）。 */
export function ObjectCard({ icon: Icon, tone, name, code, keyValue, text, emptyText, data, foot, to, onOpen, openLabel = "进入", alert, menu }: {
  icon: LucideIcon; tone: ObjectTone; name: string; code?: string; keyValue?: ReactNode;
  text?: ReactNode; emptyText?: ReactNode; data?: ReactNode; foot?: ReactNode;
  to?: string; onOpen?: () => void; openLabel?: string; alert?: boolean; menu?: ReactNode;
}) {
  const open = to ? <Link to={to} className="object-card-open" aria-label={`${openLabel} ${name}`}>{openLabel}<ArrowRight size={13} aria-hidden="true" /></Link>
    : onOpen ? <button type="button" className="object-card-open" onClick={onOpen} aria-label={`${openLabel} ${name}`}>{openLabel}<ArrowRight size={13} aria-hidden="true" /></button> : null;
  return <article className={cn("card card-hover object-card", alert && "card-alert")}>
    <header className="object-card-head">
      <div className="object-card-id">
        <span className={cn("type-icon", `type-${tone}`)} aria-hidden="true"><Icon /></span>
        <div className="object-card-name"><strong title={name}>{name}</strong>{code && <span>{code}</span>}</div>
      </div>
      {(keyValue != null || menu) && <div className="object-card-key">{keyValue}{menu && <div className="object-card-menu">{menu}</div>}</div>}
    </header>
    <div className="object-card-body">
      {text ? <p className="object-card-text">{text}</p> : <p className="object-card-text object-card-empty">{emptyText ?? "\u00a0"}</p>}
      {data}
    </div>
    <footer className="object-card-foot"><span className="min-w-0 truncate">{foot}</span>{open}</footer>
  </article>;
}

