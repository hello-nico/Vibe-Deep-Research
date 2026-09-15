import type { LucideIcon } from "lucide-react";
import { ArrowUpRight, Layers3 } from "lucide-react";
import { Link } from "react-router-dom";
import { GlassCard } from "./ui/GlassCard";

export function IndustryDashboardCard({
  title,
  description,
  href,
  ready = true,
  footer,
  icon: Icon = Layers3,
}: {
  title: string;
  description: string;
  href?: string;
  ready?: boolean;
  footer: string;
  icon?: LucideIcon;
}) {
  const card = (
    <GlassCard glow className="flex h-full min-h-44 flex-col justify-between transition-transform group-hover:-translate-y-1">
      <div>
        <div className="mb-4">
          <Icon size={20} className="text-primary" />
        </div>
        <h2 className="text-base font-bold">{title}</h2>
        <p className="mt-2 text-xs text-muted-foreground">{description}</p>
      </div>
      <div className="mt-5 flex items-center justify-between border-t border-border/50 pt-3 text-xs">
        <span className="text-muted-foreground">{footer}</span>
        <ArrowUpRight size={16} className="text-primary" />
      </div>
    </GlassCard>
  );
  return href && ready ? <Link className="group" to={href}>{card}</Link> : <div>{card}</div>;
}
