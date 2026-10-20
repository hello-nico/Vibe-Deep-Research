/** 区间带刻度：相邻两档在带上相距不足 8% 时合成一组，标签并排写，避免数字压在一起。 */
export function bandTickGroups<T extends { price: number }>(tiers: T[], span: number): T[][] {
  return [...tiers].sort((a, b) => a.price - b.price).reduce<T[][]>((acc, item) => {
    const last = acc.at(-1);
    if (last && (item.price - last.at(-1)!.price) / span < 0.08) last.push(item); else acc.push([item]);
    return acc;
  }, []);
}
