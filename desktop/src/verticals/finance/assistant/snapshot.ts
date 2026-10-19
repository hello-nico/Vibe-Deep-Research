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

/** 按节组装的页面快照：每节一段，节内不留空行（超限后二次截断也不会把一节从中间劈开）。 */
export interface SnapshotSection { id: string; title: string; text: string }

function sectionedMarker(omitted: string[], clipped: string[], focus: string | undefined, limit: number): string {
  const names = (list: string[]) => list.map(item => `「${item}」`).join('');
  return `…（页面快照超出 ${limit.toLocaleString('en-US')} 字上限：${omitted.length ? `已省略${names(omitted)}` : '没有整节省略'}${clipped.length ? `；${names(clipped)}被截断` : ''}${focus ? `；优先保留用户正在看的「${focus}」` : ''}。）`;
}

/**
 * 总长超过上限时的取舍：用户正在看的一节最先保留，其次是页首（`keep` 里列出的节，如价格与论点），其余按页面顺序。
 * 整节放不下就整节省略并在末尾写明；只有正在看的那一节可以被截断（在行边界处）。输出仍按页面顺序，总长含说明不超过上限。
 */
export function clipSectionedSnapshot(
  sections: readonly SnapshotSection[],
  options: { focus?: string; keep?: readonly string[]; limit?: number } = {},
): { body: string; truncated: boolean; omitted: string[]; clipped: string[] } {
  const limit = options.limit ?? PAGE_SNAPSHOT_LIMIT;
  const live = sections.filter(item => item.text.trim());
  const full = live.map(item => item.text).join('\n\n');
  if (full.length <= limit) return { body: full, truncated: false, omitted: [], clipped: [] };
  const focus = live.find(item => item.id === options.focus);
  const order = [
    ...(focus ? [focus] : []),
    ...live.filter(item => options.keep?.includes(item.id) && item !== focus),
    ...live.filter(item => item !== focus && !options.keep?.includes(item.id)),
  ];
  const titles = live.map(item => item.title);
  const budget = limit - sectionedMarker(titles, titles.slice(0, 1), titles[0], limit).length - 2;
  const kept = new Map<SnapshotSection, string>();
  let used = 0;
  for (const item of order) {
    const need = (kept.size ? 2 : 0) + item.text.length;
    // 页首等必留的节先把位置留出来；正在看的这一节放不下时只截它自己。
    const reserved = item === focus ? (options.keep ?? []).reduce((sum, id) => {
      const other = live.find(entry => entry.id === id);
      return other && other !== item && !kept.has(other) ? sum + other.text.length + 2 : sum;
    }, 0) : 0;
    if (used + need + reserved <= budget) { kept.set(item, item.text); used += need; continue; }
    if (item !== focus) continue;
    const room = budget - used - reserved - (kept.size ? 2 : 0);
    if (room < 80) continue;
    const cut = item.text.slice(0, room - 1);
    const line = cut.lastIndexOf('\n');
    kept.set(item, `${line > 80 ? cut.slice(0, line) : cut}…`);
    used += (kept.size > 1 ? 2 : 0) + kept.get(item)!.length;
  }
  const omitted = live.filter(item => !kept.has(item)).map(item => item.title);
  const clipped = [...kept].filter(([item, text]) => text !== item.text).map(([item]) => item.title);
  const text = live.filter(item => kept.has(item)).map(item => kept.get(item)!).join('\n\n');
  return { body: `${text}\n\n${sectionedMarker(omitted, clipped, focus?.title, limit)}`, truncated: true, omitted, clipped };
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
    '  说明：这是页面显示值，不是工具读取的证据。',
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
