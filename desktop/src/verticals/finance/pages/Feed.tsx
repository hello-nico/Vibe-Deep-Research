import { useSearchParams } from "react-router-dom";
import { PageHeader } from "@/components/ui/PageHeader";
import { WorkspaceTabs } from "@/components/ui/WorkspaceTabs";
import { STREAM_FILTERS, type StreamFilter } from "@/lib/feedStream";
import { VariableDesk } from "./VariableDesk";

const FILTERS = STREAM_FILTERS.map(value => ({ value, label: value }));

/** 动态：一条按时间倒序的流（财报、价格、公告、估值），顶部按类型筛选；公开新闻不在这条流里。 */
export function Feed() {
  const [params, setParams] = useSearchParams();
  const type = params.get("type");
  const filter: StreamFilter = STREAM_FILTERS.find(value => value === type) ?? "全部";
  const select = (value: StreamFilter) => setParams(value === "全部" ? {} : { type: value }, { replace: true });
  return <div>
    <PageHeader title="动态" actions={<WorkspaceTabs aria-label="按类型筛选" value={filter} onChange={select} options={FILTERS} />} />
    <VariableDesk filter={filter} />
  </div>;
}
