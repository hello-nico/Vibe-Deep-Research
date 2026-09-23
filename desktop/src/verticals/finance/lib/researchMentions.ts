import { mentionLabel, rememberMentionLabel } from './library';

/**
 * Model-facing notes appended by the @ serializer (dsh/research-input.ts).
 * The serializer and the fold rules below share these strings, so the model
 * input stays byte-identical while the user bubble shows only a chip.
 */
export const MENTION_NOTES = {
  documentStale: '（发送时绑定的解析版本已不可用，不能按正文引用）',
  documentUnparsed: '（原件已保存，正文尚未解析，不能按正文引用）',
  wikiStale: '（绑定版本与当前页不一致，读取将失败，不会改读最新稿）',
  url: '（发送时未读取正文）',
  company: '。用 observe_market 的 symbol 读取交易日收盘，不要把指数代码放进 symbol。',
  indices: '（上证 000001.SH、沪深300 000300.SH、深证 399001.SZ、创业板 399006.SZ）。读取时对成员逐个 observe_market，必须用 marketBenchmarkId，禁止当 symbol。观察日是工具 asOf 的交易日收盘，不是盘中 tick。',
  index: (id: string) => `。读取 observe_market 必须用 marketBenchmarkId=${id}，禁止当 symbol。观察日是工具 asOf 的交易日收盘序列，不是盘中快照。`,
  profile: '。用 read_industry_profile 核 hash 读取；这不是 Theme Wiki，也不是 41 行业研究页。',
  date: '。这是日历日，不是对象版本，也不是盘中快照。行情观察日请作为 observe_market.asOf。',
} as const;

/** What the user sees next to a chip instead of a model-facing status note. */
const STATUS_TEXT: Record<string, string> = {
  [MENTION_NOTES.documentStale]: '（引用的版本已更新，请重新引用）',
  [MENTION_NOTES.documentUnparsed]: '（正文还在处理）',
  [MENTION_NOTES.wikiStale]: '（页面已更新，请重新引用）',
};

const escape = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const TITLE = '([^\\n`]{1,200}?)';
const any = (...notes: string[]) => `(?:${notes.map(escape).join('|')})`;
const INDEX_NOTE = escape(MENTION_NOTES.index('\u0000')).replace('\u0000', '[0-9]{6}\\.(?:SH|SZ)');

interface FoldRule {
  pattern: RegExp;
  fold(match: RegExpMatchArray): { ref: string; label: string; status?: string };
}

// Each rule consumes one serialized reference, including its trailing model note.
const RULES: FoldRule[] = [
  {
    pattern: new RegExp(`引用资料：${TITLE}\\s+\`(document:[a-f0-9]{32}(?:\\/[^/?#\\s<>]+\\/[a-f0-9]{64})?)\`(?:\\s+parse_revision_id=\\S+\\s+parsed_content_sha256=\\S+)?(${any(MENTION_NOTES.documentStale, MENTION_NOTES.documentUnparsed)})?`, 'g'),
    fold: m => ({ label: m[1]!, ref: m[2]!, status: m[3] }),
  },
  {
    pattern: new RegExp(`引用议题：${TITLE}\\s+\`(topic:[a-f0-9]{12})\``, 'g'),
    fold: m => ({ label: m[1]!, ref: m[2]! }),
  },
  {
    pattern: new RegExp(`引用材料：${TITLE}\\s+\`((?:companies|industries|themes|comparisons)\\/[^/\\s?#<>\`]+)\`(${any(MENTION_NOTES.wikiStale)})?`, 'g'),
    fold: m => ({ label: m[1]!, ref: m[2]!, status: m[3] }),
  },
  {
    pattern: new RegExp(`引用来源：${TITLE}\\s+\`(url:https?:\\/\\/[^\\s\`]+)\`${any(MENTION_NOTES.url)}?`, 'g'),
    fold: m => ({ ref: m[2]!, label: mentionLabel(m[2]!, hostLabel(m[1]!)) }),
  },
  {
    pattern: new RegExp(`引用公司行情：([0-9]{6}\\.(?:SH|SZ|BJ))\\s+\`(company:[0-9]{6}\\.(?:SH|SZ|BJ))\`${any(MENTION_NOTES.company)}?`, 'g'),
    fold: m => ({ ref: m[2]!, label: mentionLabel(m[2]!, `${m[1]} 行情`) }),
  },
  {
    pattern: new RegExp(`引用宽基指数集合\\s+\`(market:indices)\`${any(MENTION_NOTES.indices)}?`, 'g'),
    fold: m => ({ ref: m[1]!, label: '宽基指数集合' }),
  },
  {
    pattern: new RegExp(`引用宽基指数：${TITLE}\\s+\`(market:[0-9]{6}\\.(?:SH|SZ))\`(?:${INDEX_NOTE})?`, 'g'),
    fold: m => ({ label: m[1]!, ref: m[2]! }),
  },
  {
    pattern: new RegExp(`引用产业研究 Profile\\s+\`(profile:sw2:[0-9A-Z.]+:[a-f0-9]{64})\`${any(MENTION_NOTES.profile)}?`, 'g'),
    fold: m => ({ ref: m[1]!, label: mentionLabel(m[1]!, '产业研究') }),
  },
  {
    pattern: new RegExp(`引用日历日\\s+(\\d{4}-\\d{2}-\\d{2})\\s+\`(date:\\d{4}-\\d{2}-\\d{2})\`${any(MENTION_NOTES.date)}?`, 'g'),
    fold: m => ({ ref: m[2]!, label: m[1]! }),
  },
];

function hostLabel(url: string): string {
  try { return new URL(url).hostname || url; } catch { return url; }
}

interface Found { index: number; length: number; ref: string; label: string; status?: string }

function findMentions(text: string): Found[] {
  const found: Found[] = [];
  for (const rule of RULES) {
    for (const match of text.matchAll(rule.pattern)) {
      const { ref, label, status } = rule.fold(match);
      found.push({ index: match.index ?? 0, length: match[0].length, ref, label: label.replace(/\s+/g, ' ').trim(), status });
    }
  }
  found.sort((left, right) => left.index - right.index);
  return found.filter((item, i) => i === 0 || item.index >= found[i - 1]!.index + found[i - 1]!.length);
}

function skipParent(node: Node): boolean {
  const parent = node.parentElement;
  if (!parent) return true;
  return Boolean(parent.closest('button, a, textarea, input, [data-research-mention]'));
}

function collectTextNodes(root: ParentNode): Text[] {
  const doc = root.ownerDocument;
  if (!doc) return [];
  const filter = doc.defaultView?.NodeFilter ?? NodeFilter;
  const walker = doc.createTreeWalker(root, filter.SHOW_TEXT, {
    acceptNode(node) {
      if (!node.nodeValue || !node.nodeValue.includes('引用') || skipParent(node)) return filter.FILTER_REJECT;
      return filter.FILTER_ACCEPT;
    },
  });
  const nodes: Text[] = [];
  for (let current = walker.nextNode(); current; current = walker.nextNode()) nodes.push(current as Text);
  return nodes;
}

function mentionButton(doc: Document, title: string, ref: string): HTMLButtonElement {
  rememberMentionLabel(ref, title);
  const button = doc.createElement('button');
  button.type = 'button';
  button.className = 'finance-citation';
  button.dataset.researchMention = 'true';
  button.dataset.ref = ref;
  button.dataset.citationLabel = title;
  button.textContent = mentionLabel(ref, title);
  button.setAttribute('aria-label', `打开资料：${title}`);
  return button;
}

/** Fold serialized @ references (all kinds) into chips. Identity stays in data-ref; model notes never show. */
export function markResearchMentions(root: ParentNode): void {
  const doc = root.ownerDocument;
  if (!doc?.defaultView) return;
  for (const node of collectTextNodes(root)) {
    const text = node.nodeValue || '';
    const found = findMentions(text);
    if (!found.length) continue;
    const fragment = doc.createDocumentFragment();
    let cursor = 0;
    for (const item of found) {
      if (item.index > cursor) fragment.append(text.slice(cursor, item.index));
      fragment.append(mentionButton(doc, item.label, item.ref));
      if (item.status && STATUS_TEXT[item.status]) fragment.append(STATUS_TEXT[item.status]!);
      cursor = item.index + item.length;
    }
    if (cursor < text.length) fragment.append(text.slice(cursor));
    node.replaceWith(fragment);
  }
}
