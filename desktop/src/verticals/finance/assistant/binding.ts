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
  const profile = /^industry-profile:(.+)$/.exec(pageKey);
  if (profile?.[1]) return { plugin: 'industry_profile', target: '', bindKey: `industry_profile:${profile[1]}` };
  return null;
}
