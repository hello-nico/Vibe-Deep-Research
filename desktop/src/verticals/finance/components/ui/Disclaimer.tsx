// 免责声明：页尾一行灰字，不加框，只在研究类页面出现。产品只呈现公开数据与榜单，不荐股、不预测、无倾向。
export function Disclaimer({ compact = false }: { compact?: boolean }) {
  if (compact) {
    return <p className="text-[11px] leading-relaxed text-[var(--text-4)]">Vibe Finance 只呈现公开数据与榜单。不荐股、不预测、不构成投资建议。</p>;
  }
  return (
    <p className="workspace-footnote">
      Vibe Finance 整理公开数据并校验证据，推理由所选模型完成。<b>不荐股、不预测涨跌、不给买卖时机，不构成投资建议。</b>输出可能有误，请自行核实，风险自担。
    </p>
  );
}
