import type { TaskTrajectorySnapshot, TaskTrajectoryStep } from '../dsh/research-session';
import { userFacingRuntimeError } from './userFacingError.ts';

const TOOL_LABELS: Record<string, string> = {
  today: '当前日期',
  wiki_read: '读取研究页',
  wiki_list_pages: '列出研究页',
  wiki_search: '搜索研究页',
  wiki_relations: '读取研究关系',
  wiki_schema_graph: '读取关系词表',
  read_research_method: '读取研究方法',
  wiki_report_publish: '发布报告',
  wiki_validate_page_draft: '检查研究页草稿',
  fetch_source_url: '读取来源网页',
  observe_market: '查看行情',
  observe_radar: '查看资讯',
  read_industry_profile: '读取产业研究',
  discover_industry_profiles: '发现产业研究',
  calculate_metrics: '计算',
  calculate_market_result: '区间计算',
  generate_market_result: '生成行情成果',
  generate_financial_result: '生成财务成果',
  source_list_documents: '列出文档',
  source_get_index: '读取文档目录',
  source_scan_sections: '扫描文档章节',
  source_read_blocks: '读取文档原文',
  source_discover_documents: '发现文档',
  source_ingest_periodic_report: '保存定期报告',
  query_observation: '查询公司数据',
  fetch_company_data: '获取公司数据',
  wiki_refresh_company_api: '刷新公司资料',
  resolve_refs: '识别引用对象',
  stage_extraction: '整理摘录',
  search_external: '检索外部资料',
  stock_search_external: '检索外部资料',
  web_search: '网页搜索',
  web_fetch: '读取网页',
  read_research_result: '读取研究成果',
  topic_list: '列出研究主题',
  topic_get: '读取研究主题',
  topic_route: '路由研究主题',
  topic_update: '更新研究主题',
  topic_list_links: '列出主题关联',
  topic_propose_link: '提出主题关联',
  topic_attach_radar_card: '关联资讯卡片',
  read_hard_relations: '读取硬关系',
  read_research_links: '读取研究链接',
  read_composition_skill: '读取写作方法',
  note_list: '列出笔记',
  note_read: '读取笔记',
  propose_maintenance: '提出维护',
  review_maintenance: '核对维护',
};

const OPERATION_LABELS: Record<string, string> = {
  align: '单位对齐', yoy: '同比', qoq: '环比', cumulative_to_quarter: '累计转单季',
  cash_rollforward: '现金勾稽', statement_linkage: '三表勾稽', fcf_proxy: '自由现金流',
  discount: '折现', terminal_gordon: '永续价值', multiple: '估值倍数', per_share: '每股价值',
  sensitivity_grid: '敏感性分析', market_window: '区间涨跌',
};

function toolStepTitle(name: string, argsRaw?: string): string {
  const base = toolLabel(name);
  if (!argsRaw) return base;
  try {
    const args = JSON.parse(argsRaw) as Record<string, unknown>;
    if (name === 'calculate_metrics' && typeof args.operation === 'string') {
      const bits = [OPERATION_LABELS[args.operation] || args.operation];
      if (args.window_start && args.window_end) bits.push(`${String(args.window_start)}→${String(args.window_end)}`);
      return `${base} · ${bits.join(' · ')}`;
    }
    if (name === 'calculate_market_result' && Array.isArray(args.windows)) {
      const windows = args.windows
        .map(item => item && typeof item === 'object'
          ? `${(item as { window_start?: string }).window_start || '?'}→${(item as { window_end?: string }).window_end || '?'}`
          : '')
        .filter(Boolean);
      if (windows.length) return `${base} · ${windows.join('；')}`;
    }
    if (name === 'generate_market_result') {
      const bits = [args.symbol, args.as_of, args.window_start].filter(Boolean).map(String);
      if (bits.length) return `${base} · ${bits.join(' · ')}`;
    }
    if (name === 'wiki_read' && typeof args.slug === 'string') return `${base} · ${args.slug}`;
    if (name === 'observe_market') {
      const bits = [args.marketBenchmarkId, args.symbol, args.as_of || args.asOf].filter(Boolean).map(String);
      if (bits.length) return `${base} · ${bits.join(' · ')}`;
    }
  } catch { /* keep base label */ }
  return base;
}

export function visibleUserPrompt(body: string): string {
  const match = /\n用户问题：\n([\s\S]+)$/.exec(body || '');
  return (match?.[1] ?? body ?? '').trim();
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
  terminal?: unknown;
}): TaskTrajectorySnapshot {
  const data = input.raw && typeof input.raw === 'object' ? input.raw as {
    runningCalls?: { callId?: string; id?: string; name?: string; argsRaw?: string; time?: number }[];
    eventNodes?: Record<string, unknown>[];
    partial?: { blocks?: unknown };
  } : {};
  const runningCalls = (data.runningCalls || []).map((call, index) => ({
    id: String(call.callId || call.id || index),
    name: toolStepTitle(call.name || '', call.argsRaw),
    args: prettyArgs(call.argsRaw),
    startedAt: typeof call.time === 'number' ? call.time : undefined,
  }));
  const nodes = [...(data.eventNodes || [])];
  // Native trajectory drops failures before a model request; Chat owns the
  // durable turn-error node even when provider selection failed immediately.
  const terminal = input.terminal as { nodes?: { values?(): { kind: string; data: Record<string, unknown> }[] } } | undefined;
  for (const node of terminal?.nodes?.values?.() || []) {
    if (node.kind !== 'turn-error' || nodes.some(event => event.seq === node.data.seq)) continue;
    nodes.push(node.data);
  }
  nodes.sort((left, right) => Number(left.seq) - Number(right.seq));
  const steps: TaskTrajectoryStep[] = nodes
    .map((node, index) => stepFromNode(node, index))
    .filter((step): step is TaskTrajectoryStep => step != null);
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
    failed: Boolean(input.failed || steps.some(step => step.kind === 'turn-error')),
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

function stepFromNode(node: Record<string, unknown>, index: number): TaskTrajectoryStep | null {
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
    const raw = contentText(node.content);
    const failed = Boolean(node.isError);
    return {
      id, kind: 'tool', title: toolStepTitle(call?.name || '', call?.argsRaw),
      body: failed ? undefined : raw,
      args: prettyArgs(call?.argsRaw),
      time, durationMs, failed,
      error: failed ? userFacingRuntimeError(raw, '这一步没有完成') : undefined,
    };
  }
  if (kind === 'turn-error') {
    return { id, kind, title: '本轮未完成', body: userFacingRuntimeError(node.message, '这一轮没有完成'), time, failed: true };
  }
  if (kind === 'turn-max-tokens') {
    return { id, kind, title: '输出达到上限', body: '本轮因长度上限结束。', time };
  }
  if (kind === 'compaction') {
    return { id, kind, title: '已精简早期对话', body: String(node.summary || '').trim(), time };
  }
  return null;
}
