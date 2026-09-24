import { ResearchError, researchRead, type ResearchTopic, type WikiPage } from '../lib/research.ts';
import { citedWikiVersionFailure, clipPageSnapshot, formatSnapshotSection, formatCompanyFromSnapshot } from './snapshot.ts';
import { parseDocumentRef, documentRef, type LibraryDocument } from '../lib/library.ts';
import type { AssistantObjectRef, CompanySnapshotQuote } from '../../../core/ai/pageContext.tsx';
import { MARKET_INDEX_IDS } from '../lib/pageAssistantObjects.ts';

const READ_TEXT_LIMIT = 24_000;
const BIND_TIMEOUT_MS = 15_000;
const BIND_TOTAL_LIMIT = 80_000;

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

export interface MarketSnapshotIndex {
  id: string;
  name: string;
  price: number | null;
  change_pct: number | null;
  asOf?: string;
  source?: string;
  fetched_at?: string;
}

function bindSignal(): AbortSignal {
  return AbortSignal.timeout(BIND_TIMEOUT_MS);
}

function citedUrl(item: AssistantObjectRef): string {
  if (item.url && /^https?:\/\//.test(item.url)) return item.url;
  if (item.id.startsWith('url:') && /^https?:\/\//.test(item.id.slice(4))) return item.id.slice(4);
  if (/^https?:\/\//.test(item.id)) return item.id;
  return '';
}

function clip(text: string): { body: string; clipped: boolean } {
  if (text.length <= READ_TEXT_LIMIT) return { body: text, clipped: false };
  return { body: text.slice(0, READ_TEXT_LIMIT), clipped: true };
}

function failLine(item: AssistantObjectRef, detail: string): string {
  return `${identityLine(item)}\n  读取失败：${detail}`;
}

function readError(item: AssistantObjectRef, error: unknown, extra = ''): string {
  if (error instanceof DOMException && error.name === 'TimeoutError') {
    return failLine(item, '读取超时，不能按正文分析。') + extra;
  }
  const detail = error instanceof ResearchError ? error.message : (error instanceof Error ? error.message : '读取失败');
  return `${identityLine(item)}${extra}\n  读取失败：${detail}${error instanceof ResearchError && error.status === 409 ? '\n  该资料当前不可读（冲突或已失效），不能按正文分析。' : ''}`;
}

function formatFetch(item: AssistantObjectRef, fetched: FetchedUrlBind): string {
  const { body, clipped } = clip(fetched.text || '');
  const status = fetched.parse_status || (body ? 'readable' : 'empty');
  const lines = [
    `- ${item.label} \`${item.id}\``,
    // 正文与页面登记的所属区块、补充说明一起传给助手。
    item.section ? `  所属：${item.section}` : '',
    item.detail ? `  ${item.detail}` : '',
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
      signal: bindSignal(),
    });
    return formatFetch(item, fetched);
  } catch (error) {
    return readError(item, error, `\n  URL：${url}\n  不能按正文分析。`);
  }
}

function wikiSlugFromId(id: string): { slug: string; inputHash?: string } | null {
  const at = id.indexOf('@');
  if (at > 0) return { slug: id.slice(0, at), inputHash: id.slice(at + 1) };
  if (/^(companies|industries|themes|comparisons)\//.test(id)) return { slug: id };
  return null;
}

async function fetchCitedWiki(item: AssistantObjectRef): Promise<string> {
  const parsed = wikiSlugFromId(item.id);
  if (!parsed) return `- ${item.label} \`${item.id}\`\n  Wiki 身份无法解析，不能读取。`;
  try {
    const page = await researchRead<WikiPage>(`/wiki/pages/read?slug=${encodeURIComponent(parsed.slug)}`, { signal: bindSignal() });
    const hash = page.input_hash;
    const expected = item.version || parsed.inputHash;
    const versionFail = citedWikiVersionFailure(expected, hash);
    if (versionFail) return `- ${item.label} \`${item.id}\`\n  ${versionFail}`;
    const { body, clipped } = clip(page.markdown || '');
    const lines = [
      `- ${page.spec?.title || item.label} \`${parsed.inputHash ? `${parsed.slug}@${parsed.inputHash}` : parsed.slug}\``,
      hash ? `  内容版本：${hash}` : '  内容版本：不可用',
      `  读取时点：${new Date().toISOString()}`,
      page.published ? '  发布状态：已接受页' : '  发布状态：草案或未发布',
      clipped ? '  正文被截断；截断片不能当作完整 Wiki。' : '',
      // 未截断时这是完整正文，"摘要"字样会让模型误以为已经过压缩。
      body ? `  ${clipped ? '正文（已截断）' : '正文'}：\n${body}` : '  没有可读正文。',
    ];
    return lines.filter(Boolean).join('\n');
  } catch (error) {
    return readError(item, error);
  }
}

async function fetchCitedTopic(item: AssistantObjectRef): Promise<string> {
  const topicId = item.id.startsWith('topic:') ? item.id : `topic:${item.id}`;
  try {
    const topic = await researchRead<ResearchTopic & { judgment?: { text?: string }; last_touched_at?: string }>(
      `/wiki/research-topics/${encodeURIComponent(topicId)}`,
      { signal: bindSignal() },
    );
    const payload = topic.markdown?.trim()
      ? topic.markdown
      : JSON.stringify({
        user_claim: topic.user_claim,
        observation: topic.observation,
        judgment: topic.judgment,
      }, null, 2);
    const { body, clipped } = clip(payload || '');
    const touched = topic.last_touched_at;
    return [
      `- ${topic.title || item.label} \`${topicId}\``,
      touched ? `  读取时点：${touched}` : '  读取时点未标注',
      clipped ? '  内容被截断。' : '',
      body ? `  议题内容：\n${body}` : '  没有可读议题正文。',
    ].filter(Boolean).join('\n');
  } catch (error) {
    return readError(item, error);
  }
}

async function fetchCitedDocument(item: AssistantObjectRef): Promise<string> {
  const parsed = parseDocumentRef(item.id) || parseDocumentRef(item.id.replace(/^document:/, 'document:'));
  const id = parsed?.document_id || (/^document:([a-f0-9]{32})/.exec(item.id)?.[1] ?? '');
  if (!id) return `- ${item.label} \`${item.id}\`\n  资料身份无法解析。`;
  try {
    const signal = bindSignal();
    const doc = await researchRead<LibraryDocument>(`/documents/${encodeURIComponent(id)}`, { signal });
    const revisions = await researchRead<{ revisions: { status?: string; parse_revision_id?: string; parsed_content_sha256?: string }[] }>(
      `/documents/${encodeURIComponent(id)}/revisions`,
      { signal },
    );
    const pinnedRev = parsed?.parse_revision_id;
    const pinnedHash = parsed?.parsed_content_sha256;
    const pinned = pinnedRev
      ? revisions.revisions.find(r => r.parse_revision_id === pinnedRev && (!pinnedHash || r.parsed_content_sha256 === pinnedHash))
      : revisions.revisions.find(r => r.status === 'active') || revisions.revisions[0];
    if (pinnedRev && !pinned) {
      return `- ${doc.title || item.label} \`${item.id}\`\n  绑定版本已不在修订列表，不能按正文分析。`;
    }
    const ref = pinned?.parse_revision_id && pinned.parsed_content_sha256
      ? documentRef(id, pinned.parse_revision_id, pinned.parsed_content_sha256)
      : documentRef(id);
    if (!doc.has_parsed || !pinned?.parse_revision_id) {
      return `- ${doc.title || item.label} \`${ref}\`\n  解析状态：${doc.extra?.process_status || '未完成'}\n  原件已保存，正文尚未解析，不能按正文分析。`;
    }
    const query = new URLSearchParams({
      parse_revision_id: pinned.parse_revision_id,
      parsed_content_sha256: pinned.parsed_content_sha256 || '',
    });
    const text = await researchRead<string>(`/documents/${encodeURIComponent(id)}/parsed?${query}`, { signal });
    const { body, clipped } = clip(typeof text === 'string' ? text : '');
    return [
      `- ${doc.title || item.label} \`${ref}\``,
      `  内容版本：${pinned.parsed_content_sha256}`,
      `  读取时点：${new Date().toISOString()}`,
      clipped ? '  正文被截断。' : '',
      body ? `  正文：\n${body}` : '  解析完成但正文为空。',
    ].filter(Boolean).join('\n');
  } catch (error) {
    if (error instanceof ResearchError && (error.status === 404 || error.status === 409)) {
      return `- ${item.label} \`${item.id}\`\n  ${error.status === 404 ? '该资料已从我的资料移除，无法读取原件。' : '该资料当前版本冲突或已失效，无法读取正文。'}`;
    }
    return readError(item, error);
  }
}

async function fetchCitedProfile(item: AssistantObjectRef): Promise<string> {
  const match = /^profile:sw2:([^:]+):([a-f0-9]{64})$/.exec(item.id);
  if (!match) return `- ${item.label} \`${item.id}\`\n  Profile 身份无效。`;
  const code = match[1] || '';
  const expectedHash = match[2] || '';
  try {
    const profile = await researchRead<{
      industry_code: string; industry_name: string; profile_sha256?: string; profile_ref?: string;
      core_questions?: { q: string; rationale: string }[];
    }>(`/industries/profiles/${encodeURIComponent(code)}`, { signal: bindSignal() });
    const hash = profile.profile_sha256;
    if (!hash) {
      return `- ${item.label} \`${item.id}\`\n  当前 Profile 没有 hash，读取失败，不能按已读正文分析。`;
    }
    if (hash !== expectedHash) {
      return `- ${item.label} \`${item.id}\`\n  绑定 hash ${expectedHash} 与当前 ${hash} 不一致，读取失败。`;
    }
    const { body, clipped } = clip(JSON.stringify({
      industry_name: profile.industry_name,
      core_questions: profile.core_questions,
    }, null, 2));
    return [
      `- ${profile.industry_name || item.label} \`${item.id}\``,
      `  内容版本：${hash}`,
      `  读取时点：${new Date().toISOString()}`,
      clipped ? '  内容被截断。' : '',
      // 未截断时这是完整核心问题列表，不是被压缩过的摘要。
      `  ${clipped ? 'Profile 内容（已截断）' : 'Profile 内容'}：\n${body}`,
    ].filter(Boolean).join('\n');
  } catch (error) {
    return readError(item, error);
  }
}

function formatMarketFromSnapshot(item: AssistantObjectRef, indices: MarketSnapshotIndex[]): string {
  if (item.id === 'market:indices') {
    const memberIds = new Set(Object.values(MARKET_INDEX_IDS));
    const members = indices.filter(i => memberIds.has(i.id.replace(/^market:/, '')));
    const body = members.length
      ? members.map(i => `  - ${i.name}（${i.id.replace(/^market:/, '')}）：点位 ${i.price ?? '—'}，涨跌幅 ${i.change_pct == null ? '—' : `${i.change_pct > 0 ? '+' : ''}${i.change_pct}%`}`).join('\n')
      : '  集合成员未在页面快照中';
    return `- 宽基指数集合 \`market:indices\`\n  页面快照显示值：\n${body}`;
  }
  const code = item.id.replace(/^market:/, '');
  const row = indices.find(i => i.id === code || i.id === `market:${code}`);
  if (!row) {
    return `- ${item.label} \`${item.id}\`\n  页面快照中没有该指数的显示值；不能假装已读取行情。`;
  }
  return [
    `- ${row.name || item.label} \`${item.id}\``,
    row.asOf ? `  观察日：${row.asOf}` : '',
    `  来源：${row.source?.trim() || '未标注'}`,
    row.fetched_at ? `  取数时点：${row.fetched_at}` : '',
    `  页面显示：点位 ${row.price ?? '—'}，涨跌幅 ${row.change_pct == null ? '—' : `${row.change_pct > 0 ? '+' : ''}${row.change_pct}%`}`,
    '  说明：这是页面显示值，不是工具读取的证据。',
  ].filter(Boolean).join('\n');
}

function identityLine(item: AssistantObjectRef): string {
  const bits = [
    item.version ? `版本 ${item.version}` : '',
    item.section ? `所属：${item.section}` : '',
    item.hint || '',
  ].filter(Boolean);
  const line = `- ${item.label} \`${item.id}\`${bits.length ? `（${bits.join(' · ')}）` : ''}`;
  return item.detail ? `${line}\n  ${item.detail}` : line;
}

async function bindCitedObject(
  item: AssistantObjectRef,
  marketIndices: MarketSnapshotIndex[],
  companyQuotes: CompanySnapshotQuote[],
): Promise<string> {
  const url = citedUrl(item);
  if (url) return fetchCitedUrl(item, url);
  if (item.kind === 'wiki' || item.id.includes('@') || /^(companies|industries|themes|comparisons)\//.test(item.id)) {
    return fetchCitedWiki(item);
  }
  if (item.kind === 'topic' || item.id.startsWith('topic:')) return fetchCitedTopic(item);
  if (item.kind === 'document' || item.id.startsWith('document:')) return fetchCitedDocument(item);
  if (item.kind === 'profile' || item.id.startsWith('profile:')) return fetchCitedProfile(item);
  if (item.kind === 'market' || item.id.startsWith('market:')) return formatMarketFromSnapshot(item, marketIndices);
  if (item.kind === 'company' || item.id.startsWith('company:')) return formatCompanyFromSnapshot(item, companyQuotes);
  return identityLine(item) + '\n  本轮没有对应的宿主读取契约，不能按已读正文分析。';
}

function capBoundReads(bound: string[]): string[] {
  let used = 0;
  const out: string[] = [];
  for (const text of bound) {
    if (used >= BIND_TOTAL_LIMIT) {
      out.push('  （后续引用因总量上限未附正文）');
      break;
    }
    if (used + text.length <= BIND_TOTAL_LIMIT) {
      used += text.length;
      out.push(text);
      continue;
    }
    const room = BIND_TOTAL_LIMIT - used;
    used = BIND_TOTAL_LIMIT;
    out.push(`${text.slice(0, room)}\n  正文被截断；截断片不能当作完整原件。`);
  }
  return out;
}

export async function bindAssistantPrompt(input: {
  prompt: string;
  title: string;
  mode: 'ask' | 'agent';
  pageSnapshot?: string;
  objects: AssistantObjectRef[];
  marketIndices?: MarketSnapshotIndex[];
  companyQuotes?: CompanySnapshotQuote[];
}): Promise<string> {
  const marketRows: MarketSnapshotIndex[] = input.marketIndices || [];
  const quoteRows: CompanySnapshotQuote[] = input.companyQuotes || [];
  const bound = capBoundReads(await Promise.all(input.objects.map(item => bindCitedObject(item, marketRows, quoteRows))));
  const cited = input.objects.flatMap(item => [item.id, item.label, item.locator || '']).filter(Boolean);
  const rawSnapshot = (input.pageSnapshot || '').trim().replace(/^【页面快照】\s*/, '');
  const snapshotBody = rawSnapshot
    ? clipPageSnapshot(rawSnapshot, cited).body
    : '（本页未提供页面快照）';
  return [
    formatSnapshotSection('页面快照', [
      '以下为用户发送时页面展示的数据，代表用户当前关注的内容；它不是证据，作为结论依据时注明来自页面显示及其时点。',
      snapshotBody,
    ]),
    bound.length ? formatSnapshotSection('引用读取结果', [
      '以下 @ 对象已在发送时读取，直接使用，不要重复读取同一对象；需要更多信息可以补读，但补读是另一份结果，不覆盖、不混用本轮内容。',
      bound.join('\n'),
    ]) : '',
    formatSnapshotSection('页面身份', [
      input.objects.length && !bound.length
        ? `本轮引用身份（发送时钉住）：\n${input.objects.map(identityLine).join('\n')}`
        : input.objects.length
          ? `本轮引用：${input.objects.map(o => o.label).join('、')}`
          : '',
      `当前页面：${input.title}`,
      `模式：${input.mode === 'agent' ? 'Agent（可按需检索补充）' : 'Ask（即答：只用上述上下文）'}`,
    ]),
  ].filter(Boolean).join('\n\n');
}

export function assistantUserMessage(prompt: string, references: string[]): string {
  return [prompt.trim(), ...references].filter(Boolean).join('\n\n');
}
