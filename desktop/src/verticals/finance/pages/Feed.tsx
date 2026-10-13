import { useSearchParams } from "react-router-dom";
import { PageHeader } from "@/components/ui/PageHeader";
import { WorkspaceTabs } from "@/components/ui/WorkspaceTabs";
import { DailyReview } from "./DailyReview";
import { Intel } from "./Intel";
import { VariableDesk } from "./VariableDesk";

const SEGMENTS = [{ value: "variables", label: "关键变量" }, { value: "intel", label: "资讯" }, { value: "market", label: "市场" }] as const;
type Segment = (typeof SEGMENTS)[number]["value"];

/** 动态：分段「关键变量」（默认）汇总关注公司的价格变动；「资讯」「市场」承载现有资讯雷达与大盘行情，数据逻辑不变。 */
export function Feed() {
  const [params, setParams] = useSearchParams();
  const tab: Segment = params.get("tab") === "market" ? "market" : params.get("tab") === "intel" ? "intel" : "variables";
  const select = (value: Segment) => setParams({ tab: value }, { replace: true });
  const selectSub = (sub: string) => setParams({ tab: "intel", sub }, { replace: true });
  return <div>
    <PageHeader title="动态" actions={<WorkspaceTabs aria-label="动态分段" value={tab} onChange={select} options={SEGMENTS} />} />
    {tab === "variables" ? <VariableDesk /> : tab === "market" ? <DailyReview /> : <Intel sub={params.get("sub")} onSub={selectSub} />}
  </div>;
}
