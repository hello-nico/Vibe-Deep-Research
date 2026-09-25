export type AssistantPlugin = 'company_wiki' | 'industry_wiki' | 'market' | 'intel' | 'industry_profile';

export function assistantBindingForPage(pageKey: string): { plugin: AssistantPlugin; target: string; bindKey: string } | null {
  const company = /^company-wiki:(companies\/[a-z0-9-]+)$/.exec(pageKey);
  if (company?.[1]) return { plugin: 'company_wiki', target: company[1], bindKey: `company_wiki:${company[1]}` };
  if (pageKey === 'company-wiki:list') return { plugin: 'company_wiki', target: '', bindKey: 'company_wiki:list' };
  const industry = /^industry-wiki:(industries\/[^\s]+)$/.exec(pageKey);
  if (industry?.[1]) return { plugin: 'industry_wiki', target: industry[1], bindKey: `industry_wiki:${industry[1]}` };
  if (pageKey.startsWith('nbs:')) return { plugin: 'industry_wiki', target: '', bindKey: 'industry_wiki:list' };
  if (pageKey === 'daily-review') return { plugin: 'market', target: '', bindKey: 'market:daily-review' };
  if (pageKey.startsWith('intel:')) return { plugin: 'intel', target: '', bindKey: 'intel:radar' };
  // 资料阅读页：用“解读资讯与公告原文”的角色，每份资料一段问助手对话；选中的原文经“就此追问”随本轮上下文送达。
  const document = /^document:([^:]+)/.exec(pageKey);
  if (document?.[1]) return { plugin: 'intel', target: '', bindKey: `document:${document[1]}` };
  const profile = /^industry-profile:(.+)$/.exec(pageKey);
  if (profile?.[1]) {
    const code = profile[1];
    // 产业研究绑定 Profile 身份供只读叙述；不授予改 Profile 正文权限（industry_profile 角色本就不在
    // Stock 侧 wikiMaintenanceRole 名单内）。目标不带 hash：binding 只有 pageKey，版本核验仍走 @ 引用。
    const target = code !== 'list' && /^[0-9A-Za-z.]+$/.test(code) ? `profile:sw2:${code.toUpperCase()}` : '';
    return { plugin: 'industry_profile', target, bindKey: `industry_profile:${code}` };
  }
  return null;
}
