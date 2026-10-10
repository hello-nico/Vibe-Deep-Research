import { api } from './api';
import { aShareQualified, companySlug, researchRead } from './research';
import { latestResearch, loadReportTasks } from './reportTasks';
import type { ResearchSessions } from '../dsh/research-session';
import { companyPageProgress, type CompanyPageResearchRead, type CompanyPageServices, type CompanyPageTask } from './companyPage';

export function createCompanyPageServices(sessions: ResearchSessions): CompanyPageServices {
  const route = (symbol: string, part: string) => {
    const code = aShareQualified(symbol);
    if (!code) throw new Error('公司基本面暂只支持 A 股');
    return `/wiki/companies/${code}/${part}`;
  };
  return {
    data: {
      quote: async symbol => (await api.quote(symbol))[symbol] ?? null,
      snapshot: (symbol, signal) => researchRead(route(symbol, 'provider-snapshot'), { signal }),
      facts: (symbol, signal) => {
        const asOf = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Shanghai', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
        return researchRead(`${route(symbol, 'facts')}?as_of=${asOf}`, { signal });
      },
      documents: (symbol, signal) => researchRead(route(symbol, 'documents'), { signal }),
    },
    readResearch: async symbol => {
      const { research, stale, basisVersion } = await researchRead<Omit<CompanyPageResearchRead, 'task'>>(route(symbol, 'page-research'));
      if (typeof basisVersion !== 'string' || !basisVersion || typeof stale !== 'boolean' || !(research === null || research && typeof research === 'object')) {
        throw new Error('个股页研究读取失败');
      }
      const store = await loadReportTasks();
      const latest = latestResearch(store, companySlug(symbol)!, id => sessions.taskRunning(id));
      let task: CompanyPageTask | undefined;
      if (latest) {
        const binding = store.sessions[latest.sessionId];
        const status = !sessions.taskRunning(latest.sessionId) && !latest.runFailed && binding?.settlement_status === 'completed' ? 'completed' : latest.status;
        task = { sessionId: latest.sessionId, status, stage: '', startedAt: latest.startedAt };
        task.stage = companyPageProgress({ loaded: true, research, stale, task }) ?? '';
      }
      return { research, stale, basisVersion, task };
    },
    subscribeResearch: listener => sessions.subscribeSessionList(listener),
    startResearch: async (symbol, name) => {
      const slug = companySlug(symbol);
      if (!slug) throw new Error('公司研究暂只支持 A 股');
      const result = await sessions.start(`按个股页研究流程研究 ${name}（${symbol}），保存最新个股页研究。`, { symbol, name }, {
        navigate: false, task: { kind: 'research', slug, symbol, title: `公司研究 · ${name}` },
      });
      return { sessionId: result.sessionId, status: 'researching', stage: '正在研究' };
    },
  };
}
