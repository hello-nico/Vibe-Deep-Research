/**
 * 把 Core 的 AI 入口接到这个垂类上 —— **只提供"行业知道、Core 不知道"的那部分**：
 * 怎么连后端、免责声明怎么说、回答下面挂什么按钮、没配模型时往哪儿引导。
 *
 * 🔴 Core 那边一个行业词都不许有（前端边界棘轮会红），所以文案在这儿而不是那儿。
 */
import { Settings } from "lucide-react";
import { Link } from "react-router-dom";

import { SaveNoteButton } from "@/components/ui/SaveNoteButton";
import { AiDock,type AiDockProps } from "../../../../core/ai/AiDock";
import { sendPageModel } from '../../dsh/page-model';
import { KnowledgeText } from "../ResearchKnowledge";

const renderReply = (reply: string) => <KnowledgeText markdown={reply} />;

const setupLink = () => (
  <Link
    to="/settings"
    className="flex items-center justify-center gap-2 rounded-lg bg-primary/15 px-3 py-2 text-sm font-medium text-primary hover:bg-primary/25"
  >
    <Settings className="h-4 w-4" /> 为助手选择模型
  </Link>
);

const replyActions = (reply: string, question: string) => (
  <div className="mt-1.5">
    <SaveNoteButton kind="问助手" title={`问助手 · ${question.slice(0, 24) || "对话"}`} content={reply} />
  </div>
);

export function FinanceAiDock({ renderPanel }: Pick<AiDockProps, 'renderPanel'>) {
  return (
    <AiDock
      renderPanel={renderPanel}
      configured={true}
      copy={{
        trigger: "问助手",
        panel: "问助手",
        runtime: "使用设置中的默认模型",
        placeholder: "就这一页的内容问点什么…",
      }}
      send={sendPageModel}
      renderReplyActions={replyActions}
      renderReply={renderReply}
      renderSetup={setupLink}
    />
  );
}
