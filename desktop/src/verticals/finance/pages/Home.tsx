import { Disclaimer } from "@/components/ui/Disclaimer";
import { useAiPage } from "../../../core/ai/pageContext";

export function Home() {
  useAiPage({
    key: "home", title: "深度对话",
    context: "这是 Vibe Finance 深度对话，可以直接与研究助手交流、查阅资料、核对证据，或继续已有研究。",
    suggestions: ["今天市场有哪些变化", "帮我研究一家公司的基本面", "哪些风险需要重点核对"],
  });
  return (
    <div className="shrink-0">
      <Disclaimer />
    </div>
  );
}
