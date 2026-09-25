/** 页面快照长度上限；超出时在截断处写明，不静默丢数值。 */
export const PAGE_SNAPSHOT_LIMIT = 16_000;
export const WIKI_SNAPSHOT_LIMIT = 8_000;

export function clipPageSnapshot(text: string, cited: string[] = []): { body: string; truncated: boolean } {
  if (text.length <= PAGE_SNAPSHOT_LIMIT) return { body: text, truncated: false };
  const needles = cited.map(item => item.replace(/^(market:|company:|url:|profile:|document:|topic:)/, '')).filter(Boolean);
  const parts = text.split(/\n\n+/);
  const scored = parts.map((part, index) => ({
    part,
    index,
    hit: needles.some(needle => needle && part.includes(needle)),
  }));
  const ordered = [...scored.filter(item => item.hit), ...scored.filter(item => !item.hit)];
  let body = '';
  for (const item of ordered) {
    const next = body ? `${body}\n\n${item.part}` : item.part;
    if (next.length > PAGE_SNAPSHOT_LIMIT) {
      const room = Math.max(0, PAGE_SNAPSHOT_LIMIT - (body ? body.length + 2 : 0));
      if (room > 80) body = body ? `${body}\n\n${item.part.slice(0, room)}` : item.part.slice(0, PAGE_SNAPSHOT_LIMIT);
      break;
    }
    body = next;
  }
  return {
    body: `${body}\n…（页面快照已截断，优先保留与 @ 对象相关部分）`,
    truncated: true,
  };
}

export function formatSnapshotSection(title: string, lines: string[]): string {
  const body = lines.filter(Boolean).join('\n');
  return body ? `【${title}】\n${body}` : '';
}

export function formatCompanyFromSnapshot(
  item: { id: string; label: string },
  quotes: {
    id: string; name: string; symbol: string; section?: string;
    price?: number | null; change_pct?: number | null; amount?: number | null;
    float_cap?: number | null; boards?: number | null; industry?: string; asOf?: string; source?: string; fetched_at?: string;
  }[],
): string {
  const symbol = item.id.replace(/^company:/, '');
  const row = quotes.find(q => q.id === item.id || q.symbol === symbol || q.id === `company:${symbol}`);
  if (!row) {
    return `- ${item.label} \`${item.id}\`\n  页面快照中没有该股的显示值；不能假装已读取行情。`;
  }
  const pct = row.change_pct == null ? '—' : `${row.change_pct > 0 ? '+' : ''}${row.change_pct}%`;
  const amount = row.amount == null ? '—' : `${(row.amount / 1e8).toLocaleString('zh-CN', { maximumFractionDigits: 2 })} 亿`;
  const floatCap = row.float_cap == null ? '' : `，流通市值 ${(row.float_cap / 1e8).toLocaleString('zh-CN', { maximumFractionDigits: 2 })} 亿`;
  return [
    `- ${row.name || item.label} \`${item.id}\``,
    row.section ? `  板块：${row.section}` : '',
    row.asOf ? `  观察日：${row.asOf}` : '',
    `  来源：${row.source?.trim() || '未标注'}`,
    row.fetched_at ? `  取数时点：${row.fetched_at}` : '',
    row.boards != null ? `  连板：${row.boards} 板` : '',
    `  页面显示：现价 ${row.price ?? '—'}，涨跌幅 ${pct}，成交额 ${amount}${floatCap}`,
    row.industry ? `  行业：${row.industry}` : '',
  ].filter(Boolean).join('\n');
}

export function clipWikiBody(markdown: string, limit = WIKI_SNAPSHOT_LIMIT): { body: string; clipped: boolean } {
  const text = markdown.trim();
  if (!text) return { body: '', clipped: false };
  if (text.length <= limit) return { body: text, clipped: false };
  return { body: `${text.slice(0, limit)}\n…（Wiki 正文已截断，截断片不能当作完整页）`, clipped: true };
}

/** Ask 引用 Wiki：指定了版本就必须核对回包 hash，缺 hash 与不一致都拒绝正文。 */
export function citedWikiVersionFailure(expected?: string, hash?: string): string | null {
  if (!expected) return null;
  if (!hash) return '回包没有内容版本，不能按绑定版本分析。';
  if (expected !== hash) return `绑定版本 ${expected} 与当前页 ${hash} 不一致，读取失败，不会改读最新稿。`;
  return null;
}

export interface DailyReviewSnapshotInput {
  reviewDate?: string | null;
  fetchedAt?: string | null;
  dataReady: boolean;
  pageErr?: string | null;
  indices: { name: string; price: number | null; change_pct: number | null; source?: string | null; fetched_at?: string | null }[];
  globalIndices: {
    name: string; region?: string; price: number | null; change_pct: number | null;
    source?: string | null; fetched_at?: string | null; note?: string | null;
  }[];
  globalDone: boolean;
  globalErr?: string | null;
  sentiment?: {
    date?: string | null;
    breadth?: string | null;
    speculation?: string | null;
    up?: number | null;
    down?: number | null;
    flat?: number | null;
    zt?: number | null;
    zt_real?: number | null;
    dt?: number | null;
    dt_real?: number | null;
    active?: number | string | null;
    source?: string | null;
    fetched_at?: string | null;
  } | null;
  emotion?: {
    date?: string | null;
    source?: string | null;
    fetched_at?: string | null;
    zt_count?: number;
    dt_count?: number;
    max_boards?: number;
    lianban_count?: number;
    seal_rate?: number | null;
    break_rate?: number | null;
    promotion_rate?: number | null;
    lianban_stocks?: {
      code: string; name: string; boards?: number;
      price?: number | null; pct?: number | null; amount?: number | null;
      float_cap?: number | null; industry?: string;
    }[];
  } | null;
  emoDone: boolean;
  ovDone: boolean;
  sectors: { name: string; pct: number | null; net: number | null }[];
  sectorsSource?: string | null;
  sectorsFetchedAt?: string | null;
  turnover?: { updated?: string | null; source?: string | null; stocks: { name: string; code: string; price?: number | null; pct?: number | null; amount?: number | null }[] } | null;
  toDone: boolean;
  idxDone: boolean;
  idxErr: boolean;
  citedMarketIds?: string[];
}

const pct = (v: number | null | undefined) =>
  v == null ? '—' : `${v > 0 ? '+' : ''}${v}%`;

const num = (v: number | null | undefined) =>
  v == null ? '—' : v.toLocaleString('zh-CN', { maximumFractionDigits: 2 });

const yi = (v: number | null | undefined) =>
  v == null ? '—' : `${num(v / 1e8)} 亿`;

function provenance(source?: string | null, fetchedAt?: string | null): string[] {
  return [
    `来源 ${source?.trim() || '未标注'}`,
    fetchedAt ? `取数时点 ${fetchedAt}` : '取数时点未标注',
  ];
}

function firstProvenance<T extends { source?: string | null; fetched_at?: string | null }>(rows: T[]): { source?: string | null; fetched_at?: string | null } {
  const withSource = rows.find(item => item.source?.trim());
  const withTime = rows.find(item => item.fetched_at);
  return { source: withSource?.source, fetched_at: withTime?.fetched_at };
}

/** 大盘页：宽基、全球指数、情绪、板块资金、短线情绪、成交额榜、连板股。 */
export function buildDailyReviewSnapshot(input: DailyReviewSnapshotInput): string {
  const asOf = input.reviewDate || '未确定业务日';
  const fetched = input.fetchedAt ? `取数时点 ${input.fetchedAt}` : '取数时点未标注';
  const header = [
    `业务日 ${asOf}`,
    fetched,
    input.pageErr ? `页面错误：${input.pageErr}` : '',
    !input.dataReady ? '部分数据块仍在加载或未加载' : '页面数据块已加载完成',
  ];
  const sections: string[] = [formatSnapshotSection('页面状态', header)];

  const indexMeta = firstProvenance(input.indices);
  const indexLines = input.indices.length
    ? [...provenance(indexMeta.source, indexMeta.fetched_at), ...input.indices.map(i => `- ${i.name}：点位 ${num(i.price)}，涨跌幅 ${pct(i.change_pct)}`)]
    : input.idxDone ? [input.idxErr ? '宽基指数：数据源暂不可用' : '宽基指数：暂无数据'] : ['宽基指数：未加载'];
  sections.push(formatSnapshotSection('宽基指数', indexLines));

  const globalMeta = firstProvenance(input.globalIndices);
  const globalLines = input.globalIndices.length
    ? [...provenance(globalMeta.source, globalMeta.fetched_at), ...input.globalIndices.map(g => `- ${g.name}${g.region ? `（${g.region}）` : ''}：${num(g.price)}，${pct(g.change_pct)}${g.fetched_at ? `，数据时间 ${g.fetched_at}` : ''}${g.note ? `，${g.note}` : ''}`)]
    : input.globalDone ? [input.globalErr || '全球指数：暂无可用数据'] : ['未加载'];
  sections.push(formatSnapshotSection('全球指数', globalLines));

  const sent = input.sentiment;
  const sentVisible = sent && [sent.breadth, sent.speculation, sent.up, sent.down, sent.flat, sent.zt, sent.dt, sent.active].some(value => value !== null && value !== undefined && value !== '');
  const sentLines = sent && sentVisible
      ? [
        ...provenance(sent.source, sent.fetched_at),
        `- 大盘宽度 ${sent.breadth ?? '—'}，题材投机 ${sent.speculation ?? '—'}`,
        '  口径：大盘宽度/题材投机是前端按上涨家数占比与涨停家数阈值派生的标签，不是取数层原始字段。',
        `- 上涨 ${sent.up ?? '—'} 家，下跌 ${sent.down ?? '—'} 家，平盘 ${sent.flat ?? '—'} 家`,
        '  口径：上涨/下跌家数是行业板块成分加总，不是交易所公布口径。',
        `- 涨停 ${sent.zt ?? '—'}，真实涨停 ${sent.zt_real ?? '—'}，跌停 ${sent.dt ?? '—'}，真实跌停 ${sent.dt_real ?? '—'}，活跃度 ${sent.active ?? '—'}`,
        sent.date ? `- 观察日 ${sent.date}` : '',
      ]
    : input.ovDone ? ['市场情绪：暂无数据'] : ['未加载'];
  sections.push(formatSnapshotSection('市场情绪', sentLines));

  const emo = input.emotion;
  const emoLines = emo && emo.zt_count !== undefined
      ? [
        ...provenance(emo.source, emo.fetched_at),
        `- 涨停 ${emo.zt_count}，跌停 ${emo.dt_count ?? '—'}，最高连板 ${emo.max_boards ?? '—'} 板，连板 ${emo.lianban_count ?? '—'} 家`,
        `- 封板率 ${emo.seal_rate == null ? '—' : `${(emo.seal_rate * 100).toFixed(1)}%`}，炸板率 ${emo.break_rate == null ? '—' : `${(emo.break_rate * 100).toFixed(1)}%`}，晋级率 ${emo.promotion_rate == null ? '—' : `${(emo.promotion_rate * 100).toFixed(1)}%`}`,
        emo.date ? `- 观察日 ${emo.date}` : '',
      ]
      : input.emoDone ? ['短线情绪：暂无数据'] : ['未加载'];
  sections.push(formatSnapshotSection('短线情绪', emoLines));

  const lianban = emo?.lianban_stocks || [];
  const lianbanLines = lianban.length
      ? [...provenance(emo?.source, emo?.fetched_at), ...lianban.slice(0, 40).map(s => `- ${s.name}（${s.code}）：连板 ${s.boards ?? '—'} 板，现价 ${num(s.price ?? null)}，${pct(s.pct ?? null)}，成交额 ${yi(s.amount ?? null)}${s.float_cap != null ? `，流通市值 ${yi(s.float_cap)}` : ''}${s.industry ? `，${s.industry}` : ''}`)]
      : input.emoDone ? ['连板股：暂无数据'] : ['未加载'];
  sections.push(formatSnapshotSection('连板股', lianbanLines));

  const sectorLines = input.sectors.length
      ? [...provenance(input.sectorsSource, input.sectorsFetchedAt), ...input.sectors.slice(0, 15).map(s => `- ${s.name}：涨跌 ${pct(s.pct)}，净流入 ${s.net == null ? '—' : `${s.net > 0 ? '+' : ''}${num(s.net)} 亿`}`)]
      : input.ovDone ? ['板块资金：暂无数据'] : ['未加载'];
  sections.push(formatSnapshotSection('板块资金趋势', sectorLines));

  const turnoverLines = input.turnover?.stocks?.length
      ? [...provenance(input.turnover.source, input.turnover.updated), ...input.turnover.stocks.slice(0, 20).map((s, i) => `- ${i + 1}. ${s.name}（${s.code}）：现价 ${num(s.price ?? null)}，${pct(s.pct ?? null)}，成交额 ${yi(s.amount ?? null)}`)]
      : input.toDone ? ['成交额榜：暂无数据'] : ['未加载'];
  sections.push(formatSnapshotSection('成交额榜 TOP20', turnoverLines));

  let body = sections.filter(Boolean).join('\n\n');
  const cited = [...(input.citedMarketIds || [])];
  return clipPageSnapshot(body, cited).body;
}

export type WikiLoadState = 'loading' | 'missing' | 'unpublished' | 'ready' | 'error';

export function buildWikiPageSnapshot(input: {
  kind: 'company' | 'industry';
  title: string;
  slug: string;
  symbol?: string;
  coverageNote?: string;
  loadState: WikiLoadState;
  page?: {
    input_hash?: string;
    spec?: { as_of?: string; status?: string; valid_until?: string; blocks?: { kind: string }[] };
  } | null;
  markdown?: string;
}): string {
  const clipped = clipWikiBody(input.markdown || '');
  const spec = input.page?.spec;
  const hash = input.page?.input_hash;
  const loadLine = {
    loading: 'Wiki 正在加载',
    missing: 'Wiki 缺页，尚未发布',
    unpublished: 'Wiki 资料尚待补充',
    error: 'Wiki 读取失败',
    ready: hash ? `Wiki 版本 ${hash}` : '内容版本未标注',
  }[input.loadState];
  const lines = [
    input.kind === 'company'
      ? `公司 ${input.title}${input.symbol ? `（${input.symbol}）` : ''}，Wiki slug ${input.slug}`
      : `行业 ${input.title}（${input.slug}）`,
    input.coverageNote || '',
    loadLine,
    spec?.as_of ? `观察时点 ${spec.as_of}` : (input.loadState === 'ready' ? '观察时点未标注' : ''),
    spec?.status ? `状态 ${spec.status}` : '',
    spec?.valid_until ? `有效至 ${spec.valid_until}` : '',
    spec?.blocks?.length ? `已加载块：${spec.blocks.map(b => b.kind).join('、')}` : '',
    clipped.body ? `【已渲染 Wiki】\n${clipped.body}` : (input.loadState === 'ready' ? 'Wiki 正文尚未加载' : ''),
  ];
  return clipPageSnapshot(lines.filter(Boolean).join('\n')).body;
}

export function buildDirectorySnapshot(input: {
  heading: string;
  items: { title: string; id: string }[];
  loading?: boolean;
}): string {
  if (input.loading) return `${input.heading}\n正在加载。`;
  const rows = input.items.map(item => `- ${item.title}（${item.id}）`);
  return clipPageSnapshot([input.heading, ...rows].filter(Boolean).join('\n')).body;
}

export function buildIndustryProfileSnapshot(profile: {
  industry_name: string;
  industry_code: string;
  status?: string;
  card_count?: number;
  companies?: string[];
  profile_sha256?: string;
  core_questions?: { q: string; rationale?: string; evidence_docs?: string[] }[];
}, evidenceTitles: Record<string, string> = {}): string {
  const questions = profile.core_questions || [];
  const lines = [
    `产业 ${profile.industry_name}（${profile.industry_code}）`,
    profile.status ? `状态 ${profile.status}` : '状态未标注',
    profile.card_count != null ? `研究切入点 ${profile.card_count}` : '',
    profile.profile_sha256 ? `内容版本 ${profile.profile_sha256}` : '内容版本未标注',
    profile.companies?.length ? `覆盖公司：${profile.companies.join('、')}` : '覆盖公司未列出',
    questions.length ? `核心问题 ${questions.length} 条：` : '核心问题未加载',
    ...questions.map(q => {
      const docs = q.evidence_docs || [];
      const docLines = docs.map(id => `    - ${evidenceTitles[id] || '来源研报'} \`document:${id}\``);
      return [`- ${q.q}`, q.rationale ? `  ${q.rationale}` : '', ...docLines].filter(Boolean).join('\n');
    }),
  ];
  return clipPageSnapshot(lines.filter(Boolean).join('\n')).body;
}

export function buildFeedListSnapshot(input: {
  kind: 'news' | 'filings';
  watchCount: number;
  rows: readonly { when: string; name: string; code?: string; title: string; url?: string }[];
  loading?: boolean;
  refreshing?: boolean;
  err?: string | null;
  staleNote?: string | null;
  depNote?: string | null;
  mode?: 'ask' | 'agent';
  selectedUrls?: readonly string[];
}): string {
  const label = input.kind === 'news' ? '公开新闻' : 'A股公告';
  const rows = input.watchCount ? input.rows : [];
  const selected = input.selectedUrls ? new Set(input.selectedUrls) : null;
  const shown = selected ? rows.filter(row => row.url && selected.has(row.url)) : rows.slice(0, 20);
  return clipPageSnapshot([
    `当前栏目：${label}；关注 ${input.watchCount} 只；${selected ? `本栏共 ${rows.length} 条，其余未提供。` : `共 ${rows.length} 条，以下最近 ${shown.length} 条。`}`,
    ...shown.map(row => `- ${row.when} ${row.name}${row.code ? `（${row.code}）` : ''}：${row.title}${input.mode === 'agent' && row.url ? `（${row.url}）` : ''}`),
    '说明：以上为发送时列表快照；链接正文在 @ 后由宿主读取，不在此重复。',
    !input.watchCount ? '当前没有关注股票。' : '',
    input.loading ? '正在加载，资料尚未取齐。' : '',
    input.refreshing ? '正在刷新，以下仍为当前已展示的快照，不代表刷新后的最新结果。' : '',
    input.err ? `读取失败：${input.err}` : '',
    input.staleNote ?? '',
    input.depNote ?? '',
    !rows.length ? '当前没有可供提炼的列表条目，不代表没有相关新闻或公告。' : '',
  ].filter(Boolean).join('\n')).body;
}

export function buildInvestmentNewsSnapshot(input: {
  industryName: string | null;
  tracks: readonly { key: string; name: string; count: number }[];
  items: readonly { time: string; source: string; title: string; url: string }[];
  generatedAt: string | null;
  recentDays: number | null;
  sourceCount: number | null;
  loading?: boolean;
  refreshing?: boolean;
  err?: string | null;
  staleNote?: string | null;
  mode?: 'ask' | 'agent';
  selectedUrls?: readonly string[];
}): string {
  const track = input.industryName ?? '未选择赛道';
  const items = input.items;
  const selected = input.selectedUrls ? new Set(input.selectedUrls) : null;
  const shown = selected ? items.filter(row => selected.has(row.url)) : items.slice(0, 20);
  return clipPageSnapshot([
    `当前栏目：Investment News；当前赛道：${track}；${selected ? `本栏共 ${items.length} 条，其余未提供。` : `共 ${items.length} 条，以下最近 ${shown.length} 条。`}`,
    input.tracks.length ? `赛道：${input.tracks.map(t => `${t.name} ${t.count}`).join('、')}。` : '',
    input.generatedAt ? `公开源 ${input.sourceCount ?? 0} 个·近 ${input.recentDays ?? 0} 天·更新于 ${input.generatedAt}` : '尚未抓取资讯。',
    ...shown.map(row => `- ${row.time} ${row.source}：${row.title}${input.mode === 'agent' && row.url ? `（${row.url}）` : ''}`),
    '说明：以上为发送时列表快照；链接正文在 @ 后由宿主读取。',
    input.loading ? '正在加载，资料尚未取齐。' : '',
    input.refreshing ? '正在刷新，以下仍为当前已展示的快照，不代表刷新后的最新结果。' : '',
    input.err ? `读取失败：${input.err}` : '',
    input.staleNote ?? '',
    !items.length ? '当前没有可供提炼的列表条目，不代表没有相关资讯。' : '',
  ].filter(Boolean).join('\n')).body;
}

/** 资讯雷达「事件概率」：合约条目没有单独 URL，不能造 @ 引用，只能靠这份快照文本让模型看见。 */
export function buildEventsProbabilitySnapshot(input: {
  items: readonly { topic: string; source: string; title: string; leg: string; prob: number | null; settle: string; volume: number | null }[];
  howToRead: readonly string[];
  updated: string | null;
  partial: boolean;
  loading?: boolean;
  refreshing?: boolean;
  err?: string | null;
  staleNote?: string | null;
}): string {
  const byTopic = new Map<string, typeof input.items[number][]>();
  for (const item of input.items) byTopic.set(item.topic, [...(byTopic.get(item.topic) ?? []), item]);
  const lines = [
    `当前栏目：事件概率（Polymarket / Kalshi 公开定价）；共 ${input.items.length} 份合约。`,
    input.partial ? '部分源没取到，这不是完整清单。' : '',
    input.updated ? `更新于 ${input.updated}` : '',
    ...[...byTopic.entries()].flatMap(([topic, items]) => [
      `【${topic}】`,
      ...items.map(it => `- ${it.title}${it.leg ? `（${it.leg}）` : ''}：概率 ${it.prob == null ? '—' : `${(it.prob * 100).toFixed(1)}%`}，结算日 ${it.settle || '—'}，24h 成交量 ${it.volume == null ? '—' : it.volume.toLocaleString('en-US')}，来源 ${it.source}`),
    ]),
    input.howToRead.length ? `怎么读这组数：${input.howToRead.join('；')}` : '',
    input.loading ? '正在加载，资料尚未取齐。' : '',
    input.refreshing ? '正在刷新，以下仍为当前已展示的快照，不代表刷新后的最新结果。' : '',
    input.err ? `读取失败：${input.err}` : '',
    input.staleNote ?? '',
    !input.items.length ? '这一轮没取到合约报价（上游可能暂时不可用），不代表没有相关事件。' : '',
  ];
  return clipPageSnapshot(lines.filter(Boolean).join('\n')).body;
}
