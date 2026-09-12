import type { InputTriggerSource } from '@deepseek-ai/dsh-client-ui-input-trigger/client';
import { researchRead, type ResearchTopicSummary, type WikiItem } from '../lib/research';
import { decodeEvidenceLink } from '../lib/evidence';

export function researchTarget(value: string): { kind: 'evidence' | 'wiki' | 'topic'; id: string } | null {
  const evidence = decodeEvidenceLink(value);
  if (evidence) return { kind: 'evidence', id: evidence };
  if (/^(claim|evidence|source|provider|lookup):[^\s<>]+$/.test(value)) return { kind: 'evidence', id: value };
  if (/^topic:[a-f0-9]{12}$/.test(value)) return { kind: 'topic', id: value };
  if (/^(companies|industries|themes|comparisons)\/[^/\s?#<>]+$/.test(value) && !value.includes('..')) return { kind: 'wiki', id: value };
  return null;
}

const categories = [
  ['topics', '议题'], ['companies', '公司'], ['industries', '行业'], ['comparisons', '对比'], ['themes', '主题'],
] as const;

/** Native input extension: references identify research objects, never workspace files. */
export const researchObjectSource: InputTriggerSource = {
  name: '研究对象', trigger: '@', showGroupTitle: false,
  async candidates(_session, { query, signal }) {
    const rows = await Promise.all(categories.map(async ([kind, label]) => {
      const items = kind === 'topics'
        ? (await researchRead<{ items: ResearchTopicSummary[] }>(`/wiki/research-topics?limit=5&query=${encodeURIComponent(query)}`, { signal })).items.map(item => ({ slug: item.topic_id, title: item.title }))
        : (await researchRead<{ items: WikiItem[] }>(`/wiki/pages?kind=${kind}&sort=updated&limit=5&query=${encodeURIComponent(query)}`, { signal })).items;
      return items.slice(0, 5).map(item => ({ name: item.title, section: label, icon: 'file' as const, value: item.slug }));
    }));
    return rows.flat();
  },
  onPick({ candidate }) {
    if (!candidate.value || !researchTarget(candidate.value)) return;
    return { insert: { source: '研究对象', ref: candidate.value, label: candidate.name, appearance: 'file', clipboardText: candidate.name } };
  },
  codec: {
    clipboardText: ref => ref,
    async serialize(ref, signal) {
      const target = researchTarget(ref);
      if (target?.kind === 'topic') {
        const topic = await researchRead<ResearchTopicSummary>(`/wiki/research-topics/${encodeURIComponent(ref)}`, { signal });
        return `引用议题：${topic.title} \`${ref}\``;
      }
      if (target?.kind !== 'wiki') throw new Error('无法读取所选研究对象，请重新选择。');
      const page = await researchRead<{ spec: { title: string } }>(`/wiki/pages/read?slug=${encodeURIComponent(ref)}`, { signal });
      return `引用材料：${page.spec.title} \`${ref}\``;
    },
  },
};
