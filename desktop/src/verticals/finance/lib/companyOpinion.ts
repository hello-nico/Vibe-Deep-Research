import { aboutMeItems, type AboutMeItem } from './aboutMe';
import { loadMemory, type MemoryDoc } from './memory';
import { shortName } from './trackingVariables';

/** 个股页「我的看法」一行最多直接列出的条数，其余收成「另有 N 条」。 */
export const OPINION_LIMIT = 2;

/** 对这家公司的看法：用户自己说过或改过的条目（stated / corrected），正文含公司名、简称（去掉「股份」）或 6 位代码；推断的不算，不做同义词匹配。 */
export function opinionsFor(items: readonly AboutMeItem[], company: { name: string; symbol: string }): AboutMeItem[] {
  const code = company.symbol.split('.')[0]!;
  const keys = [...new Set([company.name, shortName(company.name), code].map(key => key.trim()).filter(Boolean))];
  return items.filter(item => item.stance !== 'inferred' && keys.some(key => item.text.includes(key)));
}

/** 读画像与近期记忆；一份读不到用另一份，两份都读不到返回空（个股页不报错、不出现这一行）。 */
export async function loadOpinions(company: { name: string; symbol: string }, load: (kind: 'soul' | 'recent') => Promise<MemoryDoc> = loadMemory): Promise<AboutMeItem[]> {
  const [soul, recent] = await Promise.allSettled([load('soul'), load('recent')]);
  const doc = (result: PromiseSettledResult<MemoryDoc>) => result.status === 'fulfilled' && Array.isArray(result.value?.entries) ? result.value : null;
  return opinionsFor(aboutMeItems(doc(soul), doc(recent)), company);
}
