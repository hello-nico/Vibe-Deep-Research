import { ResearchLoading } from './ui/ResearchLoading';

export function wikiLoadingSections(slug: string): string[] {
  if (slug.startsWith('industries/')) return ['身份', '范围', '经营模式', '行业结构', '关系摘要', '关注点', '资料时间线', '待核验缺口'];
  if (slug.startsWith('companies/')) return ['身份', '经营', '财务', '估值', '观察窗口', '资料时间线', '关注点', '待核验缺口'];
  return ['标题', '章节', '依据', '时间线'];
}

export function WikiLoading({ slug }: { slug: string }) {
  return <ResearchLoading sections={wikiLoadingSections(slug)} />;
}
