import type { TaskTrajectorySnapshot } from '../dsh/research-session';
import { toolStepTitle } from './taskTrajectory.ts';

// 与 Stock `REPORT_PROMPT` 的步骤对应：报告方法已随系统提示附带，模板经 read_research_method 加载。
export const REPORT_STEPS = ['读取报告方法', '选择模板', '读取研究页', '组织图文', '保存报告'] as const;

const TOOL_STEPS: Record<string, number> = {
  read_research_method: 1,
  wiki_read: 2, topic_report_snapshot: 2, topic_report_wall: 2,
  wiki_report_publish: 4,
};

const stepName = (step: number): string => REPORT_STEPS[step] ?? '正在生成图文报告';

function toolStep(title: string | undefined): number | null {
  if (!title) return null;
  for (const [tool, step] of Object.entries(TOOL_STEPS)) {
    const label = toolStepTitle(tool);
    if (title === label || title.startsWith(`${label} · `)) return step;
  }
  return null;
}

/**
 * 报告生成当前所处步骤与显示文案；由最近一次工具调用推断。
 * 读完研究页之后没有工具调用的阶段是在写 HTML（组织图文）；保存被质检或数字核对退回后再写，显示“按检查结果修改”。
 */
export function reportProgress(snapshot: TaskTrajectorySnapshot): { step: number; label: string } {
  const running = toolStep(snapshot.runningCalls.at(-1)?.name);
  if (running !== null) return { step: running, label: stepName(running) };
  const tools = snapshot.steps.filter(step => step.kind === 'tool').map(step => toolStep(step.title));
  if (!tools.length) return { step: 0, label: stepName(0) };
  const latest = snapshot.steps.at(-1);
  const last = latest?.kind === 'tool' ? toolStep(latest.title) : null;
  if (last !== null) return { step: last, label: stepName(last) };
  // 最近一步是文字输出：保存过又在写，是按检查结果修改；读过研究页后在写，是组织图文。
  if (tools.includes(4)) return { step: 3, label: '按检查结果修改' };
  return tools.includes(2) ? { step: 3, label: stepName(3) } : { step: 1, label: stepName(1) };
}
