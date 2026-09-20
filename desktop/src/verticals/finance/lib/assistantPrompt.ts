import { ResearchError, researchRead } from './research';
import type { AssistantObjectRef } from '../../../core/ai/pageContext';

const FETCH_TEXT_LIMIT = 24_000;

export interface FetchedUrlBind {
  url: string;
  title?: string;
  text?: string;
  parse_status?: string;
  content_sha256?: string;
  fetched_at?: string;
  truncated?: boolean;
  persisted?: boolean;
  complete?: boolean;
}

function citedUrl(item: AssistantObjectRef): string {
  if (item.url && /^https?:\/\//.test(item.url)) return item.url;
  if (item.id.startsWith('url:') && /^https?:\/\//.test(item.id.slice(4))) return item.id.slice(4);
  if (/^https?:\/\//.test(item.id)) return item.id;
  return '';
}

function clip(text: string): { body: string; clipped: boolean } {
  if (text.length <= FETCH_TEXT_LIMIT) return { body: text, clipped: false };
  return { body: text.slice(0, FETCH_TEXT_LIMIT), clipped: true };
}

function formatFetch(item: AssistantObjectRef, fetched: FetchedUrlBind): string {
  const { body, clipped } = clip(fetched.text || '');
  const status = fetched.parse_status || (body ? 'readable' : 'empty');
  const lines = [
    `- ${item.label} \`${item.id}\``,
    `  URL：${fetched.url}`,
    fetched.fetched_at ? `  读取时点：${fetched.fetched_at}` : '',
    fetched.content_sha256 ? `  内容版本：${fetched.content_sha256}` : '  内容版本：不可用',
    `  解析状态：${status}`,
    fetched.persisted ? '  入库：是（超出快资讯默认）' : '  入库：否',
    fetched.truncated || clipped ? '  正文被截断；内容版本对应完整抓取，不是截断片，不能当作完整原件。' : '',
    body ? `  正文：\n${body}` : '  没有可读正文，不能按全文分析。',
  ];
  return lines.filter(Boolean).join('\n');
}

async function fetchCitedUrl(item: AssistantObjectRef, url: string): Promise<string> {
  try {
    const fetched = await researchRead<FetchedUrlBind>('/documents/fetch-url', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url, persist: false, title: item.label }),
    });
    return formatFetch(item, fetched);
  } catch (error) {
    const detail = error instanceof ResearchError ? error.message : (error instanceof Error ? error.message : '读取失败');
    return `- ${item.label} \`${item.id}\`\n  URL：${url}\n  读取失败：${detail}\n  不能按正文分析。`;
  }
}

function identityLine(item: AssistantObjectRef): string {
  const bits = [
    item.version ? `版本 ${item.version}` : '',
    item.hint || '',
  ].filter(Boolean);
  return `- ${item.label} \`${item.id}\`${bits.length ? `（${bits.join(' · ')}）` : ''}`;
}

export async function bindAssistantPrompt(input: {
  prompt: string;
  title: string;
  mode: 'ask' | 'agent';
  objects: AssistantObjectRef[];
}): Promise<string> {
  const urls: AssistantObjectRef[] = [];
  const others: AssistantObjectRef[] = [];
  for (const item of input.objects) {
    if (citedUrl(item)) urls.push(item);
    else others.push(item);
  }
  const bound = await Promise.all(urls.map(item => fetchCitedUrl(item, citedUrl(item))));
  return [
    bound.length ? `本轮已绑定的 URL 依据（统一读取，未入库）。必须消费这份结果作判断；不要再次抓取同一 URL。补读或重抓只能作为另一份新结果，不能覆盖或混用本轮版本。\n${bound.join('\n')}` : '',
    others.length ? `本轮引用身份（发送时钉住，不改读最新）：\n${others.map(identityLine).join('\n')}` : '',
    `当前页面：${input.title}`,
    `模式：${input.mode === 'agent' ? 'Agent' : 'Ask'}`,
    `用户问题：\n${input.prompt.trim()}`,
  ].filter(Boolean).join('\n\n');
}
