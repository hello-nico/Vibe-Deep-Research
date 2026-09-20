export type AssistantMode = 'ask' | 'agent';
export type AssistantPlugin = 'company_wiki' | 'industry_wiki' | 'deep_research' | 'market' | 'intel' | 'industry_profile';

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
    throw new Error(typeof body.detail === 'string' ? body.detail : '问助手会话绑定失败，请重试');
  }
  return response.json() as Promise<{
    plugin: AssistantPlugin;
    mode: AssistantMode;
    target?: string;
    session_id?: string;
    page_key?: string;
  }>;
}

export async function loadAssistantSessions() {
  const response = await fetch('/finance-assistant-sessions');
  if (!response.ok) throw new Error('问助手会话读取失败');
  return response.json() as Promise<{
    sessions: Record<string, { plugin?: AssistantPlugin; mode: AssistantMode; target?: string; page_key?: string }>;
    pages: Record<string, { session_id: string; plugin?: AssistantPlugin; mode: AssistantMode; target?: string }>;
  }>;
}

export function assistantBindingForPage(pageKey: string): { plugin: AssistantPlugin; target: string; bindKey: string } {
  const company = /^company-wiki:(companies\/[a-z0-9-]+)$/.exec(pageKey);
  if (company?.[1]) return { plugin: 'company_wiki', target: company[1], bindKey: `company_wiki:${company[1]}` };
  if (pageKey === 'company-wiki:list') return { plugin: 'company_wiki', target: '', bindKey: 'company_wiki:list' };
  const industry = /^industry-wiki:(industries\/[^\s]+)$/.exec(pageKey);
  if (industry?.[1]) return { plugin: 'industry_wiki', target: industry[1], bindKey: `industry_wiki:${industry[1]}` };
  if (pageKey.startsWith('nbs:')) return { plugin: 'industry_wiki', target: '', bindKey: 'industry_wiki:list' };
  if (pageKey === 'daily-review') return { plugin: 'market', target: '', bindKey: 'market:daily-review' };
  if (pageKey.startsWith('intel:')) return { plugin: 'intel', target: '', bindKey: 'intel:radar' };
  const profile = /^industry-profile:(.+)$/.exec(pageKey);
  if (profile?.[1]) return { plugin: 'industry_profile', target: '', bindKey: `industry_profile:${profile[1]}` };
  return { plugin: 'deep_research', target: '', bindKey: `deep_research:${pageKey}` };
}

export function assistantModeHint(mode: AssistantMode): string {
  return mode === 'agent'
    ? 'Agent：可以帮你改和补资料，维护判断和分析。'
    : 'Ask：只帮你看和解释，不会改任何内容。';
}

export function assistantPlaceholder(mode: AssistantMode = 'ask'): string {
  return assistantModeHint(mode);
}

export function assistantIntro(plugin: AssistantPlugin, pageKey = ''): string {
  if (plugin === 'market') {
    return '这里看的是当日盘面：指数、情绪和资金。引用指数或个股后提问，我说明表现、观察日和数据缺口，不解释成买卖建议。输入 @ 可以搜索本页已加载的条目。';
  }
  if (plugin === 'intel') {
    if (pageKey.includes('filings')) return '这里是关注股票的公告列表。引用一条公告后提问，我按本轮已读内容区分披露事实、影响推断和待核实事项。输入 @ 搜索本页公告。';
    if (pageKey.includes('investment-news')) return '这里是按赛道整理的资讯。引用一条报道后提问，我只分析这条事件本身，并区分原报道、事实和待核实条件。输入 @ 搜索本页资讯。';
    if (pageKey.includes('events')) return '这里是事件与日程。引用一条后提问，我说明时间、对象和还缺什么证据。输入 @ 搜索本页条目。';
    return '这里是公开新闻列表。引用一条新闻后提问，我按本轮已读内容区分报道、事件事实和影响推断。输入 @ 搜索本页新闻。';
  }
  if (plugin === 'industry_wiki') {
    if (pageKey.startsWith('industry-wiki:industries/')) {
      return '这里是这个行业的研究页。直接问经营机制、结构变化或会传导到哪些公司；材料够用就分析，缺页和缺数会单独说清。输入 @ 引用本页行业。';
    }
    return '这里是行业研究目录。引用一个行业后，我从经营机制、结构变化和公司传导来回答。输入 @ 搜索本页行业。';
  }
  if (plugin === 'industry_profile') {
    if (pageKey !== 'industry-profile:list' && pageKey.startsWith('industry-profile:')) {
      return '这里是这份产业研究。我会把它当作线索，展开供需、产业链和还需要核实的问题，而不是只复述目录。输入 @ 引用本页产业。';
    }
    return '这里是申万产业研究目录。引用一个产业后，我比较供需、产业链和验证问题。输入 @ 搜索本页产业。';
  }
  if (plugin === 'company_wiki') {
    if (pageKey.startsWith('company-wiki:companies/')) {
      return '这里是这家公司的研究页。按你的问题选择经营、财务或估值来分析；已有材料够用就直接答，缺什么再补。输入 @ 引用本公司或比较对象。';
    }
    return '这里是个股研究名单。引用一家公司后，可以问它做什么、财务或估值怎么看。输入 @ 搜索本页公司。';
  }
  if (pageKey.startsWith('my-research')) return '这里是已沉淀的研究和记录。引用一条后提问，我帮你接着看问题、材料和未决事项。';
  if (pageKey.startsWith('document:')) return '这里是打开的资料原文。先圈出要问的段落，再提问；没有圈选时，我不会假装已经读完全文。';
  return '引用本页对象后提问。输入 @ 可以搜索已加载的条目。';
}
