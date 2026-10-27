import { Fragment, useCallback, useEffect, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { PageHeader } from "../components/ui/PageHeader";
import { Disclaimer } from "../components/ui/Disclaimer";
import { Panel, Tag } from "../components/ui/Card";
import { useConfirm } from "../components/ui/ConfirmDialog";
import { useAiPage } from "../../../core/ai/pageContext";
import { watchPath } from "../lib/routes";
import { gradeLabel, plainNumber, yiText } from "../lib/companyNarrative";
import {
  addToChain, arrowLabel, calcRows, calcSetup, chainDrivers, chainHeadline, CYCLE, cycleSentence, defaultChainServices, deleteChain, hasCycle, isChainConflict, loadCandidates, loadChainView, loadCycle,
  removeFromChain, revertChain, roleText,
  type CalcRow, type CalcSetup, type Candidate, type ChainCompany, type ChainNode, type ChainServices, type ChainView, type Cycle,
} from "../lib/chainPage";
import "./chain-page.css";

/** 产业链页（用户自己的链）：链条 → 共同驱动 → 链上公司并排。骨架读行业公共层，公司读各家已存研究，页面不触发研究。 */
export function Chain() {
  const { chainId = "" } = useParams();
  return <ChainPage chainId={chainId} />;
}

type Load = { view?: ChainView; failed?: boolean };
const CONFLICT = "这条产业链刚被改过，已显示最新内容，请再操作一次。";
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
    const ok = await ask({ title: "删除产业链", kicker: "产业链", body: <><p>{view.chain.name}将被删除。</p><p className="refresh-dialog-scope">只删除这条产业链，关注的公司和研究不受影响。</p></>, confirmLabel: "确认删除" });
    if (!ok) return;
    setBusy("delete"); setNotice("");
    try { await deleteChain(chainId, view.version, services); navigate("/watch?kind=chains"); }
    catch (error) { setNotice(isChainConflict(error) ? CONFLICT : "这条产业链没删掉，请稍后再试。"); setAttempt(value => value + 1); }
    finally { setBusy(""); }
  };
  useAiPage({ key: `chain:${chainId}`, title: view?.chain.name ?? "产业链", context: view ? chainHeadline(view) : "产业链页正在读取", suggestions: ["这条链上哪个价格对利润影响最大？"] });
  return <div>
    <PageHeader title={view?.chain.name ?? "产业链"} actions={view && <>
      {view.hasPrevious && <button type="button" className="btn" disabled={Boolean(busy)} data-chain-revert="" onClick={() => void run("revert", () => revertChain(chainId, view.version, services), "没能撤回，请稍后再试。")}>撤回上一版</button>}
      <button type="button" className="btn btn-text" disabled={Boolean(busy)} data-chain-delete="" onClick={() => void remove()}>删除这条产业链</button>
    </>} />
    {notice && <p role="status" className="chain-note chain-notice" data-chain-notice="">{notice}</p>}
    {failed ? <p role="alert" className="chain-note">这条产业链暂时读取不到。<button type="button" className="btn btn-text btn-sm" onClick={() => setAttempt(value => value + 1)}>重试</button></p>
      : !view ? <div className="chain" aria-busy="true" aria-label="正在加载"><div className="chain-skeleton" /><div className="chain-skeleton" /></div>
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
  return <div className="chain" data-chain={chain.chain_id}>
    <p className="chain-headline" data-chain-headline="">{chainHeadline(view)}</p>
    <Panel title="链条" className="chain-section" data-chain-section="nodes">
      <ol className="chain-nodes">{chain.nodes.map((node, index) => {
        const framework = frameworks[node.industry_code];
        const method = framework?.template ? [framework.template.name, framework.template.method].filter(Boolean).join("：") : "";
        const arrow = arrowLabel(chain, index);
        return <Fragment key={node.industry_code}>
          <li className="chain-node" data-node={node.industry_code}>
            <b>{node.industry_name}</b>
            {node.role && <small>{roleText(node.role)}</small>}
            <p>{method || "估值方法暂缺"}</p>
            <small>链上 {node.companies.length} 家公司</small>
          </li>
          {index < chain.nodes.length - 1 && <li className="chain-arrow" aria-hidden="true"><span>→</span>{arrow && <small>{arrow}</small>}</li>}
        </Fragment>;
      })}</ol>
      {failed.frameworks && <p className="chain-gap" data-gap="framework">部分环节的估值方法暂时读取不到。</p>}
    </Panel>
    {drivers.length > 0 && <Panel title="共同驱动" className="chain-section" data-chain-section="drivers">
      <ul className="chain-drivers">{drivers.map(item => <li key={item.driver} data-driver={item.driver}>
        <b>{item.driver}</b>
        <span>{item.texts.join("；")}</span>
        <span className="chain-chips">{item.nodes.map(name => <Tag key={name}>{name}</Tag>)}</span>
      </li>)}</ul>
    </Panel>}
    {hasCycle(chain) && <CyclePanel services={services} />}
    <ChainCalc view={view} />
    <Panel title="链上公司" className="chain-section" data-chain-section="companies">
      {chain.nodes.map(node => <StageGroup key={node.industry_code} node={node} companies={companies.filter(company => company.industry_code === node.industry_code)}
        view={view} pool={pool} ensure={ensure} run={run} busy={busy} services={services} />)}
    </Panel>
  </div>;
}

/** 一个环节：你关注的公司一家一行（可移出），末尾「同环节还可关注」展开候选，点「关注」即关注并放进这条链。 */
function StageGroup({ node, companies, view, pool, ensure, run, busy, services }: {
  node: ChainNode; companies: ChainCompany[]; view: ChainView; pool: { items?: Candidate[]; failed?: boolean }; ensure: (force?: boolean) => void; run: Run; busy: string; services: ChainServices;
}) {
  const [open, setOpen] = useState(false);
  useEffect(() => { if (open) ensure(); }, [open, ensure]);
  const mine = pool.items?.filter(item => item.industry_code === node.industry_code);
  const chainId = view.chain.chain_id;
  return <div className="chain-stage" data-stage={node.industry_code}>
    <p className="chain-stage-name">{node.industry_name}</p>
    {companies.length ? <div className="chain-companies" role="table" aria-label={`${node.industry_name}链上公司`}>
      {companies.map(company => <CompanyRow key={company.symbol} company={company} node={node.industry_name} disabled={Boolean(busy)}
        onRemove={() => void run(`remove:${company.symbol}`, () => removeFromChain(chainId, view.version, company.symbol, services), "没能移出，请稍后再试。")} />)}
    </div> : <p className="chain-gap" data-stage-empty="">这个环节还没有你关注的公司。</p>}
    <details className="chain-candidates" open={open} onToggle={event => setOpen((event.currentTarget as HTMLDetailsElement).open)}>
      <summary>同环节还可关注</summary>
      {pool.failed ? <p className="chain-gap" data-gap="candidates">候选暂时读取不到。<button type="button" className="btn btn-text btn-sm" onClick={() => ensure(true)}>重试</button></p>
        : !mine ? <p className="chain-gap" aria-busy="true">正在读取…</p>
        : !mine.length ? <p className="chain-gap" data-candidates-empty="">这个环节暂时没有可推荐的公司。</p>
        : <ul className="chain-candidate-list">{mine.map(item => <li key={item.symbol} data-candidate={item.symbol}>
          <span className="chain-company-name"><Link to={watchPath(item.symbol.split(".")[0]!)}>{item.name}</Link><small>{item.symbol.split(".")[0]}</small></span>
          <button type="button" className="btn btn-sm" disabled={Boolean(busy)} onClick={() => void run(`add:${item.symbol}`, () => addToChain(chainId, view.version, item.symbol, services), "没能加进这条链，请稍后再试。")}>关注</button>
        </li>)}</ul>}
    </details>
  </div>;
}

/** 周期位置：一句话加底部—中位—高位刻度，现在的价差是橙色点（图表里的当前值）。日线读不到只写缺口，可单独重试。 */
function CyclePanel({ services }: { services: ChainServices }) {
  const [cycle, setCycle] = useState<Cycle | null>(null);
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    setCycle(null);
    loadCycle(services, controller.signal).then(result => { if (!controller.signal.aborted) setCycle(result); });
    return () => controller.abort();
  }, [services, attempt]);
  return <Panel title="现在在周期什么位置" className="chain-section" data-chain-section="cycle">
    {!cycle ? <div className="chain-skeleton" aria-busy="true" aria-label="正在加载" />
      : cycle.state === "gap" ? <p className="chain-gap" data-gap="cycle">{cycle.reason}。<button type="button" className="btn btn-text btn-sm" onClick={() => setAttempt(value => value + 1)}>重试</button></p>
      : <>
        <p className="chain-cycle-line" data-cycle-line="">{cycleSentence(cycle.position)}</p>
        <div className="chain-cycle-scale" role="img" aria-label={`价差在历史的 ${cycle.position.percentile}% 分位，${cycle.position.zone}`}>
          <i className="chain-cycle-track" /><i className="chain-cycle-edge" style={{ left: "25%" }} /><i className="chain-cycle-edge" style={{ left: "75%" }} />
          <i className="chain-cycle-dot" style={{ left: `${cycle.position.percentile}%` }} data-cycle-dot="" title={`现在的价差 ${plainNumber(cycle.position.spread, 0)} 元/吨`} />
          <span style={{ left: "12.5%" }}>底部</span><span style={{ left: "50%" }}>中位</span><span style={{ left: "87.5%" }}>高位</span>
        </div>
        <p className="chain-gap" data-cycle-note="">价差 = 沪铝 − {CYCLE.ratio} × 氧化铝（每吨铝约耗 {CYCLE.ratio} 吨氧化铝，行业参考值），现在 {plainNumber(cycle.position.spread, 0)} 元/吨，历史最低 {plainNumber(cycle.position.low, 0)}、最高 {plainNumber(cycle.position.high, 0)}；主力连续合约日收盘，{cycle.position.from} 至 {cycle.position.asOf} 共 {plainNumber(cycle.position.days)} 个交易日。{cycle.position.short ? `${cycle.position.short}。` : ""}不含电价和吨成本，只是铝价与氧化铝之间的空间。</p>
      </>}
  </Panel>;
}

const signed = (text: string, value: number) => `${value > 0 ? "+" : value < 0 ? "−" : ""}${text}`;
const CALC_GAP: Record<Exclude<CalcRow["state"], "ok">, string> = { none: "未研究", nomodel: "研究里没有利润模型", novar: "利润模型里没有这个价格", noanchor: "模型缺对比期均价" };

/** 试算：一个滑块调共同驱动，每家一行看利润变动。只用各家已存的利润模型，没有研究的写「未研究」，不估。 */
function ChainCalc({ view }: { view: ChainView }) {
  const setup = calcSetup(view.companies);
  return setup ? <CalcPanel view={view} setup={setup} /> : null;
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
      <div className="chain-calc-row chain-calc-head" role="row"><span role="columnheader">公司</span><span role="columnheader">利润变动</span><span role="columnheader">占对比期利润</span></div>
      {rows.map(item => <div key={item.symbol} className="chain-calc-row" role="row" data-calc={item.symbol} data-state={item.state}>
        <span className="chain-company-name" role="cell"><b>{item.name}</b><small>{nodeName(item.industry_code)}</small></span>
        {item.state === "ok" ? <>
          <span role="cell" data-calc-delta="">{signed(yiText(Math.abs(item.delta!)), Math.round(item.delta! / 1e6))}</span>
          <span role="cell" data-calc-share="">{item.share == null ? <small className="chain-gap">对比期利润非正，不算占比</small> : <>{signed(`${plainNumber(Math.abs(item.share) * 100, 1)}%`, Math.round(item.share * 1000))}<small title={item.baseLabel}>{item.baseLabel ? `（${item.baseLabel}）` : ""}</small></>}</span>
        </> : <span className="chain-gap chain-calc-gap" role="cell">{CALC_GAP[item.state]}</span>}
      </div>)}
    </div>
    <p className="chain-gap">只算{setup.name}单独变动，其余价格不动；数用各家研究保存的利润模型，不另估。</p>
  </Panel>;
}

function CompanyRow({ company, node, onRemove, disabled }: { company: ChainCompany; node: string; onRemove: () => void; disabled: boolean }) {
  const code = company.symbol.split(".")[0]!;
  return <div className="chain-company" role="row" data-company={company.symbol} data-status={company.status}>
    <span className="chain-company-name" role="cell"><Link to={watchPath(code)}>{company.name}</Link><small>{node}</small></span>
    {company.status === "none" ? <span className="chain-company-none" role="cell">尚未研究</span> : <>
      <span role="cell" className="chain-company-grade"><Tag>{gradeLabel(company.grade)}</Tag></span>
      <span role="cell" className="chain-company-band">{company.tiers && company.tiers.length === 3 && company.price != null
        ? <TierBand tiers={company.tiers} price={company.price} position={company.position} /> : <small className="chain-gap">缺{company.gaps.filter(gap => gap === "三档价" || gap === "现价").join("、") || "三档价"}</small>}</span>
      <span role="cell" className="chain-company-implied">{company.implied ? <>{company.implied}{company.flip ? <small>，{company.flip}</small> : null}</> : <small className="chain-gap">缺大致对应的价格</small>}</span>
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
