import type { HTMLAttributes, ReactNode } from "react";
import { cn } from "@/lib/utils";
import "./ui.css";

/** 白底、淡描边的卡片容器；不使用阴影、渐变与模糊。 */
export function Card({ children, className, alert, onClick }: { children: ReactNode; className?: string; alert?: boolean; onClick?: () => void }) {
  return <div onClick={onClick} className={cn("card", alert && "card-alert", onClick && "card-hover cursor-pointer", className)}>{children}</div>;
}

/** 区块组名：放在卡片或表格外的左上方，右侧可放一句说明或时点。 */
export function SectionLabel({ children, aside }: { children: ReactNode; aside?: ReactNode }) {
  return <div className="section-label"><span>{children}</span>{aside != null && aside !== "" && <span>{aside}</span>}</div>;
}

/** 分组卡：组名在外，卡片里一行一项，左边名称和一行说明，右边控件或数值。 */
export function GroupCard({ label, aside, children }: { label?: ReactNode; aside?: ReactNode; children: ReactNode }) {
  return <section>{label && <SectionLabel aside={aside}>{label}</SectionLabel>}<div className="card group-card">{children}</div></section>;
}
export function GroupRow({ title, description, children }: { title: ReactNode; description?: ReactNode; children?: ReactNode }) {
  return <div className="group-row">
    <div className="group-row-text"><p className="group-row-title">{title}</p>{description && <p className="group-row-desc">{description}</p>}</div>
    {children != null && <div className="group-row-control">{children}</div>}
  </div>;
}

/** 面板：标题与右侧期间或出处，下面一句话结论，再下面是数据。 */
export function Panel({ title, meta, conclusion, children, className, ...rest }: { title: ReactNode; meta?: ReactNode; conclusion?: ReactNode; children?: ReactNode; className?: string } & Omit<HTMLAttributes<HTMLElement>, "title">) {
  return <section {...rest} className={cn("card panel", className)}>
    <div className="panel-head"><h2 className="panel-title">{title}</h2>{meta != null && meta !== "" && <span className="panel-meta">{meta}</span>}</div>
    {conclusion && <p className="panel-conclusion">{conclusion}</p>}
    {children != null && <div className={conclusion ? "panel-body" : "mt-3"}>{children}</div>}
  </section>;
}

/** 指标：12px 灰标签（后跟期间与出处）+ 22px 数字。 */
export function Metric({ label, tags, value, unit, title }: { label: ReactNode; tags?: ReactNode; value: ReactNode; unit?: ReactNode; title?: string }) {
  return <div className="metric" title={title}>
    <div className="metric-label"><span>{label}</span>{tags}</div>
    <strong className="metric-value">{value}{unit && <small>{unit}</small>}</strong>
  </div>;
}
export function MetricTag({ children }: { children: ReactNode }) { return <em className="metric-tag">{children}</em>; }

export type PillTone = "ok" | "run" | "wait" | "info" | "bad" | "off";
export function StatusPill({ tone = "off", children }: { tone?: PillTone; children: ReactNode }) {
  return <span className={cn("status-pill", `tone-${tone}`)}>{children}</span>;
}
/** 无列头列表里的标签：对象用品牌橙浅底，时间与用时用灰底。 */
export function Tag({ children, brand }: { children: ReactNode; brand?: boolean }) {
  return <span className={cn("tag", brand && "tone-brand")}>{children}</span>;
}

/** 近 60 日走势线：当前点用品牌橙。取不到序列时调用方不要渲染，保留所在行即可。 */
export function Sparkline({ values, label }: { values: readonly number[]; label?: string }) {
  const points = values.filter(value => Number.isFinite(value));
  if (points.length < 2) return null;
  const min = Math.min(...points), max = Math.max(...points), span = max - min || 1;
  const x = (i: number) => (i / (points.length - 1)) * 100;
  const y = (v: number) => 24 - ((v - min) / span) * 20;
  return <svg className="sparkline" viewBox="0 0 100 28" preserveAspectRatio="none" role="img" aria-label={label || "近期走势"}>
    <polyline points={points.map((value, i) => `${x(i).toFixed(2)},${y(value).toFixed(2)}`).join(" ")} />
    <circle cx={x(points.length - 1)} cy={y(points[points.length - 1]!)} r="2.2" vectorEffect="non-scaling-stroke" />
  </svg>;
}

/** 表格容器：白底、12% 描边、16 圆角。 */
export function TableWrap({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn("table-wrap", className)}>{children}</div>;
}
