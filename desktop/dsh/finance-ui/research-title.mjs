// 研究任务标题统一为「公司研究 · {公司名}」；名称缺失或只是代码时需要补名。
const CODE_ONLY = /^\d{6}(\.(SH|SZ|BJ))?$/i;

export const researchTitleName = title => String(title || '').replace(/^公司研究\s*·\s*/, '').trim();
export const titleNeedsName = title => {
  const name = researchTitleName(title);
  return !name || CODE_ONLY.test(name);
};
export const researchTitleOf = (name, symbol) => `公司研究 · ${name || String(symbol || '').split('.')[0]}`;

/** 标题已有公司名原样返回；否则用 lookup(symbol) 查名称，查不到才写代码。lookup 失败不影响启动。 */
export async function resolveResearchTitle(title, symbol, lookup) {
  if (!titleNeedsName(title)) return title;
  let name = '';
  try { name = String(await lookup?.(symbol) || '').trim(); } catch { name = ''; }
  return researchTitleOf(name, symbol);
}
