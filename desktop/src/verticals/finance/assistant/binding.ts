export type AssistantPlugin = 'deep_research' | 'intel';

export function assistantBindingForPage(pageKey: string): { plugin: AssistantPlugin; target: string; bindKey: string } | null {
  const company = /^company-wiki:(companies\/[a-z0-9-]+)$/.exec(pageKey);
  // 个股页与主对话是同一个助手（deep_research），绑定当前公司；页面快照由宿主每轮隐藏注入。
  if (company?.[1]) return { plugin: 'deep_research', target: company[1], bindKey: `deep_research:${company[1]}` };
  // 动态页「关键变量」卡片的讨论：同一个助手，不绑定具体公司。
  if (pageKey === 'feed:variables') return { plugin: 'deep_research', target: '', bindKey: 'deep_research:feed-variables' };
  if (pageKey.startsWith('intel:')) return { plugin: 'intel', target: '', bindKey: 'intel:radar' };
  // 资料阅读页：用“解读资讯与公告原文”的角色，每份资料一段问助手对话；选中的原文经“就此追问”随本轮上下文送达。
  const document = /^document:([^:]+)/.exec(pageKey);
  if (document?.[1]) return { plugin: 'intel', target: '', bindKey: `document:${document[1]}` };
  return null;
}
