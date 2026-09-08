import { Info } from "lucide-react";

// 中立免责条 —— Agent 负责流程与校验、模型负责推理；产品不荐股、不预测、无倾向。
export function Disclaimer({ compact = false }: { compact?: boolean }) {
  if (compact) {
    return (
      <p className="text-[11px] leading-relaxed text-muted-foreground/70">
        Vibe Finance 只呈现公开数据与榜单。不荐股、不预测、不构成投资建议。
      </p>
    );
  }
  return (
    <div className="mt-4 flex shrink-0 items-start gap-2 rounded-lg border border-border/60 bg-muted/20 p-3 text-xs leading-relaxed text-muted-foreground">
      <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />
      <span>
        Vibe Finance 整理公开数据并校验证据，推理由所选模型完成。榜单为客观公开数据。<b className="text-foreground">不荐股、不预测涨跌、不给买卖时机，不构成投资建议。</b> 输出可能有误，请自行核实，风险自担。
      </span>
    </div>
  );
}
