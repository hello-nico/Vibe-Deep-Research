/** 动态资讯里每条标题碰到公司模型的哪个因素：只按标题匹配已存的利润试算变量，不判断方向，也不读正文。 */
import { parseSensitivity, ruleOfThumbText, variableOf, type SensitivityModel, type SensitivityVariable } from './companyNarrative';
import { researchRead } from './research';

/** 变量名之外的常用说法。「铝价」不能吃掉「氧化铝价格」，所以氧化铝单列、沪铝的说法前面不能是「氧化」。 */
const ALIAS_GROUPS: { variable: RegExp; title: RegExp }[] = [
  { variable: /氧化铝/, title: /氧化铝/ },
  { variable: /沪铝|电解铝|^铝/, title: /沪铝|电解铝|(?<!氧化)铝价|(?<!氧化)铝锭/ },
  { variable: /碳酸锂|锂/, title: /碳酸锂|锂价/ },
  { variable: /煤/, title: /动力煤|焦煤|无烟煤|煤价|煤炭价格/ },
  { variable: /沪铜|铜/, title: /沪铜|铜价|电解铜/ },
  { variable: /沪金|黄金|金价/, title: /沪金|黄金价格|金价/ },
];

function matches(variable: SensitivityVariable, title: string): boolean {
  const name = variable.name.trim();
  if (name && title.includes(name)) return true;
  const group = ALIAS_GROUPS.find(item => item.variable.test(name));
  if (group) return group.title.test(title);
  // 没有登记的变量：去掉「价格 / 售价 / 价」后缀再按名字匹配，至少两个字。
  const stem = name.replace(/(价格|售价|价)$/, '');
  return stem.length >= 2 && title.includes(stem);
}

/** 命中返回「碰到沪铝：每 +1,000 元/吨，净利润 +9.96 亿元」；没命中、没有模型、没有每步影响都返回空，不写「无关」。 */
export function factorNote(model: SensitivityModel | null | undefined, title: string | null | undefined): string {
  const text = (title ?? '').trim();
  if (!model || !text) return '';
  for (const variable of model.variables) {
    if (!matches(variable, text)) continue;
    const rule = ruleOfThumbText(model, variableOf(model, variable.id) ?? variable);
    if (rule) return `碰到${variable.name}：${rule}`;
  }
  return '';
}

type Read = typeof researchRead;
const cache = new Map<string, Promise<SensitivityModel | null>>();
/** 只读：个股页已存研究里的利润试算凭据；没有研究或读不到都是 null。同一公司一次浏览器会话只读一次。 */
export function loadFactorModel(code: string, read: Read = researchRead, memo = cache): Promise<SensitivityModel | null> {
  const hit = memo.get(code);
  if (hit) return hit;
  const job = (async () => {
    try {
      const page = await read<{ research?: { sensitivity?: { resultRef?: string | null } | null } | null }>(`/wiki/companies/${code}/page-research`);
      const ref = page?.research?.sensitivity?.resultRef;
      const id = typeof ref === 'string' ? /^result:([0-9a-f]{32})$/i.exec(ref)?.[1] : undefined;
      if (!id) return null;
      return parseSensitivity(await read(`/research-results/result:${id}`));
    } catch {
      return null;
    }
  })();
  memo.set(code, job);
  return job;
}
export function clearFactorModels() { cache.clear(); }
