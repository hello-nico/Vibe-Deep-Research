import { aShareQualified, companySlug, researchRead } from './research';
import type { ResearchSessions } from '../dsh/research-session';
import { api } from './api';
import { packetNeedsEnsure, scenarioTable, shanghaiDay, type DataPacket } from './companyPacket';
import { parseReportCalendar } from './companyNarrative';
import { companyPageTaskOf, type CompanyPageResearchRead, type CompanyPageServices, type ResearchTaskRecord } from './companyPage';

const ensuredDay = new Map<string, string>();
const ensuring = new Map<string, Promise<void>>();
const packetListeners = new Map<string, Set<() => void>>();
/** Tests isolate the once-per-symbol-per-day memory. */
export function resetPacketEnsureMemory() { ensuredDay.clear(); ensuring.clear(); packetListeners.clear(); }

async function readPacket(symbol: string, asOf: string, signal?: AbortSignal): Promise<DataPacket> {
  const packet = await researchRead<DataPacket>(`/wiki/companies/${symbol}/data-packet?as_of=${asOf}`, { signal });
  if (!packet || typeof packet !== 'object' || !packet.fields || typeof packet.as_of !== 'string') throw new Error('数据包读取失败');
  return packet;
}

function notifyPacket(symbol: string) {
  packetListeners.get(symbol)?.forEach(listener => listener());
}

/** Once per symbol per Shanghai day; concurrent callers share one job. The job is not tied to a page's abort signal. */
function ensureOnce(symbol: string, asOf: string, first?: DataPacket): Promise<void> {
  if (ensuredDay.get(symbol) === asOf) return Promise.resolve();
  const key = `${symbol}:${asOf}`;
  const pending = ensuring.get(key);
  if (pending) return pending;
  const job: Promise<void> = (async () => {
    const packet = first ?? await readPacket(symbol, asOf);
    if (!packetNeedsEnsure(packet, asOf)) { ensuredDay.set(symbol, asOf); return; }
    let refreshed = false;
    try {
      await researchRead(`/wiki/companies/${symbol}/coverage/ensure`, { method: 'POST', body: '{}', headers: { 'Content-Type': 'application/json' } });
      refreshed = true;
    } catch (error) {
      console.warn('[finance/company-page] ensure skipped', error);
    }
    ensuredDay.set(symbol, asOf);
    if (refreshed) notifyPacket(symbol);
  })().catch(error => {
    console.warn('[finance/company-page] ensure skipped', error);
  }).finally(() => { if (ensuring.get(key) === job) ensuring.delete(key); });
  ensuring.set(key, job);
  return job;
}

/** R6: return the packet that is already stored; make it current in the background and let subscribers re-read. */
async function openPacket(symbol: string, signal?: AbortSignal) {
  const asOf = shanghaiDay();
  const packet = await readPacket(symbol, asOf, signal);
  void ensureOnce(symbol, asOf, packet);
  return packet;
}

/** The host keeps the research-task record; the page only reads the newest one for the company. */
async function latestTask(code: string) {
  const response = await fetch(`/finance-research-tasks?symbol=${encodeURIComponent(code)}&limit=1`);
  const payload = await response.json().catch(() => null) as { items?: ResearchTaskRecord[] } | null;
  if (!response.ok || !Array.isArray(payload?.items)) throw new Error('研究记录读取失败');
  return payload.items[0] ? companyPageTaskOf(payload.items[0]) : undefined;
}

export function createCompanyPageServices(sessions: ResearchSessions): CompanyPageServices {
  const qualified = (symbol: string) => {
    const code = aShareQualified(symbol);
    if (!code) throw new Error('公司基本面暂只支持 A 股');
    return code;
  };
  return {
    data: {
      quote: async symbol => (await api.quote(symbol))[symbol] ?? null,
      packet: (symbol, signal) => openPacket(qualified(symbol), signal),
      documents: (symbol, signal) => researchRead(`/wiki/companies/${qualified(symbol)}/documents`, { signal }),
    },
    subscribePacket: (symbol, listener) => {
      const code = qualified(symbol);
      let listeners = packetListeners.get(code);
      if (!listeners) { listeners = new Set(); packetListeners.set(code, listeners); }
      listeners.add(listener);
      return () => { listeners.delete(listener); if (!listeners.size && packetListeners.get(code) === listeners) packetListeners.delete(code); };
    },
    readScenario: async (ref, signal) => {
      const id = /^result:([0-9a-f]{32})$/i.exec(ref)?.[1];
      if (!id) return null;
      try {
        return scenarioTable(await researchRead(`/research-results/result:${id}`, { signal }));
      } catch (error) {
        console.warn('[finance/company-page] scenario unavailable', error);
        return null;
      }
    },
    readCalendar: async (symbol, signal) => {
      try {
        const code = qualified(symbol);
        return parseReportCalendar(await researchRead(`/market/report-calendar?symbols=${code}`, { signal }), code);
      } catch (error) {
        console.warn('[finance/company-page] report calendar unavailable', error);
        return null;
      }
    },
    readResult: async (ref, signal) => {
      const id = /^result:([0-9a-f]{32})$/i.exec(ref)?.[1];
      if (!id) return null;
      try { return await researchRead(`/research-results/result:${id}`, { signal }); }
      catch (error) {
        console.warn('[finance/company-page] result unavailable', error);
        return null;
      }
    },
    revertResearch: async (symbol, expectedResearchVersion) => {
      await researchRead(`/wiki/companies/${qualified(symbol)}/page-research/revert`, {
        method: 'POST', body: JSON.stringify(expectedResearchVersion ? { expectedResearchVersion } : {}), headers: { 'Content-Type': 'application/json' },
      });
    },
    readResearch: async symbol => {
      const { research, new_material, basisVersion, researchVersion, canRevert, changedFrom } = await researchRead<Omit<CompanyPageResearchRead, 'task'>>(`/wiki/companies/${qualified(symbol)}/page-research`);
      if (typeof basisVersion !== 'string' || !basisVersion || !(new_material === null || new_material && ['report', 'announcement'].includes(new_material.kind) && typeof new_material.name === 'string' && (new_material.date === null || typeof new_material.date === 'string')) || !(research === null || research && typeof research === 'object')) {
        throw new Error('研究读取失败');
      }
      const task = await latestTask(qualified(symbol));
      return { research, new_material, basisVersion, task,
        ...(researchVersion !== undefined ? { researchVersion } : {}), ...(canRevert !== undefined ? { canRevert } : {}), ...(changedFrom !== undefined ? { changedFrom } : {}) };
    },
    subscribeResearch: listener => sessions.subscribeSessionList(listener),
    startResearch: async (symbol, name) => {
      const slug = companySlug(symbol);
      const code = qualified(symbol);
      if (!slug) throw new Error('公司研究暂只支持 A 股');
      // The research task starts after today's ensure; if the page already started it, this waits for the same job.
      try { await ensureOnce(code, shanghaiDay()); } catch (error) { console.warn('[finance/company-page] ensure before research failed', error); }
      const result = await sessions.start(`按公司研究流程研究 ${name}（${symbol}），保存最新研究。`, { symbol, name }, {
        navigate: false, task: { kind: 'research', slug, symbol: code, title: `公司研究 · ${name}` },
      });
      return { sessionId: result.sessionId, status: 'researching', stage: '正在研究' };
    },
  };
}
