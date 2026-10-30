import { Fragment, useCallback, useEffect, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { PageHeader } from "../components/ui/PageHeader";
import { Disclaimer } from "../components/ui/Disclaimer";
import { LoadingCard } from "../components/ui/LoadingCard";
import { Panel, Tag } from "../components/ui/Card";
import { useConfirm } from "../components/ui/ConfirmDialog";
import { useAiPage } from "../../../core/ai/pageContext";
import { watchPath } from "../lib/routes";
import { gradeLabel, plainNumber, yiText } from "../lib/companyNarrative";
import {
  addToChain, approximate, arrowLabel, calcRows, calcSetup, chainDrivers, chainHeadline, cycleSentence, defaultChainServices, deleteChain, isChainConflict, loadCandidates, loadChainView, loadStageCycle,
  nearestTurningPoint, profitConcentration, removeFromChain, revertChain, roleText, seasonalityLine, stageLabel,
  type CalcRow, type CalcSetup, type Candidate, type ChainCompany, type ChainNode, type ChainServices, type ChainView, type CycleItem, type CycleRef, type StageCycle,
} from "../lib/chainPage";
import "./chain-page.css";

/** 产业链页（用户自己的链）：链条 → 共同驱动 → 链上公司并排。骨架读行业公共层，公司读各家已存研究，页面不触发研究。 */
export function Chain() {
  const { chainId = "" } = useParams();
  return <ChainPage chainId={chainId} />;
}

type Load = { view?: ChainView; failed?: boolean };
const CONFLICT = "已更新到最新，请重试";
/** 改动入口：一次只做一件事；版本冲突时重读并提示，其余失败在页首下写一句话。 */
type Run = (key: string, work: () => Promise<void>, failText: string) => Promise<void>;

export function ChainPage({ chainId, services = defaultChainServices }: { chainId: string; services?: ChainServices }) {
  const navigate = useNavigate();
  const [confirmElement, ask] = useConfirm();
  const [state, setState] = useState<Load>({});
  const [attempt, setAttempt] = useState(0);
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState("");
  useEffect(() => {
    const controller = new AbortController();
    // 改动后重读时保留已显示的内容，不闪骨架。
    setState(previous => previous.view?.chain.chain_id === chainId ? { view: previous.view } : {});
    loadChainView(chainId, services, controller.signal).then(
      view => { if (!controller.signal.aborted) setState({ view }); },
      error => { if (controller.signal.aborted) return; console.warn("[finance/chain] unavailable", error); setState({ failed: true }); });
    return () => controller.abort();
  }, [chainId, services, attempt]);
  useEffect(() => { setNotice(""); }, [chainId]);
  const { view, failed } = state;
  const run: Run = async (key, work, failText) => {
    if (busy) return;
    setBusy(key); setNotice("");
    try { await work(); }
    catch (error) { setNotice(isChainConflict(error) ? CONFLICT : failText); }
    finally { setBusy(""); setAttempt(value => value + 1); }
  };
  const remove = async () => {
    if (!view) return;
    const ok = await ask({ title: "删除产业链", kicker: "产业链", body: <><p>{view.chain.name}将被删除。</p><p className="refresh-dialog-scope">关注和研究会保留。</p></>, confirmLabel: "确认删除" });
    if (!ok) return;
    setBusy("delete"); setNotice("");
    try { await deleteChain(chainId, view.version, services); navigate("/watch?kind=chains"); }
    catch (error) { setNotice(isChainConflict(error) ? CONFLICT : "没成功"); setAttempt(value => value + 1); }
    finally { setBusy(""); }
  };
  useAiPage({ key: `chain:${chainId}`, title: view?.chain.name ?? "产业链", context: view ? chainHeadline(view) : "加载中", suggestions: ["这条链上哪个价格对利润影响最大？"] });
  return <div>
    <PageHeader title={view?.chain.name ?? "产业链"} actions={view && <>
      {view.hasPrevious && <button type="button" className="btn" disabled={Boolean(busy)} data-chain-revert="" onClick={() => void run("revert", () => revertChain(chainId, view.version, services), "没成功")}>撤回</button>}
      <button type="button" className="btn btn-text" disabled={Boolean(busy)} data-chain-delete="" onClick={() => void remove()}>删除</button>
    </>} />
    {notice && <p role="status" className="chain-note chain-notice" data-chain-notice="">{notice}</p>}
    {failed ? <p role="alert" className="chain-note">读取失败<button type="button" className="btn btn-text btn-sm" onClick={() => setAttempt(value => value + 1)}>重试</button></p>
      : !view ? <div className="chain"><LoadingCard /><LoadingCard /></div>
      : <ChainBody view={view} services={services} run={run} busy={busy} />}
    <Disclaimer />
    {confirmElement}
  </div>;
}

/** 同环节还可关注：整条链的候选一次读回（最多 8 家），按环节分到各自的展开处；改动后版本变了重读。 */
function useCandidatePool(chainId: string, version: number, services: ChainServices) {
  const [pool, setPool] = useState<{ items?: Candidate[]; failed?: boolean }>({});
  const loaded = useRef<string>("");
  useEffect(() => { loaded.current = ""; setPool({}); }, [chainId, version]);
  const ensure = useCallback((force = false) => {
    const stamp = `${chainId}@${version}`;
    if (!force && loaded.current === stamp) return;
    loaded.current = stamp;
    setPool({});
    loadCandidates(chainId, services).then(
      items => { if (loaded.current === stamp) setPool({ items }); },
      () => { if (loaded.current === stamp) setPool({ failed: true }); });
  }, [chainId, version, services]);
  return { pool, ensure };
}

function ChainBody({ view, services, run, busy }: { view: ChainView; services: ChainServices; run: Run; busy: string }) {
  const { chain, frameworks, companies, failed } = view;
  const { pool, ensure } = useCandidatePool(chain.chain_id, view.version, services);
  const drivers = chainDrivers(chain);
  const [stages, setStages] = useState<Record<string, StageCycle>>({});
  const [cycleAttempt, setCycleAttempt] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    setStages({});
    for (const node of chain.nodes) void loadStageCycle(node.industry_code, services, controller.signal).then(stage => {
      if (!controller.signal.aborted) setStages(previous => ({ ...previous, [stage.code]: stage }));
    });
    return () => controller.abort();
  }, [chain, services, cycleAttempt]);
  const concentration = profitConcentration(chain, stages);
  return <div className="chain" data-chain={chain.chain_id}>
    <section className="card chain-lead" data-chain-section="lead"><p className="chain-label">概况</p><p className="chain-headline" data-chain-headline="">{chainHeadline(view)}</p></section>
    <Panel title="行业现在在哪？" className="chain-section" data-chain-section="cycle">
      {chain.nodes.map(node => <StageCycleRow key={node.industry_code} node={node} stage={stages[node.industry_code]} retry={() => setCycleAttempt(value => value + 1)} />)}
    </Panel>
    <Panel title="上下游和利润在哪？" className="chain-section" data-chain-section="nodes">
      <ol className="chain-nodes">{chain.nodes.map((node, index) => {
        const framework = frameworks[node.industry_code];
        const method = framework?.template ? [framework.template.name, framework.template.method].filter(Boolean).join("：") : "";
        const arrow = arrowLabel(chain, index);
        return <Fragment key={node.industry_code}>
          <li className="chain-node" data-node={node.industry_code}>
            <b>{node.industry_name}</b>
            {node.role && <small>{roleText(node.role)}</small>}
            <p>{method || "缺估值方法"}</p>
            <small>链上 {node.companies.length} 家公司</small>
          </li>
          {index < chain.nodes.length - 1 && <li className="chain-arrow" aria-hidden="true"><span>→</span>{arrow && <small>{arrow}</small>}</li>}
        </Fragment>;
      })}</ol>
      {failed.frameworks && <p className="chain-gap" data-gap="framework">部分估值方法读取失败</p>}
    {drivers.length > 0 && <div data-chain-section="drivers">
      <ul className="chain-drivers">{drivers.map(item => <li key={item.driver} data-driver={item.driver}>
        <b>{item.driver}</b>
        <span>{item.texts.join("；")}</span>
        <span className="chain-chips">{item.nodes.map(name => <Tag key={name}>{name}</Tag>)}</span>
      </li>)}</ul>
    </div>}
      {concentration && <p className="chain-cycle-line" data-profit-concentration="">{concentration}</p>}
      {chain.nodes.map(node => stages[node.industry_code]?.knowledge?.kind === 'growth' && <div key={node.industry_code}>
        {stages[node.industry_code]!.knowledge!.bottlenecks?.map((item, index) => <KnowledgeLine key={index} item={item} prefix={`${node.industry_name}，瓶颈在：`} />)}
      </div>)}
    </Panel>
    <Panel title="重点公司有哪些？" className="chain-section" data-chain-section="companies">
      {chain.nodes.map(node => <StageGroup key={node.industry_code} node={node} companies={companies.filter(company => company.industry_code === node.industry_code)}
        view={view} pool={pool} ensure={ensure} run={run} busy={busy} services={services} label={stageLabel(stages[node.industry_code])} />)}
    </Panel>
    <ChainCalc view={view} />
  </div>;
}

/** 一个环节：你关注的公司一家一行（可移出），末尾「同环节还可关注」展开候选，点「关注」即关注并放进这条链。 */
function StageGroup({ node, companies, view, pool, ensure, run, busy, services, label }: {
  node: ChainNode; companies: ChainCompany[]; view: ChainView; pool: { items?: Candidate[]; failed?: boolean }; ensure: (force?: boolean) => void; run: Run; busy: string; services: ChainServices; label: string;
}) {
  const [open, setOpen] = useState(false);
  useEffect(() => { if (open) ensure(); }, [open, ensure]);
  const mine = pool.items?.filter(item => item.industry_code === node.industry_code);
  const chainId = view.chain.chain_id;
  return <div className="chain-stage" data-stage={node.industry_code}>
    <p className="chain-stage-name">{node.industry_name}</p>
    {companies.length ? <div className="chain-companies" role="table" aria-label={`${node.industry_name}链上公司`}>
      {companies.map(company => <CompanyRow key={company.symbol} company={company} node={node.industry_name} label={label} disabled={Boolean(busy)}
        onRemove={() => void run(`remove:${company.symbol}`, () => removeFromChain(chainId, view.version, company.symbol, services), "没成功")} />)}
    </div> : <p className="chain-gap" data-stage-empty="">暂无关注公司</p>}
    <details className="chain-candidates" open={open} onToggle={event => setOpen((event.currentTarget as HTMLDetailsElement).open)}>
      <summary>同环节还可关注</summary>
      {pool.failed ? <p className="chain-gap" data-gap="candidates">读取失败<button type="button" className="btn btn-text btn-sm" onClick={() => ensure(true)}>重试</button></p>
        : !mine ? <LoadingCard bare />
        : !mine.length ? <p className="chain-gap" data-candidates-empty="">暂无推荐</p>
        : <ul className="chain-candidate-list">{mine.map(item => <li key={item.symbol} data-candidate={item.symbol}>
          <span className="chain-company-name"><Link to={watchPath(item.symbol.split(".")[0]!)}>{item.name}</Link><small>{item.symbol.split(".")[0]}</small></span>
          <button type="button" className="btn btn-sm" disabled={Boolean(busy)} onClick={() => void run(`add:${item.symbol}`, () => addToChain(chainId, view.version, item.symbol, services), "没成功")}>关注</button>
        </li>)}</ul>}
    </details>
  </div>;
}

function Sources({ refs }: { refs: CycleRef[] }) {
  return <details className="chain-sources"><summary>出处</summary>{refs.map((ref, index) => {
    const query = new URLSearchParams({ revision: ref.parse_revision_id ?? '', hash: ref.parsed_content_sha256 ?? '', block: ref.block_id ?? '' });
    const document = ref.document_id && ref.parse_revision_id && ref.parsed_content_sha256 && ref.block_id;
    return <p key={index}>{ref.quote}{' '}{document
      ? <Link to={`/my-reports/read/${encodeURIComponent(ref.document_id!)}?${query}`}>查看原文</Link>
      : ref.url && /^https?:\/\//.test(ref.url) ? <a href={ref.url} target="_blank" rel="noreferrer">{ref.title || '查看原文'}</a>
      : ref.series_id ? <span>系统日线：{ref.series_id}</span> : null}</p>;
  })}</details>;
}
function KnowledgeLine({ item, prefix = '' }: { item: CycleItem; prefix?: string }) {
  return <div className="chain-knowledge"><p>{prefix}{(item.text || item.mark || '').replace(/[。.]$/, '')}{approximate(item) ? '（约）' : ''}。</p><Sources refs={item.refs ?? []} /></div>;
}
/** 展开的是本次计算收到的日线，下载也使用同一份输入，不另取最新行情冒充原始依据。 */
function DailySources({ stage }: { stage: StageCycle }) {
  const { daily, metric, cycle } = stage;
  if (!daily || !metric || cycle?.state !== 'ok') return null;
  const { position } = cycle;
  const series = [metric.a, metric.b].flatMap(id => daily.series.filter(item => item.id === id));
  const cell = (value: string) => `"${value.replaceAll('"', '""')}"`;
  const csv = [['序列', '名称', '日期', '收盘价', '单位', '口径', '来源', '来源合约', '读取时间', '来源网址'],
    ...series.flatMap(item => item.points.map(([day, close]) => [item.id, item.name ?? '', day, close, item.unit ?? '', item.basis ?? '', item.source?.provider ?? '', item.source?.source_symbol ?? '', item.source?.fetched_at ?? '', item.source?.urls?.join(' ') ?? '']))]
    .map(row => row.map(cell).join(',')).join('\r\n');
  return <details className="chain-sources" data-cycle-inputs=""><summary>日线与计算依据</summary>
    <p>本次计算：{position.from} 至 {position.asOf}，{position.days} 个{metric.b ? '共同' : ''}交易日。分位 =（低于现值的天数 + 等于现值天数的一半）÷ 样本天数，四舍五入至整数百分比。</p>
    {series.map(item => <div key={item.id} data-cycle-source={item.id}>
      <p>{item.name || item.id}（{item.id}），{item.unit || '单位未提供'}；{item.basis || '口径未提供'}。计算截止日 {position.asOf} 的收盘价：{item.points.find(([day]) => day === position.asOf)?.[1]}。</p>
      <p>来源：{item.source?.provider || '未提供'}；合约：{item.source?.source_symbol || '未提供'}；本次读取时间：{item.source?.fetched_at || '未提供'}。</p>
      {item.source?.urls?.filter(url => /^https?:\/\//.test(url)).map(url => <p key={url}><a href={url} target="_blank" rel="noreferrer">行情提供方接口</a>（具体合约见上方，本次日线见下方下载）</p>)}
    </div>)}
    <a download={`周期日线_${position.asOf}.csv`} href={`data:text/csv;charset=utf-8,${encodeURIComponent('\uFEFF' + csv)}`} data-cycle-download="">下载本次计算的日线输入</a>
  </details>;
}
function StageCycleRow({ node, stage, retry }: { node: ChainNode; stage?: StageCycle; retry: () => void }) {
  const knowledge = stage?.knowledge, cycle = stage?.cycle, metric = stage?.metric;
  const history = knowledge && nearestTurningPoint(knowledge);
  return <div className="chain-stage-cycle" data-cycle-stage={node.industry_code}>
    <b>{node.industry_name}</b>
    {!stage ? <LoadingCard bare /> : !knowledge ? <p className="chain-gap">{stage.failed ? '周期资料暂时读取不到' : '这个行业的周期资料还没整理'}{stage.failed && <button className="btn btn-text btn-sm" onClick={retry}>重试</button>}</p>
      : knowledge.kind === 'growth' ? <>
        {knowledge.scope && <p className="chain-gap">{knowledge.scope}</p>}
        {knowledge.adoption?.slice(0, 1).map((item, index) => <KnowledgeLine key={index} item={item} prefix="景气阶段：" />)}
        {knowledge.bottlenecks?.slice(0, 1).map((item, index) => <KnowledgeLine key={index} item={item} prefix="瓶颈在：" />)}
      </> : <>
        {!metric ? <div className="chain-knowledge"><p className="chain-gap">这个环节的周期指标系统里暂时没有序列，看 {knowledge.watch_indicators?.[0]?.where || '行业报告'}</p><Sources refs={knowledge.watch_indicators?.[0]?.refs ?? []} /></div>
          : cycle?.state === 'ok' ? <>
            <p className="chain-cycle-line" data-cycle-line="">{cycleSentence(cycle.position, metric)}</p><Sources refs={metric.refs} /><DailySources stage={stage!} />
            <div className="chain-cycle-scale" role="img" aria-label={`${metric.label}在历史的 ${cycle.position.percentile}% 分位，${cycle.position.zone}`}>
              <i className="chain-cycle-track" /><i className="chain-cycle-edge" style={{ left: '25%' }} /><i className="chain-cycle-edge" style={{ left: '75%' }} />
              <i className="chain-cycle-dot" style={{ left: `${cycle.position.percentile}%` }} data-cycle-dot="" />
              <span style={{ left: '12.5%' }}>底部</span><span style={{ left: '50%' }}>中位</span><span style={{ left: '87.5%' }}>高位</span>
            </div>
            <p className="chain-gap" data-cycle-note="">{metric.b ? `${stage?.daily?.series.find(item => item.id === metric.a)?.name || metric.a} − ${metric.ratio} × ${stage?.daily?.series.find(item => item.id === metric.b)?.name || metric.b}；` : ''}现在 {plainNumber(cycle.position.spread, 2)}，历史最低 {plainNumber(cycle.position.low, 2)}、最高 {plainNumber(cycle.position.high, 2)}；主力连续日收盘，{cycle.position.from} 至 {cycle.position.asOf}，共 {cycle.position.days} 个交易日。{cycle.position.short && `${cycle.position.short}。`}{metric.margin ? '价差仅为利润空间代理，未扣除其余成本。' : '价格分位不等于利润分位。'}</p>
          </> : <p className="chain-gap" data-gap="cycle">{cycle?.state === 'gap' ? cycle.reason : '日线读取中'}。<button className="btn btn-text btn-sm" onClick={retry}>重试</button></p>}
        {knowledge.seasonality?.slice(0, 1).map((item, index) => <KnowledgeLine key={index} item={item} prefix={seasonalityLine(item, new Date().getMonth() + 1)} />)}
        {history && <KnowledgeLine item={history.item} prefix={`距最近记录的历史顶底约 ${history.years} 年（${history.item.year}）：`} />}
      </>}
  </div>;
}

const signed = (text: string, value: number) => `${value > 0 ? "+" : value < 0 ? "−" : ""}${text}`;
const CALC_GAP: Record<Exclude<CalcRow["state"], "ok">, string> = { none: "未研究", nomodel: "无利润模型", novar: "模型未含此价格", noanchor: "缺对比期均价" };

/** 试算：一个滑块调共同驱动，每家一行看利润变动。只用各家已存的利润模型，没有研究的写「未研究」，不估。 */
function ChainCalc({ view }: { view: ChainView }) {
  const setup = calcSetup(view.companies);
  return setup ? <CalcPanel key={`${view.chain.chain_id}:${setup.id}:${setup.current}`} view={view} setup={setup} /> : null;
}
function CalcPanel({ view, setup }: { view: ChainView; setup: CalcSetup }) {
  const [value, setValue] = useState(setup.current);
  const rows = calcRows(view.companies, setup, value);
  const nodeName = (code: string) => view.chain.nodes.find(node => node.industry_code === code)?.industry_name ?? "";
  const digits = setup.step < 1 ? 2 : 0;
  const diff = value - setup.current;
  return <Panel title={`${setup.name}变一下，链上各家利润怎么动`} className="chain-section" data-chain-section="calc">
    <div className="chain-calc-slider">
      <label htmlFor="chain-calc-input">{setup.name}</label>
      <input id="chain-calc-input" type="range" aria-label={`${setup.name}取值`} min={setup.min} max={setup.max} step={setup.step} value={value} onChange={event => setValue(Number(event.target.value))} />
      <output data-calc-value="">{plainNumber(value, digits)} {setup.unit}</output>
      <small>现在 {plainNumber(setup.current, digits)} {setup.unit}{diff ? `，拖到的位置${diff > 0 ? "高" : "低"} ${plainNumber(Math.abs(diff), digits)}` : ""}；可拖范围取各家研究里的近年区间</small>
    </div>
    <div className="chain-calc-rows" role="table" aria-label="各家利润变动">
      <div className="chain-calc-row chain-calc-head" role="row"><span role="columnheader">公司</span><span role="columnheader">利润变动</span><span role="columnheader">占利润</span></div>
      {rows.map(item => <div key={item.symbol} className="chain-calc-row" role="row" data-calc={item.symbol} data-state={item.state}>
        <span className="chain-company-name" role="cell"><b>{item.name}</b><small>{nodeName(item.industry_code)}</small></span>
        {item.state === "ok" ? <>
          <span role="cell" data-calc-delta="">{signed(yiText(Math.abs(item.delta!)), Math.round(item.delta! / 1e6))}</span>
          <span role="cell" data-calc-share="">{item.share == null ? <small className="chain-gap">利润为负，不算占比</small> : <>{signed(`${plainNumber(Math.abs(item.share) * 100, 1)}%`, Math.round(item.share * 1000))}<small title={item.baseLabel}>{item.baseLabel ? `（${item.baseLabel}）` : ""}</small></>}</span>
        </> : <span className="chain-gap chain-calc-gap" role="cell">{CALC_GAP[item.state]}</span>}
      </div>)}
    </div>
    <p className="chain-gap">只算{setup.name}单独变动，其余价格不动；数用各家研究保存的利润模型，不另估。</p>
  </Panel>;
}

function CompanyRow({ company, node, label, onRemove, disabled }: { company: ChainCompany; node: string; label: string; onRemove: () => void; disabled: boolean }) {
  const code = company.symbol.split(".")[0]!;
  return <div className="chain-company" role="row" data-company={company.symbol} data-status={company.status}>
    <span className="chain-company-name" role="cell"><Link to={watchPath(code)}>{company.name}</Link><small>{node}</small>{label && <Tag>{label}</Tag>}</span>
    {company.status === "none" ? <span className="chain-company-none" role="cell">未研究</span> : <>
      <span role="cell" className="chain-company-grade"><Tag>{gradeLabel(company.grade)}</Tag></span>
      <span role="cell" className="chain-company-band">{company.tiers && company.tiers.length === 3 && company.price != null
        ? <TierBand tiers={company.tiers} price={company.price} position={company.position} /> : <small className="chain-gap">缺{company.gaps.filter(gap => gap === "三档价" || gap === "现价").join("、") || "三档价"}</small>}</span>
      <span role="cell" className="chain-company-implied">{company.implied ? <>{company.implied}{company.flip ? <small>，{company.flip}</small> : null}</> : <small className="chain-gap">无对应价格</small>}</span>
    </>}
    <span role="cell" className="chain-company-act"><button type="button" className="btn btn-text btn-sm" disabled={disabled} data-remove="" aria-label={`把${company.name}移出这条链`} onClick={onRemove}>移出</button></span>
  </div>;
}

/** 悲观—乐观区间条：墨色短条，三个刻度，现价是橙色点（图表里的当前值）。 */
function TierBand({ tiers, price, position }: { tiers: { name: string; price: number }[]; price: number; position?: string }) {
  const values = [...tiers.map(tier => tier.price), price];
  const low = Math.min(...values) * 0.97, high = Math.max(...values) * 1.03, span = high - low || 1;
  const at = (value: number) => `${((value - low) / span) * 100}%`;
  const range = tiers.map(tier => tier.price);
  return <span className="chain-band" role="img" aria-label={`现价 ${price.toFixed(2)} 元/股，${position || "三档区间"}`}>
    <i className="chain-band-range" style={{ left: at(Math.min(...range)), right: `${100 - ((Math.max(...range) - low) / span) * 100}%` }} />
    {tiers.map(tier => <i key={tier.name} className="chain-band-tick" style={{ left: at(tier.price) }} title={`${tier.name} ${tier.price.toFixed(2)} 元/股`} />)}
    <i className="chain-band-dot" style={{ left: at(price) }} title={`现价 ${price.toFixed(2)} 元/股`} data-band-price="" />
    <small>{position}</small>
  </span>;
}
