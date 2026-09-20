import type { TaskTrajectorySnapshot, TaskTrajectoryStep } from '../dsh/research-session';

const TOOL_LABELS: Record<string, string> = {
  today: '当前日期',
  wiki_read: '读取 Wiki',
  read_research_method: '读取研究方法',
  wiki_report_publish: '发布报告',
  wiki_validate_page_draft: '校验 Wiki 草案',
  fetch_source_url: '读取来源网页',
  observe_market: '观察行情',
  observe_radar: '观察资讯',
  read_industry_profile: '读取产业研究',
  generate_market_result: '生成行情成果',
  generate_financial_result: '生成财务成果',
  source_ingest_periodic_report: '入库定期报告',
  query_observation: '查询观察',
  wiki_search: '搜索 Wiki',
  resolve_refs: '解析引用',
  search_external: '检索外部资料',
};

export function visibleUserPrompt(body: string): string {
  const match = /\n用户问题：\n([\s\S]+)$/.exec(body || '');
  return (match ? match[1] : body || '').trim();
}

export function visibleProcessPrompt(body: string): string {
  const visible = visibleUserPrompt(body);
  if (/为 Wiki 页 .+ 生成一份交互图文报告/.test(visible)) return '按当前研究页生成图文报告';
  return visible;
}

export function extractResultIds(text: string): string[] {
  return [...new Set(String(text || '').match(/result:[0-9a-f]{32}/g) || [])];
}

export function extractBoundSources(body: string): { label: string; url?: string; version?: string; fetchedAt?: string }[] {
  const section = (body || '').split('用户问题：')[0] || '';
  if (!/本轮已绑定的 URL 依据|本轮 URL 依据/.test(section)) return [];
  const items: { label: string; url?: string; version?: string; fetchedAt?: string }[] = [];
  for (const block of section.split(/\n- /).slice(1)) {
    const label = block.split('\n')[0]?.replace(/`[^`]+`/g, '').trim();
    const url = /URL：(\S+)/.exec(block)?.[1];
    const versionRaw = /内容版本：(\S+)/.exec(block)?.[1];
    const fetchedAt = /读取时点：(\S+)/.exec(block)?.[1];
    if (!label) continue;
    items.push({
      label,
      url,
      version: versionRaw && versionRaw !== '不可用' ? versionRaw : undefined,
      fetchedAt,
    });
  }
  return items;
}

export const emptyTaskTrajectory: TaskTrajectorySnapshot = {
  running: false, failed: false, openState: 'cold', hasMore: false, loadingOlder: false,
  runningCalls: [], steps: [], streaming: false,
};

export function toolLabel(name: string) {
  return TOOL_LABELS[name] || name || '工具';
}

export function durationLabel(ms: number | undefined) {
  if (!Number.isFinite(ms) || (ms ?? 0) < 0) return '';
  const total = Math.round((ms as number) / 100) / 10;
  if (total < 60) return `${total} 秒`;
  const minutes = Math.floor(total / 60);
  const seconds = Math.round(total - minutes * 60);
  return `${minutes} 分 ${seconds} 秒`;
}

function blockText(block: unknown): string {
  if (!block || typeof block !== 'object') return '';
  const item = block as { type?: string; kind?: string; text?: string };
  if (typeof item.text === 'string') return item.text;
  return '';
}

function contentText(content: unknown): string {
  if (typeof content === 'string') return content;
  if (!Array.isArray(content)) return '';
  return content.map(blockText).filter(Boolean).join('\n').trim();
}

function assistantText(blocks: unknown): { text: string; reasoning: string } {
  if (!Array.isArray(blocks)) return { text: '', reasoning: '' };
  const text: string[] = [];
  const reasoning: string[] = [];
  for (const block of blocks) {
    if (!block || typeof block !== 'object') continue;
    const item = block as { kind?: string; text?: string; name?: string };
    if (item.kind === 'reasoning' && item.text) reasoning.push(item.text);
    else if (item.kind === 'text' && item.text) text.push(item.text);
  }
  return { text: text.join('\n').trim(), reasoning: reasoning.join('\n').trim() };
}

function prettyArgs(raw: string | undefined) {
  if (!raw) return '';
  try {
    return JSON.stringify(JSON.parse(raw), null, 2);
  } catch {
    return raw;
  }
}

export function projectTaskTrajectory(input: {
  running?: boolean;
  failed?: boolean;
  openState?: TaskTrajectorySnapshot['openState'];
  openError?: string;
  hasMore?: boolean;
  loadingOlder?: boolean;
  streaming?: boolean;
  raw?: unknown;
}): TaskTrajectorySnapshot {
  const data = input.raw && typeof input.raw === 'object' ? input.raw as {
    runningCalls?: { callId?: string; id?: string; name?: string; argsRaw?: string; time?: number }[];
    eventNodes?: Record<string, unknown>[];
    partial?: { blocks?: unknown };
  } : {};
  const runningCalls = (data.runningCalls || []).map((call, index) => ({
    id: String(call.callId || call.id || index),
    name: toolLabel(call.name || ''),
    args: prettyArgs(call.argsRaw),
    startedAt: typeof call.time === 'number' ? call.time : undefined,
  }));
  const steps: TaskTrajectoryStep[] = (data.eventNodes || []).map((node, index) => stepFromNode(node, index));
  if (data.partial?.blocks) {
    const partial = assistantText(data.partial.blocks);
    if (partial.text || partial.reasoning) {
      steps.push({
        id: 'partial', kind: 'assistant', title: '模型输出', body: partial.text, detail: partial.reasoning, streaming: true,
      });
    }
  }
  return {
    running: Boolean(input.running),
    failed: Boolean(input.failed),
    openState: input.openState || 'cold',
    openError: input.openError,
    hasMore: Boolean(input.hasMore),
    loadingOlder: Boolean(input.loadingOlder),
    runningCalls,
    steps,
    streaming: Boolean(data.partial),
  };
}

export function sameTaskTrajectory(left: TaskTrajectorySnapshot, right: TaskTrajectorySnapshot) {
  return JSON.stringify(left) === JSON.stringify(right);
}

function stepFromNode(node: Record<string, unknown>, index: number): TaskTrajectoryStep {
  const kind = String(node.kind || 'event');
  const id = String(node.seq ?? index);
  const time = typeof node.time === 'number' ? node.time : undefined;
  if (kind === 'user') {
    return { id, kind, title: '任务已提交', body: contentText(node.content), time };
  }
  if (kind === 'assistant') {
    const parts = assistantText(node.blocks);
    const timing = node.timing && typeof node.timing === 'object' ? node.timing as { stepStartTime?: number | null; completedTime?: number } : undefined;
    const durationMs = timing?.stepStartTime != null && timing.completedTime
      ? timing.completedTime - timing.stepStartTime : undefined;
    return {
      id, kind, title: node.interrupted ? '输出已停止' : '模型输出',
      body: parts.text, detail: parts.reasoning, time, durationMs, failed: Boolean(node.interrupted),
    };
  }
  if (kind === 'tool-result') {
    const call = node.call && typeof node.call === 'object' ? node.call as { name?: string; argsRaw?: string } : null;
    const durationMs = typeof node.callTime === 'number' && typeof node.time === 'number' ? node.time - node.callTime : undefined;
    return {
      id, kind: 'tool', title: toolLabel(call?.name || ''),
      body: contentText(node.content),
      args: prettyArgs(call?.argsRaw),
      time, durationMs, failed: Boolean(node.isError),
      error: node.isError ? (contentText(node.content) || '工具执行失败') : undefined,
    };
  }
  if (kind === 'turn-error') {
    return { id, kind, title: '本轮未完成', body: String(node.message || '').trim(), time, failed: true };
  }
  if (kind === 'turn-max-tokens') {
    return { id, kind, title: '输出达到上限', body: '本轮因长度上限结束。', time };
  }
  if (kind === 'compaction') {
    return { id, kind, title: '上下文已压缩', body: String(node.summary || '').trim(), time };
  }
  return { id, kind, title: '执行记录', body: contentText(node.content) || contentText(node.blocks), time };
}
