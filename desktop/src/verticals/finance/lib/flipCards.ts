import { researchRead } from './research';
import { FLIP_NEAR, flipGrade, parseSensitivity, plainNumber, sliderUnitText, type SensitivityModel } from './companyNarrative';
import { readValuationGrade } from './researchTasks';
import { shortName, toNumber, type TrackingVariables } from './trackingVariables';

/** 动态「行情」与跟踪页的跳档提醒：关注公司的主价格接近或越过研究里的跳档价。 */
export interface FlipCard {
  symbol: string; company: string; kind: 'crossed' | 'near'; text: string;
}

export interface FlipInput { data: TrackingVariables; models: Record<string, SensitivityModel | null | undefined>; grades: Record<string, string | null | undefined> }

/** 页面只按实时价比较研究里存的跳档价，不重新判断估值：原档取已存研究，新档由跳档边界推出。 */
export function flipCards({ data, models, grades }: FlipInput): FlipCard[] {
  const out: FlipCard[] = [];
  const seen = new Set<string>();
  for (const variable of data.variables) {
    const live = toNumber(variable.latest);
    if (variable.status !== 'ok' || live == null) continue;
    for (const company of variable.companies) {
      const model = models[company.result_ref];
      const primary = model?.variables[0];
      if (!model || !primary || primary.id !== variable.var_id || seen.has(company.symbol)) continue;
      const flips = model.flips.filter(item => item.id === primary.id && !item.invalid);
      if (!flips.length) continue;
      const from = primary.current;
      // 越过：跳档价落在研究时价格与现价之间；多个都越过时以离研究价最远的那个为准（最后跨过的边界）。
      const crossed = flips.filter(item => (item.value - from) * (item.value - live) <= 0 && item.value !== from)
        .sort((a, b) => Math.abs(b.value - from) - Math.abs(a.value - from))[0];
      const old = grades[company.symbol]?.trim() || undefined;
      const name = shortName(company.name);
      const price = (value: number) => sliderUnitText(primary, value);
      const verdict = (flip: typeof flips[number], will: boolean) => {
        const to = flip.grade ?? flipGrade(flip, primary, old);
        if (!to) return '估值判断会改变';
        return old ? `估值${will ? '会' : ''}从${old}变为${to}` : `估值${will ? '会' : ''}变为${to}`;
      };
      if (crossed) {
        seen.add(company.symbol);
        out.push({ symbol: company.symbol, company: name, kind: 'crossed', text: `${variable.name}${crossed.value < from ? '跌破' : '涨过'} ${price(crossed.value)}，${name}${verdict(crossed, false)}` });
        continue;
      }
      const near = flips.map(item => ({ item, gap: live === 0 ? Infinity : Math.abs(item.value - live) / Math.abs(live) })).filter(entry => entry.gap <= FLIP_NEAR).sort((a, b) => a.gap - b.gap)[0];
      if (near) {
        seen.add(company.symbol);
        out.push({ symbol: company.symbol, company: name, kind: 'near', text: `${variable.name}距 ${price(near.item.value)} 只差 ${plainNumber(near.gap * 100, 1)}%，越过后${name}${verdict(near.item, true)}` });
      }
    }
  }
  return [...out.filter(card => card.kind === 'crossed'), ...out.filter(card => card.kind === 'near')];
}

/** 跟踪页走势图上的跳档线：每个价格取一条（已越过的优先，否则离现价最近的）；value 是价格，text 是线旁的一句。 */
export interface FlipLine { varId: string; value: number; text: string }
export function flipLines({ data, models, grades }: FlipInput): FlipLine[] {
  const out = new Map<string, FlipLine>();
  for (const variable of data.variables) {
    const live = toNumber(variable.latest);
    if (variable.status !== 'ok' || live == null || out.has(variable.var_id)) continue;
    for (const company of variable.companies) {
      const model = models[company.result_ref];
      const primary = model?.variables[0];
      if (!model || !primary || primary.id !== variable.var_id) continue;
      const flips = model.flips.filter(item => item.id === primary.id && !item.invalid);
      const from = primary.current;
      const pick = flips.filter(item => (item.value - from) * (item.value - live) <= 0 && item.value !== from)
        .sort((a, b) => Math.abs(b.value - from) - Math.abs(a.value - from))[0]
        ?? [...flips].sort((a, b) => Math.abs(a.value - live) - Math.abs(b.value - live))[0];
      if (!pick) continue;
      const old = grades[company.symbol]?.trim() || undefined;
      const to = pick.grade ?? flipGrade(pick, primary, old);
      const name = shortName(company.name);
      const verdict = !to ? '估值判断会改变' : old ? `估值从${old}变为${to}` : `估值变为${to}`;
      out.set(variable.var_id, { varId: variable.var_id, value: pick.value, text: `${pick.value < from ? '跌破' : '涨过'} ${sliderUnitText(primary, pick.value)}：${name}${verdict}` });
      break;
    }
  }
  return [...out.values()];
}

/** 读各家公司已存的敏感性凭据与估值档；任何一项读不到就当没有，不出卡也不报错。 */
async function loadFlipInput(data: TrackingVariables, signal?: AbortSignal): Promise<FlipInput> {
  const companies = data.variables.filter(item => item.status === 'ok').flatMap(item => item.companies);
  const refs = [...new Set(companies.map(company => company.result_ref).filter(ref => /^result:[0-9a-f]{32}$/i.test(ref)))];
  const symbols = [...new Set(companies.map(company => company.symbol))];
  const [models, grades] = await Promise.all([
    Promise.all(refs.map(async ref => [ref, parseSensitivity(await researchRead(`/research-results/${ref}`, { signal }).catch(() => null))] as const)),
    Promise.all(symbols.map(async symbol => [symbol, await readValuationGrade(symbol, signal)] as const)),
  ]);
  return { data, models: Object.fromEntries(models), grades: Object.fromEntries(grades) };
}
export async function loadFlipCards(data: TrackingVariables, signal?: AbortSignal): Promise<FlipCard[]> { return flipCards(await loadFlipInput(data, signal)); }
export async function loadFlipLines(data: TrackingVariables, signal?: AbortSignal): Promise<FlipLine[]> { return flipLines(await loadFlipInput(data, signal)); }
