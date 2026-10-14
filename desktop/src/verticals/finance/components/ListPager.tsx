import "../pages/my-research.css";

/**
 * 记录等列表共用的分页条（每页 LIST_PAGE_SIZE 条）。
 * 知道总数时显示“第 X / Y 页 · 共 N {unit}”；只知道有没有下一页时（议题接口不返回总数）显示“第 X 页”。
 */
export function ListPager({ page, total, hasNext, unit, onPage }: {
  page: number; total?: number; hasNext?: boolean; unit: string; onPage: (page: number) => void;
}) {
  const pageCount = total != null ? Math.max(1, Math.ceil(total / LIST_PAGE_SIZE)) : undefined;
  const canNext = pageCount != null ? page < pageCount - 1 : Boolean(hasNext);
  if (page === 0 && !canNext) return null;
  return <div className="rl-pager">
    <button type="button" className="workspace-action" disabled={page === 0} onClick={() => onPage(page - 1)}>上一页</button>
    <span className="rl-meta">{pageCount != null ? `第 ${page + 1} / ${pageCount} 页 · 共 ${total} ${unit}` : `第 ${page + 1} 页`}</span>
    <button type="button" className="workspace-action" disabled={!canNext} onClick={() => onPage(page + 1)}>下一页</button>
  </div>;
}

export const LIST_PAGE_SIZE = 10;

export function shortTime(value?: number | string): string {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const time = date.toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit" });
  return date.getFullYear() === new Date().getFullYear()
    ? `${date.getMonth() + 1}月${date.getDate()}日 ${time}`
    : `${date.getFullYear()}年${date.getMonth() + 1}月${date.getDate()}日`;
}
