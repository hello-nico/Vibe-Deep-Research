import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import { GlassCard } from "./GlassCard";
import "./dashboard-panel.css";

export function DashboardPanel({
  title,
  icon: Icon,
  count,
  meta,
  actions,
  children,
}: {
  title: string;
  icon?: LucideIcon;
  count?: ReactNode;
  meta?: ReactNode;
  actions?: ReactNode;
  children: ReactNode;
}) {
  return (
    <GlassCard glow>
      <div className={cn("mb-2 flex flex-wrap items-center gap-3", meta && "justify-between")}>
        <h3 className="flex items-center gap-1.5 font-semibold">
          {Icon ? <Icon className="h-4 w-4 text-primary" /> : null}
          {title}
          {count != null && count !== "" && <span className="text-xs font-normal text-muted-foreground">（{count}）</span>}
        </h3>
        {(meta || actions) && (
          <div className="flex items-center gap-2 text-[11px] text-muted-foreground/70">
            {meta}
            {actions}
          </div>
        )}
      </div>
      {children}
    </GlassCard>
  );
}

export function DashboardTable({ columns, children }: { columns: string[]; children: ReactNode }) {
  return (
    <div className="overflow-x-auto">
      <table className="dashboard-table w-full text-sm">
        <thead>
          <tr className="border-b border-border/50 text-left text-xs text-muted-foreground">
            {columns.map((column, index) => (
              <th key={`${column}-${index}`} className="whitespace-nowrap px-2 py-2 font-medium">{column}</th>
            ))}
          </tr>
        </thead>
        <tbody>{children}</tbody>
      </table>
    </div>
  );
}
