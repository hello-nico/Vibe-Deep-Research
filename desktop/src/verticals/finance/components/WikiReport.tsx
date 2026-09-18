import type { ReactNode } from 'react';
import { Link, useLocation } from 'react-router-dom';
import ReactMarkdown, { defaultUrlTransform } from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { decodeEvidenceLink } from '../lib/evidence';
import { remarkCitationMarks } from '../lib/citationMarks';
import { EvidenceLink } from './EvidenceCard';
import { symbolFromCompanySlug, type WikiBlock, type WikiPage } from '../lib/research';
import { factItems, factLabel, formatFactValue, providerSnapshot } from '../lib/wikiFacts';
import './wiki-report.css';

// 与下面四类底稿同属报告表达层；生成任务继承阅读顺序，不另建模板执行器。
export function reportDesignContract(type: string): string {
  const narratives: Record<string, string> = {
    company: '公司：身份与最新有依据的关键读数 → 已有经营机制/研究判断 → 经营、财务、估值的指标×报告期证据表 → 关系摘要 → 观察窗口与资料时间线 → 关注点、缺口。不同报告期和口径不直接合并；没有研究判断时不得把事实改名为判断。',
    industry: '行业：分类身份与覆盖范围 → 成员公司 → 经营机制 → 行业结构与上下游关系 → 关注点、资料时间线和缺口。保留页面自身分类来源，不能默认改成申万；机制缺失时明确待补充。',
    theme: '主题：已有核心论点 → 作用机制 → 成员规则与成员 → 异质性 → 催化与证伪条件 → 当前关注点与缺口。成员差异不等于反证；没有原始论点时不得凭图表补造。',
    comparison: '比较：比较问题、时间范围和可比程度 → 比较对象及各自快照 → 维度与口径 → 对比矩阵 → 结构差异 → 权衡与结论 → 缺口。单元格保留核验状态、单位和引用；缺失不得填零，不跨口径排名。',
  };
  return [
    `本页底稿契约：${narratives[type] ?? '按输入页面的实际章节阅读；不得新增事实或判断。'}`,
    'Lieflat 模板用于实现上述阅读顺序。可按数据调整章节密度、旁注与图型，但不得覆盖底稿的业务含义。没有内容的可选章节可省略，关键缺口必须保留。',
    '产品样式：报告最大宽度 1120px，正文约 46em，表格和矩阵可展开并在窄屏横向滚动；统一无衬线字体、轻分隔线、橙色强调和固定字级，避免巨大封面留白或多层卡片。',
    '页眉只写中文行业身份，不展示申万、东财或其他分类的内部代码与括号代码。',
    '同时提供浅色与深色配色（prefers-color-scheme），保证正文和引用对比度。图数切换、章节定位、证据点击在本报告内完成，不导航到外站。',
  ].join('\n');
}

/** Markdown body with citation links; shared by report and research views. */
export function KnowledgeText({ markdown }: { markdown: string }) {
  const body = markdown.replace(/^﻿?---\r?\n[\s\S]*?\r?\n---(?:\r?\n|$)/, '');
  return <div className="finance-cite-root prose prose-sm max-w-none break-words leading-8 prose-headings:tracking-tight prose-h1:text-2xl prose-h2:mt-8 prose-h2:border-b prose-h2:border-border/60 prose-h2:pb-3 prose-table:text-xs dark:prose-invert overflow-x-auto"><ReactMarkdown remarkPlugins={[remarkGfm, remarkCitationMarks]} urlTransform={url => decodeEvidenceLink(url) ? url : defaultUrlTransform(url)} components={{ a: ({ href, children }) => {
    const reference = decodeEvidenceLink(href || '');
    return reference ? <EvidenceLink reference={reference}>{children}</EvidenceLink> : <a href={href}>{children}</a>;
  } }}>{body}</ReactMarkdown></div>;
}

export function SourceTimeline({ content }: { content?: Record<string, unknown> }) {
  const location = useLocation();
  const items = Array.isArray(content?.items) ? content.items.filter((item): item is Record<string, unknown> => !!item && typeof item === 'object') : [];
  const labels: Record<string, string> = { annual_report: '年报', quarterly_report: '季报', research_report: '研报', announcement: '公告', news: '新闻', earnings_call: '业绩交流' };
  if (!items.length) return <p className="wr-gap">资料待补充</p>;
  return <ul className="divide-y divide-border/50">{items.map((item, index) => {
    const title = typeof item.title === 'string' && item.title.trim() ? item.title : '未命名资料';
    const kind = labels[String(item.document_type)] || '资料';
    const period = typeof item.reporting_period === 'string' ? item.reporting_period : '';
    const id = typeof item.document_id === 'string' && /^[a-f0-9]+$/.test(item.document_id) ? item.document_id : null;
    return <li key={index} className="flex flex-col gap-2 py-3 first:pt-0 sm:flex-row sm:items-baseline sm:gap-4"><span className="shrink-0 text-xs text-muted-foreground sm:w-24">{[period, kind].filter(Boolean).join(' · ')}</span>{id ? <Link className="text-sm font-medium leading-6 hover:text-primary" to={`/my-reports/read/${encodeURIComponent(id)}?from=${encodeURIComponent(location.pathname + location.search)}`} onClick={() => sessionStorage.setItem(`finance-scroll:${location.pathname}${location.search}`, String(document.getElementById('workspace-main')?.scrollTop ?? 0))}>{title}<span className="ml-2 text-primary" aria-hidden="true">↗</span></Link> : <span className="text-sm font-medium leading-6">{title}</span>}</li>;
  })}</ul>;
}

const TYPE_LABELS: Record<string, string> = { company: '公司研究', industry: '行业研究', theme: '主题研究', comparison: '对比研究' };
const STATUS_LABELS: Record<string, string> = { draft: '草案', active: '已复核', stale: '待复核', superseded: '已替代' };
const READABLE_REF = /^(claim|evidence|source|provider):/;

function dict(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : null;
}
function blockOf(page: WikiPage, kind: string): WikiBlock | undefined {
  return page.spec.blocks.find(block => block.kind === kind);
}
function contentDict(page: WikiPage, kind: string): Record<string, unknown> | null {
  return dict(blockOf(page, kind)?.content);
}
function isPending(block: WikiBlock | undefined): boolean {
  if (!block) return true;
  const content = dict(block.content);
  return !!content && (content.status === 'pending' || content.status === 'empty');
}
function fmtDate(value?: string): string {
  if (!value) return '';
  return Number.isNaN(Date.parse(value)) ? value : new Date(value).toLocaleDateString('zh-CN');
}
function RefNote({ refs }: { refs: string[] }) {
  const readable = refs.filter(ref => READABLE_REF.test(ref));
  if (!readable.length) return null;
  return <p className="wr-compare-note">依据：{readable.map((ref, index) => <span key={ref}>{index > 0 && '、'}<EvidenceLink reference={ref}>{index + 1}</EvidenceLink></span>)}</p>;
}

function Section({ title, refs, children }: { title: string; refs?: string[]; children: ReactNode }) {
  return <section className="wr-section"><h2>{title}</h2>{children}<RefNote refs={refs ?? []} /></section>;
}

function Gap({ text = '资料待补充' }: { text?: string }) {
  return <p className="wr-gap">{text}</p>;
}

function Shell({ page, lead, children }: { page: WikiPage; lead?: ReactNode; children: ReactNode }) {
  const spec = page.spec;
  return <article className="wr finance-cite-root">
    <header>
      <p className="wr-eyebrow">
        <span>{TYPE_LABELS[spec.type ?? ''] ?? '研究资料'} · 更新于 {fmtDate(spec.as_of)}</span>
        {spec.status && <span className="wr-status">{STATUS_LABELS[spec.status] ?? spec.status}</span>}
        {spec.valid_until && <span>适用截止 {fmtDate(spec.valid_until)}</span>}
      </p>
      <h1 className="wr-title">{spec.title}</h1>
      {lead}
    </header>
    <div className="wr-main">{children}</div>
    <footer className="wr-footer">
      <span>{[
        spec.subject_id ? `主体 ${spec.subject_id}` : '',
        spec.status ? `状态 ${STATUS_LABELS[spec.status] ?? spec.status}` : '',
        spec.superseded_by ? `已被 ${spec.superseded_by} 替代` : '',
      ].filter(Boolean).join(' · ') || 'Vibe Finance'}</span>
      <span>数字可回到依据 · 点击引用核对来源</span>
    </footer>
  </article>;
}

function itemLink(item: Record<string, unknown>, children: ReactNode): ReactNode {
  const ref = typeof item.ref === 'string' ? item.ref.trim() : '';
  if (/^(claim|evidence|source):/.test(ref)) return <EvidenceLink reference={ref}>{children}</EvidenceLink>;
  const snapshot = providerSnapshot(item);
  if (snapshot) return <EvidenceLink reference={ref || 'provider:local'} snapshot={snapshot}>{children}</EvidenceLink>;
  return children;
}

const LEAD_METRICS = ['revenue', 'net_profit_attributable', 'roe', 'pe_ttm', 'market_cap', 'pb'];

/** Metric × period evidence table; every number cell links back to its basis. */
function FactTable({ items, caption }: { items: Record<string, unknown>[]; caption: string }) {
  const periods = [...new Set(items.map(item => String(item.period || '').trim()).filter(Boolean))].sort().reverse();
  const metrics: { key: string; label: string; cells: Map<string, Record<string, unknown>> }[] = [];
  for (const item of items) {
    const key = String(item.metric || factLabel(item));
    let row = metrics.find(entry => entry.key === key);
    if (!row) { row = { key, label: factLabel({ ...item, period: '' }), cells: new Map() }; metrics.push(row); }
    const period = String(item.period || '').trim();
    if (!row.cells.has(period)) row.cells.set(period, item);
  }
  if (!metrics.length) return <Gap />;
  if (!periods.length) {
    return <ul>{items.map((item, index) => <li key={index}>{factLabel(item)}：<strong>{formatFactValue(item)}</strong>{' '}{itemLink(item, '查看依据')}</li>)}</ul>;
  }
  return <div className="wr-table-wrap"><table className="wr-table">
    <caption>{caption}</caption>
    <thead><tr><th scope="col">指标</th>{periods.map(period => <th key={period} scope="col" className="num">{period}</th>)}</tr></thead>
    <tbody>{metrics.map(row => <tr key={row.key}>
      <th scope="row">{row.label}</th>
      {periods.map(period => {
        const item = row.cells.get(period);
        return <td key={period} className="num">{item ? itemLink(item, formatFactValue(item)) : <span className="wr-empty">—</span>}</td>;
      })}
    </tr>)}</tbody>
  </table></div>;
}

const PREDICATE_LABELS: Record<string, string> = { operates_asset: '运营', owns_asset: '持有', controlled_by: '受控于', subsidiary_of: '隶属于', produces: '生产', supplies_to: '供应', cooperates_with: '合作' };
const TOPOLOGY_DIRECTION: Record<string, string> = { upstream: '上游', downstream: '下游' };
const TOPOLOGY_ROLE: Record<string, string> = { fuel: '燃料', feedstock: '原料', power_cost: '电成本', demand: '需求' };

function RelationList({ content }: { content: Record<string, unknown> | null }) {
  const items = [...(Array.isArray(content?.items) ? content.items : []), ...(Array.isArray(content?.undated_items) ? content.undated_items : [])]
    .filter((item): item is Record<string, unknown> => !!item && typeof item === 'object');
  if (!items.length) return <Gap />;
  if (items.some(item => item.direction)) {
    return <div className="wr-table-wrap"><table className="wr-table">
      <caption>上下游依赖关系</caption>
      <thead><tr><th scope="col">方向</th><th scope="col">对象</th><th scope="col">角色</th><th scope="col">有效期</th></tr></thead>
      <tbody>{items.map((item, index) => {
        const start = String(item.valid_from || '').trim();
        const end = String(item.valid_to || '').trim();
        const range = start && end ? `${start}–${end}` : start ? `${start} 起` : end ? `至 ${end}` : '时间缺口';
        return <tr key={index}><td>{TOPOLOGY_DIRECTION[String(item.direction)] ?? String(item.direction)}</td><td>{String(item.target || item.name || '未知对象')}</td><td>{TOPOLOGY_ROLE[String(item.edge_role || item.note || '')] ?? String(item.edge_role || item.note || '—')}</td><td>{range}</td></tr>;
      })}</tbody>
    </table></div>;
  }
  return <ul>{items.map((item, index) => {
    const subject = String(item.subject_name || item.subject_entity_id || '').trim();
    const target = String(item.object_name || item.object_entity_id || '未知对象');
    const label = PREDICATE_LABELS[String(item.predicate || '')] ?? String(item.predicate || '相关');
    const ref = typeof item.ref === 'string' && READABLE_REF.test(item.ref) ? item.ref : '';
    return <li key={index}>{subject ? `${subject} ` : ''}{label}：<strong>{target}</strong>{ref && <>（<EvidenceLink reference={ref}>查看依据</EvidenceLink>）</>}</li>;
  })}</ul>;
}

function ObservationWindow({ content }: { content: Record<string, unknown> | null }) {
  const scales = Array.isArray(content?.scales) ? content.scales.filter((item): item is Record<string, unknown> => !!item && typeof item === 'object') : [];
  if (!scales.length) return <Gap />;
  const lines = scales.map(item => {
    const kind = String(item.kind || '');
    const id = String(item.id || '').trim();
    const name = String(item.name || item.label || '').trim();
    if (kind === 'stock') return `个股 ${id}`;
    if (kind === 'industry') return `行业 ${name ? (name.startsWith('申万') ? name : `申万${name}`) : id}`;
    if (kind === 'benchmark') return `宽基 ${name || id}`;
    return name || id;
  }).filter(Boolean);
  return <>
    <ul>{lines.map((line, index) => <li key={index}>{line}</li>)}</ul>
    {(!content?.status || ['closed', 'pending'].includes(String(content.status))) && <p className="wr-compare-note">尚未打开。</p>}
  </>;
}

const LIST_GROUP_LABELS: Record<string, string> = { balance: '平衡', expectations: '预期', risks: '风险', includes: '包含', excludes: '不包含', confusions: '容易混淆' };
const TEXT_FIELD = (item: unknown) => {
  if (typeof item === 'string') return item.trim();
  const row = dict(item);
  return String(row?.text || row?.statement || row?.name || row?.title || '').trim();
};

/** Generic narrative block → markdown lines; unknown fields stay visible, never dropped. */
function contentMarkdown(content: unknown): string {
  if (typeof content === 'string') return content.trim();
  if (Array.isArray(content)) return content.map(item => `- ${TEXT_FIELD(item) || JSON.stringify(item)}`).join('\n');
  const c = dict(content);
  if (!c || c.status === 'pending') return '';
  const parts: string[] = [];
  const bullets = (key: string) => (Array.isArray(c[key]) ? c[key] as unknown[] : []).map(item => `- ${TEXT_FIELD(item) || JSON.stringify(item)}`).join('\n');
  const direct = bullets('items') || bullets('questions') || bullets('points') || bullets('members');
  if (direct) parts.push(direct);
  for (const [key, label] of Object.entries(LIST_GROUP_LABELS)) {
    const list = bullets(key);
    if (list) parts.push(`### ${label}\n\n${list}`);
  }
  const common = c.common_model;
  if (typeof common === 'string' && common.trim()) parts.push(`### 共性\n\n${common.trim()}`);
  else if (Array.isArray(common)) parts.push(`### 共性\n\n${common.map(item => `- ${TEXT_FIELD(item)}`).join('\n')}`);
  if (Array.isArray(c.sub_models) && c.sub_models.length) {
    const rows = (c.sub_models as unknown[]).map(item => {
      const row = dict(item);
      return `| ${TEXT_FIELD(row)} | ${String(row?.profit_identity || row?.statement || '')} |`;
    });
    parts.push(`### 子模型\n\n| 分型 | 利润怎么形成 |\n| --- | --- |\n${rows.join('\n')}`);
  }
  for (const [key, value] of Object.entries(c)) {
    if (['status', 'items', 'questions', 'points', 'members', 'common_model', 'sub_models', ...Object.keys(LIST_GROUP_LABELS)].includes(key)) continue;
    if (typeof value === 'string' && value.trim()) parts.push(value.trim());
  }
  return parts.join('\n\n');
}

function Prose({ content }: { content: unknown }) {
  const markdown = contentMarkdown(content);
  return markdown ? <KnowledgeText markdown={markdown} /> : <Gap />;
}

function Gaps({ block }: { block: WikiBlock | undefined }) {
  const items = Array.isArray(block?.content) ? block.content as unknown[] : [];
  if (!items.length) return null;
  return <Section title="缺口" refs={block?.refs}>
    <ul>{items.map((item, index) => <li key={index}>{TEXT_FIELD(item) || (typeof item === 'object' && item !== null ? Object.values(item as Record<string, unknown>).filter(v => typeof v === 'string').join(' · ') : String(item))}</li>)}</ul>
  </Section>;
}

function CompanyLead({ page }: { page: WikiPage }) {
  const items = [...factItems(contentDict(page, 'financial_facts') ?? undefined), ...factItems(contentDict(page, 'valuation_facts') ?? undefined)];
  const latest = new Map<string, Record<string, unknown>>();
  for (const item of items) {
    const metric = String(item.metric || '');
    const current = latest.get(metric);
    if (!current || String(item.period || '') > String(current.period || '')) latest.set(metric, item);
  }
  const stats = LEAD_METRICS.map(metric => latest.get(metric)).filter((item): item is Record<string, unknown> => !!item).slice(0, 4);
  return <>
    <p className="wr-lede"><span className="wr-dim">{[String(contentDict(page, 'identity')?.symbol || ''), String(contentDict(page, 'identity')?.industry || ''), String(contentDict(page, 'identity')?.parent_industry || '')].filter(Boolean).join(' · ')}</span></p>
    {stats.length ? <div className="wr-stats">{stats.map((item, index) => <div className="wr-stat" key={index}>
      <p className="wr-stat-label">{factLabel({ ...item, period: '' })}</p>
      <p className="wr-stat-value">{itemLink(item, formatFactValue(item))}</p>
      <p className="wr-stat-basis">{[String(item.period || ''), String(item.observed_at || '').replace('T', ' ').slice(0, 10)].filter(Boolean).join(' · ')}</p>
    </div>)}</div> : null}
  </>;
}

const RESEARCH_TITLES: Record<string, string> = { operating_model: '经营机制研究', industry_structure: '行业结构研究' };

function ResearchSections({ page }: { page: WikiPage }) {
  return <>{(page.spec.research_blocks ?? []).map((block, index) => {
    const markdown = typeof block.content === 'string' ? block.content.trim() : contentMarkdown(block.content);
    if (!markdown) return null;
    return <Section key={index} title={RESEARCH_TITLES[block.kind] ?? '专题研究'} refs={block.refs}>
      <KnowledgeText markdown={markdown} />
      {block.reviewed_as_of && <p className="wr-compare-note">复核日期：{fmtDate(block.reviewed_as_of)}</p>}
    </Section>;
  })}</>;
}

function CompanyReport({ page, onOpenSlug }: { page: WikiPage; onOpenSlug?: (slug: string) => void }) {
  return <Shell page={page} lead={<CompanyLead page={page} />}>
    <ResearchSections page={page} />
    {(['operating_facts', 'financial_facts', 'valuation_facts'] as const).map(kind => {
      const block = blockOf(page, kind);
      const title = { operating_facts: '经营事实', financial_facts: '财务事实', valuation_facts: '估值事实' }[kind];
      const items = factItems(dict(block?.content) ?? undefined);
      return <Section key={kind} title={title} refs={block?.refs}>
        {items.length ? <FactTable items={items} caption={`${title} · 点击数值查看依据`} /> : <Gap />}
      </Section>;
    })}
    {!isPending(blockOf(page, 'relation_summary')) && <Section title="关系摘要" refs={blockOf(page, 'relation_summary')?.refs}><RelationList content={contentDict(page, 'relation_summary')} /></Section>}
    <Section title="观察窗口" refs={blockOf(page, 'observation_window')?.refs}><ObservationWindow content={contentDict(page, 'observation_window')} /></Section>
    <Section title="资料时间线" refs={blockOf(page, 'source_timeline')?.refs}><SourceTimeline content={contentDict(page, 'source_timeline') ?? undefined} /></Section>
    {!isPending(blockOf(page, 'attention')) && <Section title="关注点" refs={blockOf(page, 'attention')?.refs}><Prose content={blockOf(page, 'attention')?.content} /></Section>}
    <Gaps block={blockOf(page, 'gaps')} />
    <IndustryMembers page={page} onOpenSlug={onOpenSlug} linkType="related_to" title="相关页面" />
  </Shell>;
}

function IndustryMembers({ page, onOpenSlug, linkType, title }: { page: WikiPage; onOpenSlug?: (slug: string) => void; linkType: string; title: string }) {
  const links = (page.spec.links ?? []).filter(link => link.type === linkType);
  if (!links.length) return null;
  return <Section title={title}>
    <ul className="wr-members">{links.map(link => {
      const symbol = symbolFromCompanySlug(link.to);
      const label = symbol ? `${symbol}.${link.to.endsWith('sh') ? 'SH' : link.to.endsWith('bj') ? 'BJ' : 'SZ'}` : link.to;
      return <li key={link.to}>{onOpenSlug ? <button type="button" onClick={() => onOpenSlug(link.to)}>{label}</button> : <span>{label}</span>}</li>;
    })}</ul>
  </Section>;
}

function IndustryReport({ page, onOpenSlug }: { page: WikiPage; onOpenSlug?: (slug: string) => void }) {
  const identity = contentDict(page, 'identity');
  const coverage = dict(identity?.coverage);
  return <Shell page={page} lead={<>
    <p className="wr-lede"><span className="wr-dim">{[String(identity?.industry_code || ''), String(identity?.parent_industry || ''), String(identity?.note || '')].filter(Boolean).join(' · ')}</span></p>
    {(coverage?.constituent_count != null || coverage?.company_pages != null) && <p className="wr-compare-note">资料覆盖：{[
      coverage?.constituent_count != null ? `成分股 ${coverage.constituent_count}` : '',
      coverage?.company_pages != null ? `已编译公司页 ${coverage.company_pages}` : '',
      typeof coverage?.basis === 'string' && coverage.basis.trim() ? String(coverage.basis) : '',
    ].filter(Boolean).join(' · ')}</p>}
  </>}>
    {blockOf(page, 'scope') && <Section title="范围" refs={blockOf(page, 'scope')?.refs}><Prose content={blockOf(page, 'scope')?.content} /></Section>}
    <IndustryMembers page={page} onOpenSlug={onOpenSlug} linkType="contains" title="成员公司" />
    {(['operating_model', 'industry_structure', 'relation_summary', 'attention'] as const).map(kind => {
      const block = blockOf(page, kind);
      if (!block || isPending(block)) return null;
      const title = { operating_model: '经营机制', industry_structure: '行业结构', relation_summary: '关系摘要', attention: '关注点' }[kind];
      return <Section key={kind} title={title} refs={block.refs}>
        {kind === 'relation_summary' ? <RelationList content={dict(block.content)} /> : <Prose content={block.content} />}
      </Section>;
    })}
    {blockOf(page, 'source_timeline') && <Section title="资料时间线" refs={blockOf(page, 'source_timeline')?.refs}><SourceTimeline content={contentDict(page, 'source_timeline') ?? undefined} /></Section>}
    <Gaps block={blockOf(page, 'gaps')} />
  </Shell>;
}

function ThemeReport({ page }: { page: WikiPage }) {
  const thesis = blockOf(page, 'thesis');
  const thesisText = contentMarkdown(thesis?.content);
  return <Shell page={page} lead={thesisText ? <div className="wr-lede"><KnowledgeText markdown={thesisText} /><RefNote refs={thesis?.refs ?? []} /></div> : undefined}>
    {([
      ['mechanism', '机制'],
      ['membership_rule', '成员规则'],
      ['members', '成员'],
      ['heterogeneity', '异质性'],
      ['catalysts_and_breakers', '催化与证伪'],
      ['attention', '当前注意力'],
    ] as const).map(([kind, title]) => {
      const block = blockOf(page, kind);
      if (!block || isPending(block)) return null;
      return <Section key={kind} title={title} refs={block.refs}><Prose content={block.content} /></Section>;
    })}
    {!thesisText && thesis && <Section title="论点" refs={thesis.refs}><Prose content={thesis.content} /></Section>}
    <Gaps block={blockOf(page, 'gaps')} />
  </Shell>;
}

const CELL_STATUS: Record<string, string> = { verified: '已核验', partial: '部分核验', missing: '待补充' };
const DIRECTION_LABELS: Record<string, string> = { higher_is_better: '越高越好', lower_is_better: '越低越好', context_dependent: '视目标而定' };

function ComparisonReport({ page }: { page: WikiPage }) {
  const scope = page.spec.comparison_scope;
  const level = page.spec.comparability?.level;
  const matrix = dict(blockOf(page, 'comparison_matrix')?.content);
  const titles = new Map((scope?.dimensions ?? []).map(dim => [dim.id, dim.title]));
  const subjects = scope?.subjects ?? [];
  return <Shell page={page} lead={<>
    {(scope?.question || blockOf(page, 'question')) && <p className="wr-question">{scope?.question ?? contentMarkdown(blockOf(page, 'question')?.content)}</p>}
    <p className="wr-compare-note">{[
      scope?.horizon ? `时间范围：${scope.horizon}` : '',
      level ? `可比程度：${{ high: '高', medium: '中', low: '低' }[level] ?? level}` : '',
      ...(page.spec.comparability?.reasons ?? []),
    ].filter(Boolean).join(' · ')}</p>
  </>}>
    {!!subjects.length && <Section title="比较对象">
      <ul className="wr-members">{subjects.map(item => <li key={item.entity_id}>{item.entity_id.replace(/^company:/, '')}<span className="wr-compare-note">（快照 {fmtDate(item.snapshot_as_of)}）</span></li>)}</ul>
    </Section>}
    {!!scope?.dimensions.length && <Section title="比较维度">
      <ul>{scope.dimensions.map(dim => <li key={dim.id}><strong>{dim.title}</strong>：{dim.basis}；方向：{DIRECTION_LABELS[dim.direction] ?? dim.direction}{dim.weight != null && `；权重 ${dim.weight}`}</li>)}</ul>
    </Section>}
    {matrix && Array.isArray(matrix.rows) && <Section title="对比矩阵" refs={blockOf(page, 'comparison_matrix')?.refs}>
      <div className="wr-table-wrap"><table className="wr-table">
        <caption>{String(matrix.unit_note || '按冻结口径比较；单元格为核验状态与数值')}</caption>
        <thead><tr><th scope="col">维度</th>{subjects.map(item => <th key={item.entity_id} scope="col">{item.entity_id.replace(/^company:/, '')}</th>)}</tr></thead>
        <tbody>{(matrix.rows as unknown[]).map((row, index) => {
          const record = dict(row);
          const cells = new Map((Array.isArray(record?.cells) ? record.cells : []).map(cell => [String(dict(cell)?.subject ?? ''), dict(cell)]));
          return <tr key={index}>
            <th scope="row">{titles.get(String(record?.dimension_id)) ?? String(record?.dimension_id ?? '维度')}</th>
            {subjects.map(item => {
              const cell = cells.get(item.entity_id);
              const status = CELL_STATUS[String(cell?.status)] ?? '待补充';
              const value = cell?.value;
              return <td key={item.entity_id} className="num">{value != null && value !== '' ? `${status}：${String(value)}` : status}</td>;
            })}
          </tr>;
        })}</tbody>
      </table></div>
    </Section>}
    {(['structural_differences', 'tradeoffs', 'conclusion', 'subjects', 'dimensions', 'question'] as const).map(kind => {
      if (kind === 'question' && scope?.question) return null;
      if ((kind === 'subjects' || kind === 'dimensions') && scope) return null;
      const block = blockOf(page, kind);
      if (!block || isPending(block)) return null;
      const title = { structural_differences: '结构性差异', tradeoffs: '权衡', conclusion: '结论', subjects: '比较对象', dimensions: '比较维度', question: '比较问题' }[kind];
      return <Section key={kind} title={title} refs={block.refs}><Prose content={block.content} /></Section>;
    })}
    <Gaps block={blockOf(page, 'gaps')} />
  </Shell>;
}

/** Type-specific deterministic base report; generated HTML versions layer on top later. */
export function WikiReport({ page, onOpenSlug }: { page: WikiPage; onOpenSlug?: (slug: string) => void }) {
  switch (page.spec.type) {
    case 'company': return <CompanyReport page={page} onOpenSlug={onOpenSlug} />;
    case 'industry': return <IndustryReport page={page} onOpenSlug={onOpenSlug} />;
    case 'theme': return <ThemeReport page={page} />;
    case 'comparison': return <ComparisonReport page={page} />;
    default: return null;
  }
}
