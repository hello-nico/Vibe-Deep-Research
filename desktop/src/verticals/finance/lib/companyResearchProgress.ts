import type { TaskTrajectorySnapshot } from '../dsh/research-session';
import { toolStepTitle } from './taskTrajectory.ts';

export const COMPANY_RESEARCH_STEPS = ['读取研究页', '补齐定期报告', '读取经营数据', '更新行情估值', '形成研究结论'] as const;

const TOOL_STEPS: Record<string, number> = {
  wiki_read: 0,
  source_list_documents: 1, source_ingest_periodic_report: 1,
  source_get_index: 2, source_scan_sections: 2, source_read_blocks: 2, stage_extraction: 2,
  generate_market_result: 3, calculate_market_result: 3, calculate_metrics: 3, query_observation: 3,
};

/** The trajectory exposes localized tool titles, including optional argument suffixes. */
export function companyResearchStep(snapshot: TaskTrajectorySnapshot): number | null {
  const running = snapshot.runningCalls.at(-1);
  const latest = snapshot.steps.at(-1);
  // A subsequent text output has no current tool signal; do not retain an old stage.
  if (!running && latest?.kind !== 'tool') return null;
  const title = running?.name ?? latest?.title;
  if (!title) return null;
  for (const [tool, step] of Object.entries(TOOL_STEPS)) {
    const label = toolStepTitle(tool);
    if (title === label || title.startsWith(`${label} · `)) return step;
  }
  return null;
}
