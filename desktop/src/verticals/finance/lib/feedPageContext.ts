import type { PageAssistantObject } from '../../../core/ai/pageContext';
import { buildFeedListSnapshot, buildInvestmentNewsSnapshot } from '../assistant/snapshot.ts';

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
      // 公司代码随来源一并带上：不带代码时模型只能靠公司名反查身份。
      source: row.code ? `${row.name}（${row.code}）` : row.name,
      time: row.when,
      section,
    });
    return object ? [{ ...object, detail: row.code ? `所属公司代码：${row.code}` : undefined }] : [];
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
    context: buildFeedListSnapshot({
      kind: input.kind,
      watchCount: input.watchCount,
      rows: input.rows,
      loading: input.loading,
      refreshing: input.refreshing,
      err: input.err,
      staleNote: input.staleNote,
      depNote: input.depNote,
    }),
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
    context: buildInvestmentNewsSnapshot({
      industryName: input.industryName,
      tracks: input.tracks,
      items: input.items,
      generatedAt: input.generatedAt,
      recentDays: input.recentDays,
      sourceCount: input.sourceCount,
      loading: input.loading,
      refreshing: input.refreshing,
      err: input.err,
      staleNote: input.staleNote,
    }),
    suggestions: ['这个栏目适合看什么', '帮我把要点提炼一下', '有哪些值得追的线索'],
    objects: investmentNewsObjects(items),
  };
}
