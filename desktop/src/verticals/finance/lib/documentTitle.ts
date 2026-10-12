const QUARTER_NAME: Record<string, string> = { Q1: '第一季度报告', Q3: '第三季度报告', H1: '半年度报告' };

/** "FY2025" → "2025 年年度报告", "2026H1" → "2026 年半年度报告"; unknown periods fall back to period + type. */
export function legacyReportTitle(period: string, kind: string): string {
  const annual = /^FY(\d{4})$/i.exec(period);
  if (annual) return `${annual[1]} 年年度报告`;
  const part = /^(\d{4})(Q1|Q3|H1)$/i.exec(period);
  if (part) return `${part[1]} 年${QUARTER_NAME[part[2]!.toUpperCase()]}`;
  return [period, kind].filter(Boolean).join(' ') || '未命名资料';
}

/** Older ingests kept a placeholder title ("legacy:…"); show a readable one instead. */
export function documentDisplayTitle(title: string | undefined, period: string | null | undefined, kind: string, company = ''): string {
  const raw = (title || '').trim();
  if (raw && !raw.startsWith('legacy:')) return raw;
  if (!raw) return '来源资料';
  return [company, legacyReportTitle(period || '', kind)].filter(Boolean).join(' ');
}

const RATINGS = '(?:强烈推荐|谨慎推荐|推荐|买入|增持|持有|中性|减持|卖出|跑赢行业|跑赢大市|优于大市|强于大市|审慎增持|谨慎增持|超配|标配|低配|同步大市|落后大市|看好)';
const RATING_ACTION = '(?:首次覆盖|首次评级|首次|维持|上调至?|下调至?|调升至?|调降至?|给予|予以|重申)';
// 评级片段：[动作][：]评级[评级]，整段都是评级才算尾巴。
const RATING_PHRASE = new RegExp(`^(?:${RATING_ACTION}\\s*[:：]?\\s*)*${RATINGS}(?:评级)?$`);
const TAIL_SEPARATOR = /[；;，,：:、—–\-|｜_/\s]/;

/**
 * Third-party research titles often end with the broker's rating ("…；维持买入", "…首次覆盖：增持").
 * Show the title without that tail; the stored title, the link and the original file are unchanged.
 */
export function reportTitleForDisplay(title: string): string {
  let text = title.trim();
  const original = text;
  for (let round = 0; round < 3; round += 1) {
    const bracket = /^(.*?)[（(]([^（）()]{1,16})[）)]$/.exec(text);
    if (bracket && RATING_PHRASE.test(bracket[2]!.trim())) { text = bracket[1]!.trimEnd(); continue; }
    let cut = -1;
    for (let index = text.length - 1; index >= 0; index -= 1) {
      if (text.length - index > 16) break;
      if (TAIL_SEPARATOR.test(text[index]!) && RATING_PHRASE.test(text.slice(index + 1).trim())) cut = index;
    }
    if (cut >= 0) { text = text.slice(0, cut).replace(/[\s；;，,：:、—–\-|｜_/]+$/, ''); continue; }
    // 「…首次覆盖增持」这类没有分隔符的写法：评级前紧跟动作词。
    const glued = new RegExp(`^(.*?)${RATING_ACTION}\\s*${RATINGS}(?:评级)?$`).exec(text);
    if (glued && glued[1]!.trim()) { text = glued[1]!.replace(/[\\s；;，,：:、—–\\-|｜_/]+$/, ''); continue; }
    break;
  }
  // 标题只剩评级时不能显示空白，退回原标题（此时标题本身就是资料名）。
  return text.length >= 2 ? text : original;
}
