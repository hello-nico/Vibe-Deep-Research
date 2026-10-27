import { api } from './api';
import { scenarioTable } from './companyPacket';
import { loadLivePrice } from './trackingVariables';
import { gradeLabel, initialSliderValues, parseSensitivity, profitAt, verdictLine, type SensitivityModel } from './companyNarrative';
import { aShareQualified, researchRead, ResearchError } from './research';
import { addWatch, loadWatch } from './watchlist';
import { addToRoster } from './researchRoster';
import { shortName } from './trackingVariables';

/** 产业链页的数据：用户链（`/wiki/user-chains`，骨架来自行业公共层）、各环节估值方法读公共接口，公司估值读各家已存研究。 */
export interface ChainNode { industry_code: string; industry_name: string; role?: string; template_id?: string; companies: string[] }
export interface ChainTransmission { from: string; to: string; driver: string; text: string }
export interface Chain { chain_id: string; name: string; nodes: ChainNode[]; transmission: ChainTransmission[] }
export interface Framework { industry_code: string; industry_name?: string; template?: { id: string; name: string; method?: string }; core_questions?: string[] }
/** 链上一家公司的估值位置；none = 还没研究（不触发研究），gap = 研究里缺这一块。 */
export interface ChainCompany {
  symbol: string; name: string; industry_code: string; status: 'researched' | 'none';
  grade?: string; price?: number | null;
  tiers?: { name: string; price: number }[]; position?: string; implied?: string; flip?: string; gaps: string[];
  /** 研究保存的敏感度模型，试算用；没有就不试算。 */
  model?: SensitivityModel;
}
/** version 是改动时要带回去的版本号；hasPrevious = 有上一版可撤回。 */
export interface ChainView { chain: Chain; frameworks: Record<string, Framework | null>; companies: ChainCompany[]; failed: { frameworks: boolean }; version: number; hasPrevious: boolean }

export interface ChainServices {
  read<T>(route: string, signal?: AbortSignal): Promise<T>;
  /** 改动类请求（建、改、撤回、删除）；Backend 校验并持久化。 */
  write<T>(method: 'POST' | 'PATCH' | 'DELETE', route: string, body?: unknown): Promise<T>;
  quote(codes: string): Promise<Record<string, { name?: string; price: number | null }>>;
  /** 已关注的 6 位代码（本机 Client 数据）。 */
  watched(): string[];
  /** 关注并加入研究名单。 */
  follow(code: string): Promise<void>;
}
export const defaultChainServices: ChainServices = {
  read: (route, signal) => researchRead(route, { signal }),
  write: (method, route, body) => researchRead(route, { method, headers: { 'Content-Type': 'application/json' }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) }),
  quote: codes => api.quote(codes) as Promise<Record<string, { name?: string; price: number | null }>>,
  watched: loadWatch,
  follow: async code => { await addWatch(code); await addToRoster(code); },
};

const ROLE_NAME: Record<string, string> = { upstream: '上游', midstream: '中游', downstream: '下游' };
export const roleText = (role?: string) => ROLE_NAME[String(role ?? '').toLowerCase()] ?? String(role ?? '');
const codeOf = (symbol: string) => symbol.split('.')[0]!;
const num = (value: unknown) => { const n = typeof value === 'number' ? value : Number(String(value ?? '').trim()); return Number.isFinite(n) && String(value ?? '').trim() !== '' ? n : null; };

/** 契约里 transmission 的 from / to 可能是行业名或代码：统一成环节下标。 */
export function nodeIndex(chain: Chain, ref: string): number {
  return chain.nodes.findIndex(node => node.industry_name === ref || node.industry_code === ref);
}
export interface ChainDriver { driver: string; texts: string[]; nodes: string[] }
/** 共同驱动：同一个价格的传导合并成一行，列出影响到的环节（按链上顺序）。 */
export function chainDrivers(chain: Chain): ChainDriver[] {
  const byDriver = new Map<string, { texts: string[]; nodes: Set<number> }>();
  for (const item of chain.transmission) {
    const entry = byDriver.get(item.driver) ?? { texts: [], nodes: new Set<number>() };
    if (item.text && !entry.texts.includes(item.text)) entry.texts.push(item.text);
    for (const ref of [item.from, item.to]) { const at = nodeIndex(chain, ref); if (at >= 0) entry.nodes.add(at); }
    byDriver.set(item.driver, entry);
  }
  return [...byDriver].map(([driver, entry]) => ({ driver, texts: entry.texts, nodes: [...entry.nodes].sort((a, b) => a - b).map(at => chain.nodes[at]!.industry_name) }));
}
/** 环节之间箭头上的价格名。 */
export function arrowLabel(chain: Chain, index: number): string {
  const drivers = chain.transmission.filter(item => nodeIndex(chain, item.from) === index && nodeIndex(chain, item.to) === index + 1).map(item => item.driver);
  return [...new Set(drivers)].join('、');
}

/** 现价在三档区间里的位置，一句话；缺任何一块返回空。 */
export function positionText(price: number | null | undefined, tiers: { name: string; price: number }[] | undefined): string {
  const by = Object.fromEntries((tiers ?? []).map(tier => [tier.name, tier.price]));
  const [low, mid, high] = [by['悲观'], by['中性'], by['乐观']];
  if (price == null || low == null || mid == null || high == null) return '';
  if (price < low) return '低于悲观价';
  if (price > high) return '高于乐观价';
  if (price === mid) return '正在中性价';
  return price < mid ? '在悲观价与中性价之间' : '在中性价与乐观价之间';
}

type Research = { research: { valuation?: { grade?: string; scenarioRef?: string }; sensitivity?: { resultRef?: string } } | null } | null;

async function companyOf(services: ChainServices, symbol: string, industry_code: string, name: string, price: number | null, signal?: AbortSignal): Promise<ChainCompany> {
  const base: ChainCompany = { symbol, name, industry_code, status: 'none', price, gaps: [] };
  let saved: Research = null;
  try { saved = await services.read<Research>(`/wiki/companies/${symbol}/page-research`, signal); } catch { /* 读不到按尚未研究写，不触发研究 */ }
  const research = saved?.research;
  if (!research || !research.valuation?.grade) return base;
  const grade = research.valuation.grade;
  const out: ChainCompany = { ...base, status: 'researched', grade };
  const refs = [research.valuation.scenarioRef, research.sensitivity?.resultRef];
  const [scenario, sensitivity] = await Promise.all(refs.map(async ref => {
    if (!ref || !/^result:[0-9a-f]{32}$/i.test(ref)) return null;
    try { return await services.read<unknown>(`/research-results/${ref}`, signal); } catch { return null; }
  }));
  const table = scenarioTable(scenario);
  if (table) out.tiers = table.rows.flatMap(row => { const value = num(row.price); return value == null ? [] : [{ name: row.name, price: value }]; });
  else out.gaps.push('三档价');
  out.position = positionText(price, out.tiers);
  if (price == null) out.gaps.push('现价');
  const model = parseSensitivity(sensitivity);
  if (model) out.model = model;
  // 页首「现在」取变量最新价；读不到退回研究时的默认值（verdictLine 写「研究时」）。
  const live = model?.implied ? await loadLivePrice(symbol, model.implied.id, services.read, signal) : null;
  const verdict = verdictLine({ grade, model, live });
  out.implied = verdict.implied;
  out.flip = verdict.flip;
  if (!verdict.implied) out.gaps.push('大致对应的价格');
  return out;
}

/** Backend 的用户链：环节叫 stages，链编号叫 id；页面内部沿用 Chain（nodes、chain_id）。 */
interface UserChainRaw { id: string; public_chain_id: string; name: string; stages: ChainNode[]; transmission?: ChainTransmission[]; version: number; has_previous?: boolean }
function fromUser(raw: UserChainRaw | null | undefined): Chain & { version: number; hasPrevious: boolean } {
  if (!raw || !Array.isArray(raw.stages) || !raw.name || !raw.id) throw new Error('产业链读取失败');
  return {
    chain_id: raw.id, name: raw.name, version: Number(raw.version) || 1, hasPrevious: Boolean(raw.has_previous),
    transmission: Array.isArray(raw.transmission) ? raw.transmission : [],
    nodes: raw.stages.map(stage => ({ ...stage, companies: Array.isArray(stage.companies) ? stage.companies : [] })),
  };
}
const userChainRoute = (chainId: string) => `/wiki/user-chains/${encodeURIComponent(chainId)}`;

/** 读一条用户链：结构、各环节估值方法、链上公司估值。框架或公司单块读不到只缺那一块，链本身读不到才抛错。 */
export async function loadChainView(chainId: string, services: ChainServices = defaultChainServices, signal?: AbortSignal): Promise<ChainView> {
  const { version, hasPrevious, ...chain } = fromUser(await services.read<UserChainRaw>(userChainRoute(chainId), signal));
  const frameworks: Record<string, Framework | null> = {};
  let frameworkFailed = false;
  await Promise.all(chain.nodes.map(async node => {
    try { frameworks[node.industry_code] = await services.read<Framework>(`/wiki/industries/${encodeURIComponent(node.industry_code)}/valuation-framework`, signal); }
    catch { frameworks[node.industry_code] = null; frameworkFailed = true; }
  }));
  const placed = chain.nodes.flatMap(node => node.companies.map(symbol => ({ symbol, node })));
  const codes = [...new Set(placed.map(item => codeOf(item.symbol)))].join(',');
  const quotes = codes ? await services.quote(codes).catch(() => ({} as Record<string, { name?: string; price: number | null }>)) : {};
  const companies = await Promise.all(placed.map(({ symbol, node }) => {
    const quote = quotes[codeOf(symbol)];
    return companyOf(services, symbol, node.industry_code, quote?.name ? shortName(quote.name) : codeOf(symbol), quote?.price ?? null, signal);
  }));
  return { chain, frameworks, companies, failed: { frameworks: frameworkFailed }, version, hasPrevious };
}

/** 页首一句话：从哪个环节到哪个环节、由哪几个价格连起来、链上研究了几家各在什么档位。 */
export function chainHeadline(view: ChainView): string {
  const { chain, companies } = view;
  const path = chain.nodes.map(node => node.industry_name).join(' → ');
  const drivers = chainDrivers(chain).map(item => item.driver);
  const researched = companies.filter(company => company.status === 'researched');
  const grades = [...new Set(researched.map(company => company.grade!))].map(grade => `${researched.filter(company => company.grade === grade).length} 家${gradeLabel(grade)}`);
  return `${path}${drivers.length ? `，由${drivers.join('、')}连成一条链` : ''}。链上${companies.length ? ` ${companies.length} 家公司，已研究 ${researched.length} 家${grades.length ? `：${grades.join('，')}` : ''}` : '还没有公司'}。`;
}

// ---------------------------------------------------------------- 用户链：列出、推荐、建、改

/** 一条推荐：公共链编号与名称；built = 已建，userChainId 是用户链编号。 */
export interface ChainRecommendation { publicChainId: string; name: string; built: boolean; userChainId: string | null }
export const chainPath = (chainId: string) => `/chains/${encodeURIComponent(chainId)}`;
/** 关注页产业链卡：环节一句话、链上已关注几家。 */
export function chainStages(chain: Chain): string {
  return chain.nodes.map(node => node.industry_name).join(' → ');
}
export const chainCompanyCount = (chain: Chain) => chain.nodes.reduce((sum, node) => sum + node.companies.length, 0);

/** Backend 只认带后缀的 A 股代码；港美股与认不出的代码不传。 */
const qualifiedWatch = (services: ChainServices) => [...new Set(services.watched().flatMap(code => { const full = aShareQualified(code); return full ? [full] : []; }))];

/** 用户的全部链（关注页产业链分段）。列表读不到抛错，单条详情读不到只缺那一条。 */
export async function loadUserChains(services: ChainServices = defaultChainServices, signal?: AbortSignal): Promise<Chain[]> {
  const list = await services.read<{ items?: { id?: string }[] }>('/wiki/user-chains', signal);
  const rows = Array.isArray(list?.items) ? list.items : [];
  const details = await Promise.all(rows.map(row => row.id ? services.read<UserChainRaw>(userChainRoute(row.id), signal).then(fromUser, () => null) : Promise.resolve(null)));
  return details.filter((chain): chain is NonNullable<typeof chain> => Boolean(chain));
}
/** 这家公司可能所在的公共链，以及你是否已建；读不到返回空，个股页那一段就不出现。 */
export async function loadRecommendations(symbol: string, services: ChainServices = defaultChainServices, signal?: AbortSignal): Promise<ChainRecommendation[]> {
  const full = aShareQualified(codeOf(symbol));
  if (!full) return [];
  try {
    const value = await services.read<{ items?: { public_chain_id: string; name: string; built: boolean; user_chain_id: string | null }[] }>(`/wiki/user-chains/recommendations?symbol=${full}`, signal);
    return (Array.isArray(value?.items) ? value.items : []).map(item => ({ publicChainId: item.public_chain_id, name: item.name, built: Boolean(item.built), userChainId: item.user_chain_id ?? null }));
  } catch { return []; }
}
/** 从公共链建一条用户链，只放已关注的公司；同一条已建则返回已有的。返回用户链编号。 */
export async function createUserChain(publicChainId: string, services: ChainServices = defaultChainServices, source?: string): Promise<string> {
  const created = await services.write<{ id: string }>('POST', '/wiki/user-chains', { public_chain_id: publicChainId, watched_symbols: qualifiedWatch(services), ...(source ? { source } : {}) });
  if (!created?.id) throw new Error('建链没有成功');
  return created.id;
}

export interface Candidate { symbol: string; name: string; industry_code: string }
/** 同环节还可关注的公司（整条链最多 8 家，已关注的不列）。名字读行情简称，读不到用代码。 */
export async function loadCandidates(chainId: string, services: ChainServices = defaultChainServices, signal?: AbortSignal): Promise<Candidate[]> {
  const watched = qualifiedWatch(services);
  const value = await services.read<{ items?: { symbol: string; industry_code: string }[] }>(`${userChainRoute(chainId)}/candidates${watched.length ? `?watched=${watched.join(',')}` : ''}`, signal);
  const items = Array.isArray(value?.items) ? value.items : [];
  const quotes = items.length ? await services.quote(items.map(item => codeOf(item.symbol)).join(',')).catch(() => ({} as Record<string, { name?: string }>)) : {};
  return items.map(item => ({ symbol: item.symbol, industry_code: item.industry_code, name: quotes[codeOf(item.symbol)]?.name ? shortName(quotes[codeOf(item.symbol)]!.name!) : codeOf(item.symbol) }));
}

/** 版本冲突：别处已改过这条链。 */
export const isChainConflict = (error: unknown) => error instanceof ResearchError && error.status === 409;
/** 关注这家公司并放进链里。关注在先，放链失败时公司仍已关注。 */
export async function addToChain(chainId: string, version: number, symbol: string, services: ChainServices = defaultChainServices): Promise<void> {
  await services.follow(codeOf(symbol));
  await services.write('PATCH', userChainRoute(chainId), { expected_version: version, add_companies: [symbol], watched_symbols: qualifiedWatch(services) });
}
/** 只移出这条链，不取消关注。 */
export async function removeFromChain(chainId: string, version: number, symbol: string, services: ChainServices = defaultChainServices): Promise<void> {
  await services.write('PATCH', userChainRoute(chainId), { expected_version: version, remove_companies: [symbol] });
}
export async function revertChain(chainId: string, version: number, services: ChainServices = defaultChainServices): Promise<void> {
  await services.write('POST', `${userChainRoute(chainId)}/revert`, { expected_version: version });
}
export async function deleteChain(chainId: string, version: number, services: ChainServices = defaultChainServices): Promise<void> {
  await services.write('DELETE', `${userChainRoute(chainId)}?expected_version=${version}`);
}

// ---------------------------------------------------------------- 试算：共同驱动变一下，链上各家利润怎么动

/** 试算的共同驱动：沪铝主力（敏感度模型里的变量编号）。链上没有一家的模型带这个变量就不出试算节。 */
export const CALC_VAR = 'cmdty:SHFE.AL';
export interface CalcSetup { id: string; name: string; unit: string; current: number; min: number; max: number; step: number }
/** 滑块：默认取第一份模型里的现价，范围取各家模型区间的并集；没有模型带这个变量返回 null。 */
export function calcSetup(companies: readonly ChainCompany[]): CalcSetup | null {
  const vars = companies.flatMap(company => { const found = company.model?.variables.find(item => item.id === CALC_VAR); return found ? [found] : []; });
  const first = vars[0];
  if (!first) return null;
  return { id: CALC_VAR, name: first.name, unit: first.unit, current: first.current, min: Math.min(...vars.map(item => item.min)), max: Math.max(...vars.map(item => item.max)), step: Math.min(...vars.map(item => item.step)) };
}
/** none = 尚未研究；nomodel = 已研究但没存敏感度；novar = 模型里没有这个价格；noanchor = 模型缺对比期均价，不可算。 */
export interface CalcRow { symbol: string; name: string; industry_code: string; state: 'ok' | 'none' | 'nomodel' | 'novar' | 'noanchor'; delta?: number; share?: number | null; baseLabel?: string }
/** 滑块拖到 value 时每家的利润变动（元，相对默认现价）；占比 = 变动 ÷ 模型基数利润。只用各家已存模型，没有就不估。 */
export function calcRows(companies: readonly ChainCompany[], setup: CalcSetup, value: number): CalcRow[] {
  return companies.map(company => {
    const base = { symbol: company.symbol, name: company.name, industry_code: company.industry_code };
    if (company.status === 'none') return { ...base, state: 'none' as const };
    const model = company.model;
    if (!model) return { ...base, state: 'nomodel' as const };
    const variable = model.variables.find(item => item.id === setup.id);
    if (!variable) return { ...base, state: 'novar' as const };
    if (variable.anchor == null) return { ...base, state: 'noanchor' as const };
    const delta = profitAt(model, { ...initialSliderValues(model), [setup.id]: value }) - profitAt(model, { ...initialSliderValues(model), [setup.id]: setup.current });
    return { ...base, state: 'ok' as const, delta, share: model.baseProfit > 0 ? delta / model.baseProfit : null, baseLabel: model.baseLabel };
  });
}

// ---------------------------------------------------------------- 周期位置：沪铝 − 1.93 × 氧化铝 的价差在近十年里的分位

/** 每吨电解铝约耗 1.93 吨氧化铝（行业参考值，评估 README 已登记），价差 = 铝价 − 单耗 × 氧化铝价，当成冶炼的毛利空间。 */
export const CYCLE = { aluminum: 'cmdty:SHFE.AL', alumina: 'cmdty:SHFE.AO', ratio: 1.93, years: 10, minDays: 250 } as const;
/** 链上同时有「铝价」「氧化铝」两个驱动才出周期位置节，不按链编号写死。 */
export const hasCycle = (chain: Chain) => { const names = chainDrivers(chain).map(item => item.driver); return names.includes('铝价') && names.includes('氧化铝'); };
export const cycleRoute = `/market/futures-daily?ids=${encodeURIComponent(CYCLE.aluminum)},${encodeURIComponent(CYCLE.alumina)}&years=${CYCLE.years}`;

export interface FuturesSeries { id: string; name?: string; first_day?: string; points: [string, string][] }
export interface FuturesDaily { series: FuturesSeries[]; failed?: { id: string; message?: string }[] }
export type CycleZone = '底部' | '中位' | '高位';
export interface CyclePosition {
  /** 现在的价差落在历史价差里的分位，0–100。 */
  percentile: number; zone: CycleZone; spread: number; low: number; median: number; high: number;
  asOf: string; from: string; days: number; years: number;
  /** 氧化铝期货上市晚、历史不足十年时的说明，足十年为空。 */
  short: string;
}
export type Cycle = { state: 'ok'; position: CyclePosition } | { state: 'gap'; reason: string };

const ZONE_EDGE = [25, 75] as const;
export const cycleZone = (percentile: number): CycleZone => percentile < ZONE_EDGE[0] ? '底部' : percentile > ZONE_EDGE[1] ? '高位' : '中位';
const quantile = (sorted: number[], q: number) => { const at = (sorted.length - 1) * q, lo = Math.floor(at), hi = Math.ceil(at); return sorted[lo]! + (sorted[hi]! - sorted[lo]!) * (at - lo); };

/** 两条日线按交易日对齐算价差，现值（最后一个共同交易日）的分位 = 价差不高于现值的天数占比（相等算半格）。样本不足或日线缺失返回缺口。 */
export function cyclePosition(daily: FuturesDaily | null | undefined): Cycle {
  const by = new Map((daily?.series ?? []).map(item => [item.id, item]));
  const al = by.get(CYCLE.aluminum), ao = by.get(CYCLE.alumina);
  if (!al || !ao) return { state: 'gap', reason: `${!al ? '沪铝' : '氧化铝'}日线取不到` };
  const alumina = new Map(ao.points.map(([day, close]) => [day, num(close)]));
  const rows = al.points.flatMap(([day, close]) => { const a = num(close), b = alumina.get(day); return a != null && b != null ? [{ day, spread: a - CYCLE.ratio * b }] : []; }).sort((x, y) => x.day.localeCompare(y.day));
  if (rows.length < CYCLE.minDays) return { state: 'gap', reason: `沪铝与氧化铝同时有价的交易日只有 ${rows.length} 天，不够算分位` };
  const last = rows[rows.length - 1]!;
  const sorted = rows.map(row => row.spread).sort((x, y) => x - y);
  const below = sorted.filter(value => value < last.spread).length, equal = sorted.filter(value => value === last.spread).length;
  const percentile = Math.round(((below + equal / 2) / sorted.length) * 100);
  const years = (Date.parse(last.day) - Date.parse(rows[0]!.day)) / (365.25 * 86400000);
  const short = years < CYCLE.years - 0.1 ? `氧化铝期货 ${ao.first_day ? `${ao.first_day.slice(0, 4)} 年 ${Number(ao.first_day.slice(5, 7))} 月` : '上市较晚'}才有日线，只能按可得的 ${years.toFixed(1)} 年算` : '';
  return { state: 'ok', position: { percentile, zone: cycleZone(percentile), spread: last.spread, low: sorted[0]!, median: quantile(sorted, 0.5), high: sorted[sorted.length - 1]!, asOf: last.day, from: rows[0]!.day, days: rows.length, years, short } };
}
/** 一句话：价差在近 N 年的第几分位。 */
export function cycleSentence(position: CyclePosition): string {
  const span = position.years >= CYCLE.years - 0.1 ? `${CYCLE.years}` : position.years.toFixed(1);
  return `铝价减去氧化铝成本的价差处在近 ${span} 年的 ${position.percentile}% 分位，${position.zone === '中位' ? '在中位区间' : `在${position.zone}区间`}`;
}
export async function loadCycle(services: ChainServices, signal?: AbortSignal): Promise<Cycle> {
  try { return cyclePosition(await services.read<FuturesDaily>(cycleRoute, signal)); }
  catch { return { state: 'gap', reason: '沪铝与氧化铝日线暂时读取不到' }; }
}
