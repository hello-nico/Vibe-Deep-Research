import { FinanceHomeAgent } from "@/components/ui/FinanceAiDock";
import { Disclaimer } from "@/components/ui/Disclaimer";
import { useAiPage } from "../../../core/ai/pageContext";

export function Home() {
  useAiPage({
    key: "home", title: "首页",
    context: "这是 Vibe Finance 首页，可以直接与本地 Agent 交流，联网查证，或进入各项研究功能。",
    suggestions: ["今天市场有哪些变化", "帮我研究一家公司的基本面", "哪些风险需要重点核对"],
  });
  return (
    <div>
      <h1 className="sr-only">Vibe Finance 研究工作台</h1>
      <FinanceHomeAgent />
      <Disclaimer />
    </div>
  );
}
