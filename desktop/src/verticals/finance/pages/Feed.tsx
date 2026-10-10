import { useSearchParams } from "react-router-dom";
import { PageHeader } from "@/components/ui/PageHeader";
import { WorkspaceTabs } from "@/components/ui/WorkspaceTabs";
import { DailyReview } from "./DailyReview";
import { Intel } from "./Intel";

const SEGMENTS = [{ value: "intel", label: "资讯" }, { value: "market", label: "市场" }] as const;
type Segment = (typeof SEGMENTS)[number]["value"];

/** 动态（过渡页）：分段「资讯」「市场」承载现有资讯雷达与大盘行情；只换外壳与样式，数据逻辑不变。 */
export function Feed() {
  const [params, setParams] = useSearchParams();
  const tab: Segment = params.get("tab") === "market" ? "market" : "intel";
  const select = (value: Segment) => setParams(value === "intel" ? { tab: "intel" } : { tab: "market" }, { replace: true });
  const selectSub = (sub: string) => setParams({ tab: "intel", sub }, { replace: true });
  return <div>
    <PageHeader title="动态" actions={<WorkspaceTabs aria-label="动态分段" value={tab} onChange={select} options={SEGMENTS} />} />
    {tab === "market" ? <DailyReview /> : <Intel sub={params.get("sub")} onSub={selectSub} />}
  </div>;
}
