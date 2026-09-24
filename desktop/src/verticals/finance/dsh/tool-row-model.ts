import type { ToolCallBlock } from '@deepseek-ai/dsh-client-ui-conversation/client';
import { durationLabel, toolStepTitle } from '../lib/taskTrajectory.ts';
import { userFacingRuntimeError } from '../lib/userFacingError.ts';

export function financeToolRowModel(toolName: string, block: ToolCallBlock) {
  const settled = 'kind' in block;
  const argsRaw = settled ? block.call?.argsRaw || '' : block.argsRaw;
  const stopped = settled && block.error?.code === 'interrupted';
  const state = !settled ? 'running' : stopped ? 'stopped' : block.isError ? 'error' : 'done';
  const rawResult = settled ? block.content.map(item => item.type === 'text' ? item.text : JSON.stringify(item, null, 2)).join('\n') : '';
  let isolatedCount = 0;
  if (settled && !block.isError) {
    try {
      const payload = JSON.parse(rawResult);
      const entries = Array.isArray(payload?.results) ? payload.results
        : Array.isArray(payload?.items) ? payload.items : [payload];
      isolatedCount = entries.filter((entry: { screen?: { status?: string } }) => entry?.screen?.status === 'isolated').length;
    } catch { /* non-JSON tool result */ }
  }
  const rawError = settled && block.isError ? rawResult || block.error?.reason || block.error?.code || '' : '';
  const result = state === 'error' ? userFacingRuntimeError(rawError, '这一步没有完成')
    : state === 'stopped' ? '已停止' : isolatedCount
      ? `${rawResult}\n\n已隔离可疑内容：该来源正文疑似包含针对 AI 的指令，未提供给模型。`
      : rawResult;
  let args = argsRaw;
  try { args = JSON.stringify(JSON.parse(argsRaw), null, 2); } catch { /* show original arguments */ }
  const elapsed = settled && block.callTime != null ? durationLabel(block.time - block.callTime) : '';
  return {
    title: toolStepTitle(toolName, argsRaw) + (isolatedCount ? ` · 已隔离 ${isolatedCount} 条可疑内容` : ''), state, args, result,
    rawError: state === 'error' ? rawError : '', elapsed,
  };
}
