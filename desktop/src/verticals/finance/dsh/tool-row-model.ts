import type { ToolCallBlock } from '@deepseek-ai/dsh-client-ui-conversation/client';
import { durationLabel, toolStepTitle } from '../lib/taskTrajectory.ts';
import { userFacingRuntimeError } from '../lib/userFacingError.ts';

export function financeToolRowModel(toolName: string, block: ToolCallBlock) {
  const settled = 'kind' in block;
  const argsRaw = settled ? block.call?.argsRaw || '' : block.argsRaw;
  const stopped = settled && block.error?.code === 'interrupted';
  const state = !settled ? 'running' : stopped ? 'stopped' : block.isError ? 'error' : 'done';
  const rawResult = settled ? block.content.map(item => item.type === 'text' ? item.text : JSON.stringify(item, null, 2)).join('\n') : '';
  const rawError = settled && block.isError ? rawResult || block.error?.reason || block.error?.code || '' : '';
  const result = state === 'error' ? userFacingRuntimeError(rawError, '这一步没有完成')
    : state === 'stopped' ? '已停止' : rawResult;
  let args = argsRaw;
  try { args = JSON.stringify(JSON.parse(argsRaw), null, 2); } catch { /* show original arguments */ }
  const elapsed = settled && block.callTime != null ? durationLabel(block.time - block.callTime) : '';
  return {
    title: toolStepTitle(toolName, argsRaw), state, args, result,
    rawError: state === 'error' ? rawError : '', elapsed,
  };
}
