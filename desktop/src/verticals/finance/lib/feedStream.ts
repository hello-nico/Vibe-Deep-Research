import { api, feedHidden } from './api';
import { loadWatch } from './watchlist';
import { wikiPages } from './research';
import { companyIndustryLabel } from './companyRoster';
import type { FlipCard } from './flipCards';
import type { ReconCard } from './quarterRecon';
import type { ReconResult } from './reconResult';
import type { WritebackEvent } from './researchEvents';
import {
  cardQuestion, cardSentence, cardTitlePieces, cardTouchPieces, companyPieces, dayLabel, shortName,
  type SentencePiece, type VariableCard,
} from './trackingVariables';

/** 动态一条流：四类卡片统一成同一种结构（第一句 → 涉及 → 类型 · 日期 + 展开 / 看公司 / 讨论）。 */
export type StreamType = '财报' | '价格' | '公告' | '判断变化' | '对话';
export const STREAM_FILTERS = ['全部', '财报', '价格', '公告'] as const;
export type StreamFilter = (typeof STREAM_FILTERS)[number];

export interface StreamCard {
  key: string; type: StreamType;
  /** YYYY-MM-DD，排序用；判断变化置顶不看它。 */
  date: string; pinned?: boolean;
  title: SentencePiece[]; involved: SentencePiece[];
  /** 展开后的内容，一行一段；没有就没有「展开」按钮。 */
  details: SentencePiece[][];
  companies: { symbol: string; name: string }[];
  /** 「讨论」：输入框预填的问句、本轮引用的标题与正文。 */
  discuss: { question: string; title: string; text: string };
  url?: string;
  /** 财报卡第三行：研究是否已按这份财报重做、档位变了没有；变了的 `strong`。 */
  result?: { text: string; strong: boolean };
  /** 对话里调整的记录：打开对话、撤回。撤回只对该公司最新一次可用，其余显示「已有更新的版本」。 */
  session?: string;
  revert?: { state: 'available' | 'newer'; event: { symbol: string; research_version: string | null } };
  /** 同公司同日合并进来的其余公告（只在「全部」里）：底行写「另有 N 份公告」，展开列出标题与原文链接。 */
  extra?: { title: string; url?: string }[];
}

const plain = (pieces: SentencePiece[]) => pieces.map(piece => piece.text).join('');
const text = (value: string): SentencePiece[] => [{ text: value }];
const dateOf = (value: string | null | undefined) => /^\d{4}-\d{2}-\d{2}/.exec(value ?? '')?.[0] ?? '';

export function priceStream(card: VariableCard): StreamCard {
  const title = cardTitlePieces(card);
  return {
    key: `price:${card.date}:${card.var_id}`, type: '价格', date: dateOf(card.date),
    title, involved: cardTouchPieces(card),
    details: card.companies.map(company => companyPieces(company)),
    companies: card.companies.map(company => ({ symbol: company.symbol, name: shortName(company.name) })),
    discuss: { question: cardQuestion(card), title: plain(title), text: `${plain(cardTouchPieces(card))}\n${cardSentence(card)}` },
  };
}

export function reconStream(card: ReconCard, result?: ReconResult | null): StreamCard {
  const impact = card.explain || '对账见展开';
  return {
    key: `recon:${card.symbol}:${card.period}`, type: '财报', date: dateOf(card.date), pinned: result?.changed || undefined,
    ...(result ? { result: { text: result.text, strong: result.changed } } : {}),
    title: text(card.headline), involved: text(`涉及：${card.company} · 利润 · ${impact}`),
    details: card.details.map(text),
    companies: [{ symbol: card.symbol, name: card.company }],
    discuss: { question: `${card.company}这份财报里利润为什么变了？`, title: card.headline, text: [card.explain, result?.text, ...card.details].filter(Boolean).join('\n') },
  };
}

export function flipStream(flip: FlipCard, today: string): StreamCard {
  const note = flip.kind === 'crossed' ? '价格已越过研究里的跳档价' : '价格接近研究里的跳档价';
  return {
    key: `flip:${flip.symbol}`, type: '判断变化', date: dateOf(today), pinned: true,
    title: text(flip.text), involved: text(`涉及：${flip.company} · 估值档位 · ${note}`), details: [],
    companies: [{ symbol: flip.symbol, name: flip.company }],
    discuss: { question: `${flip.company}的估值判断为什么会变？`, title: flip.text, text: `${note}。` },
  };
}

const WRITEBACK_AREA: Record<string, string> = { drivers: '价格影响', thesis: '论点与支柱', candidate: '对话里提到的因素' };
const WRITEBACK_FALLBACK: Record<string, string> = { drivers: '对话里调整了价格影响的取值', thesis: '对话里调整了论点与支柱', candidate: '对话里提到了一个新因素' };
/** Backend 的记录摘要里有「候选因子」等内部说法，页面上换成「对话里提到的因素」。 */
export const plainWritebackSummary = (summary: string) => summary.trim()
  .replace(/^候选因子：/, '对话里提到了一个因素：').replace(/^(纳入|排除|观察)因子：/, '$1了对话里提到的因素：').replace(/因子/g, '因素');
/** 估值档位有变化（记录带前后档位且不同）。 */
export const writebackGradeChanged = (event: Pick<WritebackEvent, 'grade_before' | 'grade_after'>) => !!event.grade_before && !!event.grade_after && event.grade_before !== event.grade_after;
/** 对话里调整的记录卡（类型「对话」）：档位变了写「估值从 A 变为 B」并置顶，与财报卡同规则。 */
export function writebackStream(event: WritebackEvent): StreamCard {
  const changed = writebackGradeChanged(event);
  const summary = plainWritebackSummary(event.summary) || WRITEBACK_FALLBACK[event.kind] || '对话里调整了研究';
  const result = changed ? `估值从${event.grade_before}变为${event.grade_after}`
    : event.grade_after && event.grade_before ? `估值判断没变（${event.grade_after}）` : '';
  return {
    key: `event:${event.id}`, type: '对话', date: shanghaiDate(event.at), pinned: changed || undefined,
    title: text(summary), involved: text(`涉及：${event.name} · ${WRITEBACK_AREA[event.kind] ?? '研究'} · 来自对话里的调整`),
    ...(result ? { result: { text: result, strong: changed } } : {}),
    details: [], companies: [{ symbol: event.symbol, name: event.name }],
    discuss: { question: `${event.name}这次对话里的调整，依据是什么？`, title: summary, text: [summary, result].filter(Boolean).join('\n') },
    ...(event.session_id ? { session: event.session_id } : {}),
    ...(event.revert ? { revert: { state: event.revert, event: { symbol: event.symbol, research_version: event.research_version } } } : {}),
  };
}
const shanghaiDate = (iso: string) => {
  const time = Date.parse(iso);
  return Number.isNaN(time) ? dateOf(iso) : new Date(time + 8 * 3600_000).toISOString().slice(0, 10);
};

export interface FilingRow { symbol: string; name: string; title: string; when: string; url: string; industry: string; /** Jev 判为例行。 */ routine?: boolean }
export function filingStream(row: FilingRow, others: readonly FilingRow[] = []): StreamCard {
  const area = row.industry ? ` · ${row.industry}` : '';
  return {
    key: `filing:${row.symbol}:${row.when}:${row.title}`, type: '公告', date: dateOf(row.when),
    title: text(row.title), involved: text(`涉及：${row.name}${area}`),
    details: [], url: row.url || undefined,
    companies: [{ symbol: row.symbol, name: row.name }],
    discuss: { question: `${row.name}这条公告对研究有什么影响？`, title: row.title, text: `${row.name} ${dateOf(row.when)} 公告：${[row.title, ...others.map(item => item.title)].join('；')}` },
    ...(others.length ? { extra: others.map(item => ({ title: item.title, url: item.url || undefined })) } : {}),
  };
}

/** 「全部」视图：同一公司同一天的公告合并成一张，第一句用最重要的一份（非例行优先，其余按原顺序即时间新的在前）。 */
export function filingStreams(rows: readonly FilingRow[], merge: boolean): StreamCard[] {
  if (!merge) return rows.map(row => filingStream(row));
  const groups = new Map<string, FilingRow[]>();
  for (const row of rows) { const key = `${row.symbol}:${dateOf(row.when)}`; groups.set(key, [...(groups.get(key) ?? []), row]); }
  return [...groups.values()].map(group => {
    const lead = group.find(row => !row.routine) ?? group[0]!;
    return filingStream(lead, group.filter(row => row !== lead));
  });
}

/** 置顶在前，其余按日期倒序（同日保持原顺序）；筛选「财报」「价格」时判断变化也出现。 */
export function streamOf(cards: readonly StreamCard[], filter: StreamFilter): StreamCard[] {
  const shown = cards.filter(card => filter === '全部' || card.type === filter || (card.type === '判断变化' && (filter === '财报' || filter === '价格')));
  const indexed = shown.map((card, index) => ({ card, index }));
  indexed.sort((a, b) => Number(!!b.card.pinned) - Number(!!a.card.pinned) || b.card.date.localeCompare(a.card.date) || a.index - b.index);
  return indexed.map(item => item.card);
}
export const streamDayText = (card: StreamCard) => card.date ? dayLabel(card.date) : '';

const MAX_FILINGS = 50;
const nameCache = new Map<string, string>();
/** 关注公司的公告（公司名、所属行业作领域）；失败当没有。`hidden` 是被判为例行、默认不显示的条数。 */
export async function loadFilingRows(showAll: boolean, signal?: AbortSignal): Promise<{ rows: FilingRow[]; hidden: number }> {
  const codes = loadWatch().filter(code => /^\d{6}$/.test(code));
  if (!codes.length) return { rows: [], hidden: 0 };
  const items = await api.announcements(codes, MAX_FILINGS, { all: showAll });
  const hidden = feedHidden(codes, MAX_FILINGS);
  const missing = codes.filter(code => !nameCache.has(code));
  if (missing.length) {
    try { const quotes = await api.quote(missing.join(',')); for (const code of missing) if (quotes[code]?.name) nameCache.set(code, shortName(quotes[code].name)); } catch { /* 无公司名退回代码 */ }
  }
  let industries = new Map<string, string>();
  try {
    industries = new Map((await wikiPages('companies', signal)).flatMap(item => {
      const code = /^companies\/(\d{6})-/.exec(item.slug)?.[1];
      const label = companyIndustryLabel(item.summary);
      return code && label ? [[code, label] as const] : [];
    }));
  } catch { /* 没有行业就只写公司 */ }
  const rows = items.map((item): FilingRow => {
    const code = item.symbol.slice(0, 6);
    return { symbol: item.symbol, name: nameCache.get(code) ?? code, title: item.title, when: (item.published_at ?? '').replace('T', ' '), url: item.url ?? '', industry: industries.get(code) ?? '', routine: item.routine === true };
  });
  return { rows, hidden };
}
