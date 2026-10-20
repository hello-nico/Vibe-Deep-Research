import { researchRead } from './research';
import { companySlug } from './research';

/** 公司所属行业估值框架里的驱动（行业公共层 `valuation-framework`，Profile 指标）。没有价格模型的公司用它列「盯什么」与标出新闻碰到哪个驱动。 */
export interface FrameworkBody { industry_code?: string; industry_name?: string; template?: { id?: string; name?: string }; drivers?: { id?: string; name?: string; kind?: string }[]; core_questions?: string[] }
export interface TemplateDriver { name: string; /** 标题里可能的说法（由驱动名拆出）。 */ tokens: string[]; question?: string }
export interface DriverSet { industryCode: string; templateId: string; drivers: TemplateDriver[] }

/** 模板层面「影响什么」：Profile 指标没有逐条的影响说明，这里只写模板级的一句，不带数字。 */
export const TEMPLATE_IMPACT: Record<string, string> = {
  commodity_pe: '利润，进而影响估值',
  volume_pe: '销量、价格和毛利，进而影响利润和估值',
  backlog_pe: '订单结算和利润，进而影响估值',
  bank_pb: '利润和净资产，进而影响市净率',
  insurance_pev: '新业务价值和投资收益，进而影响内含价值估值',
  realty_nav: '结算利润和净资产，进而影响估值',
  infra_yield: '电量、价格和现金回报，进而影响收益率',
};
export const impactOf = (templateId: string) => TEMPLATE_IMPACT[templateId] ?? '利润，进而影响估值';

/** 结果指标不是驱动：营业收入、净利润、毛利率、估值倍数、股息都是别的因素的结果。 */
const RESULT = /营业收入|营收|归母|净利润|净利率|毛利率|市盈率|市净率|PE|EPS|PB|ROE|估值|DDM|股息|分红|预测|假设|目标价|目标/i;
const NUMERIC = /^[\d\s.\-–~%％年]+$/;
const PAREN = /[（(][^）)]*[）)]/g;
/** 驱动名拆成可展示、可匹配的几项：去括号注释，按 / 、 与 及 和 × 拆，去掉结果指标，少于两个字的丢掉。 */
export function driverTokens(name: string): string[] {
  return name.replace(PAREN, '').split(/[\/／、,，及与和×\s]+/).map(item => item.trim()).filter(item => item.length >= 2 && !RESULT.test(item) && !NUMERIC.test(item));
}

/** 标题里常见的另一种说法（只列确实常见且不易误伤的几条）。 */
const ALIASES: { token: RegExp; title: RegExp }[] = [
  { token: /息差/, title: /息差|NIM/ },
  { token: /不良/, title: /不良/ },
  { token: /发电量|售电量|上网电量/, title: /发电量|售电量|上网电量|用电量/ },
  { token: /电价/, title: /电价/ },
  { token: /利用小时/, title: /利用小时/ },
];

/** 把框架接口回包整理成驱动列表；没有可用驱动返回 null。 */
export function driverSetOf(framework: FrameworkBody | null | undefined): DriverSet | null {
  const templateId = framework?.template?.id;
  if (!framework || !templateId) return null;
  const questions = framework.core_questions ?? [];
  const drivers = (framework.drivers ?? []).flatMap(item => {
    const tokens = driverTokens(String(item.name ?? ''));
    if (!tokens.length) return [];
    const question = questions.find(text => tokens.some(token => text.includes(token)));
    return [{ name: tokens[0]!, tokens, ...(question ? { question } : {}) }];
  });
  return drivers.length ? { industryCode: framework.industry_code ?? '', templateId, drivers } : null;
}

/** 标题碰到驱动里的哪一项（返回那一项的名字）；没碰到返回空。 */
function mentioned(driver: TemplateDriver, title: string): string {
  return driver.tokens.find(token => title.includes(token) || ALIASES.some(alias => alias.token.test(token) && alias.title.test(title))) ?? '';
}
/** 新闻碰到行业驱动：「碰到净息差：影响利润和净资产，进而影响市净率」；没命中或没有框架返回空。价格变量的一句由 `factorNote` 先写。 */
export function driverNote(set: DriverSet | null | undefined, title: string | null | undefined): string {
  const text = (title ?? '').trim();
  if (!set || !text) return '';
  for (const driver of set.drivers) {
    const token = mentioned(driver, text);
    if (token) return `碰到${token}：影响${impactOf(set.templateId)}`;
  }
  return '';
}
/** 「盯什么」的驱动卡：最多 limit 个，跳过名字已出现在 `taken` 里的（已有数值的驱动先列）。 */
export function driverWatch(set: DriverSet | null | undefined, taken: readonly string[], limit: number) {
  if (!set) return [];
  const overlaps = (driver: TemplateDriver) => taken.some(title => driver.tokens.some(token => title.includes(token) || token.includes(title)));
  return set.drivers.filter(driver => !overlaps(driver)).slice(0, Math.max(0, limit)).map(driver => ({
    name: driver.name, note: `影响${impactOf(set.templateId)}`, hint: driver.question,
  }));
}

type Read = typeof researchRead;
const byIndustry = new Map<string, Promise<DriverSet | null>>();
const byCompany = new Map<string, Promise<DriverSet | null>>();
/** 行业框架，同一行业一次会话只读一次；读不到是 null。 */
export function loadDriverSetByIndustry(code: string, read: Read = researchRead, memo = byIndustry): Promise<DriverSet | null> {
  if (!code) return Promise.resolve(null);
  const hit = memo.get(code);
  if (hit) return hit;
  const job = read<FrameworkBody>(`/wiki/industries/${encodeURIComponent(code)}/valuation-framework`).then(driverSetOf, () => null);
  memo.set(code, job);
  return job.then(set => { if (!set) memo.delete(code); return set; });
}
/** 公司 → 行业：读公司 Wiki 页 identity 块的行业代码（比数据包轻），再读行业框架。没有页、读不到都是 null。 */
export function loadDriverSet(code: string, read: Read = researchRead, memo = byCompany, industryMemo = byIndustry): Promise<DriverSet | null> {
  const hit = memo.get(code);
  if (hit) return hit;
  const slug = companySlug(code);
  const job = (async () => {
    if (!slug) return null;
    try {
      const page = await read<{ spec?: { blocks?: { kind?: string; content?: unknown }[] } }>(`/wiki/pages/read?slug=${encodeURIComponent(slug)}`);
      const identity = page?.spec?.blocks?.find(block => block.kind === 'identity')?.content;
      const industry = identity && typeof identity === 'object' ? (identity as { industry_code?: unknown }).industry_code : undefined;
      return typeof industry === 'string' ? await loadDriverSetByIndustry(industry, read, industryMemo) : null;
    } catch { return null; }
  })();
  memo.set(code, job);
  return job.then(set => { if (!set) memo.delete(code); return set; });
}
export function clearDriverSets() { byIndustry.clear(); byCompany.clear(); }
