import { useContext, useEffect, useMemo, useRef, useState } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, Eye, RefreshCw, Star, X } from 'lucide-react';
import { Disclaimer } from '../components/ui/Disclaimer';
import { WorkspaceSelect } from '../components/ui/WorkspaceSelect';
import { WorkspaceMoreMenu } from '../components/ui/WorkspaceMoreMenu';
import { useConfirm } from '../components/ui/ConfirmDialog';
import { AssistantSlot } from '../components/layout/assistantSlot';
import { companySlug } from '../lib/research';
import { normalizeMarketSymbol } from '../lib/marketSymbol';
import { addWatch, loadWatch, removeWatch } from '../lib/watchlist';
import { addToRoster, loadRoster, removeFromRoster, touchRoster } from '../lib/researchRoster';
import { api } from '../lib/api';
import { watchPath } from '../lib/routes';
import { useResearchSessions } from '../dsh/research-session';
import { buildDirectorySnapshot, clipSectionedSnapshot, type SnapshotSection } from '../assistant/snapshot';
import { companyQuoteObject } from '../lib/pageAssistantObjects';
import { useAiPage, useAiPageObjects } from '../../../core/ai/pageContext';
import { createCompanyPageServices } from '../lib/companyPageServices';
import { CompanyPage, CompanyPageProgress, CompanyPageServicesContext, useCompanyPageState, viewedCompanySection } from './CompanyPage';
import { companyPageStore, companyPageTaskActive } from '../lib/companyPage';
import './company-page.css';

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
  const [, setRevision] = useState(0);
  const [names, setNames] = useState<Record<string, string>>({});
  const [error, setError] = useState('');
  const [confirmElement, ask] = useConfirm();
  const roster = loadRoster();
  const watched = new Set(loadWatch());
  const slug = companySlug(symbol) || symbol;
  const codes = [...new Set([symbol, ...roster, ...watched])];
  const codesKey = codes.join(',');
  useEffect(() => {
    let alive = true;
    if (codes.length) void api.quote(codes.join(',')).then(quotes => {
      if (alive) setNames(previous => ({ ...previous, ...Object.fromEntries(Object.entries(quotes).filter(([, quote]) => quote.name).map(([code, quote]) => [code, quote.name])) }));
    }).catch(() => {});
    return () => { alive = false; };
  }, [codesKey]); // eslint-disable-line react-hooks/exhaustive-deps
  const titleOf = (code: string) => names[code] || code;
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
  useAiPageObjects(pageKey, [companyQuoteObject({ symbol, name: title })].filter(item => item !== null));
  const page = useCompanyPageState(services, symbol, title);
  const researching = companyPageTaskActive(page.task);
  const store = companyPageStore(services, symbol, title);
  const revert = async () => { try { await services.revertResearch?.(symbol, page.researchVersion); await store.refresh(); } catch (error) { console.warn('[finance/company-page] revert failed', error); } };
  // 页面内容（回答句、关键数）只有 CompanyPage 知道：它交出分节快照，这里登记给问助手。
  // 以前这里只登记了标题和 slug，助手读到的页面就只有一行标题，现金一节的数字一个都没有。
  const [snapshot, setSnapshot] = useState<{ symbol: string; sections: SnapshotSection[] }>({ symbol: '', sections: [] });
  const sectionsRef = useRef<SnapshotSection[]>([]);
  sectionsRef.current = snapshot.symbol === symbol ? snapshot.sections : [];
  const sectionsReady = sectionsRef.current.length > 0;
  // 问助手面板顶部的两个按钮，与页面上的「重新研究」「撤回」是同一个入口。
  useAiPage({ key: pageKey, title,
    context: sectionsReady
      ? clipSectionedSnapshot(sectionsRef.current, { keep: ['thesis'] }).body
      : buildDirectorySnapshot({ heading: `${title}：数据正在加载。`, items: [{ title, id: slug }], loading: false }),
    // 发送时再按用户正在看的那一节取舍；总长超过上限才会用到。
    snapshotForSend: () => sectionsRef.current.length
      ? clipSectionedSnapshot(sectionsRef.current, { focus: viewedCompanySection(), keep: ['thesis'] }).body
      : `${title}：数据正在加载，页面上还没有可读的内容。`,
    suggestions: ['这家公司的利润最取决于什么？'],
    actions: [
      { id: 'research', label: '重新研究', disabled: researching || !page.loaded || Boolean(page.error), run: () => void store.restart() },
      { id: 'revert', label: '撤回上次更新', disabled: !page.canRevert || !services.revertResearch, run: () => void revert() },
    ] });
  const openTask = (sessionId: string) => sessions.openTaskProcess({ sessionId, title: '公司研究', kind: 'research',
    ...(page.task?.sessionId === sessionId && page.task.settlementFailed ? { settlementFailed: true } : {}) });
  const actions = [
    { id: 'research', label: '重新研究', icon: <RefreshCw size={14} />, disabled: researching || !page.loaded || Boolean(page.error), onSelect: () => void companyPageStore(services, symbol, title).restart() },
    ...(page.task?.sessionId ? [{ id: 'process', label: '查看研究过程', icon: <Eye size={14} />, onSelect: () => openTask(page.task!.sessionId) }] : []),
    ...(watching ? [{ id: 'leave', label: '移出关注', icon: <X size={14} />, onSelect: () => void unfollow() }] : []),
  ];
  return <div>
    <div className="object-toolbar"><div className="object-toolbar-group">
      <button type="button" className="btn" onClick={() => navigate(backTo)}><ArrowLeft />关注</button>
      <WorkspaceSelect aria-label="切换公司" value={symbol} onChange={code => navigate(watchPath(code), { state: location.state, replace: true })} searchPlaceholder="搜索关注的公司" emptyText="关注里没有匹配的公司"
        options={[...rows, ...(rows.includes(symbol) ? [] : [symbol])].map(code => ({ value: code, label: titleOf(code), meta: code }))} />
    </div><div className="object-toolbar-group object-toolbar-actions">
      <CompanyPageProgress state={page} location="toolbar" onOpen={openTask} />
      {!watching && <button type="button" className="btn btn-primary" onClick={() => void follow()}><Star />添加关注</button>}
      <WorkspaceMoreMenu actions={actions} />
      <AssistantSlot />
    </div></div>
    {error && <p role="alert" className="mb-3 text-sm text-[var(--text-2)]">{error}</p>}
    <CompanyPage key={symbol} symbol={symbol} name={title} services={services} onSnapshot={sections => setSnapshot({ symbol, sections })} />
    {confirmElement}
    <Disclaimer />
  </div>;
}
