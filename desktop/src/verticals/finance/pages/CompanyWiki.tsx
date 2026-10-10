import { useContext, useEffect, useMemo, useState } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, Star, X } from 'lucide-react';
import { Disclaimer } from '../components/ui/Disclaimer';
import { WorkspaceSelect } from '../components/ui/WorkspaceSelect';
import { WorkspaceMoreMenu } from '../components/ui/WorkspaceMoreMenu';
import { useConfirm } from '../components/ui/ConfirmDialog';
import { AssistantSlot } from '../components/layout/assistantSlot';
import { companySlug, wikiPages, type WikiItem } from '../lib/research';
import { normalizeMarketSymbol } from '../lib/marketSymbol';
import { addWatch, loadWatch, removeWatch } from '../lib/watchlist';
import { addToRoster, loadRoster, removeFromRoster, touchRoster } from '../lib/researchRoster';
import { api } from '../lib/api';
import { watchPath } from '../lib/routes';
import { useResearchSessions } from '../dsh/research-session';
import { buildDirectorySnapshot } from '../assistant/snapshot';
import { companyQuoteObject } from '../lib/pageAssistantObjects';
import { useAiPage, useAiPageObjects } from '../../../core/ai/pageContext';
import { createCompanyPageServices } from '../lib/companyPageServices';
import { CompanyPage, CompanyPageProgress, CompanyPageServicesContext, useCompanyPageState } from './CompanyPage';
import './company-page.css';
import type { CompanyPageServices } from '../lib/companyPage';

/** 关注里的个股页（`/watch/:symbol`）：名单与自选两边同步，返回关注列表时回到离开时的筛选。 */
export function CompanyWiki() {
  const sessions = useResearchSessions();
  const supplied = useContext(CompanyPageServicesContext);
  const services = useMemo(() => supplied ?? createCompanyPageServices(sessions), [supplied, sessions]);
  const { symbol: raw = '' } = useParams();
  const symbol = normalizeMarketSymbol(decodeURIComponent(raw)) ?? raw;
  const navigate = useNavigate();
  const location = useLocation();
  const backTo = (location.state as { from?: string } | null)?.from || '/watch';
  const [revision, setRevision] = useState(0);
  const [pages, setPages] = useState<WikiItem[]>([]);
  const [names, setNames] = useState<Record<string, string>>({});
  const [error, setError] = useState('');
  const [confirmElement, ask] = useConfirm();
  const roster = loadRoster();
  const watched = new Set(loadWatch());
  const slug = companySlug(symbol) || symbol;
  useEffect(() => {
    const controller = new AbortController();
    void wikiPages('companies', controller.signal).then(value => { if (!controller.signal.aborted) setPages(value); }).catch(() => {});
    return () => controller.abort();
  }, [revision]);
  const codes = [...new Set([symbol, ...roster, ...watched])];
  const codesKey = codes.join(',');
  useEffect(() => {
    let alive = true;
    if (codes.length) void api.quote(codes.join(',')).then(quotes => {
      if (alive) setNames(previous => ({ ...previous, ...Object.fromEntries(Object.entries(quotes).filter(([, quote]) => quote.name).map(([code, quote]) => [code, quote.name])) }));
    }).catch(() => {});
    return () => { alive = false; };
  }, [codesKey]); // eslint-disable-line react-hooks/exhaustive-deps
  const wikiBySlug = new Map(pages.map(page => [page.slug, page]));
  const titleOf = (code: string) => names[code] || wikiBySlug.get(companySlug(code) || code)?.title || code;
  const title = titleOf(symbol);
  const rows = [...new Set([...roster, ...watched])].filter(code => /^\d{6}$/.test(code));
  const watching = watched.has(symbol) || roster.includes(symbol);
  // 打开个股页即计入最近使用；只有已在关注里才排序，不因打开而加入关注。
  useEffect(() => { if (roster.includes(symbol)) void touchRoster(symbol).catch(() => {}); }, [symbol]); // eslint-disable-line react-hooks/exhaustive-deps
  const follow = async () => {
    try { await Promise.all([addWatch(symbol), addToRoster(symbol)]); setRevision(value => value + 1); }
    catch { setError('关注状态暂时未能更新'); }
  };
  const unfollow = async () => {
    const ok = await ask({ title: '移出关注', kicker: '关注', body: <><p>{title}（{symbol}）将从关注里移出。</p><p className="refresh-dialog-scope">只移出关注，已有研究和资料不受影响。</p></>, confirmLabel: '确认移出' });
    if (!ok) return;
    try { await Promise.all([removeWatch(symbol), removeFromRoster(symbol)]); navigate(backTo, { replace: true }); }
    catch { setError('关注状态暂时未能更新'); }
  };
  const pageKey = `company-wiki:${slug}`;
  useAiPage({ key: pageKey, title: `个股研究 · ${title}`,
    context: buildDirectorySnapshot({ heading: `${title} 个股页：商业模式、利润变量、弹性、现金、估值与观察。`, items: [{ title, id: slug }], loading: false }),
    suggestions: ['这家公司的利润最取决于什么？'] });
  useAiPageObjects(pageKey, [companyQuoteObject({ symbol, name: title })].filter(item => item !== null));
  const openTask = (sessionId: string) => sessions.openTaskProcess({ sessionId, title: '个股页研究', kind: 'research' });
  return <div>
    <div className="object-toolbar"><div className="object-toolbar-group">
      <button type="button" className="btn" onClick={() => navigate(backTo)}><ArrowLeft />关注</button>
      <WorkspaceSelect aria-label="切换公司" value={symbol} onChange={code => navigate(watchPath(code), { state: location.state, replace: true })} searchPlaceholder="搜索关注的公司" emptyText="关注里没有匹配的公司"
        options={[...rows, ...(rows.includes(symbol) ? [] : [symbol])].map(code => ({ value: code, label: titleOf(code), meta: code }))} />
    </div><div className="object-toolbar-group object-toolbar-actions">
      <SelectedProgress symbol={symbol} name={title} services={services} onTask={openTask} />
      {!watching && <button type="button" className="btn btn-primary" onClick={() => void follow()}><Star />添加关注</button>}
      {watching && <WorkspaceMoreMenu actions={[{ id: 'leave', label: '移出关注', icon: <X size={14} />, onSelect: () => void unfollow() }]} />}
      <AssistantSlot />
    </div></div>
    {error && <p role="alert" className="mb-3 text-sm text-[var(--text-2)]">{error}</p>}
    <CompanyPage key={symbol} symbol={symbol} name={title} services={services} onTask={openTask} />
    {confirmElement}
    <Disclaimer />
  </div>;
}
function SelectedProgress({ symbol, name, services, onTask }: { symbol: string; name: string; services: CompanyPageServices; onTask: (id: string) => void }) {
  const state = useCompanyPageState(services, symbol, name);
  return <CompanyPageProgress state={state} location="toolbar" onOpen={onTask} />;
}
