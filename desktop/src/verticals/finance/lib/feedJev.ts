import { ruleOfThumbText, variableOf, type SensitivityModel } from './companyNarrative';
import type { NewsFactor } from './api';

/** 动态资讯里 Jev 读到的「碰到哪个驱动、对利润偏哪边」：句式固定，不写利好、利空，不写买卖建议。 */
export const DIRECTION_TEXT: Record<NewsFactor['direction'], string> = {
  positive: '对利润偏正面', negative: '对利润偏负面', unclear: '影响不明',
};

/** 「碰到沪铝：对利润偏负面」；有价格模型且该驱动有每步影响时，保留数值半句「；每 +1,000 元/吨，净利润 +9.96 亿元」。 */
export function jevFactorText(factor: NewsFactor | null | undefined, model?: SensitivityModel | null): string {
  const driver = String(factor?.driver ?? '').trim();
  const direction = factor ? DIRECTION_TEXT[factor.direction] : undefined;
  if (!driver || !direction) return '';
  const variable = model?.variables.find(item => item.name === driver);
  const rule = model && variable ? ruleOfThumbText(model, variableOf(model, variable.id) ?? variable) : '';
  return `碰到${driver}：${direction}${rule ? `；${rule}` : ''}`;
}
