import type { AssistantPlugin } from './binding.ts';

export type AssistantMode = 'ask' | 'agent';

export interface AssistantSeatView {
  seated: boolean;
  sessionId: string;
  mode: AssistantMode;
  pageKey?: string;
  busy: boolean;
  notice?: string;
}

let assistantSeat: AssistantSeatView = { seated: false, sessionId: '', mode: 'ask', busy: false, notice: '' };
const assistantSeatListeners = new Set<() => void>();

export function subscribeAssistantSeat(listener: () => void) {
  assistantSeatListeners.add(listener);
  return () => { assistantSeatListeners.delete(listener); };
}

export function assistantSeatSnapshot(): AssistantSeatView {
  return assistantSeat;
}

export function setAssistantSeat(next: Partial<AssistantSeatView>) {
  assistantSeat = { ...assistantSeat, ...next };
  assistantSeatListeners.forEach(listener => listener());
}

export async function bindAssistantSession(input: {
  mode: AssistantMode;
  session_id: string;
  plugin?: AssistantPlugin;
  target?: string;
  page_key?: string;
}) {
  const response = await fetch('/finance-assistant-sessions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });
  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    throw new Error(typeof body.detail === 'string' ? body.detail : '问助手没能启动，请重试');
  }
  return response.json() as Promise<{
    plugin: AssistantPlugin;
    mode: AssistantMode;
    target?: string;
    page_key?: string;
  }>;
}

export async function loadAssistantSessions() {
  const response = await fetch('/finance-assistant-sessions');
  if (!response.ok) throw new Error('问助手暂时加载不出来，请重试');
  return response.json() as Promise<{
    sessions: Record<string, { plugin?: AssistantPlugin; mode: AssistantMode; target?: string; page_key?: string }>;
    pages: Record<string, { session_id: string; plugin?: AssistantPlugin; mode: AssistantMode; target?: string }>;
  }>;
}

export function assistantModeHint(mode: AssistantMode): string {
  return mode === 'agent'
    ? 'Agent 深查：页面信息不够时会自己查资料、读原文，稍慢一些'
    : 'Ask 即答：根据本页内容和你 @ 的条目直接回答';
}

export function assistantIntro(plugin: AssistantPlugin, pageKey = ''): string {
  if (plugin === 'market') {
    return '问我今天的盘面：指数表现、市场情绪、资金流向。输入 @ 选一个指数或个股，可以问得更具体。';
  }
  if (plugin === 'intel') {
    if (pageKey.includes('filings')) return '输入 @ 选一条公告，我帮你读懂它说了什么、可能影响什么。';
    if (pageKey.includes('investment-news')) return '输入 @ 选一篇报道，我帮你解读这件事，以及它会影响谁。';
    if (pageKey.includes('events')) return '输入 @ 选一个事件，我帮你看它在问什么、市场怎么定价。';
    return '输入 @ 选一条新闻，我帮你解读这件事，以及它会影响谁。';
  }
  if (plugin === 'industry_wiki') {
    if (pageKey.startsWith('industry-wiki:industries/')) {
      return '直接问这个行业怎么赚钱、最近有什么变化、会影响哪些公司。';
    }
    return '输入 @ 选一个行业，问它怎么赚钱、最近有什么变化。';
  }
  if (plugin === 'industry_profile') {
    if (pageKey !== 'industry-profile:list' && pageKey.startsWith('industry-profile:')) {
      return '问这个产业的供需、产业链位置，或者还有哪些问题值得核实。';
    }
    return '输入 @ 选一个产业，比较供需、产业链和值得核实的问题。';
  }
  if (plugin === 'company_wiki') {
    if (pageKey.startsWith('company-wiki:companies/')) {
      return '问经营、财务或估值都可以。输入 @ 选另一家公司可以做对比。';
    }
    return '输入 @ 选一家公司，问它做什么、财务或估值怎么看。';
  }
  return '输入 @ 选择本页条目后提问。';
}
