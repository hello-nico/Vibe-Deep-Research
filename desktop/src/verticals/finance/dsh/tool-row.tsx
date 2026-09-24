import type { ToolCallViewProps } from '@deepseek-ai/dsh-client-ui-tool/client';
import { ChevronDown, ChevronRight } from 'lucide-react';
import { financeToolRowModel } from './tool-row-model';

export function FinanceToolRow({ toolName, block, useDisclosure, inspect }: ToolCallViewProps) {
  const { expanded, toggle } = useDisclosure();
  const model = financeToolRowModel(toolName, block);
  const expandable = Boolean(model.args || model.result || model.rawError || inspect);
  const open = expandable && expanded;
  return <div className="finance-tool-row" data-state={model.state} data-tool={toolName}>
    <button type="button" className="finance-tool-row-head" aria-expanded={open} disabled={!expandable} onClick={toggle}>
      <span className="finance-tool-row-leading" aria-hidden="true">{open ? <ChevronDown /> : <ChevronRight />}</span>
      <span className="finance-tool-row-status" aria-hidden="true" />
      <span className="finance-tool-row-title">{model.title}{model.state === 'error' && <span className="finance-tool-row-state"> · 未完成</span>}{model.state === 'stopped' && <span className="finance-tool-row-state"> · 已停止</span>}</span>
      {model.elapsed && <span className="finance-tool-row-time">{model.elapsed}</span>}
    </button>
    {open && <div className="finance-tool-row-body">
      {model.args && <section><div className="finance-tool-row-caption">参数</div><pre className="finance-tool-row-args">{model.args}</pre></section>}
      {model.result && <section><div className="finance-tool-row-caption">结果</div><pre className="finance-tool-row-result">{model.result}</pre></section>}
      {model.rawError && <details className="finance-tool-row-details"><summary>详情</summary><pre>{model.rawError}</pre></details>}
      {inspect && <button type="button" className="finance-tool-row-inspect" onClick={inspect}>在轨迹中查看</button>}
    </div>}
  </div>;
}
