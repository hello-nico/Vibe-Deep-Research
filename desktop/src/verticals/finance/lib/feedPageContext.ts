import type { PageAssistantObject } from '../../../core/ai/pageContext';

export interface FeedRow {
  code: string; name: string; when: string; title: string; meta?: string; url?: string;
}

function urlObject(input: { title: string; url?: string; source?: string; time?: string; section?: string }): PageAssistantObject | null {
  const url = (input.url || '').trim();
  if (!/^https?:\/\//i.test(url)) return null;
  return {
    kind: 'url',
    id: `url:${url}`,
    label: input.title || url,
    url,
    source: input.source,
    time: input.time,
    hint: [input.source, input.time].filter(Boolean).join(' · ') || undefined,
    section: input.section,
    readable: true,
  };
}

function feedObjects(kind: 'news' | 'filings', rows: readonly FeedRow[]): PageAssistantObject[] {
  const section = kind === 'news' ? '公开新闻' : 'A股公告';
  return rows.flatMap(row => {
    const object = urlObject({
      title: row.title,
      url: row.url,
      source: row.name,
      time: row.when,
      section,
    });
    return object ? [object] : [];
  });
}

/** Serialize the same snapshot as the list, without claiming to have read linked bodies. */
export function feedPageContext(input: {
  kind: 'news' | 'filings'; rows: readonly FeedRow[]; watchCount: number;
  loading: boolean; refreshing: boolean; err: string | null;
  staleNote: string | null; depNote: string | null;
}) {
  const label = input.kind === 'news' ? '公开新闻' : 'A股公告';
  const rows = input.watchCount ? input.rows : [];
  return {
    key: `intel:${input.kind}`,
    title: `资讯雷达 · ${label}`,
    context: [
      `当前栏目：${label}；关注 ${input.watchCount} 只，当前展示 ${rows.length} 条。`,
      '资料范围：本页列表仅提供标题、公司、时间、分类及链接身份，未读取链接正文。',
      !input.watchCount ? '当前没有关注股票。' : '',
      input.loading ? '正在加载，资料尚未取齐。' : '',
      input.refreshing ? '正在刷新，以下仍为当前已展示的快照，不代表刷新后的最新结果。' : '',
      input.err ? `读取失败：${input.err}` : '',
      input.staleNote ?? '', input.depNote ?? '',
      !rows.length ? '当前没有可供提炼的列表条目，不代表没有相关新闻或公告。' : '',
    ].filter(Boolean).join('\n'),
    suggestions: ['这个栏目适合看什么', '帮我把要点提炼一下', '有哪些值得追的线索'],
    objects: feedObjects(input.kind, rows),
  };
}

export interface InvestmentNewsRow {
  time: string; source: string; title: string; original?: string; url: string;
}

export function investmentNewsObjects(items: readonly InvestmentNewsRow[]): PageAssistantObject[] {
  return items.flatMap(row => {
    const object = urlObject({
      title: row.title,
      url: row.url,
      source: row.source,
      time: row.time,
      section: 'Investment News',
    });
    return object ? [object] : [];
  });
}

/** Current Investment News track list only; not linked article bodies. */
export function investmentNewsPageContext(input: {
  industryKey: string | null; industryName: string | null;
  tracks: readonly { key: string; name: string; count: number }[];
  items: readonly InvestmentNewsRow[];
  generatedAt: string | null; recentDays: number | null; sourceCount: number | null;
  loading: boolean; refreshing: boolean; err: string | null; staleNote: string | null;
}) {
  const track = input.industryName ?? '未选择赛道';
  const items = input.items;
  return {
    key: `intel:investment-news:${input.industryKey ?? 'none'}`,
    title: `资讯雷达 · Investment News · ${track}`,
    context: [
      `当前栏目：Investment News；当前赛道：${track}；本页展示 ${items.length} 条。`,
      input.tracks.length ? `赛道：${input.tracks.map((t) => `${t.name} ${t.count}`).join('、')}。` : '',
      input.generatedAt ? `公开源 ${input.sourceCount ?? 0} 个·近 ${input.recentDays ?? 0} 天·更新于 ${input.generatedAt}` : '尚未抓取资讯。',
      '资料范围：本页当前赛道列表仅提供标题、来源、时间及链接身份，未读取链接正文。',
      input.loading ? '正在加载，资料尚未取齐。' : '',
      input.refreshing ? '正在刷新，以下仍为当前已展示的快照，不代表刷新后的最新结果。' : '',
      input.err ? `读取失败：${input.err}` : '',
      input.staleNote ?? '',
      !items.length ? '当前没有可供提炼的列表条目，不代表没有相关资讯。' : '',
    ].filter(Boolean).join('\n'),
    suggestions: ['这个栏目适合看什么', '帮我把要点提炼一下', '有哪些值得追的线索'],
    objects: investmentNewsObjects(items),
  };
}
